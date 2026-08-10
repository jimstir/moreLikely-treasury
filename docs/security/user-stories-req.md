# Open Treasury V1: User Stories & Security Scenarios

This document outlines the user stories and security scenarios for the `TreasuryVault` architecture, specifically testing the resilience of different **Ingress (Join)** and **Egress (Exit)** configuration pairs.

## Configuration Primitives Reference
*   **Join Types:** Continuous (1A), Epoch/Funding Queue (1B)
*   **Exit Types:** Immutable (2A), Consensus (2B), Timelock (2C), Conditional (2D)

---

## 1. The Attacker (MEV / Front-Running)
**Goal:** An attacker attempts to snipe profits from an active treasury without taking any long-term market risk.

### Scenario A: The Vulnerable Configuration (1A + 2C)
*   **Configuration:** Continuous Join + Timelock Exit
*   **Story:** The AI Governor executes a massive, highly profitable WETH swap. The transaction is sitting in the mempool. The attacker sees the transaction and submits a high-gas `deposit()` (Continuous Join) exactly one millisecond before the AI's transaction. The attacker buys shares at the old, cheap price. The AI's profit lands, spiking the `totalAssets()`. The attacker immediately requests a `withdraw()`. 
*   **Result (Vulnerable):** While the Timelock (2C) forces the attacker to wait 7 days to get their cash, their share price was locked in at the exact moment of the front-run. The attacker successfully diluted the original shareholders' profit.

### Scenario B: The Secure Configuration (1B + 2B)
*   **Configuration:** Epoch Join + Consensus Exit
*   **Story:** The attacker attempts the same mempool front-run. They submit a massive `deposit()`. However, because the treasury uses Epoch Joins, their funds are routed to the **Pending Queue**. Their deposit does *not* instantly buy shares. The AI's profit lands in the active treasury. At the end of the week, the Funding Round finalizes, and the attacker's shares are minted at the *new, expensive post-profit price*.
*   **Result (Secure):** The attacker gains zero advantage. Original shareholders keep 100% of their profit.

---

## 2. The Good Actor (Standard DAO Operations)
**Goal:** A community member wants to passively fund an AI trader and safely exit when they need liquidity.

### Scenario: The Syndicated DAO (1B + 2B)
*   **Configuration:** Epoch Join + Consensus Exit
*   **Story:** Alice wants to support a community-run AI trading bot. She submits 5,000 USDC during the active Funding Round (1B). She knows her funds won't be exposed to risk until the round finalizes. Six months later, her shares have doubled in value. She needs to pay rent. She submits a Liquidity Unlock Proposal to the DAO. The DAO votes "Yes" (2B). The AI Governor gracefully unwinds 5,000 USDC worth of positions over 48 hours, placing the cash in the vault. Alice redeems her shares during the unlock window and pays her rent.
*   **Result:** A smooth, predictable experience for the shareholder with zero disruption to the AI's active trading strategies.

---

## 3. Profit & Growing Assets (Compounding Success)
**Goal:** The treasury experiences rapid, sustained growth, testing how the architecture handles massive value accrual.

### Scenario: Protocol-Owned Liquidity (1A + 2A)
*   **Configuration:** Continuous Join + Immutable Exit
*   **Story:** A new DeFi protocol launches a treasury to act as a market maker for its native token. Users continuously deposit USDC (1A) to buy governance tokens at a discount. The AI Governor uses the USDC to provide liquidity on Uniswap, generating massive trading fees. The `totalAssets()` skyrockets. Because the treasury is Immutable (2A), no one can `withdraw()`. The liquidity is permanently locked. 
*   **Result:** The treasury acts as a "black hole" of wealth. Shareholders benefit because the massive locked liquidity creates a permanent, ever-growing price floor for the native token they trade on secondary markets.

---

## 4. Loss & Bad Debt (Market Crashes)
**Goal:** A third-party protocol gets hacked, resulting in a sudden loss of treasury assets.

### Scenario: The Emergency Refund (1B + 2D)
*   **Configuration:** Epoch Join + Conditional Exit
*   **Story:** The treasury has 1,000,000 USDC deployed in a yield-farming protocol. The yield farm gets exploited, and the treasury loses 400,000 USDC instantly. The `totalAssets()` drops significantly, meaning all share prices plummet. 
*   **The Reaction:** Because the treasury uses Conditional Exit (2D), the smart contract detects a catastrophic deviation in NAV (or the security council triggers the emergency boolean). The treasury automatically halts all trading. The remaining 600,000 USDC is unlocked.
*   **Result:** Shareholders accept a 40% loss, but the Conditional Exit ensures they can immediately withdraw their remaining 60% before the AI attempts any risky "revenge trading" to make the money back.

---

## 5. Large Amount of Joins (The Viral Influx)
**Goal:** The treasury goes viral on Twitter, and 10,000 users attempt to deposit $10,000,000 on the same day.

### Scenario: The Batch Finalization (1B + Any Exit)
*   **Configuration:** Epoch Join + Consensus Exit
*   **Story:** A famous influencer tweets about the AI Governor's performance. Instantly, 10,000 users rush to the DApp. If the treasury used Continuous Join (1A), the AI's internal accounting and active trades would be violently disrupted by the chaotic influx of capital block-by-block. 
*   **The Reaction:** Because it uses Epoch Joins (1B), all 10,000 deposits sit quietly in the Pending Queue. The AI Governor continues its daily trades using the original capital without a single interruption. At 5:00 PM on Friday, the Round Finalizes. The $10,000,000 is cleanly swept into the active pool in one single transaction, minting shares perfectly at the Friday 5:00 PM price.
*   **Result:** The protocol survives the viral influx with zero strain on the AI Governor's active strategies.

---

## 6. Large Amount of Exits (The Bank Run)
**Goal:** Panic hits the broader crypto market, and 80% of shareholders try to withdraw simultaneously.

### Scenario: The Graceful Unwind (1B + 2B)
*   **Configuration:** Epoch Join + Consensus Exit
*   **Story:** Bitcoin drops 30% in a day. Panic ensues. 80% of the shareholders rush to the `TreasuryVault` and click `withdraw()`.
*   **The Reaction:** Because the treasury uses Consensus Exits (2B), direct withdrawals are blocked. The panic attempt fails. The shareholders must collectively submit a massive Liquidity Unlock Proposal. 
*   **The Resolution:** The AI Governor (or human manager) sees the approved proposal. They are not forced to fire-sell assets at the bottom of the market crash. They have time to wait for a slight market bounce, carefully close their Lending/Swap policies, and route the cash back to the vault. Once the cash is secured, the withdrawal window opens, and the 80% exit safely.
*   **Result:** The protocol completely prevents the fatal "Bank Run" spiral, ensuring that even in a mass-exit event, the assets are liquidated gracefully and the remaining 20% of shareholders aren't left with bad debt.
