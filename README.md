# The moreLikely Smart Treasury

## Environment Variables

For the frontend application to function properly (especially for Git cloners setting up the project locally), you need to define specific environment variables. 

Create a `.env` file in the `frontend/` directory and configure the target deployment network for the Create Treasury form:

```env
# The chosen treasury deployment chain: "testnet" (Sepolia) or "mainnet" (Ethereum)
# Defaults to "testnet" if omitted.
NEXT_PUBLIC_DEPLOY_NETWORK="testnet"
```
