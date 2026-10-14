// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IExitPolicy.sol";
import "../interfaces/ITreasuryToken.sol";
import "../treasury/TreasuryVault.sol";

/**
 * @title DissolutionExit
 * @dev Type 2B or 2D Exit Policy. When owner or shareholders trigger a dissolution,
 * all open proposals must be closed and their outstanding withdrawn funds returned to the treasury vault.
 * Once all requirements are met, shareholders can burn their treasuryTokens in exchange for their pro-rata
 * share of the underlying asset.
 */
contract DissolutionExit is IExitPolicy {
    using SafeERC20 for IERC20;

    event ExitClaimed(address indexed user, uint256 treasuryTokenAmount, uint256 underlyingClaimed);

    address public override treasuryVault;
    IERC20 public immutable exitToken;
    uint256 public override proposalNum;
    uint256 public override swapRatio;
    uint256 public override exitWindowEnd;

    constructor(
        address _treasuryVault,
        IERC20 _exitToken,
        uint256 _proposalNum,
        uint256 _swapRatio,
        uint256 _exitWindowEnd
    ) {
        require(_treasuryVault != address(0), "Invalid vault address");
        require(address(_exitToken) != address(0), "Invalid exit token");
        treasuryVault = _treasuryVault;
        exitToken = _exitToken;
        proposalNum = _proposalNum;
        swapRatio = _swapRatio;
        exitWindowEnd = _exitWindowEnd;
    }

    /**
     * @dev Checks if all proposals in the TreasuryVault (except for the exit proposal itself) 
     * are closed and have no outstanding funds owed back.
     */
    function verifyAllProposalsClosedAndReturned() public view returns (bool) {
        TreasuryVault vault = TreasuryVault(payable(treasuryVault));
        uint256 totalProposals = vault.proposalNum();
        for (uint256 i = 1; i <= totalProposals; i++) {
            if (i != proposalNum) {
                if (!vault.closedProposals(i)) {
                    return false;
                }
                if (vault.owed(i) > 0) {
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * @dev Claims the exit by burning treasury tokens and dispensing the pro-rata underlying asset.
     * Requires all other proposals to be closed and repaid.
     */
    function claimExit(uint256 amount) external override {
        require(verifyAllProposalsClosedAndReturned(), "Treasury not fully dissolved or funds outstanding");
        require(amount > 0, "Amount must be greater than zero");
        if (exitWindowEnd != 0) {
            require(block.timestamp <= exitWindowEnd, "Exit window has ended");
        }

        TreasuryVault vault = TreasuryVault(payable(treasuryVault));
        IERC20 treasToken = IERC20(vault.treasToken());

        uint256 exitAmount = (amount * swapRatio) / 1e18;
        require(exitAmount > 0, "Exit amount is zero");
        require(exitToken.balanceOf(address(this)) >= exitAmount, "Insufficient exit tokens in contract");

        // Burn their treasury tokens using TreasuryToken's burnTreasury
        ITreasuryToken(address(treasToken)).burnTreasury(msg.sender, amount);

        // Dispense the exit tokens to the user
        exitToken.safeTransfer(msg.sender, exitAmount);

        emit ExitClaimed(msg.sender, amount, exitAmount);
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IExitPolicy).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}
