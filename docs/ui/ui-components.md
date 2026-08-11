# Application Component Requirements - moreLikely Smart Treasury

This specification outlines the components, data models, and on-chain interactions for the moreLikely Smart Treasury application.

---

## Part 1: Key Application Flows

### 1. Onboarding & Web3 Connection
- **Component:** `ConnectWalletModal`
- **Trigger:** User lands on the application unauthenticated and clicks "Connect Wallet".
- **Action:**
  - Connects using `ethers.js`.
  - Prompts signature to verify ownership if needed.
  - Detects active network and requests network switch if not on the target Treasury network (e.g. Local Hardhat / Sepolia).
- **Backend / On-chain Sync:**
  - Retrieves the connected `walletAddress` (lowercase).
  - Queries `WhosOwner()` on `TreasuryVault` contract to determine if the user is the Treasury Owner/Operator, a standard stakeholder or a new user looking to join a treasury.
  - Updates user state in application context (`isOwner: true/false`, `isStakeholder: true/false`).

### 2. Joining the Treasury (Asset Deposit)
- **Component:** `JoinTreasuryModal`
- **Trigger:** User clicks "Deposit Assets" on the dashboard.
- **Action:**
  - Prompt user to select the approved ERC20 asset for the desired treasury and requires the user holds the balance amount then input deposit `amount`.
  - **ERC20-Only Constraint:** The treasury require the user to use treasury approved ERC20 tokens.
  - Triggers ERC20 `approve(vaultAddress, amount)` transaction.
  - Upon transaction confirmation, triggers `joinTreasury(tokenAddress, amount, isProposal, proposalNum)` on the `TreasuryVault` contract.
- **Backend / On-chain Sync:**
  - Vault contract calls `ITreasuryToken.mintTreasury(msg.sender, amount)` to mint `TreasuryToken` 1:1.
  - UI updates user's local balance of the deposit token and `TreasuryToken` shares.

### 3. Create a Treasury
- **Component:** `CreateTreasuryWidget`
- **Trigger:** A user wants to deploy a new smart treasury and clicks "Create a Treasury".
- **Action:**
  - Inputs: Treasury Name, Target Base Asset (e.g. USDC), Treasury Token Name, and Treasury Token Symbol.
  - First deploys the `TreasuryToken` contract to represent voting weight.
  - Next deploys the `TreasuryVault` contract with the reference token address.
  - Registers the deployer wallet as the initial `_tOwner` of the vault.
- **Backend / On-chain Sync:**
  - Broadcasts smart contract deployment transactions to the EVM network.
  - Saves the newly deployed contract addresses to the user's active session and application database.
  - Redirects the user to the Treasury Operator Dashboard.

### 4. Deploying the Owner Agent
- **Component:** `GovernorControlPanel`
- **Trigger:** Owner toggles Governor Mode from "Manual" to "AI Governor".
- **Action:**
  - Must be the owner of a deployed on-chain treasury with the `CreateTreasury` module.
  - Prompts owner to configure the initial **AI Treasury Goals Form** (defining target allocations, whitelist tokens, stop-loss limits, and data/web sources).
  - Prompts owner to allocate resources/budget for the agent (gas allowance, EOA wallet provisioning).
  - **AI Network Selection:** The owner selects which AI network to host the agent on. The `GovernorControlPanel` presents a dropdown/selector with supported AI networks. **0G Compute Network** is the default and first supported network. The architecture supports additional networks (e.g. Gemini, OpenAI, Anthropic) as they are integrated — each network adapter implements the same agent deployment and tool registration interface, so the agent module and tool server remain unchanged regardless of which network is chosen. The selected network and its configuration (API keys, model name, endpoint URL) are saved to the database and used for all subsequent agent invocations.
  - **Invocation Frequency:** The owner configures how often the agent is invoked to run a decision cycle. Options include predefined intervals (e.g. "Every 1 hour", "Every 6 hours", "Once a day", "Once a week") or a custom cron expression. This controls agent operating cost — each invocation incurs LLM inference fees on the selected AI network. The frequency is saved to the database and enforced by the backend scheduler. The owner can update the frequency at any time from the `GovernorControlPanel` without redeploying the agent.
  - Deploys the AI Owner Agent as an autonomous LLM agent on the selected AI network. The agent is an LLM that reasons independently and calls tools exposed by this project to interact with the treasury and market. The AI Owner Agent should be its own module to make future integration easy.
