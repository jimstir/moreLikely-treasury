# OracleRouter Integration & Test Suite Details

## Core Strategy
We have implemented a comprehensive test suite for the `OracleRouter.sol` contract using both a local Hardhat fork of Sepolia and the live Sepolia testnet environment.

The `OracleRouter` contract serves as the central valuation hub for the treasury, abstracting away the complexity of integrating with multiple decentralized price feeds. This ensures the treasury can securely query real-time market data to calculate its aggregate portfolio value or validate trade execution prices.

## Sepolia Testnet Constants Used
- **Chainlink ETH/USD Aggregator:** `0x694AA1769357215DE4FAC081bf1f309aDC325306`
- **Uniswap V3 WETH/USDC (500 fee) Pool:** `0x3289680dD4d6C10bb19b899729cda5eEF58AEfF1`
- **WETH Address:** `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14`
- **TWAP Window:** `10` seconds

---

## Tests

The test suite (`localOracle.test.ts` and `testnetOracle.test.ts`) verifies two primary oracle integrations currently supported by the `OracleRouter`. Both tests are functionally identical, but one runs on a fast local fork while the other broadcasts to the live Sepolia network.

### 1. should register and fetch Chainlink ETH/USD price
This test validates that the router can seamlessly interface with Chainlink Aggregator V3 contracts.

**Explanation of the Test Flow:**
- **Deployment:** The `OracleRouter` contract is deployed by the test owner.
- **Registration:** The owner calls `registerChainlinkFeed()` passing the official Sepolia `ETH/USD` Chainlink feed address. The test asserts that the router successfully saved the market type as `CHAINLINK`.
- **Validation:** The test calls `getPrice()` on the registered feed. It verifies the router successfully queried the Chainlink oracle, handled decimal normalization, and returned a non-zero current price scaled to 18 decimals.

### 2. should register and fetch Uniswap V3 WETH/USDC TWAP price
This test validates that the router natively computes Time-Weighted Average Prices (TWAP) directly from Uniswap V3 pools using the `observe` function.

**Explanation of the Test Flow:**
- **Registration:** The owner calls `registerUniswapPool()` passing the Sepolia `WETH/USDC` (500 fee tier) pool, the priced token (`WETH`), and a fast 10-second TWAP period. The test asserts the market is registered as `UNISWAP`.
- **Validation:** The test calls `getPrice()` on the registered pool. The router fetches the pool's tick cumulatives, derives the current active tick over the past 10 seconds, converts it to `sqrtRatioX96`, and computes the final token price scaled to 1e18. The test asserts this price is non-zero and successfully returned.

By organizing these tests into their own dedicated `test/contracts/oracle/` directory, we cleanly separate pure valuation mechanics from swap execution logic.
