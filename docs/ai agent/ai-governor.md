---
title: AI-GOVERNOR
name: The AI Governor
status: draft
category: Standards Track
contributors: jimstir
---

## Abstract

This specification describes the AI governor mechanism designed to operate as the owner of an [Open Treasury](./open-treasury.md).
The AI Governor introduces a LLM-driven system that is authroized to handle all tasks required by the owner of an treasury,
while remaining transparent and
auditable by all stakeholders of the treasury.

## Background

While the Open Treasury standard provides a transparent, secure, and
democratic foundation for managing blockchain assets.
Traditional treasuries are inherently static, 
requiring human shareholders or owners to constantly monitor markets,
draft proposals, and manually execute trades. 
The AI Governor aims to bridge this gap by introducing an autonomous AI agent
(the "Governor").
This agent acts as the owner role on the open treasury.
To ensure the AI cannot go rogue or drain funds,
the architecture relies on strict interface boundaries,
and stakeholder-approved policies.
The goal is to maximize treasury growth through active AI management,
without sacrificing the transparent nature of the [Open Treasury](./open-treasury.md).

## Specification

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD",
"SHOULD NOT", "RECOMMENDED",  "MAY", and
"OPTIONAL" in this document are to be interpreted as described in
[RFC 2119](http://tools.ietf.org/html/rfc2119).

Each AI Governor implementation MUST consist of two distinct layers: an **Off-chain Decision Loop** (the orchestrator) and an **On-chain Security Layer** (the gas escrow and policy contracts).

### The Decision Loop

The AI Governor MUST operate via a deterministic decision loop that abstracts the underlying smart contracts from the Large Language Model (LLM). This loop consists of the following modular interfaces:

1. **`IStateProvider`**: Fetches the current state of the treasury (e.g., token balances via ERC20 view functions) and current market data. It MUST cross-reference a whitelisted set of approved tokens.
2. **`ILLMProvider`**: Submits the state to an AI network (e.g., 0G Compute Network) for reasoning and receives a `TradeRecommendation`.
3. **`RiskEngine`**: A deterministic ruleset that evaluates the AI's recommendation against hardcoded treasury goals (e.g., maximum allocation percentages, stop-loss limits, and slippage tolerance).
4. **`IProposer`**: If the risk checks pass, this module MUST interact with the Open Treasury to open a formal proposal (`proposalOpen`).
5. **`ITradeExecutor`**: Once a proposal is approved by shareholders, this module executes the trade via a compliant policy contract.

### Agent Memory & Context

To ensure continuity across autonomous operations, the AI Governor SHOULD implement a secure memory module for state retention and historical context. Without persistent memory, the agent cannot learn from past trades or avoid repeating unsuccessful strategies. This requires a decentralized, retrieveable storage solution where the agent's reasoning, rationale, and historical decisions are securely stored and rapidly indexed for future prompt injection, often utilizing dedicated Web3 memory services to preserve owner privacy and data sovereignty. For a detailed architectural implementation, refer to the [Agent Memory](./agent-memory.md) specification.

### Agent Funding & Security Safeguards

To prevent a compromised AI or backend server from draining treasury funds, the AI Governor MUST adhere to a strict dual-funding security model. The backend server hosting the AI agent's Externally Owned Account (EOA) MUST NOT hold large amounts of capital.

#### Ethereum Gas Escrow

The owner MUST deploy an `AgentGasEscrow` smart contract. This contract acts as a tightly-coupled smart wallet that holds the agent's ETH gas budget.
- **Proposal Gas:** The escrow SHOULD enforce a time-based rate limit (e.g., once every 24 hours) matching the agent's scheduled invocation frequency before releasing gas to open a new proposal.
- **Execution Gas:** Before releasing gas for trade execution, the escrow MUST verify on-chain that the specific proposal has been approved by the Open Treasury (`proposalApproved`) and has not yet been executed.

#### LLM Inference Billing

The backend MUST NOT hold the owner's crypto funds to pay for AI compute. 
Instead, the AI Governor SHOULD utilize a Decentralized Ledger pattern (e.g., via the 0G Compute SDK). The treasury owner deposits tokens directly into the AI provider's on-chain billing ledger via a frontend interface. The backend is provisioned solely with an API Secret, ensuring that even in the event of a server compromise, the attacker can only exhaust the pre-funded compute budget and cannot access the owner's core funds.

### The Policy Interaction

The AI Governor generates the necessary calldata (e.g., Uniswap routing data) and submits it to the policy. The policy contract MUST enforce that the tokens transferred out of the treasury are securely swapped and that the resulting assets are deposited back into the tokenized reserve, matching the parameters of the original AI proposal.

### Policy-Specific Responsibilities

Because the Open Treasury architecture is modular, the responsibilities of the treasury's manager (whether a human Owner or an autonomous AI Governor) vary significantly depending on the active policy contracts. The method of management must be clearly documented and shared with all shareholders prior to deploying the policy.

In all cases, the Human Owner and the AI Governor share the exact same on-chain privileges. However, the AI Governor provides 24/7 transparency, algorithmic precision, and automated execution. Below are the execution schemas defining the responsibilities for different policy types and management methods.

#### 1. Asset Swap Policy: Executor & Monitor Method
This method focuses on automating the lifecycle of a trade *after* the initial human decision.
- **AI Governor Responsibility:** The Human Owner manually creates a token acquisition proposal. Once shareholders approve it, the AI Governor executes the swap at the optimal time. Crucially, the AI then continuously monitors the acquired asset against on-chain stop-loss or take-profit metrics. When conditions are met, the AI automatically proposes and executes the sell order.
- **Human Owner Responsibility (Non-AI):** The Human Owner must manually monitor the market 24/7. When exit metrics are hit, the owner must manually draft a sell proposal, await stakeholder approval, and manually execute the trade—often resulting in severe slippage during the delay.
- **Execution Schema:**
  1. **Owner:** `proposalOpen(Buy)`
  2. **Shareholders:** `vote()`
  3. **Manager (AI/Human):** `executeSwap(Buy)`
  4. **Manager (AI/Human):** Continuously evaluates market conditions.
  5. **Manager (AI/Human):** `proposalOpen(Sell)` -> `executeSwap(Sell)` based on exit triggers.

#### 2. Asset Swap Policy: Stakeholder Evaluator Method
This method delegates the objective analysis of community-sourced ideas to the treasury manager.
- **AI Governor Responsibility:** Stakeholders suggest target tokens, or the platform maintains a community whitelist. The AI Governor evaluates these tokens against current market conditions and the predefined `TreasuryGoals`. If the risk/reward is favorable, the Agent proactively drafts and opens the buy proposal.
- **Human Owner Responsibility (Non-AI):** The Human Owner receives community suggestions off-chain (e.g., Discord, forums), manually performs technical and fundamental analysis, and decides whether to formally open a proposal on-chain.
- **Execution Schema:**
  1. **Stakeholders:** Provide a target token whitelist.
  2. **Manager (AI/Human):** Evaluates tokens against market conditions and risk limits.
  3. **Manager (AI/Human):** `proposalOpen(Buy)` (if evaluation passes).
  4. **Shareholders:** `vote()`
  5. **Manager (AI/Human):** `executeSwap(Buy)` -> Continues to monitor for exit conditions.

#### 3. Asset Swap Policy: Autonomous Researcher Method
This method grants the manager maximum autonomy to actively source deals.
- **AI Governor Responsibility:** The Agent is tasked with broad market surveillance. It independently scrapes market feeds, identifies undervalued assets, and proposes acquisitions entirely on its own initiative without requiring stakeholder seeds.
- **Human Owner Responsibility (Non-AI):** The Human Owner acts as a full-time quantitative researcher, actively scouring markets to source and propose deals.

#### 4. Lending Policy: Yield Management Method
Lending protocols require constant vigilance to maximize yield and prevent liquidations.
- **AI Governor Responsibility:** The Agent monitors connected lending protocols (e.g., Aave, Compound) for shifting APYs. It proactively proposes moving capital between lending pools to maximize yield, or immediately proposes withdrawing collateral if the health factor drops below a critical threshold to avoid liquidations.
- **Human Owner Responsibility (Non-AI):** The Human Owner must actively track APYs and collateral ratios across multiple protocols daily and manually initiate rebalancing or rescue proposals.
- **Execution Schema:**
  1. **Manager (AI/Human):** Monitors APYs and Health Factors continuously.
  2. **Manager (AI/Human):** `proposalOpen(Rebalance/Withdraw)` based on shifting yields or liquidation risks.
  3. **Shareholders:** `vote()`
  4. **Manager (AI/Human):** Executes the lending policy transaction.

## Copyright

Copyright and related rights waived via [CC0](https://creativecommons.org/publicdomain/zero/1.0/).

## References

- [Open Treasury Standard](./open-treasury.md)