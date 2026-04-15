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
// Locked v2 (2026-04-14): baseline (v1) hit P=0.789 R=1.000 — 8 false positives
// on goals/metrics, roadmap items, "보류"/"후 확정", and questions with past-tense
// verbs. v2 adds disambiguation rules and passes the 60-pair eval at
// P=1.000 R=0.967 F1=0.983 (haiku-4-5). See eval/results/v2-haiku-20260414.json.
const CLASSIFY_SYSTEM = `You label a single text snippet from an internal doc as either "decision" or "non_decision".

A DECISION is a COMPLETED commitment the team has made and recorded:
- Explicit confirmation: "chose X", "CHOSEN", "ACCEPTED", "confirmed X", "결정함", "확정"
- Change/replacement: "moving from A to B", "A → B", "바꾸기로 했다"
- Cancellation/drop: "canceling X", "dropping Y", "취소한다", "드롭하기로"
- Explicit deferral with version tag for an item that WAS ON THE TABLE: "DEFERRED to v1.1", "v1.1로 연기" — meaning the team explicitly chose to push to a later version
- Agreement/policy: "agreed to X", "X is now the standard", "banning X", "금지한다"

A NON_DECISION is anything that is NOT a recorded commitment:
- Questions (any form, even with past-tense verbs): "왜 X 했지?", "should we ...?"
- Hypotheses, opinions, possibilities: "maybe", "might", "could", "~인 것 같다", "~일 수도 있다"
- Observations / status quo descriptions: "Teams currently use A and B", "기업 팀은 ... 분리해서 쓴다"
- Positioning / vision statements: "이들에게 필요한 것은 ..."
- Goals, metrics, success criteria, KPI targets, gates — even when stated with specific numbers ("10명이 주 3회 이상 사용", "P95 < 3초", "Phase 0 게이트: 10+ install"). A target you must hit is NOT a decision.
- Open questions explicitly marked as undecided: "보류", "TBD", "to be decided later", "X 후 확정", "유저 N명 후 결정"
- Roadmap brainstorm items (v1.x / v2 / v3) that DESCRIBE a future feature without team commitment to ship — typically appear under "TODOS", "Roadmap", "Deferred to TODOS.md", "v2-v3 roadmap". A version tag alone (e.g. "v1.2.") is NOT a commitment unless paired with explicit DEFERRED/ACCEPTED language.
- Conditional future triggers: "if X then Y", "X이면 pivot 고려"
- Candidate / option lists where no choice is made: "A 또는 B (후보)", "first candidate"
- Future-tense need claims: "X will be needed at v1.1+", "X 시점에 필요할 것이다"

DISAMBIGUATION RULES:
1. A version tag "v1.1" or "v2" is a DECISION only if the sentence explicitly says the team chose to defer/accept it (DEFERRED, ACCEPTED, "v1.1로 연기 결정", "v2로 미루기로"). A bare version tag on a roadmap item is a NON_DECISION.
2. Goals and metrics are NEVER decisions, even if quantified — they describe what the team must achieve, not what the team has committed to do.
3. Questions are ALWAYS non_decisions, regardless of verb tense. "우리가 X로 바꿨지?" is a question, not a confirmation.
4. Descriptions of how the world / industry / users currently behave are observations, not decisions.
5. "보류" or "후 확정" mark something as still open — NON_DECISION. Distinguish from "DEFERRED to v1.1" which is a commitment to not ship in MVP.

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
    temperature: 0,
    system: CLASSIFY_SYSTEM,
    messages: [{ role: "user", content: `<snippet>\n${text}\n</snippet>` }],
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
