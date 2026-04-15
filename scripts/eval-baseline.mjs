#!/usr/bin/env node
// Baseline eval for Decision Extractor.
// Loads the 60-pair dataset, runs each through classifyDecision, computes
// confusion matrix + precision/recall/f1 (overall + per difficulty),
// and writes a JSON result file.
//
// Usage:
//   ANTHROPIC_API_KEY=sk-... node scripts/eval-baseline.mjs \
//     [--model claude-haiku-4-5-20251001] \
//     [--dataset ~/.gstack/projects/doc-mvp/eval/decision-extractor-v1.jsonl] \
//     [--out ~/.gstack/projects/doc-mvp/eval/results/baseline-20260414.json] \
//     [--concurrency 5] \
//     [--label v1-haiku]

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { homedir } from "node:os";
import Anthropic from "@anthropic-ai/sdk";
import { classifyDecision as classifyDefault } from "../dist/decisions.js";

function expand(p) {
  return p.startsWith("~") ? resolve(homedir(), p.slice(2)) : resolve(p);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("ERROR: ANTHROPIC_API_KEY not set in env.");
  process.exit(2);
}

const model = args.model || "claude-haiku-4-5-20251001";
const datasetPath = expand(
  args.dataset || "~/.gstack/projects/doc-mvp/eval/decision-extractor-v1.jsonl",
);
const outPath = expand(
  args.out || "~/.gstack/projects/doc-mvp/eval/results/baseline-20260414.json",
);
const concurrency = Math.max(1, parseInt(args.concurrency || "5", 10));
const runLabel = args.label || "baseline";
const promptFile = args["prompt-file"] ? expand(args["prompt-file"]) : null;
const customSystem = promptFile ? readFileSync(promptFile, "utf8") : null;

function parseJson(raw) {
  let cleaned = raw.trim();
  const fence = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) cleaned = fence[1].trim();
  return JSON.parse(cleaned);
}

async function classifyWithCustom(text) {
  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model,
    max_tokens: 200,
    system: customSystem,
    messages: [{ role: "user", content: text }],
  });
  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("No text in LLM response");
  const parsed = parseJson(block.text);
  if (parsed.label !== "decision" && parsed.label !== "non_decision") {
    throw new Error(`Invalid label: ${parsed.label}`);
  }
  return parsed;
}

const classifyDecision = customSystem
  ? (_k, _m, t) => classifyWithCustom(t)
  : classifyDefault;

const raw = readFileSync(datasetPath, "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean);
const dataset = raw.map((l) => JSON.parse(l));

console.error(
  `[${new Date().toISOString()}] running ${runLabel} | model=${model} | n=${dataset.length} | concurrency=${concurrency}`,
);

async function classifyWithRetry(text, maxAttempts = 5) {
  let lastErr;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await classifyDecision(apiKey, model, text);
    } catch (err) {
      lastErr = err;
      const msg = err.message || "";
      if (msg.includes("rate_limit") || msg.includes("429") || msg.includes("overloaded")) {
        const backoff = Math.min(60000, 2000 * 2 ** i + Math.floor(Math.random() * 500));
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function classifyOne(entry, idx) {
  const t0 = Date.now();
  try {
    const out = await classifyWithRetry(entry.text);
    const ms = Date.now() - t0;
    return {
      id: entry.id,
      text: entry.text,
      gold: entry.label,
      difficulty: entry.difficulty,
      source: entry.source,
      pred: out.label,
      pred_reasoning: out.reasoning,
      gold_reasoning: entry.reasoning,
      latency_ms: ms,
      error: null,
    };
  } catch (err) {
    const ms = Date.now() - t0;
    return {
      id: entry.id,
      text: entry.text,
      gold: entry.label,
      difficulty: entry.difficulty,
      source: entry.source,
      pred: null,
      pred_reasoning: null,
      gold_reasoning: entry.reasoning,
      latency_ms: ms,
      error: err.message,
    };
  }
}

// Bounded concurrency
async function runWithConcurrency(items, n, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: n }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
      if ((i + 1) % 10 === 0 || i + 1 === items.length) {
        console.error(`  progress: ${i + 1}/${items.length}`);
      }
    }
  });
  await Promise.all(workers);
  return results;
}

