---
title: AI-GOVERNOR
name: The AI Governor
status: draft
category: Standards Track
contributors: jimstir
---

## Overview

This specification describes the AI governor mechanism designed to automate governance, risk monitoring, and operational actions for a [Smart Treasury](../smart contracts/treasury-arch.md). The AI Governor introduces an LLM-driven system that is authorized to handle complex tasks for owners, shareholders, and operators, while remaining transparent and auditable.

## Background

While the Open Treasury standard provides a transparent, secure, and democratic foundation for managing blockchain assets, traditional treasuries are static. They require human shareholders or owners to constantly monitor markets, draft proposals, and manually execute trades. 

The AI Governor bridges this gap by introducing autonomous AI agents. Depending on the configuration and use case, this agent acts as the Treasury Owner, a Shareholder risk auditor, or an external arbitrage Operator. To ensure the AI cannot go rogue or drain funds, the architecture relies on strict interface boundaries, on-chain gas escrows, and stakeholder-approved policies.

---

## AI Governor Use Cases

The AI Governor mechanism is integrated directly into the core treasury concepts and supports three distinct functional use cases within the platform:

1. **Treasury Owner Agent (Owner Automation):**
   * **Description:** Deployed by the Treasury Owner to automate the daily administrative and risk-management tasks of running a vault.
   * **List of Tasks (Prompt Evaluation):** The agent evaluates market conditions against a dedicated system prompt (`agent/prompts/owner-agent-prompt.txt`) to execute structured JSON decisions:
     * *Portfolio Rebalancing:* Monitors asset deviation and triggers `swapBack()` on the `AssetSwapPolicy` if allocations drift beyond target limits.
     * *Default Protection (Liquidation):* Continuously monitors the health factors of active loans in the `LendingPolicy`. If a loan defaults, it instantly triggers `seizeCollateral()` to protect the treasury's principal.
     * *Proposal Generation:* Detects high-yield opportunities and automatically drafts EIP-712 formatted proposals for shareholders to vote on.
   * **Deployment & Authorization Process:** After the human owner provisions the treasury and creates the agent's Circle Smart Wallet, the platform backend provides the agent's public EOA address. The human owner MUST then submit an on-chain transaction calling `addAuth(agentWalletAddress)` on the `TreasuryVault`. This officially delegates execution rights to the AI, allowing it to bypass human delays for critical operations while still being bound by the vault's core security constraints.
2. **Shareholder/User Agent (Trust & Voting Helper):**
   * **Description:** Tasked by a current or future stakeholder to continuously monitor the treasury's **Trust Profile**.
   * **Dashboard Integration:** The Trust Profile operates as a dedicated module. When managed by the Shareholder Agent, its computed security scores, flags, and warnings are compiled and displayed in a dedicated widget inside the Treasury's independent details dashboard (can also be manually operated by the user).
   * **Layer 2 Contextual Overlay:** Users with an active on-chain subscription (verified via the `SubscriptionManager` contract defined in `.env`) can enable automatic Trust Profile evaluations. The AI Governor analyzes raw Layer 1 metrics against the **Treasury Mandate** (shareholder goals) to dynamically adjust severity scores and provide structural rationales for any flagged items.
   * **Governance Automation:** Analyzes incoming proposals against the user's custom risk limits and recommends or automatically signs and submits votes on their behalf.
3. **Operator Agent (Arbitrage & Liquidator):**
   * **Description:** Deployed by external searchers/arbitrageurs to generate profits from liquidation bonuses.
   * **Platform Integration:** Monitors the platform-wide **Global Liquidation Dashboard** (which indexes all isolated lending policies) to spot default events and execute on-chain liquidations instantly.

---

## Deployment Methods

The platform supports deploying and running AI Governors through three distinct execution configurations. Each deployment type has a dedicated configuration and settings panel in the UI:

