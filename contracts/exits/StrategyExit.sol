// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IExitPolicy.sol";
import "../interfaces/ITreasuryToken.sol";
import "../treasury/TreasuryVault.sol";

/**
 * @title StrategyExit
 * @dev Exit policy for Strategy Vaults. Handles performance/management fee splits
 * directly to the manager before distributing the remainder.
 */
contract StrategyExit is IExitPolicy {
    using SafeERC20 for IERC20;

    address public override treasuryVault;
    IERC20 public immutable exitToken;
    address public managerAddress;
    uint256 public immutable managerFeeBps; // Immutable fee structure (e.g. 2000 = 20%)
    address public owner;

    uint256 public currentRound;

    struct ExitPeriod {
        uint256 proposalNum;
        uint256 swapRatio;
        uint256 exitWindowEnd;
        bool isActive;
    }

    mapping(uint256 => ExitPeriod) public exitPeriods;
    mapping(uint256 => mapping(address => uint256)) public eligibleShares;

    event ExitClaimed(address indexed user, uint256 treasuryTokenAmount, uint256 userReceived, uint256 managerFee);
    event ManagerUpdated(address newManager);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this");
        _;
    }

    constructor(
        address _treasuryVault,
        IERC20 _exitToken,
        address _owner,
        address _managerAddress,
        uint256 _managerFeeBps
    ) {
        require(_treasuryVault != address(0), "Invalid vault address");
        require(address(_exitToken) != address(0), "Invalid exit token");
        require(_owner != address(0), "Invalid owner address");
        require(_managerAddress != address(0), "Invalid manager address");
        require(_managerFeeBps <= 10000, "Fee cannot exceed 100%");
        
        treasuryVault = _treasuryVault;
        exitToken = _exitToken;
        owner = _owner;
        managerAddress = _managerAddress;
        managerFeeBps = _managerFeeBps;
    }

    function proposalNum() external view override returns (uint256) {
        return exitPeriods[currentRound].proposalNum;
    }

    function swapRatio() external view override returns (uint256) {
        return exitPeriods[currentRound].swapRatio;
    }

    function exitWindowEnd() external view override returns (uint256) {
        return exitPeriods[currentRound].exitWindowEnd;
    }

    function getFeeBps() external view returns (uint256) {
        return managerFeeBps;
    }

    function updateManagerAddress(address _newManager) external {
        require(msg.sender == managerAddress || msg.sender == owner, "Unauthorized");
        require(_newManager != address(0), "Invalid address");
        managerAddress = _newManager;
        emit ManagerUpdated(_newManager);
    }

    function startExitPeriod(
        uint256 _proposalNum,
        uint256 _swapRatio,
        uint256 _exitWindowEnd,
        address[] memory _eligibleUsers,
        uint256[] memory _eligibleBalances
    ) external onlyOwner {
        require(_eligibleUsers.length == _eligibleBalances.length, "Array length mismatch");
        
        if (currentRound > 0) {
            exitPeriods[currentRound].isActive = false;
        }
        currentRound++;
        exitPeriods[currentRound] = ExitPeriod({
            proposalNum: _proposalNum,
            swapRatio: _swapRatio,
            exitWindowEnd: _exitWindowEnd,
            isActive: true
        });

        for (uint256 i = 0; i < _eligibleUsers.length; i++) {
            eligibleShares[currentRound][_eligibleUsers[i]] = _eligibleBalances[i];
        }
    }

    function claimExit(uint256 amount) external override {
        uint256 round = currentRound;
        require(round > 0, "No active round");
        ExitPeriod storage period = exitPeriods[round];
        require(period.isActive, "Current exit period is not active");
        require(amount > 0, "Amount must be greater than zero");
        if (period.exitWindowEnd != 0) {
            require(block.timestamp <= period.exitWindowEnd, "Exit window has ended");
        }
        
        require(amount <= eligibleShares[round][msg.sender], "Exceeds eligible balance");
        eligibleShares[round][msg.sender] -= amount;

        TreasuryVault vault = TreasuryVault(payable(treasuryVault));
        IERC20 treasToken = IERC20(vault.treasToken());

        uint256 grossExitAmount = (amount * period.swapRatio) / 1e18;
        require(grossExitAmount > 0, "Exit amount is zero");
        require(exitToken.balanceOf(address(this)) >= grossExitAmount, "Insufficient exit tokens in contract");

        // Calculate Fee
        uint256 managerFee = (grossExitAmount * managerFeeBps) / 10000;
        uint256 userReceived = grossExitAmount - managerFee;

        // Burn treasury tokens using TreasuryToken's burnTreasury
        ITreasuryToken(address(treasToken)).burnTreasury(msg.sender, amount);

        // Dispense splits
        if (managerFee > 0) {
            exitToken.safeTransfer(managerAddress, managerFee);
        }
        exitToken.safeTransfer(msg.sender, userReceived);

        emit ExitClaimed(msg.sender, amount, userReceived, managerFee);
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IExitPolicy).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}
