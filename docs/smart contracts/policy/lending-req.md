# Smart Treasury: Lending Module Requirements and Architecture

This document outlines the architectural specifications, state models, and implementation mechanics of the `LendingPolicy.sol` module within the moreLikely Smart Treasury platform. It describes how each function is implemented so that the architecture can be directly compared against the contract implementation.

---

## 1. Overview

The Lending module introduces decentralized, over-collateralized borrowing against idle treasury reserves allocated for lending. Operating as an authorized treasury policy (`ITreasuryPolicy`), `LendingPolicy.sol` acts as a liquidity provider, earning revenue for the treasury while enforcing strict automated risk guardrails.

### 1.1 Core Principles

- **Over-Collateralization:** Borrowers must escrow approved collateral whose real-time valuation exceeds their borrowed liabilities based on an authorized Maximum Loan-to-Value (`maxLTV`) threshold.
- **Live Decimal-Normalized Oracle Pricing:** Every solvency check queries live price feeds from the unified `OracleRouter`, normalizing disparate token decimals into standard 18-decimal USD values to eliminate unpegged or unequal-value arbitrage vulnerabilities.
- **Permissionless Liquidations:** Any actor or keeper bot can liquidate positions whose debt exceeds the allowable LTV ratio, paying the outstanding debt and receiving the borrower's seized collateral.
- **Administrative Default Seizure (Repo Fallback):** The treasury owner, vault, or keeper can directly seize collateral from defaulted or expired loans and transfer it directly to the treasury vault without paying external capital.
- **Wind-Down Liquidation:** When the policy is decommissioned, new borrowing is permanently halted, and remaining token balances are swept back to the vault.

---

## 2. System Roles

### 2.1 The Lender (TreasuryVault)
The `TreasuryVault` contract acts as the ultimate liquidity source. Governance approves a funding proposal allocating idle tokens to the `LendingPolicy.sol` address. Once funded, the policy manages the cash inventory and distributes loans directly from its local ERC20 balances.

### 2.2 Borrowers
Any account holding whitelisted collateral (`acceptedCollateral`) can deposit assets into the contract. Once collateral is deposited, the borrower can draw loans up to the Maximum LTV threshold evaluated using real-time oracle prices.

### 2.3 Liquidators & Searchers
External arbitrageurs, keepers, or treasury administrators monitor active loan positions. If market movements cause a borrower's collateral value to drop such that their debt-to-collateral ratio exceeds `maxLTV`, liquidators can repay the debt on-chain and receive the borrower's locked collateral.

### 2.4 Governance & Policy Administrators
The treasury owner or authorized operators configure key parameters:
- Setting the Maximum LTV ratio (`maxLTV`).
- Setting the maximum allowable loan duration (`loanDuration`).
- Whitelisting collateral assets (`acceptedCollateral`).
- Registering the `OracleRouter` and mapping per-token price feeds (`tokenOracleMarkets`).
- Triggering repossession of expired loans or winding down the policy.

---

## 3. Core State Model

The contract maintains the following core data structures and state variables:

### 3.1 Borrower Loan Record (`Loan`)
Each borrower address maps to a single active `Loan` struct containing:
- **`collateralAmount`**: Total units of collateral currently locked in escrow.
- **`loanAmount`**: Total units of the borrowed asset currently owed as debt.
- **`startTime`**: Block timestamp when the initial borrow occurred (used for duration expiry).
- **`collateralToken`**: ERC20 token address deposited as collateral.
- **`loanToken`**: ERC20 token address drawn as debt.

### 3.2 Protocol Configuration
- **`maxLTV`**: Maximum allowable debt-to-collateral ratio represented in basis points (e.g., 7500 for 75%, base 10,000). Settable by authorized callers.
- **`loanDuration`**: Maximum duration an active loan may remain open before it is classified as expired (default: 30 days).
- **`acceptedCollateral`**: Mapping tracking which ERC20 tokens are approved for collateral escrow.
- **`collateralProposalIds`**: Tracks the governance proposal ID under which each collateral token was whitelisted.
- **`status`**: Policy lifecycle status flag (`0` for Active, `1` for Liquidated).

### 3.3 Oracle Integration & Accounting
- **`oracleRouter`**: Address of the centralized price router contract.
- **`tokenOracleMarkets`**: Mapping of each ERC20 token address to its dedicated oracle feed market address.
- **`activeTokens`**: Dynamic array of all unique ERC20 tokens that have been borrowed or managed.
- **`isTokenTracked`**: Mapping preventing duplicate token entries in `activeTokens`.
- **`totalOutstandingLoans`**: Mapping tracking total outstanding principal lent per token type.

---

## 4. Implementation Details and Workflows

