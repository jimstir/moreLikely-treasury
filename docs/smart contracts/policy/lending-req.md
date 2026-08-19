# Smart Treasury: Lending Module Requirements

This document outlines the architectural specifications and workflows for the `LendingPolicy.sol` module within the moreLikely Smart Treasury platform.

---

## 1. Overview

The Lending module introduces decentralized, over-collateralized borrowing against the Treasury's idle reserves approved to be actively lent. With the `LendingPolicy.sol`, the treasury can securely act as a liquidity provider, earning interest from borrowers while remaining fully auditable.

### 1.1 Core Principles

- **Over-Collateralization:** Borrowers must lock collateral exceeding the value of the borrowed assets to protect the treasury against default.
- **Configurable Risk:** The Treasury Owner determines the Maximum Loan-to-Value (LTV) ratio.
- **Permissionless Liquidations:** Any actor (such as the Treasury Owner or an arbitrageur) can liquidate positions that fall below the required LTV ratio.
- **Winding-Down Safeguards:** When the policy is liquidated, lending stops immediately, and unlent strategy cash can be swept back to the vault token-by-token.

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
A "Keeper" (which can be the Treasury Owner or external arbitrageurs) monitors active loans. If a borrower's LTV exceeds the `maxLTV` (due to interest accrual or collateral devaluation), the liquidator repays the borrower's debt out-of-pocket and seizes the borrower's locked collateral.

---

## 3. Workflow & Lifecycle

### Capital Allocation
The policy receives liquidity funded from one or more proposals. The contract tracks the latest funding proposal ID via `proposalNum` to maintain standard policy compliance. Loans are issued directly from the contract's available token balances.

### 3.1 Establishing Collateral
Before borrowing, a user must call `depositCollateral(IERC20 token, uint256 amount)`.
- The contract verifies the token is whitelisted via `acceptedCollateral`.
- The assets are transferred via `safeTransferFrom` and locked in the contract's escrow.

### 3.2 Taking a Loan
The user calls `takeLoan(IERC20 loanToken, uint256 amount)`.
- The contract verifies the policy is active (`status == 0`).
- It calculates the current Loan-to-Value (LTV) ratio assuming 1:1 token value ratio for simplicity or peg validation.
- If the requested amount keeps the ratio strictly `<= maxLTV`, the loan is issued from the contract's available balance, and the debt amount is added to `totalOutstandingLoans[loanToken]`.

### 3.3 Repayment & Withdrawal
- Users call `repayLoan(uint256 amount)` to pay down their debt. This decrements `totalOutstandingLoans[loanToken]`.
- Users can call `withdrawCollateral(uint256 amount)`. The contract ensures the post-withdrawal LTV remains healthy before releasing collateral.

### 3.4 Liquidation Event
If a loan breaches the `maxLTV` threshold:
1. The liquidator calls `liquidatePosition(address borrower)`.
2. The contract resets the user's debt and collateral balances to 0, decrementing `totalOutstandingLoans[loanToken]`.
3. The liquidator pays the debt amount directly to the contract.
4. The contract transfers the seized collateral to the liquidator.

### 3.5 Solving the Discovery Problem: The Platform Liquidation Portal
*   **The Discovery Problem:** Since individual treasuries deploy their own isolated `LendingPolicy` contracts, public liquidator searchers/bots will not automatically know these contracts exist, which could cause defaults to remain un-liquidated indefinitely.
*   **The Platform Portal:** The central platform indexes all deployed `LendingPolicy` contracts and exposes active, near-default, or defaulted loans in a unified **Global Liquidation Dashboard**.
*   **Incentive Loop:** External arbitrageurs browse this portal to execute public liquidations directly, keeping individual treasuries liquid and removing the need for them to market their own loan defaults.

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

**Key State Variables:**
- `uint256 public maxLTV`: Settable by the owner (e.g., 7500 for 75%).
- `mapping(IERC20 => bool) public acceptedCollateral`: Whitelists specific tokens for use as collateral.
- `address public oracleRouter`: The unified price oracle router contract.
- `mapping(address => address) public tokenOracleMarkets`: Maps tokens to their respective oracle markets.
- `address[] public activeTokens`: List of tokens managed/lent by the contract.
- `mapping(address => uint256) public totalOutstandingLoans`: Tracks total lent outstanding principal per token type.
- `uint256 public status`: Status flag (`0` for Active, `1` for Liquidated).

**Core Functions:**
- `function status() external view returns (uint256)`: Returns the current status flag.
- `function getTotalValue() external view returns (uint256)`: Calculates aggregate valuation of cash and outstanding debt.
- `function liquidate() external`: Initiates the wind-down process and sets `status = 1`.
- `function liquidateToken(address token) external`: Sweeps unlent balances of the specified token back to the vault during liquidation.
- `function seizeCollateral(address borrower) external`: Allows the Owner or the Vault to directly seize a defaulted loan's collateral and transfer it to the TreasuryVault without requiring external payment capital.

---

## 5. Security & Risk Guardrails

### 5.1 Liquidation Wind-Down Lock
*   Once `liquidate()` is triggered, no new borrowing is allowed. The `takeLoan()` function is permanently disabled, ensuring that the policy can only receive repayments and sweep remaining cash.

### 5.2 Collateral Isolation (No Same-Asset Borrowing)
*   To prevent redundant utility and looping exploits, borrowers **MUST NOT** be allowed to borrow the same asset they deposited as collateral.
*   **Enforcement:** `takeLoan()` reverts if `collateralToken == loanToken`.

### 5.3 Oracle Valuation Integration
*   To calculate the policy's fair value transparently, `getTotalValue()` aggregates the contract's token cash balances and the total outstanding debt, querying the `OracleRouter` to price them accurately in standard 18-decimal USD/Base terms.

### 5.4 On-Chain Direct Seizure (Repo Fallback)
*   To protect the treasury from infinite default exposure in the absence of public liquidator bots, the contract implements an administrative repossession function (`seizeCollateral()`).
*   **Enforcement:** Restricted strictly to the `tOwner` or `treasuryVault` (callable by the AI Agent). If a loan's LTV is breached or its repayment period has expired, the caller can directly trigger a state update that sets the borrower's debt to 0 and transfers their locked collateral directly to the `TreasuryVault` address. This converts the bad debt into treasury-owned reserve assets in a single transaction.
