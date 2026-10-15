# Lending Policy Standard (RFC)

This document outlines the default success/fail scenarios, contract tasks, and baseline operating rules for any AI Governor interacting with the `LendingPolicy`.

## Contract Task Definitions
1. **Health Factor Monitoring**: Continuously track collateral ratios, debt balances, and borrowing thresholds for all active loans.
2. **`seizeCollateral(borrower)`**: Executes repossession and default liquidation when a borrower breaches loan-to-value limits or deadline expiries.
3. **Collateral Reclamation & Swap Fallback**: Automatically transfers seized collateral back to the `TreasuryVault` and coordinates with the `AssetSwapPolicy` to liquidate it into base treasury assets.

## Core Mandates
1. **Health Factor Monitoring:** The AI must continuously monitor the health factor of any active loans.
2. **Yield Optimization:** Track APY across whitelisted lending markets and propose capital reallocation if yield differences exceed the gas cost of migration.

## Deployer Customization & Task Toggles
- **Lending Module Toggle (`enabledTasks.lending`):** Deployers can completely disable lending tasks (`lending: false`). When disabled, the `ContextBuilder` omits lending rules from prompt context, restricting the agent to spot portfolio management.

## Success Scenarios
- **Profitable Yield:** Interest accrues beyond the target baseline. The AI proposes a withdrawal of the yield portion back to the `TreasuryVault`.
- **Optimal Rebalance:** Moving capital from a lower APY pool to a higher APY pool successfully without incurring high slippage.

## Fail Scenarios & Circuit Breakers
- **Liquidation Imminent:** The loan health factor drops below a critical threshold (e.g., 1.1). The AI MUST immediately propose a transaction to withdraw collateral or repay debt to prevent liquidation.
- **Borrower Default:** If managing isolated lending markets, the AI must automatically trigger the fallback path (`seizeCollateral`) when a borrower defaults, transferring the seized assets to an Asset Swap Policy to recover the base stablecoin.
- **Data / RPC Failure (`SAFE_MODE`):** If lending contract states or loan data cannot be retrieved from on-chain feeds, the agent enters `SAFE_MODE` and defers execution to manual stakeholder governance.
