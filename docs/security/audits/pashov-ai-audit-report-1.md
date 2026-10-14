Pashov Solidity Auditor (skill v3) — moreLikely-treasury
Scan time: 2026-09-09 18:15:00
Note: The 12 parallel Task agents could not start on this Cursor plan
("Named models unavailable / Free plans can only use Auto"). The same
12 specialty lenses were applied by the orchestrator against the in-scope
bundles. No contract source was modified.

Completeness: 22 unique (Contract, function) in raw, 22 covered in final.

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

[90] **1. TXNS “vote” compares vault-share units to the raw token transfer amount**

`TreasuryVault.vote` / `TreasuryVault.proposalApproved` · Confidence: 90 [agents: 1,3,4,5,8,10]

**Description**
For `ProposalType.TXNS`, `vote()` returns `totalShares[proposal] >= proposalBook[proposal].withdraw`, so dust vault shares (18-decimal treasury-token shares) can authorize a transfer of a 6-decimal or high-value ERC20 held by the vault; any account can then call `proposalApproved` and move those tokens to the policy.

**Fix**

```diff
- return shares >= proposalBook[proposal].withdraw;
+ // Compare like units (e.g. share value vs withdraw value in the same decimals/oracle)
+ uint256 shareValue = convertToAssets(shares);
+ return shareValue >= proposalBook[proposal].withdraw;
```

Gate: G1 ALLOWS (no other vote recording) · G2 ALLOWS (normal TXNS flow) · G3 ALLOWS (unprivileged deposit + proposalApproved) · G4 CONFIRMED (vault inventory leaves to receiver).
Chain: [1] + [8] — dust approval plus 1:1 lending LTV lets an unprivileged borrower extract the policy’s loan token.

---

[90] **2. `proposalRedeem` burns global ERC4626 shares with no per-proposal cap**

`TreasuryVault.proposalRedeem` · Confidence: 90 [agents: 1,4,5,9,10]

**Description**
The only check is `userBook[receiver][proposal].withdrew <= deposit`, which does not bound `shares`; after a proposal is closed, an owner can `redeem` their entire vault share balance (including shares attributed to other proposals) while posting the withdrawal against a single proposal’s book.

**Fix**

```diff
- require(
-     userBook[receiver][proposal].withdrew <=
-         userBook[receiver][proposal].deposit,
-     "Invalid redeem state"
- );
+ uint256 remaining = userBook[owner][proposal].deposit - userBook[owner][proposal].withdrew;
+ require(shares <= remaining, "Exceeds proposal deposit");
+ require(receiver == owner || allowance(owner, msg.sender) >= shares, "Not allowed");
```

Gate: G1 ALLOWS · G2 ALLOWS (closed proposals + multi-proposal depositors) · G3 ALLOWS · G4 CONFIRMED (other shareholders’ ERC4626 assets).

---

[90] **3. Unlock Merkle leaf is not consumed; re-deposit replays `claimExit`**

`VoterPool.claimExit` · Confidence: 90 [agents: 2,4,5,11]

**Description**
`claimExit` verifies `keccak256(abi.encodePacked(msg.sender, amount))` against `globalUnlockRoot` but never marks the leaf used; after burning vTokens and receiving treasury tokens, the user can `depositTokens` again and replay the same proof until the pool’s treasury-token balance is drained.

**Fix**

```diff
+ require(!claimed[leaf], "Already claimed");
+ claimed[leaf] = true;
  _burn(msg.sender, amount);
  IERC20(treasuryToken).safeTransfer(msg.sender, amount);
```

Gate: G1 ALLOWS · G2 ALLOWS (tokens remain in the pool whenever they have not been `proposalDeposit`ed) · G3 ALLOWS (unprivileged after owner publishes a root, which is the intended flow) · G4 CONFIRMED (other depositors).

---

[88] **4. Shareholder CLOSE execution calls `proposalClose` as the vault and fails `auth`**

`TreasuryVault.proposalApproved` · Confidence: 88 [agents: 2,4,6,12]

