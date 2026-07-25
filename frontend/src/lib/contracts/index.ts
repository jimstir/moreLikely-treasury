// Contract ABI definitions and helper factory functions for the moreLikely Smart Treasury.
// These ABIs are a minimal subset matching what the frontend needs.

import { ethers } from "ethers";

// ─── TreasuryVault ABI ───
export const TREASURY_VAULT_ABI = [
  "function treasuryName() view returns (string)",
  "function WhosOwner() view returns (address)",
  "function approvedTokens(address) view returns (bool)",
  "function listToken(uint256) view returns (address)",
  "function tokenListLength() view returns (uint256)",
  "function joinTreasury(address _token, uint256 _amount, bool _isProposal, uint256 _proposalNum) external",
  "function depositTreasury(address _token, uint256 _amount, bool _isProposal, uint256 _proposalNum) external",
  "function proposalOpen(uint256 _amount, address _pContract, address _receiver, bool _isVault, bool _isClosed, address _token) external",
  "function proposalApproved(uint256 _num) external",
  "function proposalClose(uint256 _num) external",
  "function proposalWithdraw(uint256 _num) external",
  "function proposalDeposit(uint256 _amount, address _holder, uint256 _num) external",
  "function newToken(address _token) external",
  "function changeOwner(address _new) external",
  "function proposalCount() view returns (uint256)",
  "function proposalAmount(uint256) view returns (uint256)",
  "function proposalPolicy(uint256) view returns (address)",
  "function proposalReceiver(uint256) view returns (address)",
  "function proposalToken(uint256) view returns (address)",
  "function closedProposal(uint256) view returns (bool)",
  "function executed(uint256) view returns (bool)",
  "function isVault(uint256) view returns (bool)",
];

// ─── TreasuryToken ABI ───
export const TREASURY_TOKEN_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function setVault(address _vault) external",
];

// ─── AssetSwapPolicy ABI ───
export const ASSET_SWAP_POLICY_ABI = [
  "function executeSwap(uint256 proposalId, address tokenIn, address tokenOut, uint256 amountIn, uint256 totalVotesFor, uint256 totalVotesAgainst, bytes attestationSignature, bytes swapCallData) external",
  "function triggerDispute(uint256 proposalId) external",
  "function isPaused(uint256 proposalId) view returns (bool)",
  "event SwapExecuted(uint256 indexed proposalId, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)",
  "event ProposalDisputed(uint256 indexed proposalId, address indexed disputer, uint256 reviewPeriodEnd)",
];

// ─── TreasuryVoting ABI ───
export const GASLESS_VOTING_POLICY_ABI = [
  "function batchDeposit(address[] calldata _holders, uint256[] calldata _amounts, uint256 _proposalNum, bytes[] calldata _signatures) external",
];

// ─── Standard ERC20 ABI ───
export const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

// ─── Factory Functions ───

export function getTreasuryVault(address: string, signerOrProvider: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(address, TREASURY_VAULT_ABI, signerOrProvider);
}

export function getTreasuryToken(address: string, signerOrProvider: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(address, TREASURY_TOKEN_ABI, signerOrProvider);
}

export function getAssetSwapPolicy(address: string, signerOrProvider: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(address, ASSET_SWAP_POLICY_ABI, signerOrProvider);
}

export function getERC20(address: string, signerOrProvider: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(address, ERC20_ABI, signerOrProvider);
}
