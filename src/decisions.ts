import Anthropic from "@anthropic-ai/sdk";

export type DecisionLabel = "decision" | "non_decision";

export interface DecisionResult {
  label: DecisionLabel;
  reasoning: string;
}

export interface ExtractedDecision {
  text: string;
  reasoning: string;
  line?: number;
}

/**
 * Prompt is eval-friendly: same I/O shape as eval/decision-extractor-v1.jsonl.
 * Input: a single text snippet. Output: {label, reasoning}.
 * This lets Phase 1 drop the same prompt into the 60-pair eval harness.
 */
const CLASSIFY_SYSTEM = `You label a single text snippet from an internal doc as either "decision" or "non_decision".

A DECISION is a completed commitment the team has made:
- Explicit confirmation: "chose X", "CHOSEN", "ACCEPTED", "confirmed X", "결정함", "확정"
- Change/replacement: "moving from A to B", "A → B"
- Cancellation/drop: "canceling X", "dropping Y"
- Deferral as decision: "deferred to v1.1", "DEFERRED" (this IS a decision to not do it now)
- Agreement/policy: "agreed to X", "X is now the standard", "banning X"

A NON_DECISION is anything not yet committed:
- Questions, hypotheses, "maybe", "might", "could"
- Observations, problem statements, positioning
- Goals, metrics, success criteria
- Open questions, "TBD", "to be decided later"
- Roadmap brainstorm with no commitment
- Conditional future triggers ("if X then Y")

Respond with STRICT JSON only (no prose, no markdown fences):
{"label":"decision"|"non_decision","reasoning":"one short sentence"}`;

const EXTRACT_SYSTEM = `You extract DECISION statements from a markdown document.

A DECISION is a sentence/paragraph where the team has made a completed commitment
(choice confirmed, change agreed, item explicitly deferred or dropped, policy adopted).
Ignore questions, hypotheses, goals, metrics, roadmap ideas, and open items.

Return STRICT JSON only (no prose, no markdown fences):
{"decisions":[{"text":"<exact sentence or short paragraph>","reasoning":"<why this is a decision>","line":<1-based line number or null>}]}

Keep "text" verbatim from the document. Limit to the 10 most salient decisions.
If there are no decisions, return {"decisions":[]}.`;

function parseJson<T>(raw: string): T {
  let cleaned = raw.trim();
  // Strip accidental code fences
  const fence = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) cleaned = fence[1].trim();
  return JSON.parse(cleaned) as T;
}

export async function classifyDecision(
  apiKey: string,
  model: string,
  text: string
): Promise<DecisionResult> {
  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model,
    max_tokens: 200,
    system: CLASSIFY_SYSTEM,
    messages: [{ role: "user", content: text }],
  });
  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("No text in LLM response");
  try {
    const parsed = parseJson<DecisionResult>(block.text);
    if (parsed.label !== "decision" && parsed.label !== "non_decision") {
      throw new Error(`Invalid label: ${parsed.label}`);
    }
    return parsed;
  } catch (err) {
    throw new Error(
      `Decision classifier returned malformed output: ${block.text.slice(0, 200)} (${(err as Error).message})`
    );
  }
}

export async function extractDecisionsFromDoc(
  apiKey: string,
  model: string,
  docTitle: string,
  body: string
): Promise<ExtractedDecision[]> {
  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model,
    max_tokens: 2000,
    system: EXTRACT_SYSTEM,
    messages: [
      {
        role: "user",
        content: `# ${docTitle}\n\n${body}`,
      },
    ],
  });
  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("No text in LLM response");
  try {
    const parsed = parseJson<{ decisions: ExtractedDecision[] }>(block.text);
    if (!Array.isArray(parsed.decisions)) throw new Error("decisions is not an array");
    return parsed.decisions.slice(0, 20);
  } catch (err) {
    throw new Error(
      `Decision extractor returned malformed output: ${block.text.slice(0, 200)} (${(err as Error).message})`
    );
  }
}