**Description**
The CLOSE branch sets `proposalBook[closing].close = true` then calls `this.proposalClose(...)`, so `msg.sender` is the vault; `proposalClose`’s `auth` modifier only allows `tOwner` or `_authUsers`, and the vault is not in that set unless `addAuth` was used, so the vote-to-close path reverts.

**Fix**

```diff
- this.proposalClose(closing);
- this.proposalClose(proposal);
+ _proposalClose(closing);
+ _proposalClose(proposal);
```
(Extract internal close logic that does not re-check `auth`, or `addAuth(address(this))` in the constructor.)

Gate: G1 ALLOWS (revert is the bug) · G2 ALLOWS · G3 ALLOWS (anyone may call `proposalApproved` when `vote` is true) · G4 CONFIRMED (intended close/veto path is dead; funds/proposals stuck without owner).

---

[85] **5. Exit policies pay `vault.asset()` (treasury token) instead of deposited treasury assets**

`DissolutionExit.claimExit` · Confidence: 85 [agents: 3,6,7,11]

**Description**
`IERC20 exitToken = IERC20(vault.asset())` is the ERC4626 underlying, which the vault constructor sets to `treasToken`, so claimants send treasury tokens to `0xdead` and receive treasury tokens from the exit contract rather than a pro-rata share of USDC/other `_tokenList` holdings.

**Fix**

```diff
- IERC20 exitToken = IERC20(vault.asset());
+ IERC20 exitToken = vault.tokensL()[0]; // or an explicit exit-asset parameter
```

Gate: G1 ALLOWS · G2 ALLOWS (if the exit contract is funded at all) · G3 ALLOWS · G4 CONFIRMED (wrong asset / cannot redeem real reserves).

---

[85] **6. Same `vault.asset()` mismatch on portional exits**

`PortionalExit.claimExit` · Confidence: 85 [agents: 3,6,7,11]

**Description**
Identical `vault.asset()` usage as DissolutionExit, so a Type 2C exit also cannot distribute the strategy’s real tokens.

**Fix**

```diff
- IERC20 exitToken = IERC20(vault.asset());
+ IERC20 exitToken = /* snapshot asset actually liquidated into this contract */;
```

Gate: G1 ALLOWS · G2 ALLOWS · G3 ALLOWS · G4 CONFIRMED.

---

[85] **7. Lending LTV is 1:1 token amounts despite an oracle router existing**

`LendingPolicy.takeLoan` · Confidence: 85 [agents: 3,8,10,11]

**Description**
`maxBorrow = (collateralAmount * maxLTV) / 10000` compares raw units of collateral and debt with no `getPrice` call, so if auth has accepted an unequal-value collateral token (normal multi-asset config), an unprivileged user borrows the valuable loan token at 75% of the junk token’s amount.

**Fix**

```diff
- uint256 maxBorrow = (loan.collateralAmount * maxLTV) / 10000;
+ uint256 collatValue = _value(address(loan.collateralToken), loan.collateralAmount);
+ uint256 debtValue = _value(address(loanToken), newTotalDebt);
+ require(debtValue * 10000 <= collatValue * maxLTV, "Exceeds Maximum LTV");
```

Gate: G1 ALLOWS · G2 ALLOWS (acceptedCollateral is intended) · G3 ALLOWS (`takeLoan` is public) · G4 CONFIRMED (treasury-funded loan inventory).
Amplifier: asymmetric formula after admin lists two tokens.

---

[85] **8. `owed()` underflows when a proposal is over-repaid, bricking dissolution checks**

`TreasuryVault.owed` · Confidence: 85 [agents: 1,5,9,12]

**Description**
`withdraw - deposits` uses Solidity 0.8 checked math; if `deposits > withdraw`, `owed` reverts, and `DissolutionExit.verifyAllProposalsClosedAndReturned` cannot finish its loop, so `claimExit` is permanently blocked.

**Fix**

```diff
- uint256 amount = proposalBook[num].withdraw - proposalBook[num].deposits;
- return (amount);
+ uint256 w = proposalBook[num].withdraw;
+ uint256 d = proposalBook[num].deposits;
+ return w > d ? w - d : 0;
```