- **Agent Funding & Security Safeguards:**
  - **Master Platform Wallet (Execution):** To optimize key management and security, the platform backend uses the **Circle Developer-Controlled Wallets API (App Kits)** to submit transactions for all managed AI agents, avoiding the need to manage raw EOA private keys locally on a Node.js server.
  - **Ethereum Gas — Transaction Forwarder (`AgentGasEscrow.sol`):** The Circle Master Platform Wallet has zero authority over the treasury. Instead, the owner deploys a custom `AgentGasEscrow` smart contract that is registered as the authorized user on the `TreasuryVault`. The escrow contract acts as a secure transaction forwarder and gas paymaster:
    - **Execution & Gas Refund:** The Master Platform Wallet submits a transaction to the `AgentGasEscrow` (paying the upfront gas fee). The escrow checks the on-chain rules (e.g., verifying that `TreasuryVault.vote(proposalId) == true`). If valid, the escrow forwards the call to the vault. Finally, the escrow calculates the gas used and refunds the Master Platform Wallet from the owner's deposited escrow balance.
    - **Rate Limiting:** For opening new proposals, the escrow enforces a time-based rate limit matching the agent's configured invocation frequency.
    - **Kill Switch:** The owner can freeze or drain the escrow at any time via MetaMask.
  - **LLM Inference Billing — Decentralized Ledger:** The backend does not hold the owner's crypto funds to pay for AI compute. Instead, the owner uses their MetaMask via the `GovernorControlPanel` to deposit tokens into the AI provider's on-chain billing ledger. The backend is provisioned with an API Secret tied to this ledger and utilizes the `@0gfoundation/0g-compute-ts-sdk` (`ComputeClient`) to seamlessly execute function-calling inferences via the decentralized nodes.
  - **Security Sandboxing:** This architecture ensures a hacked backend server cannot drain the owner's crypto funds. Since the backend uses Circle's MPC infrastructure, the server only holds API keys. Even if the API keys are stolen, the hacker possesses no authority on the `TreasuryVault` and would only burn their own ETH attempting to submit unauthorized requests to the escrow.
  - The owner can monitor the smart wallet gas balance, the AI provider ledger balance, and the agent's consumption rates from the `GovernorControlPanel` dashboard, topping them up via MetaMask at any time.
- **Backend / On-chain Sync:**
  - Registers the `AgentGasEscrow` contract as the authorized user (`_authUsers`) on `TreasuryVault` (the Master Platform EOA is never authorized directly).
  - Configures the agent's system prompt with the treasury address, policy contract address, treasury goals, and approved tokens.
  - Initializes the invocation scheduler at the owner-configured frequency.

### 4.1 AI Governor Deployment Approaches

The AI Governor architecture is designed to be highly flexible, allowing Treasury Owners to deploy the agent with varying degrees of decentralization. Crucially, **shareholders do not need to check Etherscan to verify the agent's setup.** The `GovernorControlPanel` dashboard will allow users to connect their wallet and make direct view function calls to verify the `AgentGasEscrow` and the authorized infrastructure.

#### 1. Fully Managed (Circle Programmable Wallets)
  - *No Local Private Keys:* The platform uses Circle Developer-Controlled Wallets to manage transaction signing securely via Multi-Party Computation (MPC).
  - *Isolated Signer Architecture:* The platform configures the Circle SDK securely. By using API keys and Entity Secrets rather than raw EOA private keys, a breach of the main web application does not instantly expose raw cryptography.
- **Verification (Live Checks):** 
  - The dashboard directly queries and displays the `AgentGasEscrow` view functions so shareholders can monitor the agent's gas budget, rate limits, and authorized EOA address.
  - To prove the LLM is actively making decisions, the dashboard MUST display the **inference receipts** of the agent's most recent requests.
  - If 0G Compute is used, the 0G Network Job ID / cryptographic receipt is displayed.
  - If Gemini is used (which lacks a decentralized receipt), the platform MUST generate an **Internal Inference Receipt** that mimics the 0G schema (see schema below) and publish it for transparency.
