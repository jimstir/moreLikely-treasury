# The moreLikely Smart Treasury

## Environment Variables

To run the moreLikely Smart Treasury and AI Governor locally, you must provide the following required environment variables in a `.env` file at the root of the repository:

```env
# 1. Circle API Credentials (Required for AI Agent Execution)
CIRCLE_API_KEY=""
CIRCLE_ENTITY_SECRET=""
CIRCLE_WALLET_ID=""

# 2. Blockchain Configuration
OWNER_PRIVATE_KEY="" # Required to deploy the contracts initially
SEPOLIA_RPC_URL="https://gateway.tenderly.co/public/sepolia"

# 3. 0G Compute Credentials (Required for AI Inference)
ZEROG_COMPUTE_API_KEY=""
ZEROG_COMPUTE_BASE_URL="https://compute-network-19.integratenetwork.work/v1/proxy"
```

Additionally, if you are running the frontend locally, create a `.env` file in the `frontend/` directory with:

```env
# Target deployment network: "testnet" (Sepolia) or "mainnet" (Ethereum)
NEXT_PUBLIC_DEPLOY_NETWORK="testnet"
```

## Self-Hosting & Private AI Agents

If you are running your own **Private AI Governor** deployment, your agent is responsible for computing the AI Contextual Overlay for the Trust Profile dashboard. 

You can customize the strictness and reasoning capabilities of your private agent by editing the following files:
1. **System Prompt:** `agent/prompts/trust-profile-prompt.txt`
2. **Output Schema:** `agent/prompts/trust-profile-schema.json`

As long as your private AI runner returns JSON that perfectly matches the provided schema, the moreLikely platform backend will parse and display your agent's custom rationale on the treasury's frontend dashboard.


## Circle + Stablecoin Integrations

The moreLikely Smart Treasury is integrated with the Circle ecosystem to provide some enterprise-grade security and stablecoin management.

### 1. USDC as the Default Base Asset

When an operator creates a new treasury, the platform defaults the treasury's underlying asset (the "Join Token") to **USDC**. 
- The UI form and network-specific USDC contract is located in the `CreateTreasuryWidget` component (`frontend/src/components/CreateTreasuryWidget.tsx`). The selected asset is passed during deployment and officially approved on the `TreasuryVault`.

### 2. Circle Developer-Controlled Wallets

To submit trades securely on behalf of the [AI Governor]() without exposing EOA private keys, the agent's wallet is powered by the **Circle Developer-Controlled Wallets**.
- The integration using the `@circle-fin/developer-controlled-wallets` SDK is implemented in the agent's submitter class located at `agent/aiAgent.ts`. 

### 3. Circle Arc Testnet Support
The platform natively supports deploying compliance-focused treasuries on the Circle Arc Testnet, with Arc mainnet support in the future.
- The Arc Testnet is exposed as a primary deployment network option inside the `CreateTreasuryWidget` (`frontend/src/components/CreateTreasuryWidget.tsx`).
