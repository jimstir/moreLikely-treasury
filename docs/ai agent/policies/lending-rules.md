# Lending Policy Standard (RFC)

This document outlines the default success/fail scenarios and baseline operating rules for any AI Governor interacting with the `LendingPolicy`.

## Core Mandates
1. **Health Factor Monitoring:** The AI must continuously monitor the health factor of any active loans. 
2. **Yield Optimization:** Track APY across whitelisted lending markets and propose capital reallocation if yield differences exceed the gas cost of migration.

## Success Scenarios
- **Profitable Yield:** Interest accrues beyond the target baseline. The AI proposes a withdrawal of the yield portion back to the `TreasuryVault`.
- **Optimal Rebalance:** Moving capital from a 2% APY pool to a 6% APY pool successfully without incurring high slippage.

## Fail Scenarios
- **Liquidation Imminent:** The loan health factor drops below a critical threshold (e.g., 1.1). The AI MUST immediately propose a transaction to withdraw collateral or repay debt to prevent liquidation.
- **Borrower Default:** If managing isolated lending markets, the AI must automatically trigger the fallback path (`seizeCollateral`) when a borrower defaults, transferring the seized assets to an Asset Swap Policy to recover the base stablecoin.
