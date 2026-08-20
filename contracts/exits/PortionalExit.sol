// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IExitPolicy.sol";
import "../treasury/TreasuryVault.sol";

/**
 * @title PortionalExit
 * @dev Type 2C Exit Policy. Liquidates a specific strategy/portion of tokens and 
 * distributes it only to the shareholders who were active at the time of the exit proposal.
 * Prevents front-running/exploitation by snapshotting eligible shareholders and their balances.
 */
contract PortionalExit is IExitPolicy {
    using SafeERC20 for IERC20;

    event ExitClaimed(address indexed user, uint256 treasuryTokenAmount, uint256 underlyingClaimed);

    address public override treasuryVault;
    address public owner;

    uint256 public currentRound;

    struct ExitPeriod {
        uint256 proposalNum;
        uint256 swapRatio;
        uint256 exitWindowEnd;
        bool isActive;
    }

    // roundId => ExitPeriod
    mapping(uint256 => ExitPeriod) public exitPeriods;

    // roundId => voterAddress => balance
    mapping(uint256 => mapping(address => uint256)) public eligibleShares;

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this");
        _;
    }

    constructor(
        address _treasuryVault,
        address _owner
    ) {
        require(_treasuryVault != address(0), "Invalid vault address");
        require(_owner != address(0), "Invalid owner address");
        
        treasuryVault = _treasuryVault;
        owner = _owner;
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

    /**
     * @dev Starts a new portional exit period.
     */
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

    /**
     * @dev Deactivates the current active exit period.
     */
    function deactivateCurrentPeriod() external onlyOwner {
        require(currentRound > 0, "No active round");
        exitPeriods[currentRound].isActive = false;
    }

    /**
     * @dev Claims the exit by burning eligible treasury tokens and dispensing the pro-rata underlying asset.
     */
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
        IERC20 exitToken = IERC20(vault.asset());

        uint256 exitAmount = (amount * period.swapRatio) / 1e18;
        require(exitAmount > 0, "Exit amount is zero");
        require(exitToken.balanceOf(address(this)) >= exitAmount, "Insufficient exit tokens in contract");

        // Pull the treasuryToken from the user to a dead address to effectively burn it
        treasToken.safeTransferFrom(msg.sender, address(0xdead), amount);

        // Dispense the exit tokens to the user
        exitToken.safeTransfer(msg.sender, exitAmount);

        emit ExitClaimed(msg.sender, amount, exitAmount);
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IExitPolicy).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}
