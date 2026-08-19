# Application Component Requirements - moreLikely Smart Treasury

This specification outlines the components, data models, and on-chain interactions for the moreLikely Smart Treasury application.

### Core Components

- **Key Application Flows:**
  - Onboarding & Web3 Connection
  - Joining the Treasury (Asset Deposit)
  - Create a Treasury
  - Deploying the Owner Agent
  - AI Agent Architecture (Autonomous Operation)
  - Audit Components (Trusty Profile)
  - Off-Chain Voting (VoterPool)

- **Components Breakdown:**
  - Treasury Dashboard & Metrics
  - Treasury Configuration & Goals
  - Governance & Voting Module
  - Audit & Dispute Module
  - AI Agent Module

- **Shared Smart Contracts:** Reference for underlying contract integration.
- **Audit Getters:**
  - AuditBeforeJoin (UI Component)
  - AuditInteractionsWidget (UI Component)
  - PolicyTracker / Active Strategies Dashboard
  - VoterRecordWidget (UI Component)


- **CreateTreasuryWidget:** Interface for users to deploy a new smart treasury.
- **GovernorControlPanel:** Dashboard to deploy and manage the AI Owner Agent.
- **AI Owner Agent:** An autonomous LLM agent running on the owner's selected AI network.
- **AuditInteractionsWidget:** Component to monitor treasury activities and interactions.
---

## Key Application Flows

### Onboarding & Web3 Connection

A wallet needs to be connected which acts as the user's identity.

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

### Create a Treasury

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

### Deploying the Treasury Governor Agent

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

### Joining the Treasury (Asset Deposit)

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

## Components Descriptions

### AI Governor Deployment Approaches

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


### AI Agent Architecture (Autonomous Operation)
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

### Audit Components (Trusy Profile)

**Component:** `AuditInteractionsWidget`
- **Trigger:** Stakeholder runs public attirbute audit.
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
*   **Strategy Rebalancing & Asset Deviation Risk (Swap Policy):** While the policy's `swapBack` function provides necessary operational flexibility to trade assets and rebalance portfolios, it presents a potential centralization risk. A malicious owner/manager could execute a proposal under the guise of acquiring a "safe" token (e.g. USDC), but subsequently call `swapBack` to swap into high-risk, volatile, or unapproved tokens that do not align with the treasury's goals.
    *   **UI Trust Profile Metric:** The UI's Trust Profile MUST query the history of swaps (`getSwapBackHistory()`) and compare current holdings (`heldTokens`) against the originally proposed tokens. Any significant deviation, or accumulation of high-risk assets, must be flagged as a critical warning attribute in the owner behavior profile.
*   **Lending Policy Default-Risk Management:** If the treasury implements a `LendingPolicy`, the Trust Profile must audit and display the management model of the policy to calculate the default-risk safety rating. The UI evaluates this by identifying which of the three execution paths is active:
    *   **AI Governor Path (Highest Trust):** If an autonomous AI Governor is actively authorized on the Lending Policy, the Trust Profile displays a high-security status. The AI continuously monitors loan health factors and automatically triggers immediate on-chain `seizeCollateral()` and swap-backs upon default, minimizing bad debt.
    *   **Manual Owner Path (Medium Trust / Centralization Risk):** If the policy relies on the human owner to manually call `seizeCollateral()`, the UI displays a warning. Humans are subject to delays, manual errors, or inactivity during rapid market crashes, increasing default exposure.
    *   **Public Portal Dependency (Lowest Trust / Fallback):** If there is no active AI or active owner monitoring, the policy relies entirely on public searchers. The UI warns that low-value loans (where gas costs exceed the liquidation bonus) will likely sit in default forever, leading to capital lockups and treasury poor performance.

---

### Off-Chain Voting (VoterPool)

A treasury has the option to conduct off-chain voting while remaining transparent for all participants.