### 4.1 Internal Valuation & Decimal Normalization (`_getValue`)
All valuation logic is centralized in the internal view helper `_getValue(address token, uint256 amount)`. The implementation executes as follows:
1. **Zero Check:** If the provided amount is zero, it returns zero immediately.
2. **Configuration Validation:** Resolves the token's market feed from `tokenOracleMarkets`. Reverts if either the market feed address is unconfigured (`address(0)`) or the `oracleRouter` is not set.
3. **Fail-Closed Oracle Query:** Executes a low-level `staticcall` to `getPrice(market)` on the `oracleRouter`. Reverts if the call fails, returns no data, or returns a price less than or equal to zero.
4. **Decimals Query:** Executes a low-level `staticcall` to `decimals()` on the target token contract. If successful and non-empty, it uses the decoded value; otherwise, it defaults to 18 decimals.
5. **18-Decimal Normalization:** Multiplies the token amount by the oracle price and divides by 10 raised to the token's decimal precision. This normalizes all valuations into standard 18-decimal USD values, ensuring equitable comparison between assets with 6 decimals (USDC), 8 decimals (WBTC), and 18 decimals (DAI/WETH).

### 4.2 Depositing Collateral (`depositCollateral`)
1. Verifies that the specified token is whitelisted in `acceptedCollateral` and that the deposit amount is greater than zero.
2. Enforces collateral isolation: if the borrower already has an open collateral position, the deposited token must match the existing `collateralToken`. A borrower cannot mix multiple collateral types in a single loan.
3. If this is the borrower's first deposit, records the token as their active `collateralToken`.
4. Transfers the tokens from the caller into contract escrow using SafeERC20 `safeTransferFrom`.
5. Increments the borrower's `collateralAmount` and emits `CollateralDeposited`.

### 4.3 Drawing a Loan (`takeLoan`)
1. Verifies that the policy is active (`status == 0`).
2. Confirms that the caller has positive deposited collateral and that the requested borrow amount is greater than zero.
3. Verifies contract solvency by checking that the contract's local balance of the requested `loanToken` is greater than or equal to the requested amount.
4. Restricts borrowing to a single token type: if debt is already active, the requested asset must match `loan.loanToken`. If starting a new loan, sets `loanToken` and captures the current `block.timestamp` as `startTime`.
5. Computes the candidate total debt by adding the requested amount to the current `loanAmount`.
6. Computes the 18-decimal USD value of the borrower's locked collateral and the 18-decimal USD value of the candidate total debt via `_getValue`.
7. Enforces the live LTV constraint: multiplies the total debt USD value by 10,000 and requires that it is less than or equal to the collateral USD value multiplied by `maxLTV`. Reverts with an LTV breach error if this condition is not met.
8. Updates the borrower's `loanAmount` to the new total debt.
9. Increments `totalOutstandingLoans` for the borrowed token and registers the token in `activeTokens` if not already tracked.
10. Transfers the borrowed tokens to the borrower using SafeERC20 `safeTransfer` and emits `LoanTaken`.

### 4.4 Repaying a Loan (`repayLoan`)
1. Verifies that the caller has an active loan with non-zero debt and that the repayment amount is greater than zero.
2. Caps the repayment amount: if the requested amount exceeds the outstanding debt, it sets the repaid amount to the exact debt owed.
3. Transfers the debt tokens from the borrower to the contract using SafeERC20 `safeTransferFrom`.
4. Decrements the borrower's `loanAmount` and decrements `totalOutstandingLoans` for that token.
5. Emits `LoanRepaid`.

### 4.5 Withdrawing Collateral (`withdrawCollateral`)
1. Verifies that the borrower has at least the requested collateral amount locked and that the withdrawal amount is greater than zero.
2. Calculates the prospective remaining collateral amount.
3. If the borrower still has outstanding debt (`loanAmount > 0`), re-evaluates the position's health:
   - Computes the 18-decimal USD value of the prospective remaining collateral via `_getValue`.
   - Computes the 18-decimal USD value of the existing debt via `_getValue`.
   - Requires that the debt USD value multiplied by 10,000 is less than or equal to the remaining collateral USD value multiplied by `maxLTV`. Reverts if the withdrawal would breach the required ratio.
4. Updates the borrower's `collateralAmount` to the reduced balance.
5. Transfers the withdrawn collateral tokens to the borrower using SafeERC20 `safeTransfer` and emits `CollateralWithdrawn`.

