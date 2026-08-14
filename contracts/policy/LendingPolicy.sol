// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Lending Policy for Smart Treasury
/// @author moreLikely

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "../interfaces/ITreasuryVault.sol";
import "../interfaces/ITreasuryPolicy.sol";

contract LendingPolicy is ITreasuryPolicy {
    using SafeERC20 for IERC20;

    event CollateralDeposited(address indexed user, uint256 amount);
    event CollateralWithdrawn(address indexed user, uint256 amount);
    event LoanTaken(address indexed user, uint256 amount);
    event LoanRepaid(address indexed user, uint256 amount);
    event Liquidated(
        address indexed user,
        uint256 debtAmount,
        uint256 collateralSeized,
        address liquidator
    );
    event MaxLTVUpdated(uint256 oldLTV, uint256 newLTV);

    struct Loan {
        uint256 collateralAmount;
        uint256 loanAmount;
        uint256 startTime;
        IERC20 collateralToken;
        IERC20 loanToken;
    }

    address public owner;
    address public treasuryVault;
    uint256 public proposalNum;

    // Configurable Loan-to-Value ratio (e.g., 7500 = 75%)
    // Base is 10,000
    uint256 public maxLTV = 7500;

    // User address => Loan
    mapping(address => Loan) public loans;

    // Allowed collateral tokens
    mapping(IERC20 => bool) public acceptedCollateral;

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this");
        _;
    }

    constructor(address _treasuryVault) {
        owner = msg.sender;
        treasuryVault = _treasuryVault;
    }

    function getTotalValue() external view returns (uint256) {
        return 0;
    }

    /**
     * @dev Set the Maximum Loan-To-Value ratio.
     * E.g. 7500 = 75%. Base is 10,000.
     */
    function setMaxLTV(uint256 _newLTV) external onlyOwner {
        require(_newLTV <= 10000, "LTV cannot exceed 100%");
        uint256 oldLTV = maxLTV;
        maxLTV = _newLTV;
        emit MaxLTVUpdated(oldLTV, _newLTV);
    }

    /**
     * @dev Approve a specific ERC20 token to be used as collateral.
     */
    function setAcceptedCollateral(
        IERC20 token,
        bool accepted
    ) external onlyOwner {
        acceptedCollateral[token] = accepted;
    }

    /**
     * @dev Deposit collateral to the lending policy.
     */
    function depositCollateral(IERC20 token, uint256 amount) external {
        require(acceptedCollateral[token], "Token not accepted as collateral");
        require(amount > 0, "Deposit amount must be > 0");

        Loan storage loan = loans[msg.sender];
        if (loan.collateralAmount > 0) {
            require(
                loan.collateralToken == token,
                "Cannot mix collateral types"
            );
        } else {
            loan.collateralToken = token;
        }

        token.safeTransferFrom(msg.sender, address(this), amount);
        loan.collateralAmount += amount;

        emit CollateralDeposited(msg.sender, amount);
    }

    /**
     * @dev Take out a loan against deposited collateral.
     * Note: In a fully decentralized system, we need an Oracle (e.g. Chainlink) to calculate the USD value of the collateral vs the loan token.
     * For the scope of this policy module, we assume 1:1 price parity for simplicity, or that the tokens are pegged.
     */
    function takeLoan(IERC20 loanToken, uint256 amount) external {
        Loan storage loan = loans[msg.sender];
        require(loan.collateralAmount > 0, "No collateral deposited");
        require(amount > 0, "Loan amount must be > 0");

        // Ensure loanToken has been funded into this contract from the TreasuryVault via a proposal
        require(
            loanToken.balanceOf(address(this)) >= amount,
            "Insufficient lending liquidity in contract"
        );

        if (loan.loanAmount == 0) {
            loan.loanToken = loanToken;
            loan.startTime = block.timestamp;
        } else {
            require(
                loan.loanToken == loanToken,
                "Cannot borrow multiple token types"
            );
        }

        // Calculate LTV assuming 1:1 token value ratio for simplicity
        uint256 newTotalDebt = loan.loanAmount + amount;
        uint256 maxBorrow = (loan.collateralAmount * maxLTV) / 10000;
        require(newTotalDebt <= maxBorrow, "Exceeds Maximum LTV");

        loan.loanAmount = newTotalDebt;
        loanToken.safeTransfer(msg.sender, amount);

        emit LoanTaken(msg.sender, amount);
    }

    /**
     * @dev Repay an outstanding loan.
     */
    function repayLoan(uint256 amount) external {
        Loan storage loan = loans[msg.sender];
        require(loan.loanAmount > 0, "No active loan");
        require(amount > 0, "Repay amount must be > 0");

        uint256 repayAmount = amount > loan.loanAmount
            ? loan.loanAmount
            : amount;
        loan.loanToken.safeTransferFrom(msg.sender, address(this), repayAmount);

        loan.loanAmount -= repayAmount;

        emit LoanRepaid(msg.sender, repayAmount);
    }

    /**
     * @dev Withdraw collateral if LTV remains healthy.
     */
    function withdrawCollateral(uint256 amount) external {
        Loan storage loan = loans[msg.sender];
        require(loan.collateralAmount >= amount, "Insufficient collateral");
        require(amount > 0, "Withdraw amount must be > 0");

        uint256 newCollateral = loan.collateralAmount - amount;

        // If they still have debt, ensure the new collateral amount supports the debt
        if (loan.loanAmount > 0) {
            uint256 requiredCollateral = (loan.loanAmount * 10000) / maxLTV;
            require(
                newCollateral >= requiredCollateral,
                "Withdrawal would breach LTV"
            );
        }

        loan.collateralAmount = newCollateral;
        loan.collateralToken.safeTransfer(msg.sender, amount);

        emit CollateralWithdrawn(msg.sender, amount);
    }

    /**
     * @dev Liquidate an undercollateralized loan.
     * Callable by anyone (or specifically the AI Agent Keeper).
     */
    function liquidatePosition(address borrower) external {
        Loan storage loan = loans[borrower];
        require(loan.loanAmount > 0, "No active loan");

        // Check if undercollateralized
        uint256 maxBorrow = (loan.collateralAmount * maxLTV) / 10000;
        require(
            loan.loanAmount > maxBorrow,
            "Loan is sufficiently collateralized"
        );

        uint256 debtToRecover = loan.loanAmount;
        uint256 collateralToSeize = loan.collateralAmount;

        // Reset loan
        loan.loanAmount = 0;
        loan.collateralAmount = 0;

        // Transfer collateral to liquidator (incentive) or back to treasury
        // In a real system, the liquidator pays off the debt to seize the collateral.
        // Here, the liquidator pays the debt to the contract and receives the collateral.
        loan.loanToken.safeTransferFrom(
            msg.sender,
            address(this),
            debtToRecover
        );
        loan.collateralToken.safeTransfer(msg.sender, collateralToSeize);

        emit Liquidated(borrower, debtToRecover, collateralToSeize, msg.sender);
    }

    /**
     * @dev Initiates the wind-down process for this policy.
     * Restricts call to the owner or the TreasuryVault.
     */
    function liquidate() external override {
        require(msg.sender == owner || msg.sender == treasuryVault, "Only owner or vault allowed");
        // Return underlying funds to treasury if applicable
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(ITreasuryPolicy).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}

