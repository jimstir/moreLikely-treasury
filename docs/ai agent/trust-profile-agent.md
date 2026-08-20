# Trust Profile AI Agent (Shareholder Auditor)

The Trust Profile is a critical transparency module displayed on the frontend dashboard, allowing potential users and stakeholders to evaluate the risk of joining a Smart Treasury. 

To prevent deterministic on-chain data from unfairly penalizing treasuries (e.g., flagging a risk because an owner hasn't immediately executed a passed proposal), the architecture splits the Trust Profile into two layers:

### Layer 1: Raw On-Chain Data (Deterministic)
The UI queries the blockchain directly to find raw facts. Examples:
*   Owner controls 60% of voting power.
*   The contract holds unapproved tokens.
*   The quorum threshold is low.

### Layer 2: AI Contextual Overlay (LLM Reasoning)
The `AIShareholderAgent` (acting as the Trust Profile Auditor) runs periodically to evaluate the **Layer 1** metrics against recent on-chain events. It provides contextual reasoning for "gray areas" and outputs a structured JSON assessment.

For example, if Layer 1 flags "Unapproved Tokens Present", the AI Agent queries recent events. If it sees a proposal to remove the token passed 4 hours ago, it downgrades the risk to "Low" and adds a rationale: *"Pending owner execution. Standard operational delay."*

---

## Architecture & Implementation

### 1. Data Aggregation
The platform backend or the Self-Hosted Agent Runner collects the treasury's flagged metrics and a window of recent events (proposals, transactions) into a structured JSON context block.

### 2. Prompt Injection
The context block is injected into the predefined system prompt located at:
[`agent/prompts/trust-profile-prompt.txt`](../../agent/prompts/trust-profile-prompt.txt)

This prompt instructs the LLM to act as an impartial auditor, downgrading severity if a recent event explains the anomaly.

### 3. Structured JSON Output
To ensure the UI can consume the AI's reasoning, the LLM is constrained to output data matching the JSON schema located at:
[`agent/prompts/trust-profile-schema.json`](../../agent/prompts/trust-profile-schema.json)

The UI overlays the `assessedRiskLevel` and `shortRationale` on top of the original Layer 1 metrics.

---

## Updating the Prompt for Private Deployments
Users running Private (Self-Hosted) AI Governors can modify the LLM's reasoning engine to be more strict or lenient by editing `trust-profile-prompt.txt`. 

As long as the private agent continues to output valid JSON matching the `trust-profile-schema.json`, the platform will successfully parse and display the custom AI insights on the treasury's frontend dashboard.
