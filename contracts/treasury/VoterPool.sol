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
    IERC20 public immutable treasuryToken;

    uint256 public votingPeriod;
    bytes32 public globalUnlockRoot;

    struct ProposalRoot {
        bytes32 merkleRoot;
        uint256 votingRound;
        uint256 deadline;
        bool closed;
    }

    // Maps proposalId => ProposalRoot details
    mapping(uint256 => ProposalRoot) public proposalRoots;

    event VotingPeriodSet(uint256 oldPeriod, uint256 newPeriod);
    event GlobalUnlockRootUpdated(bytes32 newRoot);
    event ProposalClosed(uint256 indexed proposalId);

    constructor(
        address _treasuryVault,
        IERC20 _treasuryToken,
        address _owner
    ) ERC20("VotePool", "vToken") Ownable(_owner) {
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
        treasuryToken.safeTransferFrom(msg.sender, address(this), amount);

        // Mint receipt tokens
        _mint(msg.sender, amount);
    }

    function setVotingPeriod(uint256 _period) external onlyOwner {
        emit VotingPeriodSet(votingPeriod, _period);
        votingPeriod = _period;
    }

    function updateGlobalUnlockRoot(bytes32 _newRoot) external onlyOwner {
        globalUnlockRoot = _newRoot;
        emit GlobalUnlockRootUpdated(_newRoot);
    }

    /**
     * @dev Relayer submits the aggregated votes for a proposal.
     * Saves the Merkle Root for exit auditing.
     * Also updates the global unlock root to reflect newly locked tokens.
     */
    function submitBatchVote(
        uint256 proposalId,
        uint256 totalVoteAmount,
        bytes32 merkleRoot,
        uint256 votingRound,
        uint256 deadline,
        bytes32 newGlobalUnlockRoot
    ) external onlyOwner {
        proposalRoots[proposalId] = ProposalRoot({
            merkleRoot: merkleRoot,
            votingRound: votingRound,
            deadline: deadline,
            closed: false
        });
        
        globalUnlockRoot = newGlobalUnlockRoot;
        emit GlobalUnlockRootUpdated(newGlobalUnlockRoot);

        // Approve Vault and execute a single aggregated deposit
        IERC20(treasuryToken).forceApprove(treasuryVault, totalVoteAmount);
        ITreasuryVault(treasuryVault).proposalDeposit(
            totalVoteAmount,
            address(this),
            proposalId
        );
    }

    /**
     * @dev Marks a proposal's Merkle root as closed. 
     * The actual withdrawal of tokens from the vault is handled separately.
     * Also updates the global unlock root to reflect newly unlocked tokens.
     */
    function closeProposal(uint256 proposalId, bytes32 newGlobalUnlockRoot) external onlyOwner {
        require(!proposalRoots[proposalId].closed, "Already closed");
        proposalRoots[proposalId].closed = true;
        
        globalUnlockRoot = newGlobalUnlockRoot;
        emit GlobalUnlockRootUpdated(newGlobalUnlockRoot);
        
        emit ProposalClosed(proposalId);
    }

    /**
     * @dev Users claim their available unlocked tokens by burning their vTokens 
     * and presenting a Merkle Proof against the globalUnlockRoot.
     */
    function claimExit(
        uint256 amount,
        bytes32[] calldata proof
    ) external {
        // Verify user has this unlocked amount in the global root
        bytes32 leaf = keccak256(
            abi.encodePacked(msg.sender, amount)
        );
        require(
            MerkleProof.verify(proof, globalUnlockRoot, leaf),
            "Invalid global unlock proof"
        );

        // Burn their receipt tokens. Reverts if they don't have enough vTokens.
        // This naturally prevents double claiming on the same root, as their vToken balance decreases.
        _burn(msg.sender, amount);

        // Return their original TreasuryTokens
        IERC20(treasuryToken).safeTransfer(msg.sender, amount);
    }

    /**
     * @dev Restrict transfers to make the token non-transferable (Soulbound).
     * Only allows minting (from == address(0)) and burning (to == address(0)).
     */
    function _update(address from, address to, uint256 value) internal override {
        // If it's not a mint and not a burn, it's a peer-to-peer transfer, which is forbidden.
        if (from != address(0) && to != address(0)) {
            revert("VoterPool: vTokens are non-transferable");
        }
        
        super._update(from, to, value);
    }
}

