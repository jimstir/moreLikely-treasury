Pashov Solidity Auditor (skill v3) — moreLikely-treasury
Scan time: 2026-10-14 16:40:00
Note: The 12 specialist lenses from pashov-skills were applied sequentially by the
orchestrator across all in-scope contracts. No contract source was modified during this review.

Completeness: 7 unique (Contract, function) in raw, 7 covered in final.

```

██████╗  █████╗ ███████╗██╗  ██╗ ██████╗ ██╗   ██╗     ███████╗██╗  ██╗██╗██╗     ██╗     ███████╗
██╔══██╗██╔══██╗██╔════╝██║  ██║██╔═══██╗██║   ██║     ██╔════╝██║ ██╔╝██║██║     ██║     ██╔════╝
██████╔╝███████║███████╗███████║██║   ██║██║   ██║     ███████╗█████╔╝ ██║██║     ██║     ███████╗
██╔═══╝ ██╔══██║╚════██║██╔══██║██║   ██║╚██╗ ██╔╝     ╚════██║██╔═██╗ ██║██║     ██║     ╚════██║
██║     ██║  ██║███████║██║  ██║╚██████╔╝ ╚████╔╝      ███████║██║  ██╗██║███████╗███████╗███████║
╚═╝     ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝ ╚═════╝   ╚═══╝       ╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝╚══════╝

```

# 🔐 Security Review — moreLikely-treasury

---

## Scope

|                                  |                                                        |
| -------------------------------- | ------------------------------------------------------ |
| **Mode**                         | ALL / default                                          |
| **Files reviewed**               | `TickMath.sol` · `SmartWallet.sol` · `OracleRouter.sol`<br>`TreasuryVault.sol` · `TreasuryToken.sol` · `VoterPool.sol`<br>`DissolutionExit.sol` · `ImmutableExit.sol` · `PortionalExit.sol`<br>`LendingPolicy.sol` · `AssetSwapPolicy.sol` |
| **Confidence threshold (1-100)** | 80                                                     |

---

## Findings

[85] **1. `OracleRouter.getUniswapTwapPrice` ignores decimal discrepancies between pool tokens**

`OracleRouter.getUniswapTwapPrice` · Confidence: 85 [agents: 1,9,10]

**Description**
`TickMath.getSqrtRatioAtTick` returns `sqrt(amount1 / amount0) * 2^96` in raw token units; when `token0` and `token1` have differing decimal precisions (e.g., USDC 6 decimals vs WETH 18 decimals), `(ratioX192 * 1e18) >> 192` does not normalize for the decimal difference, outputting a price distorted by powers of 10.

**Fix**

```diff
+       uint8 dec0 = ERC20(token0).decimals();
+       uint8 dec1 = ERC20(IUniswapV3Pool(pool).token1()).decimals();
        if (pricedToken == token0) {
            // Price of token0 in terms of token1
-           return (ratioX192 * 1e18) >> 192;
+           uint256 price = (ratioX192 * 1e18) >> 192;
+           return dec0 <= dec1 ? price * (10 ** (dec1 - dec0)) : price / (10 ** (dec0 - dec1));
        } else {
            // Price of token1 in terms of token0
-           return (1e18 << 192) / ratioX192;
+           uint256 price = (1e18 << 192) / ratioX192;
+           return dec1 <= dec0 ? price * (10 ** (dec0 - dec1)) : price / (10 ** (dec1 - dec0));
        }
```

Gate: G1 ALLOWS (router executes formula directly) · G2 ALLOWS (common in any pool with mixed-decimal pairs like USDC/WETH) · G3 ALLOWS (unprivileged caller queries price via policy) · G4 CONFIRMED (distorts LTV valuations and total asset accounting by orders of magnitude).

---

[80] **2. `TreasuryVault.vote` unconditionally queries `token.decimals()` before checking proposal type**

`TreasuryVault.vote` · Confidence: 80 [agents: 2,4,6,9]

