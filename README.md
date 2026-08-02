# The moreLikely Smart Treasury

## Environment Variables

For the frontend application to function properly (especially for Git cloners setting up the project locally), you need to define specific environment variables. 

Create a `.env` file in the `frontend/` directory and configure the target deployment network for the Create Treasury form:

```env
# The chosen treasury deployment chain: "testnet" (Sepolia) or "mainnet" (Ethereum)
# Defaults to "testnet" if omitted.
NEXT_PUBLIC_DEPLOY_NETWORK="testnet"
```

## Circle + Stablecoin Integrations

The moreLikely Smart Treasury is deeply integrated with the Circle ecosystem to provide enterprise-grade security and stablecoin management.

### 1. USDC as the Default Base Asset (Join Token)
When a DAO or operator creates a new treasury, the platform defaults the treasury's underlying asset (the "Join Token") to **USDC**. 
- **Implementation Location**: The UI form and network-specific USDC contract auto-population logic is located in the `CreateTreasuryWidget` component (`frontend/src/components/CreateTreasuryWidget.tsx`). The selected asset is passed during deployment and officially approved on the `TreasuryVault`.

### 2. Circle Developer-Controlled Wallets (Master Gas Relayer)
To submit trades securely on behalf of the AI Governor without exposing vulnerable EOA private keys on a Node.js server, the agent's Master Platform Wallet is powered by the **Circle Developer-Controlled Wallets (App Kits) API**.
- **Implementation Location**: The integration using the `@circle-fin/developer-controlled-wallets` SDK is implemented in the agent's submitter class located at `agent/aiAgent.ts`. 
- **Fire & Sleep Architecture**: The execution loop in `agent/runner.ts` implements an asynchronous webhook architecture that instantly suspends the 0G Compute LLM process while waiting for the Circle transaction to confirm, saving compute billing.

### 3. Circle Arc Testnet Support
The platform natively supports deploying compliance-focused treasuries on the **Circle Arc Testnet**.
- **Implementation Location**: The Arc Testnet is exposed as a primary deployment network option inside the `CreateTreasuryWidget` (`frontend/src/components/CreateTreasuryWidget.tsx`). Treasury creators can select this network to test permissioned deployments.
