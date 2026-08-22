# Uniswap Sepolia Fork Test Suite Overview

This test suite focuses on validating the smart treasury's integration with real-world DeFi protocols, specifically the Uniswap Universal Router. It operates against a live fork of the Sepolia Ethereum Testnet to ensure that the `AssetSwapPolicy` contract can correctly interpret and execute real transaction calldata provided by the Uniswap Swapping API.

## Tests

### 1. should execute a live swap on Sepolia Fork using Uniswap Swapping API transaction data
This is an end-to-end integration test that simulates a real governance decision to acquire assets via Uniswap.

**Explanation of the Test Flow:**
- **Treasury Initialization:** Deploys the core `TreasuryToken` and `TreasuryVault` contracts, as well as an `AssetSwapPolicy` connected to the real Sepolia Uniswap Universal Router.
- **Funding the Treasury:** A stakeholder converts native ETH to WETH and joins the treasury, providing it with real Sepolia WETH liquidity.
- **Proposal Lifecycle:** A proposal is opened to swap 0.0005 WETH for USDC. The stakeholder votes to approve it, and the proposal is executed, moving the WETH into the `AssetSwapPolicy`.
- **Live API Integration:** The test performs a live `POST` request to the Uniswap Swapping API (`https://trade-api.gateway.uniswap.org/v1/quote`) using the provided `UNISWAP_API_KEY` to retrieve real-time swap calldata for the WETH -> USDC pair.
- **AI Attestation & Execution:** The AI Agent signs an attestation for the trade. The `AssetSwapPolicy.executeSwap()` function is called using the real Uniswap calldata.
- **Verification:** The test asserts that the Uniswap swap was successful and that the treasury vault's USDC balance increased by the swapped amount.

### 2. should execute a manual owner live swap (USDC -> WETH) using Uniswap Swapping API
This test simulates a scenario where the treasury, natively denominated in USDC, decides to acquire WETH. Instead of using the AI Agent to execute the trade, the Human Owner executes it manually.

**Explanation of the Test Flow:**
- **Treasury Initialization:** Deploys the core `TreasuryToken` and `TreasuryVault` contracts with USDC as the base asset, along with an `AssetSwapPolicy` connected to the real Sepolia Uniswap Universal Router.
- **Funding the Stakeholder:** Uses the live Uniswap Swapping API to seamlessly swap the stakeholder's Sepolia ETH directly into Sepolia USDC via the Universal Router.
- **Funding the Treasury:** The stakeholder joins the treasury by depositing their newly acquired USDC, funding the vault with real USDC liquidity.
- **Proposal Lifecycle:** A proposal is opened to swap 10 USDC for WETH. The stakeholder votes, and the proposal is executed, transferring the USDC to the policy contract.
- **Verification:** The test verifies that the WETH balance on the `AssetSwapPolicy` increased according to the quote, and logs the execution price in the results file.

### 3. Live Sepolia Testnet Sweep (Testnet Script)
Unlike the previous tests which run on a local mainnet fork (simulated), this test executes fully on the live Sepolia testnet. It introduces a permanent historical registry and dynamic wallet management.

**Sepolia Testnet Constants Used:**
- **USDC Address:** `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` (Circle Sepolia Testnet USDC)
- **WETH Address:** `0x7b79995e5f793a07bc00c21412e50ecae098e7f9`
- **Uniswap Universal Router:** `0x3fc91a3afd20baba244d2e0e97e68207d094d29c`

#### 3A. Standard Live Test (New Deployment)
This is an end-to-end integration test executed against the live testnet without relying on the AI Agent attestation.

**Workflow of the Test:**
- **Interactive Setup:** You run `npx ts-node test/contracts/aquire-assets/setupTestnet.ts`. The script asks if you want to create a new run and how many new shareholder wallets to add.
- **Auto-Split Funding:** The script checks the Owner's live Sepolia ETH and USDC balances. If the Owner has excess funds (from a faucet, for instance), the script automatically splits and distributes the required ETH and USDC to all the newly generated stakeholder wallets so they can participate.
- **Validation Loop:** If any wallet (Owner or stakeholders) lacks sufficient funds, the script pauses and waits for you to fund them before continuing.
- **Contract Deployment:** Deploys `TreasuryToken`, `TreasuryVault` (USDC base asset), and `AssetSwapPolicy` to the live Sepolia blockchain and saves the addresses to `testnet-deployments.json`.
- **Policy Setup:** Owner calls `proposalOpen` to add the WETH token, and approves it in the `TreasuryVault`, then configuring the `AssetSwapPolicy` to support it.
- **Stakeholders Join:** All stakeholders approve and deposit their real Sepolia USDC into the treasury.
- **Proposal & Execution:** Owner proposes swapping 10 USDC for WETH. Stakeholders vote. Upon approval, the owner pulls a live Uniswap API quote and executes `executeSwap` manually directly on the policy contract.

#### 3B. Adding New Wallets to an Existing Treasury (Reuse Deployment)
Because the setup script acts as a state manager, you can stop and return to a previous test to expand it!

**Workflow to Add Wallets:**
- **Resume Test:** Run the `setupTestnet.ts` script again. This time, choose an older Test Run ID from the prompt instead of starting a new one.
- **Dynamic Addition:** The script will ask how many *new* wallets you want to add to this existing run.
- **Auto-Fund New Actors:** As with 3A, the script will automatically siphon excess ETH/USDC from the Owner and send it to your newly added stakeholders.
- **Execution:** The script will boot up the `testnetUniswap.test.ts` suite. Because it detects existing contracts in the registry, it skips deployment, instantly connects the new stakeholders to the existing treasury, has them deposit their USDC, and runs a new swap proposal with a now-larger voting pool!
