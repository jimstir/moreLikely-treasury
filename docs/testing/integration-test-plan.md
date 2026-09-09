# Platform Integration Test Plan

This document outlines the full scope of integration testing required for the moreLikely Smart Treasury platform. Unlike unit tests (which mock external dependencies to test internal logic), **Integration Tests** validate that our system correctly interacts with live third-party services, APIs, blockchains, and smart contracts.

---

## 1. AI Governor & Backend Boundaries

These tests validate the communication between the backend `Orchestrator` / `ContextBuilder` and external Web2/Web3 infrastructure.

### 1.1 0G Compute Network (Agentic Wallet)
- **Scope:** Verify the `ComputeClient` connects to the 0G Network.
- **Test Actions:**
  - Initialize the client using `ZEROG_COMPUTE_API_KEY` and `ZEROG_COMPUTE_BASE_URL`.
  - Submit a test inference and verify the router successfully routes the request and returns a structured JSON payload.
  - Verify that if an invalid API key is used, the network accurately rejects the request due to insufficient ledger balance.

### 1.2 Platform Gemini LLM Subscription
- **Scope:** Verify the backend correctly routes to Google Gemini when the user is a Platform Subscriber.
- **Test Actions:**
  - Submit an inference via the `OpenAI` compatible SDK using `GEMINI_API_KEY`.
  - Validate the response is successfully parsed into a `TradeRecommendation` object.

### 1.3 0G Storage Network (Transcript Logging)
- **Scope:** Verify the `logger.ts` correctly archives AI decision transcripts to decentralized storage.
- **Test Actions:**
  - Use an ethers wallet to sign an upload transaction to the `0G_STORAGE_INDEXER`.
  - Validate the indexer returns a valid cryptographic receipt hash.

### 1.4 Circle Developer-Controlled Wallets
- **Scope:** Verify the backend can provision and execute transactions via Circle Smart Contract Accounts (SCAs).
- **Test Actions:**
  - Authenticate using `CIRCLE_API_KEY` and `CIRCLE_ENTITY_SECRET`.
  - Provision a test SCA wallet for a mock user.
  - Submit a raw transaction payload (e.g., calling `proposalOpen` on Sepolia) and verify Circle returns a valid transaction ID.

### 1.5 PostgreSQL Database (Prisma)
- **Scope:** Verify the connection to the core relational database.
- **Test Actions:**
  - Perform CRUD operations for users, treasuries, and historical decision logs to ensure schema integrity and active connection.

### 1.6 Platform Scheduler (Recurring Cron)
- **Scope:** Verify the `scheduler.ts` loops correctly and applies database limits.
- **Test Actions:**
  - Mock the `PlatformConfig` database table and verify the daemon adjusts its polling interval and concurrency in real-time.
  - Verify that treasuries marked as `gemini` are executed, while `0g` and `private` are ignored.
  - Test the `isPaused` kill-switch instantly halts all execution.

---

## 2. Smart Contract & Blockchain Boundaries

These tests validate the on-chain execution logic, rate-limiting, and interactions with external protocols on the Sepolia Testnet.

### 2.1 Pashov Agent Audit Integration
**Scope:** Security Auditing and "By-Design" Vulnerability Documentation.
Because the Smart Treasury uses unique permission models (e.g., AI Agents possessing execution rights, decoupled Gas Escrows), standard automated audits may flag false positives or fundamentally intended architectural choices as vulnerabilities.
- **Testing Approach:** Implement the **[Pashov Solidity Auditor Skill](https://github.com/pashov/skills/tree/main/solidity-auditor)** against the `contracts/` directory.
- **Objective:** 
  1. Find genuine logic flaws, reentrancy vectors, and access control issues.
  2. Formally document and whitelist "by-design" vulnerabilities (e.g., the AI agent's ability to trigger `execute` without a human signature) to ensure future auditors understand the architectural intent.

### 2.2 SubscriptionManager NFT Validations
- **Scope:** Verify the backend can read external NFT states.
- **Test Actions:**
  - Connect to the `SEPOLIA_RPC_URL`.
  - Query `userPrimaryToken(address)` on the `SubscriptionManager` contract.
  - Validate it correctly returns `> 0` for an active subscriber and `0` for an inactive address.

### 2.3 Oracle Router
- **Scope:** Verify the `AssetSwapPolicy` and `ContextBuilder` can fetch live market data.
- **Test Actions:**
  - Call the Oracle Router contract for a specific token pair.
  - Validate that it successfully returns accurate `price` and `liquidity` metrics.

### 2.4 TreasuryVault & Policies Execution
- **Scope:** End-to-end execution of a trade proposal.
- **Test Actions:**
  - Test the `AgentGasEscrow` releases ETH gas to an authorized EOA.
  - Verify the EOA can successfully call `executeSwap` on the `AssetSwapPolicy`.
  - Ensure the policy transfers the exact amounts and updates the core `TreasuryVault` ledger correctly.

---

## 3. Frontend & API Routing Boundaries

These tests validate that the Next.js frontend correctly builds payloads and routes them to the backend or blockchain.

### 3.1 Voting API (`/api/voting`)
- **Scope:** Verify payload delivery from the user interface.
- **Test Actions:**
  - Submit a "Vote For" action from the UI.
  - Validate the API route successfully receives the payload and formats the EIP-712 signature correctly.

### 3.2 Trust Profile API (`/api/trust-profile`)
- **Scope:** Verify the dashboard correctly fetches and merges on-chain data with AI analysis.
- **Test Actions:**
  - Fetch raw smart contract metrics.
  - Route the metrics through the AI Governor API and validate the Trust Profile returns a merged severity score and text rationale.

### 3.3 Treasury & Governor APIs (`/api/treasury`, `/api/governor`)
- **Scope:** Verify the dashboard correctly displays historical actions and triggers manual evaluations.
- **Test Actions:**
  - Trigger `/api/governor/evaluate` and verify it successfully hands off the execution to the background Orchestrator.
  - Fetch historical PnL metrics from `/api/treasury/metrics` and validate data structure.
