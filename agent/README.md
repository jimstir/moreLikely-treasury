# AI Agent Orchestrator

This directory contains the autonomous AI Governor for the moreLikely Smart Treasury.

## Architecture

The AI Agent operates using a modular plugin/adapter pattern to ensure that the core logic is decoupled from specific implementations (like the `TreasuryVault` contract or the specific LLM used for inference).

### Core Components

- **`interfaces.ts`**: Defines the boundary layer for the agent (State Providers, Proposers, Trade Executors, and LLM Providers).
- **LLM Adapters**: The agent natively uses the 0G Compute Network for inference, but the interface pattern allows dropping in other models/networks (Gemini, OpenAI, etc.).
- **Decision Loop**: The core orchestrator that fetches the on-chain state, passes context to the LLM, reads the generated decision, and executes it via the defined `ITradeExecutor` or `IProposer`.

## Gas Escrow

To protect the agent's execution gas, all on-chain interactions are tied to the `AgentGasEscrow` smart contract. The agent cannot drain gas arbitrarily; it can only request gas top-ups from the escrow when it successfully proves an on-chain action (like executing an approved proposal or opening a proposal within the permitted rate limit).