Gate: G1 ALLOWS · G2 ALLOWS (overpayment via `depositTreasury(..., true, num)`) · G3 ALLOWS (anyone can overpay if the receiver has approved) · G4 CONFIRMED (all shareholders’ exit).

---

[82] **9. `proposalMint` inverts the valid-proposal bound and can credit future IDs**

`TreasuryVault.proposalMint` · Confidence: 82 [agents: 4,5,9]

**Description**
`require(proposalNum <= proposal)` is the opposite of `proposalDeposit`’s `proposalNum >= proposal`, so callers mint against proposal IDs that do not exist yet; when that ID is later opened as TXNS, `totalShares` may already satisfy `vote()`.

**Fix**

```diff
- require(proposalNum <= proposal, "Invalid proposal");
+ require(proposalNum >= proposal && proposal > 0, "Invalid proposal");
```

Gate: G1 ALLOWS · G2 ALLOWS · G3 ALLOWS · G4 CONFIRMED (pre-loaded approval).

---

[82] **10. `proposalMint` books `assets` into `totalShares` and `userBook.deposit`**

`TreasuryVault.proposalMint` · Confidence: 82 [agents: 1,5,10]

**Description**
After `super.mint`, the code adds `assets` (not `shares`) to `totalShares[proposal]` and `userBook[receiver][proposal].deposit`, so vote weight and redeem caps are in the wrong unit once the ERC4626 exchange rate leaves 1:1.

**Fix**

```diff
- totalShares[proposal] = add(totalShares[proposal], assets);
- userBook[receiver][proposal].deposit = add(
-     userBook[receiver][proposal].deposit,
-     assets
- );
+ totalShares[proposal] = add(totalShares[proposal], shares);
+ userBook[receiver][proposal].deposit = add(
+     userBook[receiver][proposal].deposit,
+     shares
+ );
```

Gate: G1 ALLOWS · G2 ALLOWS · G3 ALLOWS · G4 CONFIRMED (mis-weighted `vote` / caps).

---

[80] **11. “Burn” sends treasury tokens to `0xdead` instead of `burnTreasury`, leaving `totalSupply` unchanged**

`DissolutionExit.claimExit` · Confidence: 80 [agents: 1,5,7]

**Description**
`treasToken.safeTransferFrom(msg.sender, address(0xdead), amount)` does not reduce `totalSupply`; `vote()`’s non-TXNS path uses `treasToken.totalSupply()`, so dead tokens keep the threshold high and `TreasuryToken.burnTreasury` is never used.

**Fix**

```diff
- treasToken.safeTransferFrom(msg.sender, address(0xdead), amount);
+ ITreasuryToken(address(treasToken)).burnTreasury(msg.sender, amount);
```
(Requires vault-only burn to be callable from the exit policy, or a dedicated burn path.)

Gate: G1 ALLOWS · G2 ALLOWS · G3 ALLOWS · G4 CONFIRMED (governance threshold / non-redeemable supply).

---

[80] **12. Same 0xdead “burn” on PortionalExit**

`PortionalExit.claimExit` · Confidence: 80 [agents: 1,5,7]

**Description**
Same transfer-to-dead pattern; eligible snapshot balances decrease but circulating `totalSupply` does not.

**Fix**

```diff
- treasToken.safeTransferFrom(msg.sender, address(0xdead), amount);
+ ITreasuryToken(address(treasToken)).burnTreasury(msg.sender, amount);
```

Gate: G1 ALLOWS · G2 ALLOWS · G3 ALLOWS · G4 CONFIRMED.

---

[80] **13. `depositTreasury` pulls from the proposal receiver, not the caller**

`TreasuryVault.depositTreasury` · Confidence: 80 [agents: 2,4,6,12]

**Description**
Anyone may call `depositTreasury` on a closed `num` and `safeTransferFrom(token, proposalBook[num].receiver, vault, amount)`, so leftover `forceApprove(treasuryVault, ...)` on a policy lets an unprivileged party yank tokens from the policy into the vault (grief / accounting desync; `proposal=false` skips `deposits` credit).