function metrics(items) {
  let tp = 0,
    fp = 0,
    fn = 0,
    tn = 0,
    errs = 0;
  for (const r of items) {
    if (r.error || r.pred === null) {
      errs++;
      continue;
    }
    const goldPos = r.gold === "decision";
    const predPos = r.pred === "decision";
    if (goldPos && predPos) tp++;
    else if (!goldPos && predPos) fp++;
    else if (goldPos && !predPos) fn++;
    else tn++;
  }
  const precision = tp + fp === 0 ? null : tp / (tp + fp);
  const recall = tp + fn === 0 ? null : tp / (tp + fn);
  const f1 =
    precision == null || recall == null || precision + recall === 0
      ? null
      : (2 * precision * recall) / (precision + recall);
  const accuracy = items.length === 0 ? null : (tp + tn) / (items.length - errs || 1);
  return { tp, fp, fn, tn, errors: errs, precision, recall, f1, accuracy, n: items.length };
}

const t0 = Date.now();
const results = await runWithConcurrency(dataset, concurrency, classifyOne);
const totalMs = Date.now() - t0;

const overall = metrics(results);
const byDifficulty = {};
for (const d of ["easy", "medium", "hard"]) {
  byDifficulty[d] = metrics(results.filter((r) => r.difficulty === d));
}
const bySource = {};
for (const s of new Set(results.map((r) => (r.source === "synthetic" ? "synthetic" : "real")))) {
  bySource[s] = metrics(
    results.filter((r) => (r.source === "synthetic" ? "synthetic" : "real") === s),
  );
}

const failures = results.filter(
  (r) => !r.error && r.pred !== null && r.pred !== r.gold,
);
const errors = results.filter((r) => r.error);

const report = {
  run_label: runLabel,
  model,
  dataset: datasetPath,
  n: dataset.length,
  concurrency,
  total_ms: totalMs,
  generated_at: new Date().toISOString(),
  targets: { precision: 0.9, recall: 0.7 },
  overall,
  by_difficulty: byDifficulty,
  by_source: bySource,
  pass_overall: overall.precision != null && overall.recall != null
    && overall.precision >= 0.9 && overall.recall >= 0.7,
  failures: failures.map((r) => ({
    id: r.id,
    text: r.text,
    gold: r.gold,
    pred: r.pred,
    difficulty: r.difficulty,
    pred_reasoning: r.pred_reasoning,
    gold_reasoning: r.gold_reasoning,
  })),
  errors: errors.map((r) => ({ id: r.id, error: r.error })),
  results,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(report, null, 2));

console.error("");
console.error(`=== ${runLabel} | ${model} ===`);
console.error(
  `overall: P=${(overall.precision ?? NaN).toFixed(3)} R=${(overall.recall ?? NaN).toFixed(3)} F1=${(overall.f1 ?? NaN).toFixed(3)} acc=${(overall.accuracy ?? NaN).toFixed(3)} (TP=${overall.tp} FP=${overall.fp} FN=${overall.fn} TN=${overall.tn}, errors=${overall.errors})`,
);
for (const d of ["easy", "medium", "hard"]) {
  const m = byDifficulty[d];
  console.error(
    `  ${d}: P=${(m.precision ?? NaN).toFixed(3)} R=${(m.recall ?? NaN).toFixed(3)} F1=${(m.f1 ?? NaN).toFixed(3)} acc=${(m.accuracy ?? NaN).toFixed(3)} (n=${m.n})`,
  );
}
console.error(`failures: ${failures.length}, errors: ${errors.length}`);
console.error(`pass=${report.pass_overall} (target P>=0.90, R>=0.70)`);
console.error(`saved → ${outPath}`);
