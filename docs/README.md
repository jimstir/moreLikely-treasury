# Testnet (Sepolia) Wallet & Hardhat Setup

This file documents how to create a Sepolia test wallet, add its private key to `.env`, verify the derived address, and use the wallet with Hardhat for testnet runs.

> Keep your private key secret. Never commit `.env` to version control.

## 1) Create a new Sepolia wallet (command-line)

Run from the repo root:

```bash
node -e "const { Wallet } = require('ethers'); const w = Wallet.createRandom(); console.log('OWNER_PRIVATE_KEY=' + w.privateKey); console.log('ADDRESS=' + w.address);"
```

This prints two lines you can copy into your `.env` file.

## 2) Add the private key to `.env`

Open `.env` and add (no surrounding quotes):

```
OWNER_PRIVATE_KEY=0x...your_private_key_here...
SEPOLIA_RPC_URL="https://your-sepolia-rpc.example/"
```

The project already reads `.env` in `hardhat.config.ts` (via `dotenv.config()`), so Hardhat will pick up `OWNER_PRIVATE_KEY` automatically.

## 3) Verify the derived address

Use `dotenv` when running Node so `process.env` loads from `.env`:

```bash
node -r dotenv/config -e "const { Wallet } = require('ethers'); console.log(new (require('ethers').Wallet)(process.env.OWNER_PRIVATE_KEY).address)"
```

Or, source `.env` into your shell and run the simple command:

```bash
set -a; source .env; set +a
node -e "const { Wallet } = require('ethers'); console.log(new (require('ethers').Wallet)(process.env.OWNER_PRIVATE_KEY).address)"
```

## 4) Use the wallet with Hardhat (Sepolia)

The repository `hardhat.config.ts` reads `SEPOLIA_RPC_URL` and `OWNER_PRIVATE_KEY` from `process.env`. After adding the private key and RPC URL to `.env`, run tests or scripts on Sepolia as:

```bash
npx hardhat test --network sepolia test/deployment.test.ts
# or run a deploy script
npx hardhat run --network sepolia scripts/deploy.ts
```

If you prefer to export the key into your shell session instead of `.env`:

```bash
export OWNER_PRIVATE_KEY="0x..."
export SEPOLIA_RPC_URL="https://..."
npx hardhat test --network sepolia test/deployment.test.ts
```

## 5) Open Treasury Testnet

Ethereum Sepolia testnet deployment, the test produced a deployed `TreasuryVault` contract address:

- `0x3598968BA45Af36E6Ca961e47b9f29afE4e19a32`

This address is provided as an example only. Replace it with your own deployed TreasuryVault address if you deploy to Sepolia.

## 6) Notes & security

- Never publish or commit your private key. Use a dedicated testnet-only key.
- If running CI, inject the key via CI secrets (do not store in repo).
- `dotenv` is already a dev dependency; install it locally if you need the `-r dotenv/config` approach: `npm install dotenv --save-dev`.

---

If you want, I can also add a small helper script `scripts/make-sepolia-wallet.js` that creates a wallet, prints the `.env` lines, and optionally writes them to `.env.local` for you to review before committing.

## 6) Check wallet balances (ETH + ERC20 like USDC)

After adding `OWNER_PRIVATE_KEY` and `SEPOLIA_RPC_URL` to `.env`, you can check the wallet's balances with these commands.

- Get ETH balance for the wallet:

```bash
node -r dotenv/config -e "const { Wallet, JsonRpcProvider, formatEther } = require('ethers'); const provider = new JsonRpcProvider(process.env.SEPOLIA_RPC_URL); const address = new Wallet(process.env.OWNER_PRIVATE_KEY).address; provider.getBalance(address).then(b => console.log('ETH balance:', formatEther(b)));"
```

-- Get an ERC20 token balance (USDC) for the wallet — Sepolia USDC address is `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` (Etherscan: https://sepolia.etherscan.io/address/0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238):

```bash
USDC_ADDRESS=0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238
node -r dotenv/config -e "const { Wallet, JsonRpcProvider, Contract, formatUnits } = require('ethers'); const provider = new JsonRpcProvider(process.env.SEPOLIA_RPC_URL); const address = new Wallet(process.env.OWNER_PRIVATE_KEY).address; const erc20 = new Contract(process.env.USDC_ADDRESS || process.env.USDC_ADDRESS_OVERRIDE || '$USDC_ADDRESS', ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'], provider); (async () => { const b = await erc20.balanceOf(address); const d = await erc20.decimals(); console.log('USDC balance:', formatUnits(b, d)); })();"
```

Notes:
- Replace `<USDC_ADDRESS>` with the appropriate Sepolia token address (or set `USDC_ADDRESS` environment variable before running the command).
- These commands use `ethers` (v6-compatible call signatures used above). If you see a runtime error, ensure `ethers` is installed in the project (`npm install ethers`) and that `SEPOLIA_RPC_URL` is reachable.
