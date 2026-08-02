# TODO


## Networks Config

1. The "Managed Platform" Approach

This is the 1-click, "easy mode" for users who trust your platform to handle the infrastructure.

The Server: Your platform spins up a cloud server (e.g., AWS) to run the DecisionLoop code in the background.
The LLM: The UI provides a dropdown. If they choose Gemini, the platform uses its own Gemini API key (perhaps charging the user a flat monthly fee). If they choose 0G, the UI uses the 0G SDK so the user can deposit tokens from MetaMask into the 0G billing ledger, and the platform server uses the generated API secret.
*   **The Agent Wallet:** Your platform's backend uses the Circle Developer-Controlled Wallets API to securely provision and manage an MPC wallet specifically for this user's agent without exposing raw private keys.
The Security: The platform prompts the user to deploy the AgentGasEscrow smart wallet via the frontend. The platform's newly generated EOA is set as the authorized receiver of gas.
2. The "Self-Hosted / Bring Your Own" Approach
This is for advanced DAOs that do not want to rely on your centralized servers or want to use third-party agent frameworks (like Eliza or a custom Python agent).

The Server: The owner downloads the open-source agent code (or writes their own) and runs it on their own private server. The platform's UI is not involved in running the agent loop.
The LLM: The owner configures their own server with their own OpenAI/Gemini/0G API keys using their own .env files.
*   **The Agent Wallet:** The owner configures their own isolated Circle App Kit environment or provides a designated smart wallet relayer. Your platform never controls the execution keys.
How it connects to your Treasury: The owner goes to your platform's UI and says, "I want to add an AI Governor, but I am hosting it myself." The UI simply asks them to input the Public Address of their self-hosted EOA.
The Security: The UI then guides them to deploy the AgentGasEscrow smart wallet, setting their self-hosted EOA public address as the receiver. Finally, the UI helps them add their self-hosted EOA (or the Escrow) to the TreasuryVault's auth list.
3. The Universal Security Layer (The Escrow)
The beautiful part of this design is that the smart contracts do not care which approach the user chose.

Whether the agent is running on your platform's servers, a user's private AWS instance, or a third-party AI network, the TreasuryVault is protected by the AgentGasEscrow architecture we designed.

Here is how the security works universally:

The Gas Budget is Isolated: The treasury owner's main pool of ETH for gas is locked inside the AgentGasEscrow smart contract.
No Direct Access: Neither the platform's server nor the self-hosted server has direct access to this ETH pool.
On-Chain Verification: When the agent (managed or self-hosted) wants to execute a trade, its EOA asks the Escrow for gas. The Escrow contract checks the TreasuryVault to see if the proposal was actually approved by shareholders.
The Drip: Only if the proposal is valid on-chain does the Escrow release 0.01 ETH to the agent's EOA so it can pay the transaction fee.
In Summary: Your platform UI acts as the configuration hub. For managed users, it provisions the wallets and servers automatically. For self-hosted users, it simply provides a form to input their custom public addresses and helps them deploy the necessary Escrow contracts to secure their custom setup. Because the security is enforced on-chain via the Escrow and the Vault, both setups are equally secure for the shareholders!