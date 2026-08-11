// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/ITreasuryVault.sol";

contract VoterPool {
    // Maps proposalId => Merkle Root of the voters
    mapping(uint256 => bytes32) public proposalMerkleRoots;
    // Maps user => proposalId => true (to prevent double-withdrawing)
    mapping(address => mapping(uint256 => bool)) public hasWithdrawn;

    // Users deposit shares here first
    function depositTokens(uint256 amount) external { ... }

    // Relayer submits the batch vote with the Merkle Root
    function submitBatchVote(
        uint256 proposalId, 
        uint256 totalVoteAmount, 
        bytes32 merkleRoot
    ) external onlyOwner {
        proposalMerkleRoots[proposalId] = merkleRoot;
        // Approve Vault and call proposalDeposit
        IERC20(token).approve(vault, totalVoteAmount);
        ITreasuryVault(vault).proposalDeposit(totalVoteAmount, address(this), proposalId);
    }

    // Users claim their tokens back individually using a Merkle Proof
    function claimExit(
        uint256 amount,
        uint256 proposalId,
        bytes32[] calldata proof
    ) external {
        require(!hasWithdrawn[msg.sender][proposalId], "Already claimed");
        
        // Verify the user was part of the Merkle Tree for this proposal
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, amount, proposalId));
        require(MerkleProof.verify(proof, proposalMerkleRoots[proposalId], leaf), "Invalid proof");

        hasWithdrawn[msg.sender][proposalId] = true;
        // Transfer tokens back to user...
    }
}
