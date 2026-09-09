# Asset Swap Policy Standard (RFC)

This document outlines the default success/fail scenarios and baseline operating rules for any AI Governor interacting with the `AssetSwapPolicy`.

## Core Mandates
1. **Slippage Protection:** Never execute a swap if expected slippage exceeds the threshold defined in the treasury goals.
2. **Stop-Loss Enforcement:** If an acquired asset drops below the stop-loss percentage, an exit proposal must be generated immediately.
3. **Liquidity Check:** Do not swap into illiquid pairs. Volume must be verified before opening a proposal.

## Success Scenarios
- **Take-Profit:** The asset appreciates by the target yield margin. The AI proposes a swap back to the base stablecoin to secure profits.
- **Rebalancing:** An asset exceeds its maximum allocation percentage due to price appreciation. The AI proposes selling the excess to maintain treasury balance.

## Fail Scenarios
- **Flash Crash:** The asset drops rapidly. The AI proposes a rescue swap to limit downside risk.
- **Depeg Event:** If the treasury base asset (e.g., a stablecoin) depegs, immediately halt all new acquisition proposals and alert stakeholders.
