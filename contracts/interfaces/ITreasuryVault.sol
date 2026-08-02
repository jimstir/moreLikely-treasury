// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/interfaces/IERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ITreasuryVault is IERC4626 {
    function treasuryName() external view returns (string memory);
    function treasuryToken() external view returns (address);
    function approvedTokens(IERC20 token) external view returns (bool);
    function whosOwner() external view returns (address);
    function proposalCheck() external view returns (uint256);
    function getAuth(address user) external view returns (bool);
    function addAuth(address user) external;
    function userDeposit(address user, uint256 proposal) external view returns (uint256);
    function userWithdrew(address user, uint256 proposal) external view returns (uint256);
    function userNumOfProposal(address user) external view returns (uint256);
    function userProposal(address user, uint256 proposal) external view returns (uint256);
    function proposalToken(uint256 proposal) external view returns (address);
    function getProposalWithdrawAmount(uint256 proposal) external view returns (uint256);
    function proposalReceiver(uint256 proposal) external view returns (address);
    function totalShares(uint256 proposal) external view returns (uint256);
    function closedProposal(uint256 proposal) external view returns (bool);
    function owed(uint256 num) external view returns (uint256);
    function executed(uint256 proposal) external view returns (bool);
    
    function newToken(IERC20 token) external returns (bool);
    function proposalDeposit(uint256 assets, address receiver, uint256 proposal) external returns (uint256);
    function proposalMint(uint256 shares, address receiver, uint256 proposal) external returns (uint256);
    function proposalWithdraw(uint256 assets, address receiver, address owner, uint256 proposal) external returns (uint256);
    function proposalRedeem(uint256 shares, address receiver, address owner, uint256 proposal) external returns (uint256);
    
    function proposalOpen(uint256 amount, address receiver, address owner, bool rate, bool request, IERC20 token) external returns (uint256);
    function proposalClose(uint256 proposal) external returns (bool);
    function vote(uint256 proposal) external view returns (bool);
    function proposalApproved(uint256 proposal) external returns (bool);
    
    function joinTreasury(IERC20 token, uint256 amount, bool proposal, uint256 num) external;
    function depositTreasury(IERC20 token, uint256 amount, address sender) external returns (bool);
}
