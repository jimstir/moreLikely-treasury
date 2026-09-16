## Smart Treasury

> [!WARNING]
> **Status: Pre-deployment testing**
>
> The core implementation is currently undergoing integration, edge-case, and security testing prior to testnet deployment. The testing phase is focused on validating the interaction between the AI Governor, treasury contracts, treasury asset swaping, on-chain state transitions and security assumptions.

## Overview

An on-chain decentralized treasury designed to transparently manage assets including shareholder goverance. Deploy a smart treasury then acquire assets, swap or lend those aquired assets. 

The treasury's history remains publicly accessible so the treasury owner cannot falsify performance.

## Motivation

Managing a decentralized treasury lacks usable transparency features and keeps stakeholders excluded at times. The moreLikely Smart Treasury aims to create an owner-to-shareholder relationship that helps expose malicious actions. Autonomous AI features may be utilized as an treasury manager by the treasury owner or by shareholders to help monitor the treasury owner actions.

## Key Capabilities

- **Smart Treasury Vaults:** ERC4626-compatible vaults representing proportional ownership via governance tokens.
- **AI-Powered Automonous Management:** An autonomous agent that monitors the market and executes strategies transparently.
- **Policy Engine:** Abstracted policy contracts that restrict malicious owners from stealing treasury funds.
- **Oracle Capibilites:** Native `OracleRouter` integration with Chainlink and Uniswap V3 TWAP for secure asset valuation.
- **Shareholder Voting:** Goverance tokens used for off-chain to on-chain voting for future treasury activity, also ensuring the AI Agent operates strictly with shareholder approval.
- **Trust Profile:** Real-time AI auditing of current treasury contstraits and past treasury activity on-chain to empower shareholders the probability of malicious intent.

## Architecture

```mermaid
sequenceDiagram
    actor Owner as Treasury Owner (AI/Human)
    participant Vault as TreasuryVault
    actor Shareholders as Shareholders (Voters)
    participant Policy as Policy Engine
    participant Dashboard as Public Dashboard

    Shareholders->>Dashboard: Monitor Public Treasury Data
    Owner->>Vault: 1. Propose Action (e.g. Asset Swap, Lending)
    Note over Shareholders: Transparency: Shareholders audit proposal intent
    Shareholders->>Vault: 2. Cast Votes (Approve or Reject)
    
    alt If Proposal Approved
        Owner->>Vault: 3. Execute Proposal
        Vault->>Policy: 4. Route Assets to Policy Contract
    else If Proposal Rejected
        Note over Vault: Execution Blocked (Protects Treasury)
    end
```

The architecture is split into two primary layers:

1. **Smart Contracts (On-Chain):** The `TreasuryVault`, `TreasuryToken`, `OracleRouter`, and Policy Contracts deployed.
2. **AI Governor & Execution (Off-Chain):** A unified agent layer that handles both reasoning and transaction execution. 
   - **Inference:** An LLM Agent that analyzes state and constructs transactions. Can be run locally or via cloud providers.
   - **Execution:** Uses Circle Developer-Controlled Wallets to sign and broadcast those transactions securely.

## Getting Started: Local & Testnet Deployment

Running this protocol locally or on a testnet requires standing up several pieces of infrastructure. To successfully run the entire project, you must satisfy the following 5 requirements:

### 1. Smart Contract Dependencies (Mainnet Forking)

Because `AssetSwapPolicy` hardcodes calls to the Uniswap Universal Router and Chainlink Oracle feeds, **a blank local blockchain will fail**. 
- **Local:** You must start your local Hardhat/Anvil node as a **Mainnet Fork** (or Sepolia Fork) so real Uniswap routers are copied into your environment.
- **Testnet (Sepolia):** If testing on Sepolia, Uniswap exists, but liquidity is terrible. Ensure your AI mandate's `slippageLimit` is set very high to avoid reverted swaps.

### 2. Database Integration (Prisma / PostgreSQL)

The Next.js backend requires a PostgreSQL database to store user sessions, treasury metadata, and Trust Profile audit data

1. Run a local database: `docker run --name postgres -p 5432:5432 -e POSTGRES_PASSWORD=password -d postgres`
2. Update `.env`: `DATABASE_URL="postgresql://postgres:password@localhost:5432/treasury"`
3. Push the schema: `npx prisma db push`

### 3. File Storage Configurations (S3 Standard or 0G)