Off-chain vote may be conducted in voting periods compared to the on-chain defualt open voting until the proposal is closed. So every pool can set a predefined voting period time on the VotingPool contract that the owner, authorized users, or any thrid party can view. 

A merkle tree will store an up to date, balance of all shareholders that have active balances in the voting pool. This includes, current balance of `treasuryTokens` that are not in an active proposal and the current active vote for each proposal for each shareholder. The contract will store the merkle root, and the platform will make the entire merkle tree available.

(Note: this is a hybrid, centralized/decentralized solution as the merkle tree is stored on the centralized server controled by the platform. But since deposits need to occur first, if the merkle tree becomes unavailable, the voterPool should be able to be decommisioned, closing every propsal it is in and returning `treasuryToken`s to the voterPool contract. After the contract confirms all proposals are closed, shareholders can withdraw. )

The reason for a voting period is to help transparency of how the merkle tree wil be generated and when the root will be added on-chain. If the owner needs more time than the set period, another voting round based on the defined voting period time can happen again, with the merkle tree is updated with new votes and the vote transaction not occuring. This all happens off-chain, on the vote transaction and merkle root updates happen on-chain. 

#### Merkle Proof Contruction

**Voting (Root Construction):** 
  - **Signature Collection:** A user holding `vTokens` casts a gasless vote by signing an EIP-712 typed data payload (containing their address, vote amount, proposal ID, and vote direction) and sending it to the backend platform.

  if the user votes no, this is not translated on-chain, as the treasury only records yes votes. But this information can be used to on the platform for other metrics.
  - **Verification:** When the voting period closes( also not enforced on-chain, this is only enforced by the platform), the backend verifies all collected signatures to prove authenticity. It also queries the `VoterPool` contract to ensure each signer actually holds enough `vTokens` to back their `voteAmount`.
  - **Tree Construction:** The signatures themselves are not placed in the tree. Instead, the backend extracts the validated facts from each signature: `(voterAddress, voteAmount, proposalId)`. It constructs a Merkle Tree where each leaf is the packed hash of this data: `keccak256(abi.encodePacked(voterAddress, voteAmount, proposalId))`. This tree is presented on the UI for the specific proposal, to all share holders(stored by the platform backend).
  - **On-chain Submission:** The backend generates the Merkle Root of this tree. The relayer submits this single root (along with the total aggregated vote amount) to the `submitBatchVote` function on the `VoterPool` contract, committing the root on-chain for future exit verification.

**Voting Pool Tracking Open Proposals:**

The `VoterPool` contract must maintain a mapping of the submitted Merkle Roots for all active proposals it has voted on within the `TreasuryVault`. For example, if the provider has submitted bulk transactions for 10 different active proposals, the contract stores 10 active Merkle Roots.

- **Public Auditing:** Any user or auditor can grab these 10 Merkle Roots directly from the blockchain. By matching them against the off-chain vote data (published by the platform), they can reconstruct the Merkle Trees and calculate the exact locked voting balance of any user at any given time. This provides absolute transparency based strictly on finalized on-chain bulk transactions, explicitly ignoring any pending or un-submitted off-chain signatures.

- **Cross-Contract Verification:** Other smart contracts within the ecosystem (such as Exit Policies or Lending modules) can reliably verify a user's locked state. To do this, the external contract queries the `VoterPool` for the active `merkleRoots`. The user then provides a Merkle Proof for their vote in each active proposal. By verifying these proofs on-chain, the external contract can cryptographically confirm exactly how many of the user's `vTokens` are currently locked in open proposals without needing to trust an off-chain oracle.

**Exit the Voting Pool (Proof Generation):**

When a proposal is closed, the provider should withdraw the `treasuryToken` from the proposal, and mark the merkle root `closed`. 
Note: The `close` should happen in the same function that the owner does `proposalWithdrawal`. but the proposalClose function should have happened already.

