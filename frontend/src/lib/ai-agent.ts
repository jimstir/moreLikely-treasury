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

export interface AIOverlayResult {
  attributeName: string;
  isTriggered: boolean;
  triggerDescription: string;
}

/**
 * Calls an OpenAI-compatible LLM endpoint to evaluate the raw Trust Profile (Layer 1)
 * against the Treasury Mandate to provide a Contextual Overlay (Layer 2).
 */
export async function generateAiOverlay(
  layer1Profile: AttributeResult[],
  mandate: string
): Promise<AIOverlayResult[]> {
  const baseUrl = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error("LLM configuration missing in environment variables (LLM_BASE_URL, LLM_API_KEY).");
  }

  const systemPrompt = `You are the AI Shareholder Agent for a decentralized smart treasury. 
Your job is to audit the raw on-chain data (Layer 1 Trust Profile) against the treasury's official mandate.
You must output a strictly formatted JSON array containing your contextual overlay based on specific triggers.

### Treasury Mandate
"${mandate}"

### JSON Output Schema
Respond ONLY with a JSON array where each object has:
- "attributeName": (string) The name of the attribute (e.g. "Unapproved Token & Collateral Additions").
- "isTriggered": (boolean) Whether the attribute was triggered maliciously based on your reasoning.
- "triggerDescription": (string) A specific description of how the treasury triggered it (e.g., "[Token Name] swap was not described/shared in any open proposal description", or "Active front-running detected: [Token Name] was traded while Proposal [ID] was still pending.")

Do not output individual severities. Only output true if there is a severe risk of malicious intent, and provide the exact descriptive string.
Do not include markdown blocks like \`\`\`json. Just output the raw JSON array.`;

  const userPrompt = `Here is the Layer 1 Trust Profile data:\n\n${JSON.stringify(layer1Profile, null, 2)}`;

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o", // You can customize this or make it an env var
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.1,
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`LLM API returned ${response.status}: ${errText}`);
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
    throw error;
  }
}