The platform saves Treasury Mandates and Policies as markdown files. 
- **Standard Cloud (`MODE_A_STANDARD`):** Requires S3-compatible configuration. Works natively with Google Cloud Storage, AWS S3, or Cloudflare R2 by simply changing the `STORAGE_ENDPOINT_URL`. If running purely locally, use a local S3 simulator like **MinIO**.
- **Decentralized Storage (`MODE_B_0G`):** Requires access to a live 0G Storage testnet RPC node to generate Content Identifiers (CIDs).

### 4. LLM Endpoint

The backend's AI Agent requires an OpenAI-compatible endpoint. Set `LLM_BASE_URL` and `LLM_API_KEY` in your `.env`. (See "Deploying a Private AI Governor" below for local LLM instructions).

### 5. Circle Wallet Infrastructure
The AI Governor executes trades autonomously via Circle Programmable Wallets. You must sign up for a free Circle Web3 Services developer account and provide Sandbox API keys in your environment variables.

---

## Deploying a Private LLM AI Governor

By default, the platform supports utilizing cloud AI providers (like OpenAI or Gemini) to run your Treasury Governor. However, many privacy-focused DAOs prefer to run a **Private AI Governor** completely isolated on their own hardware, ensuring trading strategies and swap policies never leave their local network.

To deploy a Private LLM Governor:

1. **Install Local Compute:** Download and install [Ollama](https://ollama.com/) (or LM Studio) on your secure machine.
2. **Download a Local Model:** Open your terminal and run `ollama run llama3` (or any fast, high-context model like `mixtral`).
3. **Configure the Platform:** In your root `.env` and `frontend/.env`, point the platform to your local machine instead of a cloud provider:
   ```env
   # Override standard cloud providers
   LLM_BASE_URL="http://localhost:11434/v1"
   LLM_API_KEY="ollama" # Mock key, required by most SDKs
   ```
4. **Agent Execution:** The Next.js backend and Agent modules will now route all complex reasoning, proposal generations, and trust profile audits directly to your local hardware. No strategy data will ever be sent to a third party.

---

## Environment Variables
To run the Smart Treasury locally, create `.env` files in the root and `frontend/` directories utilizing this template:

```env
# 1. Circle API Credentials (Required for Agent Execution)
CIRCLE_API_KEY=""
CIRCLE_ENTITY_SECRET=""
CIRCLE_WALLET_ID=""

# 2. Blockchain Configuration
OWNER_PRIVATE_KEY="" 
SEPOLIA_RPC_URL="https://gateway.tenderly.co/public/sepolia"
NEXT_PUBLIC_ORACLE_ROUTER_ADDRESS=""

# 3. LLM Configuration (Cloud or Local)
LLM_BASE_URL="https://api.openai.com/v1"
LLM_API_KEY=""

# 4. Storage Configuration
STORAGE_MODE="MODE_A_STANDARD" # or MODE_B_0G
STORAGE_ACCESS_KEY=""
STORAGE_SECRET_KEY=""
STORAGE_REGION="us-east-1"
STORAGE_BUCKET_NAME="treasury-prompts"
STORAGE_ENDPOINT_URL="https://storage.googleapis.com" # Google Cloud, AWS, or MinIO

# 5. Decentralized Storage (0G Network - Optional)
ZEROG_STORAGE_RPC="https://rpc.0g.ai"
ZEROG_STORAGE_NODE_URL="https://storage.0g.ai"
```

## Running Tests
```bash
npm install
npx hardhat test
```

## Design Decisions & Tradeoffs

- **USDC Default:** The platform defaults to USDC as the base asset to integrate seamlessly with the broader Circle ecosystem.
- **Off-Chain AI Computation:** Running AI inference on-chain can be expensive. We allow treasury owners to run their own AI agents on the service provider they prefer (including local hardware). We trade complete decentralization at the compute layer for cost efficiency by computing off-chain and verifying execution natively on-chain.
- **SwapRouter02 vs UniversalRouter:** We opted for standard UniswapV3 implementations to maintain compatibility with standard `IERC20.approve`, avoiding the architectural overhaul required for `Permit2`.

## Future work

- Full integration of the `LendingPolicy` (e.g., Aave/Compound). Treasury Policies focused on yield.
- Expansion of the `OracleRouter` to support highly exotic or low-liquidity assets.
- Support for deploying treasuries natively on the Circle Arc Testnet/Mainnet.

## License

MIT License