**Description**
`vote()` calls `ERC20(address(token)).decimals()` before evaluating `proposalBook[proposal].request == ProposalType.TXNS`, causing `vote()` (and therefore `proposalApproved`) to revert if a `CLOSE` proposal is opened with `token = address(0)` as permitted by design.

**Fix**

```diff
-       IERC20 token = proposalBook[proposal].token;
-       uint256 rawWithdrawAmount = proposalBook[proposal].withdraw;
-       uint8 decimals = ERC20(address(token)).decimals();
-       uint256 normalWithdraw = rawWithdrawAmount;
-
        if (proposalBook[proposal].request == ProposalType.TXNS) {
+           IERC20 token = proposalBook[proposal].token;
+           uint256 rawWithdrawAmount = proposalBook[proposal].withdraw;
+           uint8 decimals = ERC20(address(token)).decimals();
+           uint256 normalWithdraw = rawWithdrawAmount;
            // value-ratio voting: require total shares for proposal >= requested withdraw amount
```

Gate: G1 ALLOWS (staticcall to address(0) reverts immediately) · G2 ALLOWS (CLOSE proposals ignore token field per NatSpec) · G3 ALLOWS (shareholders attempting to approve a passed CLOSE proposal are blocked) · G4 CONFIRMED (bricks shareholder ability to finalize CLOSE proposals on-chain).

---

[80] **3. `TreasuryVault.proposalRedeem` and `proposalWithdraw` check and update `userBook[receiver]` instead of `userBook[owner]`**

`TreasuryVault.proposalRedeem` / `TreasuryVault.proposalWithdraw` · Confidence: 80 [agents: 2,5,8,11]

**Description**
ERC4626 `redeem` and `withdraw` burn shares from `owner` and remit assets to `receiver`, but `proposalRedeem` and `proposalWithdraw` validate and decrement `userBook[receiver]`, causing legitimate redemptions where `receiver != owner` to revert due to `userBook[receiver]` having 0 deposits, or desyncing the quota between accounts.

**Fix**

```diff
-       uint256 remaining = userBook[receiver][proposal].deposit -
-           userBook[receiver][proposal].withdrew;
+       uint256 remaining = userBook[owner][proposal].deposit -
+           userBook[owner][proposal].withdrew;
        require(shares <= remaining, "Exceeds proposal deposit");

        _allowInternal = true;
        uint256 assets = super.redeem(shares, receiver, owner);
        _allowInternal = false;
-       userBook[receiver][proposal].withdrew =
-           userBook[receiver][proposal].withdrew +
+       userBook[owner][proposal].withdrew =
+           userBook[owner][proposal].withdrew +
            shares;
```

Gate: G1 ALLOWS (standard ERC4626 allowance-based redeem path) · G2 ALLOWS (normal usage when delegating redemption or sending assets to cold wallet) · G3 ALLOWS (shareholders executing approved redeems) · G4 CONFIRMED (denial of redemption or misattribution of quota consumption).

---

[75] **4. `TreasuryToken.burnTreasury` allows any compliant `IExitPolicy` to burn tokens from arbitrary addresses**

`TreasuryToken.burnTreasury` · Confidence: 75 [agents: 2,7,11]

**Description**
`burnTreasury(address from, uint256 amount)` checks only `onlyVaultOrExit` without validating that `from == msg.sender` or that `from` has provided an explicit allowance, enabling any deployed exit policy to burn tokens from unconsenting token holders.

Gate: G1 ALLOWS · G2 DEMOTE (requires malicious or faulty exit policy to be approved by governance) · G3 DEMOTE · G4 CONFIRMED.

---

[75] **5. `SmartWallet.forwardExecution` does not validate that `data` targets the approved `proposalId`**

`SmartWallet.forwardExecution` · Confidence: 75 [agents: 4,11,12]

**Description**
`forwardExecution` verifies that `vault.vote(proposalId) == true`, but forwards arbitrary calldata `target.call(data)` to allowed policies without ensuring the calldata parameters match the approved proposal ID or intended method.

