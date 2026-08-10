# Smart Treasury: Lending Module Requirements

This document outlines the architectural specifications and workflows for the `LendingPolicy.sol` module within the moreLikely Smart Treasury platform.

## 1. Overview

The Lending module introduces decentralized, over-collateralized borrowing against the Treasury's idle reserves. By implementing `LendingPolicy.sol`, the treasury can securely act as a liquidity provider, earning yield on its idle assets while offering credit to stakeholders.

### 1.1 Core Principles
- **Over-Collateralization:** Borrowers must lock collateral exceeding the value of the borrowed assets to protect the treasury against default.
- **Configurable Risk:** The Treasury Owner determines the Maximum Loan-to-Value (LTV) ratio.
- **Permissionless Liquidations:** Any actor (specifically the AI Governor Agent) can liquidate positions that fall below the required LTV ratio.

---

## 2. System Roles

### 2.1 The Lender (Treasury)

The `TreasuryVault` acts as the sole lender. 
1. A `LoanProposal` is submitted to the DAO (or AI Governor) requesting to allocate a specific amount of idle treasury tokens to the `LendingPolicy.sol` contract.
2. Once the proposal passes, the treasury transfers liquidity to the lending contract, making it available for borrowing.

### 2.2 The Borrower (Shareholders / Users)

Any user can become a borrower if they possess an asset explicitly approved as collateral by the Treasury Owner (`acceptedCollateral`).
Borrowers lock their collateral in the `LendingPolicy.sol` contract and draw loans up to the Maximum LTV threshold.

### 2.3 The Liquidator (AI Governor Agent)
A "Keeper" responsible for monitoring the health of all active loans. If a borrower's collateral value drops (or debt increases) such that their current LTV exceeds the `maxLTV`, the Liquidator triggers the `liquidate()` function on-chain.
- **Action:** The Liquidator repays the borrower's outstanding debt out-of-pocket and, in return, seizes the borrower's locked collateral at a discount.
- **AI Agent Integration:** In our ecosystem, the AI Governor Agent continuously polls blockchain state. If it detects an under-collateralized position, it will bundle a transaction to call `liquidate()`, securing the treasury's health autonomously without requiring human intervention.

---

## 3. Workflow & Lifecycle

### 3.1 Establishing Collateral
Before borrowing, a user must call `depositCollateral(IERC20 token, uint256 amount)`.
- The smart contract verifies the token is whitelisted.
- The assets are transferred via `safeTransferFrom` and locked in the contract's escrow.

### 3.2 Taking a Loan
The user calls `takeLoan(IERC20 loanToken, uint256 amount)`.
- The contract calculates the current Loan-to-Value (LTV) ratio.
- **LTV Formula:** `(Total Debt / Total Collateral Value) * 10,000`
- If the requested amount keeps the ratio strictly `<= maxLTV`, the loan is issued from the contract's available liquidity.

### 3.3 Repayment & Withdrawal
- Users can call `repayLoan(uint256 amount)` at any time to pay down their debt balance.
- Once the debt is reduced, the user can call `withdrawCollateral(uint256 amount)`. The contract guarantees that the post-withdrawal LTV remains healthy before releasing the assets.

### 3.4 Liquidation Event
If a loan breaches the `maxLTV` threshold:
1. The AI Agent detects the breach off-chain.
2. The AI Agent signs a transaction calling `liquidate(address borrower)`.
3. The smart contract resets the user's debt and collateral balances to 0.
4. The Agent pays the debt amount directly to the contract.
5. The contract transfers the seized collateral to the Agent.

---

## 4. Smart Contract Interfaces

The module revolves around the following state structures in `LendingPolicy.sol`:

```solidity
struct Loan {
    uint256 collateralAmount;
    uint256 loanAmount;
    uint256 startTime;
    IERC20 collateralToken;
    IERC20 loanToken;
}
```

**Key Configurable Variables:**
- `uint256 public maxLTV`: Settable by the owner (e.g., 7500 for 75%).
- `mapping(IERC20 => bool) public acceptedCollateral`: Whitelists specific tokens for use as collateral.

---

## 5. AI Governor Liquidation Design

The `LendingPolicy.sol` contract already includes the `liquidate(address borrower)` method. However, since smart contracts are passive, the AI Governor Agent must actively monitor and trigger this function.

### 5.1 Monitoring Loop (The Keeper Bot)
The AI Governor will implement a background CRON task (e.g., running every 5 minutes) via `agent/runner.ts` that performs the following:
1. **Fetch Active Loans:** Query the `LendingPolicy` contract to retrieve all active loans.
2. **Fetch Live Prices:** Call an Oracle (e.g., Chainlink or a DEX API) to get the real-time USD value of the `collateralToken` and the `loanToken`.
3. **Calculate Current LTV:**
   - Compute `Collateral USD Value = collateralAmount * collateralTokenPrice`
   - Compute `Debt USD Value = loanAmount * loanTokenPrice`
   - Compute `Current LTV = (Debt USD Value / Collateral USD Value) * 10,000`

### 5.2 Triggering Liquidation
If the `Current LTV > maxLTV` (e.g., exceeds 75%):
1. **Fund Verification:** The AI Agent checks its own EOA wallet balance to ensure it has enough of the `loanToken` to pay off the borrower's debt.
2. **Execution:** The Agent signs and broadcasts the `liquidate(borrower)` transaction.
3. **Settlement:** 
   - The Agent's wallet pays the debt to the Treasury.
   - The Agent's wallet receives the borrower's seized collateral.
4. **Rebalancing:** The Agent can be programmed to immediately swap the seized collateral back to stablecoins on a DEX to capture the liquidation premium (arbitrage) and fund future liquidations.
