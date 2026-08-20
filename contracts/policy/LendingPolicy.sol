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
    event CollateralSeized(
        address indexed borrower,
        address indexed collateralToken,
        uint256 amount,
        uint256 outstandingDebt
    );

    struct Loan {
        uint256 collateralAmount;
        uint256 loanAmount;
        uint256 startTime;
        IERC20 collateralToken;
        IERC20 loanToken;
    }

    address public treasuryVault;
    uint256 public proposalNum;

    // Configurable Loan-to-Value ratio (e.g., 7500 = 75%)
    // Base is 10,000
    uint256 public maxLTV = 7500;

    // Configurable maximum loan duration (default: 30 days)
    uint256 public loanDuration = 30 days;

    // User address => Loan
    mapping(address => Loan) public loans;

    // Allowed collateral tokens
    mapping(IERC20 => bool) public acceptedCollateral;
    mapping(address => uint256) public collateralProposalIds;

    address public oracleRouter;
    mapping(address => address) public tokenOracleMarkets;
    address[] public activeTokens;
    mapping(address => bool) public isTokenTracked;
    mapping(address => uint256) public totalOutstandingLoans;

    uint256 public override status; // 1 = Liquidated, 0 = Active

    modifier auth() {
        require(
            msg.sender == ITreasuryVault(treasuryVault).tOwner() || 
            ITreasuryVault(treasuryVault).getAuth(msg.sender),
            "Not authorized by TreasuryVault"
        );
        _;
    }

    constructor(address _treasuryVault) {
        treasuryVault = _treasuryVault;
    }

    function setOracleRouter(address _oracleRouter) external auth {
        oracleRouter = _oracleRouter;
    }

    function setTokenOracleMarket(address token, address market) external auth {
        tokenOracleMarkets[token] = market;
    }

    function setLoanDuration(uint256 _duration) external auth {
        loanDuration = _duration;
    }

    function getTotalValue() public view override returns (uint256) {
        uint256 total = 0;
        for (uint i = 0; i < activeTokens.length; i++) {
            address t = activeTokens[i];
            uint256 cash = IERC20(t).balanceOf(address(this));
            uint256 debt = totalOutstandingLoans[t];
            uint256 totalManaged = cash + debt;
            if (totalManaged > 0) {
                address market = tokenOracleMarkets[t];
                if (market != address(0) && oracleRouter != address(0)) {
                    (bool s1, bytes memory d1) = oracleRouter.staticcall(
                        abi.encodeWithSignature("getPrice(address)", market)
                    );
                    if (s1 && d1.length > 0) {
                        uint256 price = abi.decode(d1, (uint256));
                        uint8 decimals = 18;
                        (bool s2, bytes memory d2) = t.staticcall(
                            abi.encodeWithSignature("decimals()")
                        );
                        if (s2 && d2.length > 0) {
                            decimals = abi.decode(d2, (uint8));
                        }
                        total += (totalManaged * price) / (10 ** decimals);
                    }
                } else {
                    total += totalManaged;
                }
            }
        }
        return total;
    }

    /**
     * @dev Set the Maximum Loan-To-Value ratio.
     * E.g. 7500 = 75%. Base is 10,000.
     */
    function setMaxLTV(uint256 _newLTV) external auth {
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
        bool accepted,
        uint256 proposalId
    ) external auth {
        acceptedCollateral[token] = accepted;
        collateralProposalIds[address(token)] = proposalId;
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
                address(loan.collateralToken) == address(token),
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
        require(status == 0, "Policy is liquidated");
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
                address(loan.loanToken) == address(loanToken),
                "Cannot borrow multiple token types"
            );
        }

        // Calculate LTV assuming 1:1 token value ratio for simplicity
        uint256 newTotalDebt = loan.loanAmount + amount;
        uint256 maxBorrow = (loan.collateralAmount * maxLTV) / 10000;
        require(newTotalDebt <= maxBorrow, "Exceeds Maximum LTV");

        loan.loanAmount = newTotalDebt;
        totalOutstandingLoans[address(loanToken)] += amount;
        if (!isTokenTracked[address(loanToken)]) {
            activeTokens.push(address(loanToken));
            isTokenTracked[address(loanToken)] = true;
        }
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
        totalOutstandingLoans[address(loan.loanToken)] -= repayAmount;

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
        totalOutstandingLoans[address(loan.loanToken)] -= debtToRecover;

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
     * @dev Repossesses and seizes collateral of a defaulted or expired loan.
     * Restricted to tOwner or treasuryVault (AI Agent).
     */
    function seizeCollateral(address borrower) external {
        require(
            msg.sender == ITreasuryVault(treasuryVault).tOwner() || 
            ITreasuryVault(treasuryVault).getAuth(msg.sender) ||
            msg.sender == treasuryVault,
            "Only owner, vault or auth executor allowed"
        );
        Loan storage loan = loans[borrower];
        require(loan.loanAmount > 0, "No active loan");

        uint256 maxBorrow = (loan.collateralAmount * maxLTV) / 10000;
        bool ltvBreached = loan.loanAmount > maxBorrow;
        bool timeExpired = block.timestamp > loan.startTime + loanDuration;
        require(ltvBreached || timeExpired, "Loan is healthy and active");

        uint256 seizedDebt = loan.loanAmount;
        uint256 seizedCollateralAmount = loan.collateralAmount;
        IERC20 collateralToken = loan.collateralToken;

        // Reset loan state
        loan.loanAmount = 0;
        loan.collateralAmount = 0;
        totalOutstandingLoans[address(loan.loanToken)] -= seizedDebt;

        // Transfer collateral directly to the TreasuryVault
        collateralToken.safeTransfer(treasuryVault, seizedCollateralAmount);

        emit CollateralSeized(borrower, address(collateralToken), seizedCollateralAmount, seizedDebt);
    }

    /**
     * @dev Initiates the wind-down process for this policy.
     * Restricts call to the owner or the TreasuryVault.
     */
    function liquidate() external override {
        require(
            msg.sender == ITreasuryVault(treasuryVault).tOwner() || 
            ITreasuryVault(treasuryVault).getAuth(msg.sender) ||
            msg.sender == treasuryVault,
            "Only owner, vault or auth executor allowed"
        );
        status = 1;
    }

    function liquidateToken(address token) external auth {
        require(status == 1, "Not liquidated");
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "No balance to liquidate");

        IERC20(token).forceApprove(treasuryVault, balance);
        bool ok = ITreasuryVault(treasuryVault).depositTreasury(
            IERC20(token),
            balance,
            false,
            0
        );
        require(ok, "Liquidation deposit failed");
    }

    function supportsInterface(
        bytes4 interfaceId
    ) external pure override returns (bool) {
        return
            interfaceId == type(ITreasuryPolicy).interfaceId ||
            interfaceId == type(IERC165).interfaceId;
    }
}