**Fix**

```diff
- address sender = proposalBook[num].receiver;
- SafeERC20.safeTransferFrom(token, sender, address(this), amount);
+ SafeERC20.safeTransferFrom(token, msg.sender, address(this), amount);
```

Gate: G1 ALLOWS · G2 ALLOWS (policies approve the vault in `exit`/`liquidateToken`) · G3 ALLOWS · G4 CONFIRMED (policy AUM, `owed` / dissolution).

---

[75] **14. `joinTreasury` mints treasury tokens 1:1 with raw `amount` for any approved token**

`TreasuryVault.joinTreasury` · Confidence: 75 [agents: 1,3,8]

**Description**
`mintTreasury(msg.sender, amount)` ignores decimals and price, so an 18-decimal junk token approved via `newToken` mints vastly more governance/exit weight than 6-decimal USDC.

---

[75] **15. EXIT and ADD_TOKEN proposals are not executed by `proposalApproved`**

`TreasuryVault.proposalApproved` · Confidence: 75 [agents: 4,7,12]

**Description**
After the CLOSE branch, any non-TXNS type `return false` with no token movement, so `ProposalType.EXIT` never funds an exit policy through the documented approval path.

---

[75] **16. `proposalWithdraw` caps using `receiver` and mixes assets vs shares**

`TreasuryVault.proposalWithdraw` · Confidence: 75 [agents: 1,4,9]

**Description**
The remaining-deposit check keys `userBook[receiver]` while ERC4626 burns `owner`, and `withdrew` is increased by returned `shares` after a check against `assets`, so allowance + receiver/owner mismatch can desync the book.

---

[75] **17. `newToken` does not bind the listed token or require `vote()`**

`TreasuryVault.newToken` · Confidence: 75 [agents: 2,11]

**Description**
Any `auth` caller can pass an arbitrary `token` if some proposal has type `ADD_TOKEN`; `proposalBook[proposal].token` and `vote(proposal)` are ignored.

---

[75] **18. Chainlink path has no staleness or sequenced-round checks**

`OracleRouter.getChainlinkPrice` · Confidence: 75 [agents: 3,4,6]

**Description**
`latestRoundData()` only requires `answer > 0`; `updatedAt` / `answeredInRound` are ignored, so `getTotalValue` (and any future price-using logic) can read a frozen feed.

---

[75] **19. Uniswap TWAP tick is truncated to `int24` without range checks before TickMath**

`OracleRouter.getUniswapTwapPrice` · Confidence: 75 [agents: 1,9,10]

**Description**
`int24(tickCumulativesDelta / int56(uint56(twapPeriod)))` silently wraps if the average tick is outside `[-887272, 887272]`, then `getSqrtRatioAtTick` may revert or price wrongly depending on the wrapped value.

---

[75] **20. Policy wind-down always uses proposal id 0, which is never opened**

`LendingPolicy.liquidateToken` / `AssetSwapPolicy.exit` · Confidence: 75 [agents: 6,12]

**Description**
Both call `depositTreasury(..., false, 0)` but `closedProposals[0]` is false until the owner manually closes the unused id 0, so the documented liquidation/exit deposit reverts by default.

---

[75] **21. `AssetSwapPolicy.executeSwap` / `swapBack` accept arbitrary router calldata with only `amountOut > 0`**

`AssetSwapPolicy.executeSwap` · Confidence: 75 [agents: 3,6,8]

**Description**
`universalRouter.call(swapCallData)` has no `minAmountOut`, deadline, or spender restriction beyond a prior `forceApprove`, so an authorized executor (or compromised key) can sandwich to dust.

---

[75] **22. `VoterPool.closeProposal` does not return tokens from the vault**

`VoterPool.closeProposal` · Confidence: 75 [agents: 5,12]

**Description**
Batch votes `proposalDeposit` treasury tokens into the vault, but close only flips a flag and updates the Merkle root; `claimExit` then `safeTransfer`s from the pool, which may be empty unless a separate withdraw is implemented.

---

Findings List