If a user needs to claim their tokens out of the pool, they should verify the current balance of their `treasuryTokens` not in an active merkle root. 
The proof generated that specific user about their pool account is submitted. The proof is an array of `bytes32` sibling hashes. The user submits this proof on-chain to the `claimExit(amount, proposalId, proof)` function. The smart contract reconstructs the user's leaf using `msg.sender` and verifies it against the saved Merkle Root to release their funds.

#### Off-Chain Component Definition

- **Component:** `JoinVoterPoolModal`
- **Trigger:** User wants to vote gaslessly and clicks "Deposit to Voter Pool".
- **Action:**
  - Prompts user to input the amount of `TreasuryToken` to deposit.
  - Triggers ERC20 `approve(voterPoolAddress, amount)` transaction for the `TreasuryToken`.
  - Upon confirmation, triggers `depositTokens(amount)` on the `VoterPool` contract.
- **Backend / On-chain Sync:**
  - `VoterPool` contract locks the `TreasuryToken` and mints a strictly non-transferable (soulbound) `vToken` receipt 1:1 to the user.
  - UI updates user's local balance, deducting `TreasuryToken` and crediting `vToken`.
  - The user is now eligible to sign gasless votes off-chain via the platform.

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



### AI Agent Module
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

This section details how the front-end UI components consume the `TreasuryVault`'s public state variables and mappings to present transparent, real-time audit data to shareholders and auditors.

### 1. `AuditBeforeJoin` (UI Component)
Before a user deposits funds into the treasury (calling `joinTreasury`), this widget performs pre-flight audit checks to calculate a **Trust Profile Score** and displays warnings about centralization risks.

*   **`whosOwner()`** (Public `address` variable)
    *   **UI Display:** Renders the "Treasury Administrator Address". The UI also queries the `TreasuryToken` contract to verify that `whosOwner` is **not** the owner of the token minting rights, showing a critical security warning if the owner has direct minting access.
*   **`votingThres()`** (Public `uint256` variable)
    *   **UI Display:** Converts the basis points (e.g., `7500`) into a percentage and displays: `"Governance Consensus Quorum: 75% Supermajority Required"`.