1. **0G Compute Network (Decentralized):**
   * **Configuration:** The agent runs on the decentralized 0G Compute network.
   * **On-Chain Payments:** Operates direct on-chain billing on the ZG blockchain using ZG tokens.
   * **Transcripts & Auditability:** Persists decision reports and conversation history directly to the ZG Storage layer (incurring ZG token storage fees).
   * **UI Settings Panel:** Provides a dedicated dashboard where the user can view their ZG token balances, configure ZG Storage nodes, and review verifiable inference receipts.
2. **Platform Gemini LLM (Managed/Centralized):**
   * **Configuration:** The platform runs a managed instance of Google's Gemini LLM.
   * **On-Chain Subscription Check:** To prevent abuse and enforce invocation limits, the platform's backend checks the user's subscription status by querying an on-chain **Subscription Smart Contract**.
   * **Environment Setup:** The address of the on-chain Subscription Smart Contract must be defined in the backend configuration via the `.env` file (`SUBSCRIPTION_CONTRACT_ADDRESS=0x...`).
   * **UI Settings Panel:** Displays the user's active subscription tier, monthly invocation caps, and active task configurations.
3. **Private/Self-Hosted Deployment:**
   * **Configuration:** The user hosts the agent runner locally or on their own cloud infrastructure (e.g., a Node.js runner).
   * **Metadata Registry:** To maintain auditability for shareholders, the user registers their agent metadata with the platform (stored **for free in the platform database**):
     * `statusCheckUrl`: The endpoint for the platform to query the agent's live heartbeat.
     * `receiptWebhookUrl`: The endpoint where the agent publishes decision transcripts (conforming to a standard schema copied from the 0G Network's receipt structure).
   * **UI Settings Panel:** Allows the user to input and update their private endpoints, API keys, and callback webhooks.

---

## Core Specification

Each AI Governor implementation MUST consist of two distinct layers: an **Off-chain Decision Loop** (the orchestrator) and an **On-chain Security Layer** (the gas escrow and policy contracts).

### The Decision Loop

The AI Governor MUST operate via a deterministic decision loop that abstracts the underlying smart contracts from the Large Language Model (LLM). This loop consists of the following modular interfaces:

1. **`IStateProvider`**: Fetches the current state of the treasury (e.g., token balances via ERC20 view functions) and current market data. It MUST cross-reference a whitelisted set of approved tokens. Crucially, all AI tasks MUST align directly with available on-chain actions by validating the current state of the `TreasuryVault` and any active Policy contracts.
2. **`ILLMProvider`**: Submits the state to an AI network (e.g., 0G Compute Network) for reasoning and receives a `TradeRecommendation`.
3. **`RiskEngine`**: A deterministic ruleset that evaluates the AI's recommendation against hardcoded treasury goals (e.g., maximum allocation percentages, stop-loss limits, and slippage tolerance).
4. **`IProposer`**: If the risk checks pass, this module MUST interact with the Open Treasury to open a formal proposal (`proposalOpen`).
5. **`ITradeExecutor`**: Once a proposal is approved by shareholders, this module executes the trade via a compliant policy contract.

### Agent Memory & Context

To ensure continuity across autonomous operations, the AI Governor SHOULD implement a secure memory module for state retention and historical context. Without persistent memory, the agent cannot learn from past trades or avoid repeating unsuccessful strategies. This requires a decentralized, retrieveable storage solution where the agent's reasoning, rationale, and historical decisions are securely stored and rapidly indexed for future prompt injection, often utilizing dedicated Web3 memory services to preserve owner privacy and data sovereignty. For a detailed architectural implementation, refer to the [Agent Memory](./agent-memory.md) specification.

### Public Standards & Private Overrides (Subscribers Only)

The platform publishes an RFC-style standard document outlining default recurring rules and success/fail scenarios for each policy type (e.g., Asset Swap, Lending). 

For **Platform Subscribers**, these defaults can be secretly augmented. Subscribers gain the exclusive ability to apply **Private Overrides** to these policy documents. These overrides act as trade secrets, allowing the deployer to provide the AI Governor with custom strategies, external contexts, or specialized tools without revealing them publicly to shareholders or third parties.

### Agent Funding & Security Safeguards

To prevent a compromised AI or backend server from draining treasury funds, the AI Governor MUST adhere to a strict dual-funding security model. The backend server hosting the AI agent's Externally Owned Account (EOA) MUST NOT hold large amounts of capital.

#### Ethereum Gas Escrow

The owner MUST deploy an `AgentGasEscrow` smart contract. This contract acts as a tightly-coupled smart wallet that holds the agent's ETH gas budget.
- **Proposal Gas:** The escrow SHOULD enforce a time-based rate limit (e.g., once every 24 hours) matching the agent's scheduled invocation frequency before releasing gas to open a new proposal.
- **Execution Gas:** Before releasing gas for trade execution, the escrow MUST verify on-chain that the specific proposal has been approved by the Open Treasury (`proposalApproved`) and has not yet been executed.

#### LLM Inference Billing

The backend MUST NOT hold the owner's crypto funds to pay for AI compute. 
Instead, the AI Governor utilizes two distinct billing processes depending on the deployment configuration:

**1. The Agentic Wallet Process (0G Network Router Approach)**
When deployed on the 0G Compute Network, the agent uses an "Agentic Wallet". Instead of the backend codebase holding a private key and manually signing ledger transactions, the infrastructure utilizes the **Router Approach**:
- The treasury owner deposits ZG tokens directly into the 0G Private Computer Router via a frontend interface.
- The backend is provisioned solely with a `0G_API_KEY`.
- The Router abstracts the on-chain ledger settlement, seamlessly mapping the API Key to the pre-funded on-chain balance. If the balance is depleted, the Router automatically rejects the inference request.

**2. The Platform Smart Wallet Process (Gemini Subscription)**
When deployed via the managed Platform Gemini LLM, inference billing is handled via a traditional Web3 subscription model rather than a per-token ledger:
- The backend queries the on-chain `SubscriptionManager` smart contract to verify the user holds an active, unexpired subscription NFT.
- Universal backend allowances (e.g., maximum monthly requests) are enforced natively by the Orchestrator off-chain.
- The platform pays the underlying fiat LLM costs, and the user's on-chain subscription covers the platform fees.

### The Policy Interaction

The AI Governor generates the necessary calldata (e.g., Uniswap routing data) and submits it to the policy. The policy contract MUST enforce that the tokens transferred out of the treasury are securely swapped and that the resulting assets are deposited back into the tokenized reserve, matching the parameters of the original AI proposal.

To enforce a unified permission structure, policy contracts DO NOT maintain local owner variables. Instead, they dynamically query the `TreasuryVault` (via the `auth` modifier) to verify if the caller is the `tOwner()` or an authorized executor via `getAuth()`. This allows the owner to delegate or revoke the AI Governor's execution privileges centrally on the Vault, which instantly propagates to all active policies.

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

#### 5. Lending Policy: Automated Liquidation Flow (Fallback Path)
Lending policies require immediate repossession and conversion of collateral during a borrower default to protect the treasury from market risk.
- **AI Governor Responsibility:** The Agent continuously monitors active loans in the `LendingPolicy` contract. If a loan defaults (due to LTV breach or time expiry), the Agent automatically executes the fallback path. It calls `seizeCollateral(borrower)` on the lending contract, repossessing the collateral (e.g. WETH) to the `TreasuryVault`. It then scans historical proposals to locate the registered `AssetSwapPolicy` contract, drafts and approves a proposal to transfer the WETH to the swap policy, and triggers `executeSwap()` to sell it for the vault's base asset (e.g. USDC). The swap policy then calls `depositTreasury(..., true, proposalId)`, automatically updating the vault ledger and closing the loop.
- **Human Owner Responsibility (Non-AI):** The human owner must manually track loan health, call `seizeCollateral()`, locate the swap policy, draft a swap proposal, and manually execute the trade—exposing the treasury to severe price drop risks during the delay.
- **Execution Schema:**
  1. **AI Agent:** Monitors loan health and detects a default.
  2. **AI Agent:** Calls `seizeCollateral(borrower)` on the Lending Policy contract.
  3. **AI Agent:** Opens and executes a proposal to transfer seized collateral from the Vault to the `AssetSwapPolicy` contract.
  4. **AI Agent:** Calls `executeSwap()` on the `AssetSwapPolicy` to trade collateral back to the base asset.
  5. **AssetSwapPolicy:** Executes Uniswap trade and returns base assets via `depositTreasury()` to settle the ledger.

---

## Smart Wallet & Circle Integration Flows

To prevent key theft and protect user assets from on-chain execution abuse (such as rogue AI behavior or compromised backend servers), the AI Governor architecture enforces a strict boundary between **Key Custody** (Circle Developer-Controlled Wallet) and **On-Chain Governance/Rate-Limiting** (Contract Wallet / Gas Escrow).

### Core Components:
1. **The Signer (Circle EOA):** The signing wallet address managed in Circle's secure hardware modules. It has zero initial ETH gas and cannot make arbitrary transfers.
2. **The Guardrail (AgentGasEscrow Contract):** Holds the owner's ETH gas budget on-chain. It enforces time-locked rate limits and verifies proposal states on the `TreasuryVault` before releasing gas.

### Transaction Flow per Deployment Configuration:

#### 1. 0G Compute Network (Decentralized Agent)
The agent runs on a public decentralized node. Circle API credentials are never stored on the node.
1. The 0G Compute AI Agent completes its reasoning loop and determines an action (e.g. `proposalOpen`).
2. The agent sends a secure HTTP POST request containing the trade parameters and ZG receipt to the **Platform Backend Relayer** (`/api/governor/execute-trade`).
3. The platform backend verifies the ZG receipt, validates the request against risk limits, and uses its secure credentials to trigger the Circle API.
4. Circle commands the **Signer EOA** to request gas from the `AgentGasEscrow` contract.
5. The `AgentGasEscrow` contract checks the daily allowance limit on-chain. If valid, it transfers the gas (ETH) to the **Signer EOA**.
6. The **Signer EOA** immediately executes the transaction (`proposalOpen`) on the `TreasuryVault` on Sepolia and the remaining gas is spent.

#### 2. Platform Gemini LLM (Managed Agent)
The platform backend manages both the LLM execution and the Circle wallet triggers.
1. The platform-managed Gemini model decides to execute a trade.
2. The platform backend queries the on-chain **Subscription Smart Contract** to verify the user has not exceeded their invocation limits.
3. The backend calls the Circle API to sign the transaction.
4. Circle commands the **Signer EOA** to call the `AgentGasEscrow` contract for gas.
5. The `AgentGasEscrow` releases the gas to the **Signer EOA** after validating on-chain rate limits.
6. The **Signer EOA** executes the transaction on the `TreasuryVault` on Sepolia.

#### 3. Private/Self-Hosted Agent
The user hosts their own agent runner locally. The platform backend is completely bypassed for signing and execution.
1. The user's self-hosted runner decides to execute a trade.
2. The runner, configured locally with the user's private Circle developer credentials, directly calls the Circle API from its private server.
3. Circle commands the user's private **Signer EOA** to call the `AgentGasEscrow` contract to retrieve gas.
4. The `AgentGasEscrow` validates the on-chain rate limits and transfers gas to the EOA.
5. The private **Signer EOA** signs and executes the transaction on the `TreasuryVault` on Sepolia.

### Technical Implementation Details (Circle SDK)

To integrate Circle's multi-tenant Developer-Controlled Wallets into the platform backend, developers must implement the following operations:

#### 1. Provisioning a User Agent Wallet
When a user deploys an AI Governor, the backend initializes the `@circle-fin/developer-controlled-wallets` client and provisions a unique Smart Contract Account (SCA) for that user:
```typescript
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { v4 as uuidv4 } from "uuid";

const circleClient = initiateDeveloperControlledWalletsClient({
    apiKey: process.env.CIRCLE_API_KEY!,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

async function provisionAgentWallet(): Promise<{ walletId: string; address: string }> {
    const response = await circleClient.createWallet({
        idempotencyKey: uuidv4(),
        accountType: "SCA", // Smart Contract Account (ERC-4337 Compliant)
        chain: "ETH-SEPOLIA" // Target network
    });

    const walletId = response.data?.wallet?.id;
    const address = response.data?.wallet?.address;

    if (!walletId || !address) {
        throw new Error("Circle wallet provisioning failed");
    }

    return { walletId, address };
}
```

#### 2. Database Mapping (Multi-Tenant Separation)
The platform maps the generated `walletId` (a unique Circle UUID) directly to the user's database record. The platform does not store private keys, only the `walletId` reference:
```prisma
model UserAgent {
  id             String   @id @default(uuid())
  userId         String   @unique
  treasuryId     String
  circleWalletId String   // e.g., "550e8400-e29b-41d4-a716-446655440000"
  walletAddress  String   // EOA address used on Sepolia
  status         String   @default("active")
}
```

#### 3. Executing a Transaction
To perform an on-chain action (e.g., executing a swap proposal), the backend relays the transaction parameters to Circle using the user's `circleWalletId`:
```typescript
async function executeAgentTransaction(
    circleWalletId: string,
    contractAddress: string,
    functionSignature: string,
    parameters: string[]
): Promise<string> {
    const response = await circleClient.createContractExecutionTransaction({
        walletId: circleWalletId,
        contractAddress: contractAddress,
        abiFunctionSignature: functionSignature,
        abiParameters: parameters,
        feeLevel: "MEDIUM"
    });

    const transactionId = response.data?.id;
    if (!transactionId) {
        throw new Error("Circle contract execution submission failed");
    }

    return transactionId; // Returns Circle Tx ID immediately (Fire & Sleep)
}
```

### Developer Implementation Specifications

To build a modular, testable, and secure system, developers MUST implement the following TypeScript interfaces and cryptographic verification methods:

#### 1. Use-Case Interface (`IAIAgent.ts`)
Each AI Governor use case (Owner, Shareholder, Operator) must implement the following base contract:
```typescript
export interface IAIAgent {
    monitorState(vaultAddress: string): Promise<any>;
    evaluate(state: any, marketData: any): Promise<TradeRecommendation>;
    execute(recommendation: TradeRecommendation): Promise<string>;
}
```

#### 2. LLM Provider Adapter Interface (`ILLMProvider.ts`)
Each execution engine (0G Compute, Platform Gemini, Private Host) must implement a pluggable adapter to handle requests and return standardized inference receipts:
```typescript
export interface InferenceResult {
    textResponse: string;
    toolCalls?: Array<{
        toolName: string;
        parameters: Record<string, any>;
    }>;
    receiptSignature?: string; // Verification proof for ZG/Private receipts
}

export interface ILLMProvider {
    requestInference(prompt: string): Promise<InferenceResult>;
    getBillingStatus?(): Promise<{ balance: string; unit: string }>;
}
```

#### 3. Cryptographic Receipt Verification for Private Agents
To prevent malicious private agent hosts from spoofing execution logs and transcripts in the platform database, the platform enforces strict signature checks:

* **Registration:** During the deployment phase, a self-hosted agent registers its configuration along with its authorized **Agent EOA address**.
* **Signature Webhook Payload:** When the private agent submits its decision receipts to the platform backend via the `/api/governor/private-receipt` endpoint, the payload must include a cryptographic signature of the receipt content:
  ```json
  {
    "receipt": {
      "timestamp": 1787123900,
      "decision": "propose_swap",
      "rationale": "WETH price fell below the stop-loss limit of $3,100.",
      "txHash": "0xabc123..."
    },
    "signature": "0xPrivateSignatureString..."
  }
  ```
* **On-Chain/Off-Chain Verification:** The platform backend recovers the signer from the signature using `ethers.verifyMessage()` and verifies it matches the registered **Agent EOA address** before publishing the receipt to the dashboard or updating the treasury's trust profile score.

---

## Copyright

Copyright and related rights waived via [CC0](https://creativecommons.org/publicdomain/zero/1.0/).

## References

- [Smart Treasury Architecture](../smart contracts/treasury-arch.md)