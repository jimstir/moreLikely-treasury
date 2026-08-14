// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/**
 * @title ITreasuryPolicy
 * @dev The official standard interface for Open Treasury Compliant Policies.
 */
interface ITreasuryPolicy is IERC165 {
    /**
     * @dev Returns the address of the TreasuryVault this policy belongs to.
     */
    function treasuryVault() external view returns (address);

    /**
     * @dev Returns the specific proposal number this policy is executing.
     */
    function proposalNum() external view returns (uint256);

    /**
     * @dev Calculates and returns the value of the policy.
     * This MAY include the principal, accrued yield denominated in the Vault's deposit token, or just the assets list itself.
     */
    function getTotalValue() external view returns (uint256);

    /**
     * @dev Initiates the wind-down process for this policy.
     * The policy should return the underlying funds to the TreasuryVault contract using `depositTreasury()`.
     * MUST be restricted to the `owner` or if ProposalType.EXIT is approved.
     */
    function liquidate() external;
}
