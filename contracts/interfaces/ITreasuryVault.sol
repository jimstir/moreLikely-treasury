// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/interfaces/IERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ITreasuryVault is IERC4626 {
    enum ProposalType {
        TXNS,
        CLOSE,
        ADD_TOKEN,
        EXIT
    }

    function treasToken() external view returns (IERC20);
    function treasName() external view returns (string memory);
    function tOwner() external view returns (address);
    function proposalNum() external view returns (uint256);
    function votingThres() external view returns (uint256);
    function depositNum() external view returns (uint256);
    function list() external view returns (uint256);
    function totalShares(uint256 proposal) external view returns (uint256);
    function closedProposals(uint256 proposal) external view returns (bool);

    function userBook(
        address user,
        uint256 index
    )
        external
        view
        returns (uint256 proposal, uint256 deposit, uint256 withdrew);

    function approvedTokens(IERC20 token) external view returns (bool);
    function tokensL() external view returns (IERC20[] memory);
    function getAuth(address user) external view returns (bool);
    function owed(uint256 num) external view returns (uint256);
    function executed(uint256 proposal) external view returns (bool);
    function checkCompliance(
        address policyAddress,
        bytes4 interfaceId
    ) external view returns (bool);

    function addAuth(address user) external;
    function newToken(
        IERC20 token,
        uint256 proposal
    ) external returns (uint256);
    function proposalDeposit(
        uint256 assets,
        address receiver,
        uint256 proposal
    ) external returns (uint256);
    function proposalMint(
        uint256 shares,
        address receiver,
        uint256 proposal
    ) external returns (uint256);
    function proposalWithdraw(
        uint256 assets,
        address receiver,
        address owner,
        uint256 proposal
    ) external returns (uint256);
    function proposalRedeem(
        uint256 shares,
        address receiver,
        address owner,
        uint256 proposal
    ) external returns (uint256);
    function proposalOpen(
        uint256 amount,
        address receiver,
        address owner,
        ProposalType request,
        IERC20 token
    ) external returns (uint256);
    function proposalClose(uint256 proposal) external returns (bool);
    function vote(uint256 proposal) external view returns (bool);
    function proposalApproved(uint256 proposal) external returns (bool);

    function joinTreasury(IERC20 token, uint256 amount) external;
    function depositTreasury(
        IERC20 token,
        uint256 amount,
        bool proposal,
        uint256 num
    ) external returns (bool);
}
