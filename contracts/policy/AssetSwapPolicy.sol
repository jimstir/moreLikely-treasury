// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/ITreasuryPolicy.sol";

contract AssetSwapPolicy is Ownable, ITreasuryPolicy {
    using SafeERC20 for IERC20;

    event SwapExecuted(
        uint256 indexed proposalId,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );
    event ProposalDisputed(uint256 indexed proposalId, address indexed disputer, uint256 reviewPeriodEnd);
    event DisputeResolved(uint256 indexed proposalId);

    address public treasuryVault;
    uint256 public proposalNum;
    address public universalRouter;
    address public attestationSigner;
    uint256 public disputePeriod = 1 days;

    mapping(uint256 => bool) public executedProposals;
    mapping(uint256 => bool) public disputedProposals;
    mapping(uint256 => uint256) public reviewPeriodEnd;

    constructor(
        address _treasuryVault,
        address _universalRouter,
        address _attestationSigner,
        address _initialOwner
    ) Ownable(_initialOwner) {
        treasuryVault = _treasuryVault;
        universalRouter = _universalRouter;
        attestationSigner = _attestationSigner;
    }

    function setAttestationSigner(address _attestationSigner) external onlyOwner {
        attestationSigner = _attestationSigner;
    }

    function setUniversalRouter(address _universalRouter) external onlyOwner {
        universalRouter = _universalRouter;
    }

    function setDisputePeriod(uint256 _disputePeriod) external onlyOwner {
        disputePeriod = _disputePeriod;
    }

    // Trigger dispute: pauses proposal execution for a review period.
    // In production, requires the caller holds a minimum percentage of shares.
    function triggerDispute(uint256 proposalId) external {
        disputedProposals[proposalId] = true;
        reviewPeriodEnd[proposalId] = block.timestamp + disputePeriod;
        emit ProposalDisputed(proposalId, msg.sender, reviewPeriodEnd[proposalId]);
    }

    function resolveDispute(uint256 proposalId) external onlyOwner {
        disputedProposals[proposalId] = false;
        emit DisputeResolved(proposalId);
    }

    function isPaused(uint256 proposalId) public view returns (bool) {
        if (disputedProposals[proposalId]) {
            return block.timestamp < reviewPeriodEnd[proposalId];
        }
        return false;
    }

    // Execute swap using Uniswap Router.
    // Expects the vault has already transferred tokenIn to this policy contract.
    function executeSwap(
        uint256 proposalId,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 totalVotesFor,
        uint256 totalVotesAgainst,
        bytes calldata attestationSignature,
        bytes calldata swapCallData
    ) external returns (bool) {
        require(!executedProposals[proposalId], "Proposal already executed");
        require(!isPaused(proposalId), "Proposal execution is paused due to dispute");

        // Verify AI Attestation Signature
        bytes32 messageHash = keccak256(abi.encodePacked(proposalId, totalVotesFor, totalVotesAgainst, true));
        bytes32 ethSignedMessageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        address recovered = recoverSigner(ethSignedMessageHash, attestationSignature);
        require(recovered == attestationSigner, "Invalid AI attestation signature");

        // Verify voting threshold (e.g. votes in support must exceed votes against)
        require(totalVotesFor > totalVotesAgainst, "Voting criteria not met");

        // Verify balance
        uint256 balanceBefore = IERC20(tokenIn).balanceOf(address(this));
        require(balanceBefore >= amountIn, "Insufficient tokenIn balance in policy");

        // Approve router
        IERC20(tokenIn).forceApprove(universalRouter, amountIn);

        // Record balance of output token before swap
        uint256 tokenOutBefore = IERC20(tokenOut).balanceOf(address(this));

        // Execute swap call
        (bool success, ) = universalRouter.call(swapCallData);
        require(success, "Uniswap swap execution failed");

        // Record balance of output token after swap
        uint256 tokenOutAfter = IERC20(tokenOut).balanceOf(address(this));
        uint256 amountOut = tokenOutAfter - tokenOutBefore;
        require(amountOut > 0, "Swap returned zero output tokens");

        // Transfer swapped assets back to vault
        IERC20(tokenOut).safeTransfer(treasuryVault, amountOut);

        executedProposals[proposalId] = true;
        emit SwapExecuted(proposalId, tokenIn, tokenOut, amountIn, amountOut);

        return true;
    }

    function recoverSigner(bytes32 _ethSignedMessageHash, bytes memory _sig) internal pure returns (address) {
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(_sig);
        return ecrecover(_ethSignedMessageHash, v, r, s);
    }

    function splitSignature(bytes memory sig) internal pure returns (bytes32 r, bytes32 s, uint8 v) {
        require(sig.length == 65, "invalid signature length");

        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
    }
    function getTotalValue() external view returns (uint256) {
        return 0;
    }

    function liquidate() external onlyOwner {
        // Return underlying funds to treasury if applicable
    }
}
