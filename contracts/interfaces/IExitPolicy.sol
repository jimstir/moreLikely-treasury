// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

interface IExitPolicy is IERC165 {
    function treasuryVault() external view returns (address); // the address of the treasury
    function proposalNum() external view returns (uint256); // the proposalNumber of this Exit(upgradeable depending on exit deployment)
    function swapRatio() external view returns (uint256); // the agreed treasuryToken swap
    function exitWindowEnd() external view returns (uint256); 
    function claimExit(uint256 amount) external;
}
