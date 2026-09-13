# Treasury Mandate

This document serves as the constitutional goals and risk tolerance for this treasury. The AI Governor uses this mandate to evaluate operations and execute autonomous strategies. 

## 1. Protocol Mechanics (Smart Treasury Definitions)
*The following definitions outline the moreLikely open standard. The AI Governor must obey these mechanics when managing or auditing the treasury:*
- **Opening a Proposal (`proposalOpen`):** Initiates a standard stakeholder vote for a new strategy or token addition.
- **Closing a Proposal (`proposalClose`):** An administrative function to end a strategy. Calling this on a scheduled end date is standard maintenance. Calling this early during stable markets may indicate erratic interference. Calling this early during a market crash is a justified emergency measure to protect capital.
- **Executing a Proposal:** Calling the policy contract (e.g., Asset Swap or Lending) only after a proposal has successfully passed voting.

## 2. Core Objectives
*Provide a brief summary of the treasury's purpose (e.g., Stablecoin yield generation, volatile asset aggregation, DAO operating capital).*

## 2. Risk Parameters
```json
{
  "slippageLimit": 0.5,
  "stopLoss": 5.0,
  "maxTreasuryPercentage": 10.0,
  "disputePeriodSeconds": 86400
}
```

## 3. Target Allocations
```json
{
  "targetAllocations": {
    "WETH": 40.0,
    "WBTC": 40.0,
    "USDC": 20.0
  }
}
```

## 4. Approved Data Sources
```json
{
  "dataSources": [
    "https://api.coingecko.com/api/v3",
    "https://trade-api.gateway.uniswap.org/v1"
  ]
}
```

## 5. Owner Justifications & Forward Guidance
*This section is intended for the Treasury Owner to provide contextual instructions, manual overrides, or justifications for upcoming on-chain actions that shareholders and the AI Governor should be aware of.*

**[YYYY-MM-DD]:** Initial treasury deployment and mandate creation.
