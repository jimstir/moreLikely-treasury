// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "../interfaces/ITreasuryVault.sol";

/**
 * @title VoterPool
 * @dev An optional service contract that wraps the TreasuryVault to enable
 * gasless off-chain EIP-712 voting using Merkle aggregation.
 */
contract VoterPool is ERC20, Ownable {
    using SafeERC20 for IERC20;

    address public immutable treasuryVault;
    address public immutable treasuryToken;

    // Maps proposalId => Merkle Root of the active votes
    mapping(uint256 => bytes32) public proposalMerkleRoots;
    // Maps user => proposalId => true (to prevent double-claiming)
    mapping(address => mapping(uint256 => bool)) public hasWithdrawn;

    constructor(
        address _treasuryVault,
        address _treasuryToken,
        address _initialOwner
    ) ERC20("Voting Pool Receipt", "vToken") Ownable(_initialOwner) {
        treasuryVault = _treasuryVault;
        treasuryToken = _treasuryToken;
    }

    /**
     * @dev Users deposit their TreasuryTokens to join the pool.
     * Mints them a 1:1 vToken receipt.
     */
    function depositTokens(uint256 amount) external {
        require(amount > 0, "Amount must be greater than zero");

        // Pull TreasuryTokens from the user
        IERC20(treasuryToken).safeTransferFrom(
            msg.sender,
            address(this),
            amount
        );

        // Mint receipt tokens
        _mint(msg.sender, amount);
    }

    /**
     * @dev Users can withdraw their idle (non-voting) tokens at any time
     * by burning their receipt.
     */
    function withdrawIdle(uint256 amount) external {
        require(amount > 0, "Amount must be greater than zero");

        // Burn receipt tokens first (reverts if user doesn't have enough)
        _burn(msg.sender, amount);

        // Return original TreasuryTokens
        IERC20(treasuryToken).safeTransfer(msg.sender, amount);
    }

    /**
     * @dev Relayer submits the aggregated votes for a proposal.
     * Saves the Merkle Root for exit auditing.
     */
    function submitBatchVote(
        uint256 proposalId,
        uint256 totalVoteAmount,
        bytes32 merkleRoot
    ) external onlyOwner {
        proposalMerkleRoots[proposalId] = merkleRoot;

        // Approve Vault and execute a single aggregated deposit
        IERC20(treasuryToken).forceApprove(treasuryVault, totalVoteAmount);
        ITreasuryVault(treasuryVault).proposalDeposit(
            totalVoteAmount,
            address(this),
            proposalId
        );
    }

    /**
     * @dev Users claim their locked voting tokens back once a proposal is closed
     * by burning their receipt and presenting a Merkle Proof.
     */
    function claimExit(
        uint256 amount,
        uint256 proposalId,
        bytes32[] calldata proof
    ) external {
        require(!hasWithdrawn[msg.sender][proposalId], "Already claimed exit");

        // Verify user was part of the Merkle Tree for this proposal
        bytes32 leaf = keccak256(
            abi.encodePacked(msg.sender, amount, proposalId)
        );
        require(
            MerkleProof.verify(proof, proposalMerkleRoots[proposalId], leaf),
            "Invalid proof"
        );

        hasWithdrawn[msg.sender][proposalId] = true;

        // Burn their receipt tokens
        _burn(msg.sender, amount);

        // Return their original TreasuryTokens
        IERC20(treasuryToken).safeTransfer(msg.sender, amount);
    }
}
