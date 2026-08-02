---
title: AI-GOVERNOR
name: The AI Governor
status: draft
category: Standards Track
contributors: jimstir <x.com/jimstir0>
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

When the AI Governor decides to execute a trade, it MUST do so through an Open Treasury Compliant Policy.
The AI Governor generates the necessary calldata (e.g., Uniswap routing data) and submits it to the policy. The policy contract MUST enforce that the tokens transferred out of the treasury are securely swapped and that the resulting assets are deposited back into the tokenized reserve, matching the parameters of the original AI proposal.

## Copyright

Copyright and related rights waived via [CC0](https://creativecommons.org/publicdomain/zero/1.0/).

## References

- [Open Treasury Standard](./open-treasury.md)