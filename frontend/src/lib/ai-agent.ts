import { AttributeResult } from "./trust-profile";


// ---------------------------------------------------------
// Trust Profile Checkpoint Data Context Interfaces
// ---------------------------------------------------------

export interface BaseCheckpointContext {
  layer1Metrics?: any;
  recentEvents?: any[];
}

export interface OwnerOverrideContext extends BaseCheckpointContext {
  layer1Metrics?: {
    totalProposalsCreated?: number;
    totalProposalsClosedByOwner?: number;
    averageProposalDurationSeconds?: number;
  };
  recentEvents?: Array<{
    proposalId?: string;
    closureType?: "owner_override" | "scheduled_end";
    originalProposalTerms?: {
      scheduledCloseDate?: number | null;
      strategyType?: string;
    };
    timeOpenBeforeClosureSeconds?: number;
    marketSnapshotAtClosure?: {
      blockTimestamp?: number;
      assetPrices?: Record<string, number>;
    };
  }>;
}

export interface TokenAddControlContext extends BaseCheckpointContext {
  layer1Metrics?: {
    ownerVotingPowerPercentage?: number;
    votingThresholdPercentage?: number;
    hasUnilateralControl?: boolean;
  };
  recentEvents?: Array<{
    proposalId?: string;
    proposalType?: "ADD_TOKEN";
    tokenAdded?: {
      symbol?: string;
      contractAddress?: string;
      isVerifiedBlueChip?: boolean;
    };
    passedUnilaterallyByOwner?: boolean;
  }>;
}

export interface LendingPolicyContext extends BaseCheckpointContext {
  layer1Metrics?: {
    agentVerificationReceipt?: string;
    isAiGovernorAuthorized?: boolean;
    totalActiveLoans?: number;
    loansInDefaultWarning?: number;
  };
  recentEvents?: Array<{
    loanId?: string;
    wasLiquidated?: boolean;
    timeSpentInDefaultWarningSeconds?: number;
    liquidator?: "owner" | "public" | "ai_agent";
  }>;
}

// TODO: Add remaining checkpoint interfaces (3-8) here as the indexer is built out.

export interface TrustProfileAuditPayload {
  checkpointsData: {
    [checkpointId: number]: BaseCheckpointContext;
  };
}

export interface ProposalLifecycleContext {
  proposals?: Array<{
    id?: string;
    onChainId: number;
    proposerAddress: string;
    recipientAddress: string;
    withdrawAmount: number;
    targetToken: string;
    status: string;
    createdAt: string | Date;
    updatedAt: string | Date;
    decisionReport?: {
      id?: string;
      rationale: string;
      timeframe: string;
      ticketReceipt?: string | null;
      swapRoutes?: any;
      rawMarketData?: any;
    } | null;
  }>;
  performances?: Array<{
    date: string | Date;
    totalValueUsd: number;
  }>;
  goals?: any;
}

export interface AIOverlayResult {
  attributeName: string;
  isTriggered: boolean;
  triggerDescription: string;
}

/**
 * Evaluates rule-based lifecycle heuristics when LLM is unavailable or for deterministic testing.
 */
export function evaluateLifecycleHeuristics(
  layer1Profile: AttributeResult[],
  mandate: string,
  lifecycleContext?: ProposalLifecycleContext
): AIOverlayResult[] {
  const results: AIOverlayResult[] = [];

  // Check 1: Proposal Document Integrity
  const missingDocProposals = (lifecycleContext?.proposals || []).filter(
    p => !p.decisionReport || !p.decisionReport.rationale || p.decisionReport.rationale.trim().length === 0
  );
  if (missingDocProposals.length > 0) {
    results.push({
      attributeName: "Proposal Document Integrity",
      isTriggered: true,
      triggerDescription: `Undocumented proposals detected: ${missingDocProposals.map(p => `#${p.onChainId}`).join(", ")} opened without verified DecisionReport documents.`
    });
  }

  // Check 2: Early Quitting / Abandonment of Long-Term Strategies
  const abandonedLongTerm = (lifecycleContext?.proposals || []).filter(p => {
    if (p.decisionReport?.timeframe?.toLowerCase().includes("long-term") && (p.status === "closed" || p.status === "disputed")) {
      const openTimeMs = new Date(p.updatedAt).getTime() - new Date(p.createdAt).getTime();
      // If closed in less than 3 days despite claiming to be a long-term strategy
      return openTimeMs < 3 * 86400 * 1000;
    }
    return false;
  });
  if (abandonedLongTerm.length > 0) {
    results.push({
      attributeName: "Early Quitting & Strategy Abandonment",
      isTriggered: true,
      triggerDescription: `Premature closure detected: Proposal(s) ${abandonedLongTerm.map(p => `#${p.onChainId}`).join(", ")} declared a long-term timeframe but were abandoned early.`
    });
  }

  // Check 3: Repeated Undefined Actions
  const totalClosed = (lifecycleContext?.proposals || []).filter(p => p.status === "closed").length;
  const totalProposals = (lifecycleContext?.proposals || []).length;
  if (totalProposals >= 5 && totalClosed / totalProposals > 0.7) {
    results.push({
      attributeName: "Repeated Undefined & Churn Actions",
      isTriggered: true,
      triggerDescription: `High proposal churn rate (${Math.round((totalClosed / totalProposals) * 100)}% closed without completion) indicating unstable execution.`
    });
  }

  return results;
}