| # | Confidence | Title |
|---|---|---|
| 1 | [90] | TXNS vote compares shares to raw token amount |
| 2 | [90] | proposalRedeem unbounded global ERC4626 redeem |
| 3 | [90] | VoterPool claimExit Merkle replay |
| 4 | [88] | CLOSE path this.proposalClose fails auth |
| 5 | [85] | DissolutionExit pays vault.asset() (treasToken) |
| 6 | [85] | PortionalExit pays vault.asset() (treasToken) |
| 7 | [85] | LendingPolicy 1:1 LTV ignores oracle |
| 8 | [85] | owed() underflow bricks dissolution |
| 9 | [82] | proposalMint inverted proposal bound |
| 10 | [82] | proposalMint books assets as shares |
| 11 | [80] | DissolutionExit transfer to 0xdead not burn |
| 12 | [80] | PortionalExit transfer to 0xdead not burn |
| 13 | [80] | depositTreasury pulls from receiver |
| 14 | [75] | joinTreasury 1:1 mint vs token value |
| 15 | [75] | EXIT/ADD_TOKEN not executed in proposalApproved |
| 16 | [75] | proposalWithdraw receiver/owner unit mix |
| 17 | [75] | newToken unbound token / no vote |
| 18 | [75] | Chainlink no stale check |
| 19 | [75] | Uniswap TWAP int24 truncation |
| 20 | [75] | liquidate/exit depositTreasury id 0 |
| 21 | [75] | Swap calldata no minOut |
| 22 | [75] | VoterPool close does not withdraw |

---

## Leads

_Vulnerability trails with concrete code smells where the full exploit path could not be completed in one analysis pass. These are not false positives — they are high-signal leads for manual review. Not scored._

- **`_allowInternal` window** — `TreasuryVault.deposit` — Code smells: flag instead of `nonReentrant` — If the ERC4626 asset ever gained callbacks, `deposit`/`mint`/`redeem`/`withdraw` would be callable mid-hook; current `TreasuryToken` has none, so unverified against future assets.
- **`forwardExecution` arbitrary call** — `SmartWallet.forwardExecution` — Code smells: `target.call(data)` to any allowed policy or the vault — Restricted to `executionWallet`; impact depends on whether that key is treated as unprivileged automation. Not scored as a finding (trusted role).
- **Gas refund drain** — `SmartWallet._refundGas` — Code smells: refunds `gasUsed * capped gas price` from ETH escrow to `executionWallet` — Only the execution wallet can trigger; owner-funded escrow.
- **`getTotalValue` silent oracle failure** — `LendingPolicy.getTotalValue` / `AssetSwapPolicy.getTotalValue` — Code smells: failed `staticcall` skipped, tokens without markets counted as raw or omitted — View/accounting; not shown to gate insolvency on-chain.
- **Cannot revoke `_authUsers`** — `TreasuryVault.addAuth` — Code smells: no `removeAuth` — Privileged by design; no unprivileged amplifier.
- **`vote()` is not a ballot** — `TreasuryVault.vote` — Code smells: no per-user vote mapping — Capital-in-proposal is the entire election; may be intended, but combines with finding 1.
- **Portional snapshot integrity** — `PortionalExit.startExitPeriod` — Code smells: owner-supplied `_eligibleBalances` — Admin-set; no on-chain check vs `treasToken.balanceOf`.
- **`ImmutableExit` still advertises IExitPolicy** — `ImmutableExit.supportsInterface` — Code smells: compliance true while `claimExit` always reverts — Confusion for `proposalOpen` EXIT routing, not a fund path.
- **TickMath vendored copy** — `TickMath.getSqrtRatioAtTick` — Code smells: standard Uniswap library — No additional defect beyond OracleRouter’s missing tick clamp.

---

> ⚠️ This review was performed by an AI assistant. AI analysis can never verify the complete absence of vulnerabilities and no guarantee of security is given. Team security reviews, bug bounty programs, and on-chain monitoring are strongly recommended. For a consultation regarding your projects' security, visit [https://www.pashov.com](https://www.pashov.com)
