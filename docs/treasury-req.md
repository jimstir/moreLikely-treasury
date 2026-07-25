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
  - **ERC20-Only Constraint:** The treasury vault MUST ONLY accept ERC20 tokens. No native gas tokens (e.g. ETH) can be deposited directly; users wishing to deposit native assets must first wrap them into their ERC20 equivalent (e.g. WETH).
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

### 4. Deploying the Owner Agent (0G Hosted)
- **Component:** `GovernorControlPanel`
- **Trigger:** Owner toggles Governor Mode from "Manual" to "AI Governor (Hosted on 0G)".
- **Action:**
  - Must be the owner of a deployed on-chain treasury with the `CreateTreasury` module.
  - Prompts owner to configure the initial **AI Treasury Goals Form** (defining target allocations, whitelist tokens, stop-loss limits, and data/web sources).
  - Prompts owner to allocate resources/budget for the agent (gas allowance, EOA wallet provisioning).
  - Launches/deploys the AI Owner Agent instance on the preferred host platform (0G decentralized AI network). (AI Owner Agent instance should be its own module to make future integration easy. E.g. Gemini and OpenAI will be integrated.).
- **Backend / On-chain Sync:**
  - Deploys EOA credentials and policy configuration to the 0G host.
  - Connects the agent's signer EOA as the registered `_tOwner` of the `TreasuryVault` smart contract.


### 5. Agent Decision Loop (Autonomous Operation)
- **Component:** `AI Owner Agent` (Background service running on 0G Platform)
- **Trigger:** Configured time interval tick (e.g. every 1 hour, or real-time priority override if conditions trigger stop-loss).
- **Loop Sequence:**
  1. **Monitor Current State:** Query treasury asset balances and retrieve current treasury conditions.
  2. **Monitor Market Conditions:** Retrieve token prices(Uniswap API), liquidity metrics(Uniswap Api), and news/signals (from apporved web sources from Owner/Stakeholders).
  3. **Evaluate Trade (Decision Report):** Run LLM analysis to determine if a buy/sell trade should be initiated. Draft a report containing transaction rationale, execution timeframe, and Uniswap swap routes/prices. (A structured input schema containing all compiled market parameters must be created and logged before LLM execution).
  4. **Align to Goals & Risk Check:** Cross-reference the trade with stakeholder goals (max percentage allocation, slippage limits, stop-loss). The agent automatically rejects proposed trades that fail the risk checks (low liquidity, low holder count, dropping price, or high volatility).
  5. **Propose Trade:** Autonomous Agent opens a proposal (`proposalOpen`) on-chain (subject to limits defined in treasury goals).
  6. **Attest Voting Outcome:** Stakeholders sign EIP-712 vote payloads off-chain using their wallets. The agent checks the database to verify these votes. If the voting interval passes, the agent aggregates the signatures and broadcasts a cryptographic ECDSA attestation of the vote results to the `AssestSwapPolicy` contract.
  7. **Execute Trade:** If voting passes, the agent executes the swap by triggering `proposalApproved` on the `TreasuryVault`, which recovers the agent's signature on-chain to verify the attestation and delegates to the `AssestSwapPolicy` smart contract to execute the Uniswap swap.
  8. **Continuous Evaluation:** Regularly monitor open proposals and close them if parameters shift. For returned value parameters, standard swaps are tracked with the target output asset, while non-trade proposals use fallback zero values (or custom attestation tags) so as not to break default `TreasuryVault` withdraw math.

### 6. Audit & Malicious Decision Dispute Flow
- **Component:** `AuditInteractionsWidget`
- **Trigger:** Stakeholder or third-party auditor flags an active proposal or decision as malicious.
- **Action:**
  - Stakeholder views the logged LLM input/output data, 0G ticket receipts, and trade parameters.
  - Stakeholder triggers a dispute by calling `triggerDispute(proposalId)` on-chain via the `AssestSwapPolicy` contract (requiring >1% share balance).
  - The dispute details and audit evidence are posted to the database to sync with the operator and stakeholder dashboard.
- **Backend / On-chain Sync:**
  - On-chain dispute transaction pauses voting progress and blocks execution signatures.
  - Enforces a review cooldown window (defined in goals) allowing the owner or DAO to review the disputed proposal.

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

### 5. AI Governor & Orchestration APIs
- **`POST /api/governor/evaluate`** (Agent Endpoint)
    - Orchestrates the **Agent Decision Loop**: gathers state, analyzes market data, checks liquidity constraints, and builds proposal arguments.
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
- **`AssestSwapPolicy.sol` (Policy Contract)**
  - Deployed policy contract linked to specific proposal types.
  - Implements checks for voting attestations and verifies authorized transactions.
  - Interacts directly with the Uniswap Router/APIs to manage buying and selling assets.
  - Receives approved funds from the vault and executes atomic swap routes.
  - **Production vs. Testnet Targets:** While automated unit tests and local fork simulations utilize the Ethereum Sepolia testnet environment and WETH/USDC addresses, the production deployment of the application and policy contract MUST target the **Uniswap Ethereum Mainnet** implementation (using mainnet token addresses and the mainnet Universal Router).

