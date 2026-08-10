// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/ITreasuryVault.sol";

contract TreasuryVoting is Ownable {
    using SafeERC20 for IERC20;

    struct StakeholderVote {
        address voter;
        uint256 amount;
        bool support;
        uint256 nonce;
        bytes signature;
    }

    address public treasuryVault;
    address public treasuryToken;

    bytes32 public DOMAIN_SEPARATOR;
    bytes32 public constant VOTE_TYPEHASH =
        keccak256(
            "Vote(address voter,uint256 proposalId,uint256 amount,bool support,uint256 nonce)"
        );

    constructor(
        address _treasuryVault,
        address _treasuryToken,
        address _initialOwner
    ) Ownable(_initialOwner) {
        treasuryVault = _treasuryVault;
        treasuryToken = _treasuryToken;

        uint256 chainId;
        assembly {
            chainId := chainid()
        }
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256(bytes("TreasuryVoting")),
                keccak256(bytes("1")),
                chainId,
                address(this)
            )
        );
    }

    // Pattern A: Direct deposit using stakeholder as receiver
    function batchVoteDirect(
        uint256 proposalId,
        StakeholderVote[] calldata votes
    ) external onlyOwner returns (bool) {
        for (uint256 i = 0; i < votes.length; i++) {
            StakeholderVote calldata voteInfo = votes[i];

            // 1. Verify EIP-712 voter signature
            bytes32 structHash = keccak256(
                abi.encode(
                    VOTE_TYPEHASH,
                    voteInfo.voter,
                    proposalId,
                    voteInfo.amount,
                    voteInfo.support,
                    voteInfo.nonce
                )
            );
            bytes32 hash = keccak256(
                abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash)
            );
            (bytes32 r, bytes32 s, uint8 v) = splitSignature(
                voteInfo.signature
            );
            address recoveredVoter = ecrecover(hash, v, r, s);
            require(
                recoveredVoter == voteInfo.voter,
                "Invalid voter signature"
            );

            // 2. Pull voter's TreasuryTokens to policy contract
            IERC20(treasuryToken).safeTransferFrom(
                voteInfo.voter,
                address(this),
                voteInfo.amount
            );

            // 3. Approve TreasuryVault to spend these TreasuryTokens
            IERC20(treasuryToken).forceApprove(treasuryVault, voteInfo.amount);

            // 4. Call proposalDeposit on Vault (sets stakeholder voter as receiver)
            ITreasuryVault(treasuryVault).proposalDeposit(
                voteInfo.amount,
                voteInfo.voter,
                proposalId
            );
        }
        return true;
    }

    // Pattern B: Policy receives shares first, then distributes to stakeholders
    function batchVoteAndDistribute(
        uint256 proposalId,
        StakeholderVote[] calldata votes
    ) external onlyOwner returns (bool) {
        for (uint256 i = 0; i < votes.length; i++) {
            StakeholderVote calldata voteInfo = votes[i];

            // 1. Verify EIP-712 voter signature
            bytes32 structHash = keccak256(
                abi.encode(
                    VOTE_TYPEHASH,
                    voteInfo.voter,
                    proposalId,
                    voteInfo.amount,
                    voteInfo.support,
                    voteInfo.nonce
                )
            );
            bytes32 hash = keccak256(
                abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash)
            );
            (bytes32 r, bytes32 s, uint8 v) = splitSignature(
                voteInfo.signature
            );
            address recoveredVoter = ecrecover(hash, v, r, s);
            require(
                recoveredVoter == voteInfo.voter,
                "Invalid voter signature"
            );

            // 2. Pull voter's TreasuryTokens to policy contract
            IERC20(treasuryToken).safeTransferFrom(
                voteInfo.voter,
                address(this),
                voteInfo.amount
            );

            // 3. Approve TreasuryVault to spend these TreasuryTokens
            IERC20(treasuryToken).forceApprove(treasuryVault, voteInfo.amount);

            // 4. Call proposalDeposit on Vault (sets this policy contract as receiver)
            uint256 shares = ITreasuryVault(treasuryVault).proposalDeposit(
                voteInfo.amount,
                address(this),
                proposalId
            );

            // 5. Transfer vault shares back to stakeholder
            IERC20(treasuryVault).safeTransfer(voteInfo.voter, shares);
        }
        return true;
    }

    function splitSignature(
        bytes memory sig
    ) internal pure returns (bytes32 r, bytes32 s, uint8 v) {
        require(sig.length == 65, "invalid signature length");

        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
    }
}
