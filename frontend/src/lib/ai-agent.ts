import { AttributeResult } from "./trust-profile";

export interface AIOverlayResult {
  attributeId: number;
  originalSeverity: string;
  revisedSeverity: string;
  aiRationale: string;
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
Sometimes raw on-chain data looks risky (e.g. unapproved tokens) but is actually part of standard operations (e.g. pending proposals) aligned with the mandate. 
You must output a strictly formatted JSON array containing your contextual overlay.

### Treasury Mandate
"${mandate}"

### JSON Output Schema
Respond ONLY with a JSON array where each object has:
- "attributeId": (number) The ID of the attribute being evaluated (1-7)
- "originalSeverity": (string) The raw severity from Layer 1
- "revisedSeverity": (string) Your revised severity ("safe", "warning", or "critical")
- "aiRationale": (string) A concise explanation of your reasoning (max 2 sentences).

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
