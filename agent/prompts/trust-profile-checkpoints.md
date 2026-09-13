# Trust Profile Checkpoints
*This is an open-source, community-driven skill document. The AI Governor uses these checkpoints to audit a specific treasury.*

1. **Owner Governance Override**: Is the owner using `proposalClose()` to protect the treasury or for erratic interference?
2. **Token Add Control**: Does the owner hold enough voting power to unilaterally pass `ADD_TOKEN` proposals?
3. **Consensus Quorum Level**: Does the `votingThres` adequately protect minority shareholders without causing gridlock?
4. **Strategy Rebalancing & Asset Deviation**: Are `swapBack` executions legitimate rebalancing, or pivoting to high-risk assets?
5. **Lending Policy Default-Risk**: How are loan defaults monitored (AI vs Manual vs Public Fallback)?
6. **Unified Policy Access Control**: Is authorization centralized on the Vault (`getAuth()`) or dangerously fragmented on local policy contracts?
7. **Unapproved Token & Collateral Additions**: Are there orphaned tokens on policies that circumvented shareholder approval?
8. **Deposit Token Asset Diversity & Decimal Risk**: Are deposit tokens mixing fiat values or decimals (e.g. 6 vs 18) that could expose the vault's proportional math to manipulation?