### 4.6 Permissionless Liquidation (`liquidatePosition`)
1. Callable by any account (including keeper bots) for any borrower address that currently holds outstanding debt.
2. Calculates the 18-decimal USD value of the borrower's collateral and debt using `_getValue`.
3. Verifies that the position is undercollateralized: requires that the debt USD value multiplied by 10,000 is strictly greater than the collateral USD value multiplied by `maxLTV`. Reverts with `"Loan is sufficiently collateralized"` if the loan is healthy.
4. Caches the outstanding debt amount and total locked collateral.
5. Resets the borrower's `loanAmount` and `collateralAmount` to zero and decrements `totalOutstandingLoans`.
6. Transfers the debt amount from the liquidator to the contract using SafeERC20 `safeTransferFrom`.
7. Transfers the seized collateral from the contract to the liquidator using SafeERC20 `safeTransfer`.
8. Emits `Liquidated` detailing the borrower, debt repaid, collateral seized, and liquidator address.

### 4.7 Administrative Collateral Seizure (`seizeCollateral`)
1. Restricts execution to the treasury owner (`tOwner`), authorized treasury executors (`getAuth`), or the `TreasuryVault` contract itself.
2. Verifies that the target borrower has active debt.
3. Evaluates default criteria:
   - Calculates the 18-decimal USD value of the borrower's collateral and debt via `_getValue` to check if `maxLTV` has been breached.
   - Evaluates whether the position has expired by checking if `block.timestamp` exceeds `loan.startTime + loanDuration`.
   - Requires that at least one of these two default conditions is met (`ltvBreached || timeExpired`). Reverts if the loan is healthy and active.
4. Caches the debt and collateral balances, resets both state values to zero, and decrements `totalOutstandingLoans`.
5. Transfers the seized collateral directly to the `TreasuryVault` contract address using SafeERC20 `safeTransfer` without requiring repayment funds from the caller.
6. Emits `CollateralSeized`.

### 4.8 View Helpers for Frontend & Integration

#### `getTokenValue(address token, uint256 amount)`
- Public view function exposing the internal `_getValue` logic.
- Allows frontends and users to preview a token amount's 18-decimal USD valuation and verify that oracle price feeds are configured and operational before submitting transactions.

#### `getMaxBorrow(address borrower, address loanToken)`
- Public view function enabling borrowers and user interfaces to preview the exact maximum borrowable amount of a specified `loanToken`.
- If the borrower has no deposited collateral, returns zero.
- Computes the 18-decimal USD value of the borrower's deposited collateral via `_getValue`.
- Queries the loan token's oracle feed from `tokenOracleMarkets` and fetches its live price via `oracleRouter.staticcall`.
- Resolves the loan token's decimals.
- Calculates the maximum borrowable USD value as collateral value multiplied by `maxLTV` divided by 10,000, and converts this value into loan token units scaled by the token's native decimals.

### 4.9 Policy Valuation (`getTotalValue`)
- Implements the standard `ITreasuryPolicy` valuation interface.
- Iterates through all tokens recorded in `activeTokens`.
- For each token, sums the local cash held in the contract and the total outstanding debt recorded in `totalOutstandingLoans`.
- Converts the combined managed balance to an 18-decimal USD value using the registered oracle feed (or falls back to raw balance if unconfigured), and returns the cumulative valuation across all managed tokens.

### 4.10 Wind-Down and Sweeping (`liquidate` and `liquidateToken`)
- **`liquidate()`**: Restricts access to authorized callers and sets `status = 1`. Permanently disables `takeLoan()`.
- **`liquidateToken(address token)`**: Once liquidated, an authorized caller sweeps idle balances of the specified token back to the `TreasuryVault` by force-approving the vault and invoking `ITreasuryVault.depositTreasury(...)`.

---

## 5. Security & Risk Guardrails Summary

- **Fail-Closed Oracle Integration:** Reverts if an oracle feed is unconfigured, staticcalls fail, or a reported price is non-positive. This guarantees that trades and borrows cannot proceed during oracle outages or flash crashes.
- **Decimal Normalization:** Prevents decimal discrepancy exploits (e.g. depositing 8-decimal WBTC and borrowing 18-decimal DAI or 6-decimal USDC under an unnormalized 1:1 ratio).
- **Single Collateral Isolation:** Eliminates cross-collateral contagion and complex basket liquidation risks by requiring each borrower to utilize a single collateral token per active loan.
- **Checks-Effects-Interactions:** State resets (clearing borrower debt and collateral) occur before external token transfers in both `liquidatePosition` and `seizeCollateral` to prevent reentrancy attacks.
- **Two-Tier Default Enforcement:** Protects treasury solvency through both permissionless arbitrage liquidations (for market speed) and administrative repo seizures (as a fallback when keeper bot liquidity is absent).

## To-Do: On the Policy Contract (AssetSwapPolicy, LendingPolicy): In functions like exit() or liquidateToken(), allow shareholders or anyone to trigger it if the policy has been marked liquidated or closed