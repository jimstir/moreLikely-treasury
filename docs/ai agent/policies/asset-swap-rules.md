# Asset Swap Policy Standard (RFC)

This document outlines the default success/fail scenarios, contract tasks, and baseline operating rules for any AI Governor interacting with the `AssetSwapPolicy`.

## Contract Task Definitions
1. **`setTokenOracleMarket(proposalId, tokenOut)`**: Registers the target asset on-chain to the proposal before execution, binding oracle feeds and Uniswap pool routes.
2. **`executeSwap(...)`**: Executes the trade through Uniswap via the policy contract, enforcing minimum output amounts, deadline timestamps, and slippage guards.
3. **Execution Forwarding**: When executing via a `SmartWallet`, the agent wraps `executeSwap` within `SmartWallet.forwardExecution`, verifying on-chain that the policy is the designated recipient in `vault.proposalBook(proposalId)`.

## Core Mandates
1. **Slippage Protection:** Never execute a swap if expected slippage exceeds the threshold defined in the treasury goals (`slippageLimit`).
2. **Stop-Loss Enforcement:** If an acquired asset drops below the stop-loss percentage, an exit proposal must be generated immediately.
3. **Liquidity Check:** Do not swap into illiquid pairs. Volume and pool depth must be verified before opening a proposal.

## Deployer Customization & Task Toggles
- **Stop-Loss Toggle (`enabledTasks.stopLoss`):** Deployers can toggle stop-loss checks ON or OFF. If disabled (`stopLoss: false`), the AI Governor will hold positions through drawdowns per the deployer's explicit strategy.
- **Custom Strategies (`skills.md`):** Deployers can paste custom strategy guidelines directly into the platform settings (`customSkillMd`). The `ContextBuilder` appends these instructions directly to the prompt context.

## Success Scenarios
- **Take-Profit:** The asset appreciates by the target yield margin. The AI proposes a swap back to the base stablecoin to secure profits.
- **Rebalancing:** An asset exceeds its maximum allocation percentage due to price appreciation. The AI proposes selling the excess to maintain treasury balance.

## Fail Scenarios & Circuit Breakers
- **Flash Crash:** The asset drops rapidly. If stop-loss is enabled, the AI proposes a rescue swap to limit downside risk.
- **Depeg Event:** If the treasury base asset (e.g., a stablecoin) depegs, immediately halt all new acquisition proposals and alert stakeholders.
- **Data / RPC Failure (`SAFE_MODE`):** If on-chain balances or prices cannot be queried, the agent halts all swap proposals and engages `SAFE_MODE`.