*   **`getAuth(address)`** (Public `mapping` getter)
    *   **UI Display:** Renders the list of all authorized execution wallets (e.g., the AI Agent's wallet). Warns the user if there are more than 2 non-owner wallets with execution rights.
*   **`approvedTokens(IERC20)`** (Public `mapping` getter)
    *   **UI Display:** When a user selects a token to deposit, the UI verifies compliance. If `approvedTokens` returns `false`, it disables the deposit button and shows: `"Deposit Rejected: This token is not whitelisted by the DAO."`

### 2. `AuditInteractionsWidget` (UI Component)
This widget displays active and historical proposals, allowing users to track the lifecycle of DAO consensus.

*   **`proposalCheck()`** (Public `uint256` variable)
    *   **UI Display:** Serves as the length parameter. The UI loops from `1` to `proposalCheck` to fetch and render the list of all historical proposals.
*   **`proposalBook(uint256)`** (Public `mapping` getter returning a struct tuple)
    *   **UI Parsing & Index Mapping:** Querying `proposalBook(proposalId)` returns a tuple of the `proposalAccount` struct. The UI must map the returned array indices as follows:
        *   **Index 0: `request` (uint8)** - The Proposal Type:
            *   `0` (`TXNS`): Display: `"Transactional proposal"`
            *   `1` (`CLOSE`): Display: `"Proposal Closure request"`
            *   `2` (`ADD_TOKEN`): Display: `"Token Whitelist request"`
        *   **Index 1: `close` (bool)** - Authorize Close flag. If `true`, indicates the proposal is ready to bypass owner controls and be closed permissionlessly.
        *   **Index 2: `owner` (address)** - The address of the proposal's creator. Render as: `"Proposed by: [owner]"`.
        *   **Index 3: `withdraw` (uint256)** - Asset amount or target ID:
            *   *For `CLOSE` request (Index 0 is `1`):* Denotes the **target proposal ID** to close. Render as: `"Target Proposal: #[withdraw]"`.
            *   *For `TXNS` request (Index 0 is `0`):* Denotes the amount of assets being withdrawn. Render as decimal formatted based on the token's decimals.
        *   **Index 4: `receiver` (address)** - The recipient address of the funds (for `TXNS` proposals) or target policy contract.
        *   **Index 5: `executed` (bool)** - Execution status:
            *   `true`: Display badge `"Status: Executed"`
            *   `false`: Display badge `"Status: Pending Execution / Active"`
        *   **Index 6: `token` (address)** - The token address used in the proposal (e.g. USDC, WETH).
        *   **Index 7: `time` (uint256)** - Unix timestamp of when the proposal was opened. Convert to local date-time format for display.
        *   **Index 8: `deposits` (uint256)** - The total amount of funds returned to the vault for this proposal. Used in risk/P&L calculations.
*   **`totalShares(uint256)`** (Public `mapping` getter)
    *   **UI Display:** Renders the voting progress bar: `"Current Staked Votes: 45,000 / 75,000 required for Quorum"`.
*   **`vote(uint256)`** (View Function)
    *   **UI Display:** Renders the live approval badge for a proposal: `"Status: Approved (Quorum Met)"` or `"Status: Voting (Quorum Pending)"`.
*   **`closedProposal(uint256)`** (Public `mapping` getter)
    *   **UI Display:** Renders the status of voting lockups. If `true`, the UI displays a green button: `"Voting Closed: Unlock & Withdraw Your Shares"`.

### 3. `PolicyTracker` / `Active Strategies Dashboard`
This component tracks the performance of deployed funds in the active DeFi strategies.

*   **`executed(uint256)`** (Public `mapping` getter)
    *   **UI Display:** Displays whether the approved funds have physically left the vault: `"Strategy Status: Deployed (Funds transferred to Aave Policy)"`.
*   **`owed(uint256)`** (View Function)
    *   **UI Display:** Dynamically calculates the capital currently at risk. It reads `proposalBook[num].withdraw` (Principal sent) and subtracts `proposalBook[num].deposits` (Yield returned). Renders a ledger:
        *   *Principal Transferred:* \$100,000 USDC
        *   *Yield / Funds Returned:* \$60,000 USDC
        *   *Net Outstanding Capital at Risk:* \$40,000 USDC (Highlighted in Orange)
*   **`checkCompliance(address)`** (View Function)
    *   **UI Display:** Integrated into the **Create Proposal Form**. When an authorized manager pastes a proposed contract address, the UI queries this function in the background. It renders a green `"✅ Verified Compliant Policy"` or a red `"❌ Non-Compliant Contract (Warning: Proposal will fail)"` directly next to the input field.

### 4. `VoterRecordWidget` (UI Component)
This widget displays the individual user's voting record and allows them to claim exit tokens.

*   **`userBook(address, uint256)`** (Public `mapping` getter returning a struct tuple)
    *   **UI Parsing & Index Mapping:** Querying `userBook(userAddress, index)` returns a tuple representing the `userAccount` struct. The UI must map indices as follows:
        *   **Index 0: `proposal` (uint256)** - Metadata or Proposal ID:
            *   *For Index 0 query:* Represents the **total count** of proposals the user has joined.
            *   *For Index > 0 query:* Represents the specific proposal number the user voted in.
        *   **Index 1: `deposit` (uint256)** - The amount of voting shares the user minted and locked for this proposal. Render as: `"Voted Shares: [deposit] shares"`.
        *   **Index 2: `withdrew` (uint256)** - The amount of voting shares the user has successfully burned to unlock their tokens. If `withdrew == deposit`, render status as `"Withdrawn"`; otherwise, display a `"Claim Shares"` button.