- **On-Chain Proof:** With every LLM-initiated on-chain transaction (e.g., calling `proposalOpen` or `proposalClose` via the `AgentGasEscrow`), the owner/agent SHOULD attach or publish the corresponding inference receipt. This links the on-chain action to the off-chain AI reasoning.

**Inference Receipt Schema Example:**
```json
{
  "receiptId": "uuid-or-tx-hash",
  "provider": "0G-Compute | Platform-Gemini",
  "model": "glm-5.2 | gemini-1.5-pro",
  "timestamp": 1718293041,
  "promptHash": "0x...",
  "responseHash": "0x...",
  "computeCost": "0.05"
}
```

#### 2. Self-Hosted / Bring Your Own Infrastructure (Hybrid & Sovereign)
- **Setup:** The owner does not trust the platform's centralized servers. The owner downloads the open-source agent client and runs it on their own private server using their own self-generated EOA wallet. The owner then connects their custom EOA to the `AgentGasEscrow` via the dashboard.
- **Agent Client Functions:** To successfully run a self-hosted agent, the owner's server MUST implement and continuously run the core **Decision Loop**. This requires running instances of:
  - `IStateProvider`: To query the TreasuryVault for portfolio state and goals.
  - `ILLMProvider`: To authenticate with the chosen LLM network (0G or Gemini) and request inferences.
  - `RiskEngine`: To locally verify the LLM's recommended trades against the treasury's safety rules.
  - `IProposer` / `ITradeExecutor`: To sign and submit the actual transactions to the blockchain using the self-hosted EOA.
- **Verification:** The dashboard displays the self-hosted EOA address registered in the `AgentGasEscrow`. The owner publishes an Architecture Manifest detailing their self-hosted setup, and publishes the inference receipts just like the managed approach.


### 5. AI Agent Architecture (Autonomous Operation)
- **Component:** `AI Owner Agent` — an autonomous LLM agent running on the owner's selected AI network (0G Compute Network by default).
- **Architecture:** The backend drives the agent loop. On each scheduled invocation, the backend sends an inference request to the AI network (e.g. 0G Compute `/chat/completions`) containing the system prompt and tool definitions. The LLM responds with tool call requests. The backend executes each requested tool locally (reading on-chain state, fetching market data, submitting transactions via the Circle Developer-Controlled Wallet API), sends the tool results back to the LLM, and continues the conversation until the LLM returns a final response with no further tool calls. The LLM never directly accesses the backend server or the API credentials — it only reasons and requests tool calls; the backend handles all execution.
- **System Prompt Context:** The agent receives its treasury address, policy contract address, treasury goals, and the set of approved tokens. The system prompt instructs the agent to manage the treasury according to stakeholder-defined goals.

#### Invocation Loop
Each scheduled tick executes the following loop on the backend:
1. Backend constructs the inference request: system prompt, conversation history (if continuing a multi-tick operation like monitoring a vote), and tool definitions with parameter schemas.
2. Backend sends the request to the selected AI network's chat completions endpoint (e.g. `POST {0G_BASE_URL}/chat/completions` with `tools` parameter).
3. The AI network returns a response containing one or more `tool_calls` — structured requests specifying which tool to call and with what parameters.
4. Backend executes each requested tool locally as a function call (e.g. reads the vault contract, queries Uniswap, submits a transaction).
5. Backend appends the tool results as messages and sends the updated conversation back to the AI network.
6. Steps 3–5 repeat until the LLM returns a final response with no further tool calls.
7. Backend stores the complete conversation transcript (see §5.3 Conversation Logging).

#### Agent Tool Definitions
The following tools are implemented as local functions on the backend. They are registered as tool definitions (JSON schemas) in the inference request so the LLM can discover and request them. The LLM decides which tools to call, in what order, and how to interpret the results.

##### 1. `read_treasury_state`
- **Description:** Returns the current on-chain state of the treasury vault — asset balances, total share supply, approved tokens, and open proposals.
- **Parameters:** `{ treasuryAddress: string }`
- **Returns:** `{ assets: string[], balances: { [token: string]: string }, totalShareSupply: string, openProposals: { id: number, status: string, amount: string, targetToken: string }[] }`
- **Implementation:** Queries `TreasuryVault` contract view functions (`asset()`, `approvedTokens()`, `proposalBook()`) and ERC20 `balanceOf` for each approved token.

