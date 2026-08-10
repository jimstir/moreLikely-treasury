// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./TreasuryVault.sol";

/**
 * @title SmartWallet
 * @dev A transaction forwarder and gas escrow for the AI Governor.
 * Secures the treasury by restricting the execution wallet to rate-limited proposals
 * and strictly verified executions based on TreasuryVault voting state.
 */
contract SmartWallet {
    address public owner;
    address public executionWallet;
    TreasuryVault public vault;

    uint256 public proposalRateLimit;
    uint256 public lastProposalTime;
    uint256 public maxGasPrice;

    mapping(address => bool) public allowedPolicies;

    event Deposited(address indexed sender, uint256 amount);
    event Withdrawn(address indexed owner, uint256 amount);
    event GasRefunded(address indexed to, uint256 amount);
    event PolicyUpdated(address indexed policy, bool allowed);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyExecutionWallet() {
        require(msg.sender == executionWallet, "Not execution wallet");
        _;
    }

    constructor(
        address _executionWallet,
        address _vault,
        uint256 _proposalRateLimit,
        uint256 _maxGasPrice
    ) {
        owner = msg.sender;
        executionWallet = _executionWallet;
        vault = TreasuryVault(_vault);
        proposalRateLimit = _proposalRateLimit;
        maxGasPrice = _maxGasPrice;
    }

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    function deposit() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    function withdrawAll() external onlyOwner {
        uint256 balance = address(this).balance;
        (bool success, ) = owner.call{value: balance}("");
        require(success, "Transfer failed");
        emit Withdrawn(owner, balance);
    }

    function updateExecutionWallet(address _newWallet) external onlyOwner {
        executionWallet = _newWallet;
    }

    function updateRateLimit(uint256 _newLimit) external onlyOwner {
        proposalRateLimit = _newLimit;
    }

    function updateMaxGasPrice(uint256 _newPrice) external onlyOwner {
        maxGasPrice = _newPrice;
    }

    function setPolicyAllowed(address policy, bool allowed) external onlyOwner {
        allowedPolicies[policy] = allowed;
        emit PolicyUpdated(policy, allowed);
    }

    function forwardProposal(
        uint256 amount,
        address receiver,
        address pOwner,
        bool rate,
        bool request,
        IERC20 token
    ) external onlyExecutionWallet returns (uint256) {
        require(
            block.timestamp >= lastProposalTime + proposalRateLimit,
            "Rate limited"
        );
        lastProposalTime = block.timestamp;

        uint256 gasStart = gasleft();

        uint256 proposalId = vault.proposalOpen(
            amount,
            receiver,
            pOwner,
            rate,
            request,
            token
        );

        _refundGas(gasStart);
        return proposalId;
    }

    function forwardExecution(
        address target,
        uint256 proposalId,
        bytes calldata data
    ) external onlyExecutionWallet {
        require(
            allowedPolicies[target] || target == address(vault),
            "Target not allowed"
        );
        require(vault.vote(proposalId) == true, "Proposal not approved");
        require(!vault.closedProposal(proposalId), "Proposal closed");

        uint256 gasStart = gasleft();

        (bool success, bytes memory ret) = target.call(data);
        if (!success) {
            if (ret.length > 0) {
                assembly {
                    let returndata_size := mload(ret)
                    revert(add(32, ret), returndata_size)
                }
            } else {
                revert("Execution failed");
            }
        }

        _refundGas(gasStart);
    }

    function forwardClose(uint256 proposalId) external onlyExecutionWallet {
        uint256 gasStart = gasleft();
        vault.proposalClose(proposalId);
        _refundGas(gasStart);
    }

    function _refundGas(uint256 gasStart) internal {
        uint256 gasUsed = gasStart - gasleft() + 30000; // 30k base overhead
        uint256 gasPrice = tx.gasprice > maxGasPrice
            ? maxGasPrice
            : tx.gasprice;
        uint256 refundAmount = gasUsed * gasPrice;

        if (address(this).balance >= refundAmount) {
            (bool success, ) = executionWallet.call{value: refundAmount}("");
            if (success) {
                emit GasRefunded(executionWallet, refundAmount);
            }
        }
    }
}
