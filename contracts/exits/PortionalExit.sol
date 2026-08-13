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
    uint256 public override proposalNum;
    uint256 public override swapRatio;
    uint256 public override exitWindowEnd;

    // Snapshot of user balances at the time of the exit proposal to prevent front-running
    mapping(address => uint256) public eligibleShares;

    constructor(
        address _treasuryVault,
        uint256 _proposalNum,
        uint256 _swapRatio,
        uint256 _exitWindowEnd,
        address[] memory _eligibleUsers,
        uint256[] memory _eligibleBalances
    ) {
        require(_treasuryVault != address(0), "Invalid vault address");
        require(_eligibleUsers.length == _eligibleBalances.length, "Array length mismatch");
        
        treasuryVault = _treasuryVault;
        proposalNum = _proposalNum;
        swapRatio = _swapRatio;
        exitWindowEnd = _exitWindowEnd;

        for (uint256 i = 0; i < _eligibleUsers.length; i++) {
            eligibleShares[_eligibleUsers[i]] = _eligibleBalances[i];
        }
    }

    /**
     * @dev Claims the exit by burning eligible treasury tokens and dispensing the pro-rata underlying asset.
     */
    function claimExit(uint256 amount) external override {
        require(amount > 0, "Amount must be greater than zero");
        if (exitWindowEnd != 0) {
            require(block.timestamp <= exitWindowEnd, "Exit window has ended");
        }
        
        require(amount <= eligibleShares[msg.sender], "Exceeds eligible balance at proposal time");
        eligibleShares[msg.sender] -= amount;

        TreasuryVault vault = TreasuryVault(payable(treasuryVault));
        IERC20 treasToken = IERC20(vault.treasToken());
        IERC20 exitToken = IERC20(vault.asset());

        uint256 exitAmount = (amount * swapRatio) / 1e18;
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