##### 2. `get_market_data`
- **Description:** Fetches current market data for a given token pair — prices, liquidity depth, and 24h price change from Uniswap pools.
- **Parameters:** `{ tokenIn: string, tokenOut: string, chainId: number }`
- **Returns:** `{ price: number, liquidity: string, priceChange24h: number, volume24h: string }`
- **Implementation:** Queries the Uniswap Swapping API and/or on-chain pool data.

##### 3. `get_treasury_goals`
- **Description:** Returns the stakeholder-configured investment goals and risk constraints for the treasury.
- **Parameters:** `{ treasuryAddress: string }`
- **Returns:** `{ targetAllocations: { [token: string]: number }, slippageLimit: number, stopLoss: number, maxTreasuryPercentage: number, disputePeriodSeconds: number, approvedDataSources: string[] }`
- **Implementation:** Reads from the application database (`TreasuryGoals` model).

##### 4. `check_risk`
- **Description:** Validates a proposed trade against the treasury's risk constraints. Checks balance sufficiency, allocation limits, slippage tolerance, stop-loss thresholds, and liquidity depth.
- **Parameters:** `{ tokenIn: string, tokenOut: string, amountIn: string, treasuryAddress: string }`
- **Returns:** `{ passed: boolean, reason: string, checks: { name: string, passed: boolean, detail: string }[] }`
- **Implementation:** Runs risk validation rules against on-chain state and treasury goals.

##### 5. `get_uniswap_quote`
- **Description:** Fetches a live swap quote from the Uniswap Swapping API, including expected output amount, price impact, and the encoded transaction calldata for execution.
- **Parameters:** `{ tokenIn: string, tokenOut: string, amount: string, slippageTolerance: number, recipient: string, chainId: number }`
- **Returns:** `{ amountOut: string, priceImpact: number, gasEstimate: string, swapCallData: string }`
- **Implementation:** Calls `POST https://trade-api.gateway.uniswap.org/v1/quote` with the Uniswap API key.

##### 6. `propose_trade`
- **Description:** Opens a new trade proposal on-chain via `TreasuryVault.proposalOpen()`. The proposal enters the voting queue for stakeholder approval.
- **Parameters:** `{ treasuryAddress: string, policyAddress: string, tokenIn: string, tokenOut: string, amountIn: string, rationale: string }`
- **Returns:** `{ success: boolean, proposalId: number, txHash: string }`
- **Implementation:** Submits an on-chain transaction via the Circle Developer-Controlled Wallet SDK.

##### 7. `get_voting_status`
- **Description:** Returns the current voting tally for an open proposal — total votes for, total votes against, number of voters, and whether the voting interval has ended.
- **Parameters:** `{ proposalId: string }`
- **Returns:** `{ totalVotesFor: string, totalVotesAgainst: string, voterCount: number, votingEnded: boolean, isDisputed: boolean }`
- **Implementation:** Reads aggregated off-chain EIP-712 signed votes from the database and checks on-chain dispute status.

##### 8. `execute_swap`
- **Description:** Executes an approved swap proposal. Generates the agent's ECDSA attestation signature over the voting outcome, calls `proposalApproved` on `TreasuryVault` to transfer funds to the policy contract, then calls `executeSwap` on `AssetSwapPolicy` with the Uniswap calldata.
- **Parameters:** `{ proposalId: number, tokenIn: string, tokenOut: string, amountIn: string, totalVotesFor: string, totalVotesAgainst: string, swapCallData: string }`
- **Returns:** `{ success: boolean, txHash: string, amountOut: string }`
- **Implementation:** Generates the attestation payload and submits the on-chain transaction via the Circle Developer-Controlled Wallet SDK. The `AssetSwapPolicy` contract verifies the attestation via `ecrecover` before executing the Uniswap swap.

