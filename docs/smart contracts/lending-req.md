# Smart Treasury: Lending Module Requirements

This document outlines the architectural specifications and workflows for the `LendingPolicy.sol` module within the moreLikely Smart Treasury platform.

## 1. Overview

The Lending module introduces decentralized, over-collateralized borrowing against the Treasury's idle reserves approved to be actively lent. With the `LendingPolicy.sol`, the treasury can securely act as a liquidity provider, earning interest from shareholders who partcipate in borrowing activities.

### 1.1 Core Principles

- **Over-Collateralization:** Borrowers must lock collateral exceeding the value of the borrowed assets to protect the treasury against default.
- **Configurable Risk:** The Treasury Owner determines the Maximum Loan-to-Value (LTV) ratio.
- **Permissionless Liquidations:** Any actor (such as the Treasury Owner or an arbitrageur) can liquidate positions that fall below the required LTV ratio.

---

## 2. System Roles

### 2.1 The Lender (Treasury)

The `TreasuryVault` acts as the sole lender. 
1. A `LoanProposal` is submitted a treasury proposal requesting to allocate a specific amount of idle tokens held in the `TreasuryVault.sol` contract to be sent to the `LendingPolicy.sol` contract.
2. Once the proposal is approved, the `owner` or shareholders can transfer the approved amount to the lending contract.

### 2.2 The Borrower (Shareholders / Users)

Any user can become a borrower if they possess an asset explicitly approved as collateral by the Treasury Owner (`acceptedCollateral`).
Borrowers lock their collateral in the `LendingPolicy.sol` contract and draw loans up to the Maximum LTV threshold.

### 2.3 The Liquidator

A "Keeper" (which can be the Treasury Owner or external arbitrageurs) responsible for monitoring the health of all active loans. If a borrower's collateral value drops (or debt increases) such that their current LTV exceeds the `maxLTV`, the Liquidator triggers the `liquidatePosition()` function on-chain.
- **Action:** The Liquidator repays the borrower's outstanding debt out-of-pocket and, in return, seizes the borrower's locked collateral.

---

## 3. Workflow & Lifecycle

### Deploying LendingPolicy

- 

The contract does not pool liquidity arbitrarily. Instead, it tracks the amount of loan tokens received *per proposal ID* (`proposalLendingCap`).
*   The total outstanding loan amount issued under a specific proposal cannot exceed the lending cap allocated by that proposal.

### Establishing Collateral

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
1. A liquidator detects the breach.
2. The liquidator signs a transaction calling `liquidatePosition(address borrower)`.
3. The smart contract resets the user's debt and collateral balances to 0.
4. The liquidator pays the debt amount directly to the contract.
5. The contract transfers the seized collateral to the liquidator.

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
- `mapping(IERC20 => address) public priceFeeds`: Maps whitelisted collateral tokens to their respective Chainlink Oracle aggregator addresses.
- `mapping(uint256 => uint256) public proposalLendingCap`: Maps the Treasury proposal ID to the maximum liquidity allocated for lending under that specific proposal.

---

## 5. Security & Risk Guardrails

To prevent exploits and ensure capital preservation, the `LendingPolicy.sol` contract enforces the following guardrails:

### 5.1 Proposal-Specific Liquidity Limits
*   

### 5.2 Collateral Isolation (No Same-Asset Borrowing)
*   To prevent redundant utility and looping exploits, borrowers **MUST NOT** be allowed to borrow the same asset they deposited as collateral.
*   **Enforcement:** `takeLoan()` must revert if the user's `collateralToken == loanToken`.
*   Whitelisting a token for lending (e.g., USDC) automatically makes it recommended **not** to accept the same token as collateral.

### 5.3 Hard Oracle Requirement
*   To prevent LTV manipulation and secure liquidations, the contract requires a reliable pricing feed for all whitelisted collateral.
*   **Enforcement:** The owner **CANNOT** call `setAcceptedCollateral(token, true)` unless a valid Chainlink Price Feed address has been registered first for that token in `priceFeeds`.
*   During `takeLoan()` and `withdrawCollateral()`, the contract dynamically queries the oracle to calculate the USD value of the collateral before modifying the LTV.