Gate: G1 ALLOWS · G2 DEMOTE (requires compromised executionWallet) · G3 DEMOTE (restricted role) · G4 CONFIRMED.

---

[75] **6. `LendingPolicy.liquidatePosition` lacks bad-debt absorption or partial liquidations**

`LendingPolicy.liquidatePosition` · Confidence: 75 [agents: 3,5,10]

**Description**
`liquidatePosition` forces a 100% debt repayment to seize 100% of collateral; if price drops rapidly causing collateral value to fall below outstanding debt, liquidators will never execute the liquidation, leaving unbacked debt in the protocol until manual admin seizure.

Gate: G1 ALLOWS · G2 ALLOWS (rapid market drops) · G3 ALLOWS · G4 DEMOTE (keeper can still call `seizeCollateral` as a fallback).

---

[75] **7. `PortionalExit` and `StrategyExit` do not verify total snapshot balances against available funding**

`PortionalExit.startExitPeriod` / `StrategyExit.startExitPeriod` · Confidence: 75 [agents: 5,8,11]

**Description**
Admins provide arbitrary `_eligibleBalances` when starting an exit round without on-chain verification that the sum of eligible claims matches the actual `exitToken` deposited by the exit proposal, creating a potential race condition where later claimants cannot redeem if balances were over-committed.

Gate: G1 ALLOWS · G2 DEMOTE (privileged admin configuration) · G3 DEMOTE · G4 CONFIRMED.

---

Findings List

| # | Confidence | Title |
|---|---|---|
| 1 | [85] | `OracleRouter.getUniswapTwapPrice` ignores decimal discrepancies between pool tokens |
| 2 | [80] | `TreasuryVault.vote` unconditionally queries `token.decimals()` before checking proposal type |
| 3 | [80] | `TreasuryVault.proposalRedeem` and `proposalWithdraw` check and update `userBook[receiver]` instead of `userBook[owner]` |
| 4 | [75] | `TreasuryToken.burnTreasury` allows any compliant `IExitPolicy` to burn tokens from arbitrary addresses |
| 5 | [75] | `SmartWallet.forwardExecution` does not validate that `data` targets the approved `proposalId` |
| 6 | [75] | `LendingPolicy.liquidatePosition` lacks bad-debt absorption or partial liquidations |
| 7 | [75] | `PortionalExit` / `StrategyExit` do not verify total snapshot balances against available funding |

---

## Leads

_Vulnerability trails with concrete code smells where the full exploit path could not be completed in one analysis pass. These are not false positives — they are high-signal leads for manual review. Not scored._

- **Silent oracle failure in policy view accounting** — `AssetSwapPolicy.getTotalValue` / `LendingPolicy.getTotalValue` — Code smells: failed `staticcall` or unconfigured oracle market is omitted or counted at 1:1 units — Informational view only; does not gate solvency or fund transfers on-chain.
- **Unbounded execution replay before proposal close** — `SmartWallet.forwardExecution` — Code smells: checks `!closedProposals(proposalId)` rather than an internal execution marker — Gated by trusted `executionWallet`.
- **Zero-transfer revert risk on 100% manager fee** — `StrategyExit.claimExit` — Code smells: `exitToken.safeTransfer(msg.sender, 0)` when `managerFeeBps == 10000` — Reverts on tokens that disallow zero-value transfers (e.g. LEND).
- **Relayer root generation trust** — `VoterPool.submitBatchVote` — Code smells: Merkle roots are generated entirely off-chain by the owner without on-chain signature verification proofs — Relies on governance operator integrity.

---

> ⚠️ This review was performed by an AI assistant. AI analysis can never verify the complete absence of vulnerabilities and no guarantee of security is given. Team security reviews, bug bounty programs, and on-chain monitoring are strongly recommended. For a consultation regarding your projects' security, visit [https://www.pashov.com](https://www.pashov.com)