##### 9. `get_proposals`
- **Description:** Returns all proposals for the treasury, filtered by status. Used by the agent to monitor open proposals, track execution, and decide whether to close stale proposals.
- **Parameters:** `{ treasuryAddress: string, status?: string }`
- **Returns:** `{ proposals: { id: number, status: string, amount: string, targetToken: string, createdAt: string, votingStatus: object }[] }`
- **Implementation:** Queries the application database and cross-references on-chain proposal state.

##### 10. `close_proposal`
- **Description:** Closes an open proposal that the agent determines should not proceed (e.g., market conditions shifted, stop-loss triggered, or the proposal became stale).
- **Parameters:** `{ proposalId: number, reason: string }`
- **Returns:** `{ success: boolean, txHash: string }`
- **Implementation:** Calls the appropriate close/cancel function on `TreasuryVault`.

#### 2. Supported Networks & Integrations

The platform is designed to decouple the blockchain execution layer from the AI reasoning layer. To achieve this, the architecture explicitly defines supported networks across these two domains.

#### A. Treasury Blockchain Networks (Smart Contracts)
These networks host the `TreasuryVault`, `TreasuryToken`, `AssetSwapPolicy`, and the `SmartWallet` contracts. The UI `GovernorControlPanel` interacts with these networks via standard Web3 providers (e.g. Wagmi/Viem).
- **Ethereum Mainnet**: The primary target for high-value production treasuries.
- **Ethereum Testnet (Sepolia/Holesky)**: Used for robust staging and testing of new governance features.
- **Arc Testnet**: A specialized L2/AppChain testnet supported for rapid, low-cost treasury deployments and testing.

#### B. AI Networks (Compute & Storage)
These networks host the decentralized AI reasoning loops and immutable audit trails. The backend `AgentRunner` interfaces with these networks using specific SDKs.
- **0G Mainnet (Compute & Storage)**: The primary decentralized AI network. The backend uses `@0gfoundation/0g-compute-ts-sdk` for LLM inferences and `@0gfoundation/0g-storage-ts-sdk` to persist `DecisionReport` transcripts to the storage nodes.
- **0G Testnet**: Available for developers and test treasuries to run the agent loop without expending real ZG tokens for compute/storage fees.
- **Gemini (Centralized Fallback)**: A centralized option utilizing Google's Gemini API for inference, with the platform simulating the storage of internal receipts.

The `GovernorControlPanel` UI exposes these options, allowing treasury owners to explicitly configure their target Treasury Blockchain (where the vault lives) and their AI Environment (where the agent lives) independently.

---

### 3. Agent & Orchestrator Flow
The agent is free to call tools in whatever order its reasoning dictates. A typical flow might look like:
1. Call `read_treasury_state` to understand current holdings.
2. Call `get_treasury_goals` to understand constraints.
3. Call `get_market_data` for tokens that are over/underweight relative to target allocations.
4. Reason about whether a rebalance trade is warranted.
5. Call `check_risk` to validate the proposed trade.
6. Call `get_uniswap_quote` to get pricing and calldata.
7. Call `propose_trade` to open the proposal on-chain.
8. On subsequent ticks, call `get_voting_status` to check if voting has concluded.
9. Call `execute_swap` when voting passes.
10. Call `get_proposals` to monitor open proposals and `close_proposal` if conditions shift.

However, the agent may deviate from this sequence based on its reasoning. For example, it may decide to check multiple token pairs, skip proposing if risk checks fail, or prioritize closing a stale proposal before evaluating new trades.

#### Conversation Logging & Audit Trail
Every invocation of the agent produces a complete conversation transcript that is stored in the database for auditability. The transcript captures the full request-response cycle between the backend and the AI network, providing a tamper-evident record of the agent's reasoning and actions.

