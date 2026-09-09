# Frontend UI Components Architecture

This document outlines the architecture and data integration flow for the moreLikely Smart Treasury frontend UI components. The UI is built using Next.js (App Router), React, and ethers.js to provide a rich, glassmorphic dashboard for treasury management.

## 1. Data Layers

The UI integrates data from three distinct layers to provide a unified dashboard:

1. **On-Chain State (EVM)**
   - Smart contract state for vault parameters, approved tokens, and active token supply.
   - User wallet balances (via `ethers.js` providers).

2. **Decentralized Oracles (OracleRouter)**
   - Resolves real-time USD equivalent prices for treasury assets.
   - Abstracts pricing complexity by mapping assets to Chainlink Aggregators or Uniswap V3 TWAP pools.

3. **Off-Chain Database (Prisma / PostgreSQL)**
   - **Treasury Performance:** Daily historical valuation snapshots used to plot the Performance Tracker chart.
   - **AI Policies (TreasuryGoals):** User-defined constraints (Slippage limits, Stop-loss) which guide the AI Agent.

---

## 2. Core Widgets

### 2.1 TreasuryStatsWidget (`TreasuryStatsWidget.tsx`)

**Purpose:** 
Displays high-level, real-time statistics for a selected treasury, including Total Value Locked (TVL), active tokens, and AI Policy constraints.

**Integration Flow:**
- **Initial Load:** Fetches the `DBTreasury` metadata via `/api/treasury?id=...` which includes the base asset, member count, and the `TreasuryGoals` (AI Policies).
- **On-Chain Sync:** Instantiates the `TreasuryVault` and `TreasuryToken` contracts via `ethers` to read the live `activeTokensList` and `totalSupply`.
- **Pricing:** Iterates over active ERC20 tokens and queries the `OracleRouter` (`getPrice(marketAddr)`) directly from the browser's web3 provider to calculate a real-time, USD-denominated TVL.
- **Display:** Renders the TVL, share supply, token breakdown table, and the active policy constraints (Slippage, Stop Loss, Max Trade %).

### 2.2 PerformanceTracker (`PerformanceTracker.tsx`)

**Purpose:**
Provides an interactive HTML5 `<canvas>` chart displaying the historical performance (TVL) of the treasury over a 30-day window.

**Integration Flow:**
- **Initial Load:** Fetches the `TreasuryPerformance` history via the `/api/treasury/performance?treasuryId=...` endpoint.
- **Rendering:** Uses the HTML5 Canvas API to plot the data. It calculates dynamic scaling and Y-axis limits based on the min/max values of the period.
- **Aesthetics & Feedback:** 
  - If the treasury is profitable over the window, the chart is styled in glowing **Emerald Green**. If running at a loss, it switches to **Rose Red**.
  - A custom mouse-move event handler tracks cursor position to display a precise date-and-value tooltip for the nearest data point.

---

## 3. Best Practices

- **Browser-side Oracles:** Oracle pricing queries should be performed via the client's Web3 Provider (`useWeb3()`) rather than the Next.js API. This reduces centralized RPC load and ensures users fetch prices directly from their connected nodes (e.g., MetaMask).
- **Graceful Fallbacks:** If the API fails or a token is not mapped in the `OracleRouter`, the UI should fallback gracefully to mock data (for charts) or a 1:1 price ratio (for unpriced testnet tokens) rather than crashing the component tree.