/**
 * Calls an OpenAI-compatible LLM endpoint to evaluate the raw Trust Profile (Layer 1)
 * against the Treasury Mandate and Proposal Lifecycle History (Layer 2 Contextual Overlay).
 */
export async function generateAiOverlay(
  layer1Profile: AttributeResult[],
  mandate: string,
  lifecycleContext?: ProposalLifecycleContext
): Promise<AIOverlayResult[]> {
  const baseUrl = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;

  if (!baseUrl || !apiKey) {
    console.warn("[ai-agent] LLM config missing, falling back to rule-based lifecycle heuristics.");
    return evaluateLifecycleHeuristics(layer1Profile, mandate, lifecycleContext);
  }

  const systemPrompt = `You are the AI Trust Governor and Shareholder Auditor for a decentralized smart treasury. 
Your job is to audit the raw on-chain data (Layer 1 Trust Profile), treasury mandate, and proposal lifecycle history.
You must reason through:
1. Proposal-Document Alignment: Check whether proposal attributes (withdrawn amount, target token, recipient) correspond faithfully with the stated rationale in the DecisionReport document.
2. Early Quitting & Abandonment: Detect if proposals designated as 'long-term' were prematurely closed or abandoned before fulfilling their strategy.
3. Repeated Undefined Actions: Flag erratic trading actions, repeated undefined proposals, or severe divergences from the mandate.
4. Historical Performance: Correlate portfolio drawdowns with speculative proposal executions.

### Treasury Mandate
"${mandate}"

### JSON Output Schema
Respond ONLY with a JSON array where each object has:
- "attributeName": (string) The name of the attribute (e.g. "Proposal Document Integrity", "Early Quitting & Strategy Abandonment", "Repeated Undefined Actions", "Unapproved Token & Collateral Additions").
- "isTriggered": (boolean) Whether the attribute was triggered maliciously or abnormally based on your reasoning.
- "triggerDescription": (string) Specific explanation of the discrepancy or violation observed.

Do not output individual severities. Only output true if there is a genuine risk or verifiable discrepancy, and provide the exact descriptive string.
Do not include markdown blocks like \`\`\`json. Just output the raw JSON array.`;

  const userPrompt = `Here is the Layer 1 Trust Profile data:\n${JSON.stringify(layer1Profile, null, 2)}\n\nHere is the Proposal Lifecycle & Historical Context:\n${JSON.stringify(lifecycleContext || {}, null, 2)}`;

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.1,
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`LLM API returned ${response.status}: ${errText}. Using heuristic fallback.`);
      return evaluateLifecycleHeuristics(layer1Profile, mandate, lifecycleContext);
    }

    const data = await response.json();
    let content = data.choices[0].message.content.trim();
    
    // Strip markdown formatting if the model still returned it
    if (content.startsWith("```json")) {
      content = content.replace(/^```json\n?/, "").replace(/```$/, "").trim();
    } else if (content.startsWith("```")) {
      content = content.replace(/^```\n?/, "").replace(/```$/, "").trim();
    }

    const parsed: AIOverlayResult[] = JSON.parse(content);
    return parsed;
  } catch (error) {
    console.error("AI Overlay Generation Error:", error);
    return evaluateLifecycleHeuristics(layer1Profile, mandate, lifecycleContext);
  }
}