Each stored transcript includes:
- **Invocation metadata:** Timestamp, treasury address, AI network used, model name, invocation frequency setting, and the agent's EOA address.
- **System prompt:** The full system prompt sent to the LLM, including treasury context and goals.
- **Conversation messages:** Every message in the conversation, in order:
  - LLM reasoning responses (the agent's natural language thinking)
  - Tool call requests (which tool the LLM asked to call, with exact parameters)
  - Tool call results (the data returned by each tool execution)
  - Final LLM response (the agent's summary/conclusion for the tick)
- **On-chain actions:** Any transaction hashes produced during tool execution (proposals opened, swaps executed, proposals closed), linked to the specific tool call that triggered them.
- **Error log:** Any tool execution failures, AI network errors, or on-chain transaction reverts encountered during the invocation.
- **0G Storage Layer (Optional):** The owner can opt-in via the deployment UI to persist the full DecisionReport (including transcripts and rationale) directly to the **0G Storage Network** for decentralized permanence. This provides an immutable audit trail but incurs additional ZG token storage costs. The backend utilizes `@0gfoundation/0g-storage-ts-sdk` (specifically the `Indexer.upload` flow) to chunk the JSON file and returns a decentralized `dataRoot` receipt hash. The UI must display warnings about this increased operational cost.

Transcripts are stored in the `AgentInvocation` database model and linked to the treasury. They are surfaced to owners and stakeholders through the `AuditInteractionsWidget` (see §6). When a proposal is created or executed during an invocation, the transcript is cross-linked to the `DecisionReport` for that proposal (storing the 0G `dataRoot` if applicable), providing a complete audit chain from the agent's first observation through to the on-chain action.

#### On-Chain Safety Boundary
Regardless of the agent's reasoning, the smart contracts enforce hard safety rules:
- `AssetSwapPolicy.executeSwap()` requires a valid ECDSA attestation signature, voting threshold (`totalVotesFor > totalVotesAgainst`), and sufficient token balance.
- `triggerDispute()` allows any stakeholder with >1% shares to pause execution.
- The `TreasuryVault` enforces proposal accounting and prevents double-execution.

The agent cannot bypass these on-chain checks. The tools are the agent's interface to the world; the contracts are the world's guardrails on the agent.

### 6. Audit Components (Trusy Profile)

**Component:** `AuditInteractionsWidget`
- **Trigger:** Stakeholder or third-party auditor flags an active proposal or decision as malicious.
- **Action:**
  - Stakeholder views the stored agent conversation transcripts — the full sequence of LLM reasoning, tool calls (with exact parameters), tool results, and on-chain transaction hashes produced during each invocation. This provides complete visibility into why the agent made a decision and what data it was acting on.
  - Stakeholder can inspect the `DecisionReport` linked to any proposal, which includes the agent's rationale, the market data snapshot at the time of the decision, and the Uniswap swap routes/pricing used.
  - If the agent's reasoning or inputs appear manipulated, inconsistent with live market data, or outside the parameters defined by `TreasuryGoals`, the stakeholder triggers a dispute by calling `triggerDispute(proposalId)` on-chain via the `AssetSwapPolicy` contract (requiring >1% share balance).
  - The dispute details and audit evidence are posted to the database to sync with the operator and stakeholder dashboard.
- **Backend / On-chain Sync:**
  - On-chain dispute transaction pauses voting progress and blocks execution signatures.
  - Enforces a review cooldown window (defined in goals) allowing the owner or DAO to review the disputed proposal.

  **Components** `Deposit Token Audit` 
  The UI SHOULD include an audit or warning system that evaluates the treasury's accepted deposit tokens by calling getApprovedTokens(). 
  - The UI will display the security of the treasury's accepted tokens.
  **Action:**
  - Stakeholder views and monitors the current list of approved tokens.
  **Minor Warning Metric**: If a treasury accepts multiple tokens with different fiat values (e.g., accepting both USDC and a volatile asset, or even USDC and a different fiat-pegged stablecoin), the UI MUST display a severe warning.

#### Trust Profile

The UI MUST compile a Trust Profile of the treasury and display it transparently to stakeholders before they interact with the platform. This profile is evaluated using the following criteria:

*   **Owner Governance Override:** The Treasury Owner has the administrative rights to unilaterally close policies and recall funds early to protect the treasury in volatile markets (via `proposalClose()`).
*   **Token Add Control:** The owner could use `ADD_TOKEN` proposals. The UI must evaluate if the owner holds enough voting power to pass an `ADD_TOKEN` proposal by themselves, which would allow them to change the math of the treasury unilaterally.
*   **Consensus Quorum Level:** The UI must display the immutable `votingThres` variable (basis points converted to percentage, e.g., 75%). This informs users of the supermajority requirement needed to pass major treasury restructuring proposals or close strategies. A lower threshold indicates higher centralization risk, whereas a higher threshold indicates democratic security but higher risk of governance gridlock.


---

## Part 2: Full Stack Components Breakdown

### 1. Treasury Dashboard & Metrics
- **`TreasuryStatsWidget`** (UI Component)
    - `TVL & Balance Display`: Queries asset holdings of `TreasuryVault`.
    - `ShareSupply Display`: Queries `totalSupply()` from `TreasuryToken` contract.
- **`AssetListWidget`** (UI Component)
    - `Asset Table`: Loops through approved tokens, showing live prices, liquidity, and holder counts.
- **`PerformanceTracker`** (UI Component)
    - `Yield & PnL Chart`: Renders historic portfolio performance, successfully executed trades, and stop-loss event logs.

### 2. Treasury Configuration & Goals
- **`CreateTreasuryGoalsForm`** (UI Component)
    - `Allocation Configurator`: Form to define target percentages for each type of token.
    - `Risk Rules Input`: Numeric inputs for slippage limits, stop-loss thresholds, and max percentage of treasury caps.
    - `Data Source Integrator`: Text fields to add URLs/APIs for market signal evaluation.
    - `Submit Configuration`: Opens a meta-proposal allowing stakeholders to vote on changing active treasury goals.

### 3. Governance & Voting Module
- **`ProposalQueue`** (UI Component)
    - `Proposal List`: Shows all open proposals with recipient details.
- **`VotingInterface`** (UI Component)
    - `Off-Chain Voting Portal`: Allows stakeholders to cast gasless cryptographic signature votes.
    - `Attestation Broadcaster`: Collects off-chain votes, aggregates them, and calls the contract's attestation verification endpoint to lock/unlock on-chain execution.

### 4. Audit & Dispute Module
- **`AuditInteractionsWidget`** (UI Component)
    - `Recipient Registry`: Displays all proposal request recipients.
    - `Report Dispute Button`: Form to submit malicious activity reports.
    - `Audit Status Panel`: Displays current audit state (Active, Paused, Resolved) and remaining review period timer.
- **`AuditBeforeJoin`** (UI Component)

### 5. AI Agent Module
The AI agent logic is implemented as a backend module (not API endpoints). The module contains:

- **Agent Runner** — The core invocation loop. Called by the backend scheduler at the owner-configured frequency. Constructs the inference request (system prompt + tool definitions + conversation history), sends it to the selected AI network, processes tool call responses, executes tools locally, and loops until the LLM completes. Stores the full conversation transcript on completion.
- **Tool Functions** — Local implementations of each tool (`read_treasury_state`, `get_market_data`, `check_risk`, `propose_trade`, `execute_swap`, etc.). Each function reads on-chain state, queries external APIs, or submits transactions using the Circle Developer-Controlled Wallet API.
- **AI Network Adapters** — Pluggable adapters for each supported AI network (0G Compute, Gemini, OpenAI, etc.). Each adapter translates the tool definitions and conversation messages into the network's specific API format (e.g. OpenAI-compatible chat completions with `tools` parameter). New networks are added by implementing a new adapter.
- **Conversation Logger** — Persists the complete request-response transcript of each invocation to the `AgentInvocation` database model. Cross-links transcripts to proposals and `DecisionReport` records for audit.

- **`POST /api/voting/attest`** (Attestation API)
    - Validates off-chain signature votes and pushes the aggregated attestation record to the blockchain.
- **`POST /api/audit/report`** (Audit API)
    - Submits a dispute report and sets contract state to "Review Period Paused".

---

## Part 3: Shared Smart Contracts

- **`TreasuryVault.sol`**
  - Manages vault deposits (`joinTreasury`, `depositTreasury`).
  - Stores proposal registry (`proposalBook`) and processes voting logic (`vote`, `proposalApproved`).
  - Supports owner/agent auth controls (`auth` modifier).
  - **New feature**: Dispute/Review state variable checking to pause/resume operations.
- **`TreasuryToken.sol`**
  - Standard ERC20 token minted 1:1 upon treasury deposit.
  - Represents voting shares inside the vault.
- **`AssetSwapPolicy.sol` (Policy Contract)**
  - Deployed policy contract linked to specific proposal types.
  - Implements checks for voting attestations and verifies authorized transactions.
  - Interacts directly with the Uniswap Router/APIs to manage buying and selling assets.
  - Receives approved funds from the vault and executes atomic swap routes.
  - **Production vs. Testnet Targets:** While automated unit tests and local fork simulations utilize the Ethereum Sepolia testnet environment and WETH/USDC addresses, the production deployment of the application and policy contract MUST target the **Uniswap Ethereum Mainnet** implementation (using mainnet token addresses and the mainnet Universal Router).

## Audit Getters

This section details how the front-end UI components consume the `TreasuryVault`'s public state variables and view functions to present transparent, real-time audit data to shareholders and auditors.

### 1. `AuditBeforeJoin` (UI Component)
Before a user deposits funds into the treasury (calling `joinTreasury`), this widget performs pre-flight audit checks to calculate a **Trust Profile Score** and displays warnings about centralization risks.

*   **`whosOwner()`** (Public Variable Getter)
    *   **UI Display:** Renders the "Treasury Administrator Address". The UI also queries the `TreasuryToken` contract to verify that `whosOwner` is **not** the owner of the token minting rights, showing a critical security warning if the owner has direct minting access.
*   **`votingThres()`** (Public Variable Getter)
    *   **UI Display:** Converts the basis points (e.g., `7500`) into a percentage and displays: `"Governance Consensus Quorum: 75% Supermajority Required"`.
*   **`getAuth(address)`** (Public Mapping Getter)
    *   **UI Display:** Renders the list of all authorized execution wallets (e.g., the AI Agent's wallet). Warns the user if there are more than 2 non-owner wallets with execution rights.
*   **`approvedTokens(IERC20)`** (Public Mapping Getter)
    *   **UI Display:** When a user selects a token to deposit, the UI verifies compliance. If `approvedTokens` returns `false`, it disables the deposit button and shows: `"Deposit Rejected: This token is not whitelisted by the DAO."`

### 2. `AuditInteractionsWidget` (UI Component)
This widget displays active and historical proposals, allowing users to track the lifecycle of DAO consensus.

*   **`proposalCheck()`** (Public Variable Getter)
    *   **UI Display:** Serves as the length parameter. The UI loops from `1` to `proposalCheck` to fetch and render the list of all historical proposals.
*   **`totalShares(uint256)`** (Public Mapping Getter)
    *   **UI Display:** Renders the voting progress bar: `"Current Staked Votes: 45,000 / 75,000 required for Quorum"`.
*   **`vote(uint256)`** (View Function)
    *   **UI Display:** Renders the live approval badge for a proposal: `"Status: Approved (Quorum Met)"` or `"Status: Voting (Quorum Pending)"`.
*   **`closedProposal(uint256)`** (Public Mapping Getter)
    *   **UI Display:** Renders the status of voting lockups. If `true`, the UI displays a green button: `"Voting Closed: Unlock & Withdraw Your Shares"`.

### 3. `PolicyTracker` / `Active Strategies Dashboard`
This component tracks the performance of deployed funds in the active DeFi strategies.

*   **`executed(uint256)`** (Public Mapping Getter)
    *   **UI Display:** Displays whether the approved funds have physically left the vault: `"Strategy Status: Deployed (Funds transferred to Aave Policy)"`.
*   **`owed(uint256)`** (View Function)
    *   **UI Display:** Dynamically calculates the capital currently at risk. It reads `proposalBook[num].withdraw` (Principal sent) and subtracts `proposalBook[num].deposits` (Yield returned). Renders a ledger:
        *   *Principal Transferred:* \$100,000 USDC
        *   *Yield / Funds Returned:* \$60,000 USDC
        *   *Net Outstanding Capital at Risk:* \$40,000 USDC (Highlighted in Orange)
*   **`checkCompliance(address)`** (View Function)
    *   **UI Display:** Integrated into the **Create Proposal Form**. When an authorized manager pastes a proposed contract address, the UI queries this function in the background. It renders a green `"✅ Verified Compliant Policy"` or a red `"❌ Non-Compliant Contract (Warning: Proposal will fail)"` directly next to the input field.



