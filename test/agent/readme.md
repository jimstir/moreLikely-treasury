# AI Governor Modular Test Suite

This directory contains the testing framework for the AI Governor modules, broken out by deployment configurations and component boundaries. Because the AI Agent was transitioned from a monolithic architecture into a multi-step pipeline (`Orchestrator` -> `ContextBuilder` -> `ReasoningEngine` -> `Executor`), the tests here focus on isolating these steps and verifying different deployment topologies.

## Test Structure

### 1. `deployments/`
Integration tests that mock external networking (Circle SDK, LLM HTTP calls, RPC state) but run the full agent pipeline. They verify that the Orchestrator successfully configures the pipeline for specific user deployments.
- **`platformSubscriber.test.ts`**: Tests the Platform Subscriber pipeline (Gemini). Verifies backend subscription checking, the application of Private Overrides during Context Building, and successful Circle `openProposal` generation.
- **`zeroGNetwork.test.ts`**: Tests the decentralized 0G configuration. Verifies on-chain ZG balance requirements and ensures Private Overrides are *never* loaded for non-subscriber deployments.
- **`privateProvider.test.ts`**: Tests the self-hosted configuration. Verifies that platform billing/subscription checks are completely bypassed.

### 2. `components/`
Isolated unit tests that ensure the mathematical and logical boundaries of the autonomous agents never fail in production.
- **`contextBuilder.test.ts`**: Verifies file-system access (or mocked DB access) to successfully stitch together Public Policy RFC standards, Agent Memory, and Private Overrides.
- **`executor.test.ts`**: The most critical test file. Verifies the `Executor`'s deterministic risk engine. Asserts that hallucinatory or malicious LLM outputs (e.g., trying to swap 100% of the treasury into a volatile asset) are intercepted and rejected before ever touching the Circle SDK or the blockchain.

## Running the Tests
To execute this suite locally:
```bash
npx hardhat test test/agent/**/*.test.ts
```
