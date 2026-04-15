#!/usr/bin/env node
// Document-level extraction eval for EXTRACT_SYSTEM (extractDecisionsFromDoc).
// Builds gold sets per source doc from the labeled jsonl (decision-only entries),
// runs the extractor on each full doc, fuzzy-matches extracted items against gold,
// computes recall (primary metric) and writes a JSON report.
//
// Why recall is primary:
//   The dataset only labels a curated subset of decisions per doc (10 per doc),
//   so unmatched-extracted items might still be valid decisions we didn't label.
//   Treating those as FPs would underestimate precision. Recall on labeled gold
//   is the trustworthy metric here. A v1.1 dataset with full-doc labeling is
//   tracked in eval/RESOLUTION-BACKLOG.md.
//
// Usage:
//   ANTHROPIC_API_KEY=sk-... node scripts/eval-extract.mjs \
//     [--model claude-haiku-4-5-20251001] \
//     [--dataset ~/.gstack/projects/doc-mvp/eval/decision-extractor-v1.jsonl] \
//     [--docs-root ~/.gstack/projects/doc-mvp] \
//     [--out ~/.gstack/projects/doc-mvp/eval/results/extract-20260414.json] \
//     [--label extract-baseline]

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { homedir } from "node:os";
import { extractDecisionsFromDoc } from "../dist/decisions.js";

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
const docsRoot = expand(args["docs-root"] || "~/.gstack/projects/doc-mvp");
const outPath = expand(
  args.out || "~/.gstack/projects/doc-mvp/eval/results/extract-20260414.json",
);
const runLabel = args.label || "extract-baseline";

// Load dataset, group decision entries by source
const entries = readFileSync(datasetPath, "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean)
  .map((l) => JSON.parse(l));

const goldBySource = {};
for (const e of entries) {
  if (e.label !== "decision") continue;
  if (e.source === "synthetic") continue;
  if (!goldBySource[e.source]) goldBySource[e.source] = [];
  goldBySource[e.source].push(e);
}

console.error(
  `[${new Date().toISOString()}] running ${runLabel} | model=${model} | docs=${Object.keys(goldBySource).length}`,
);

// Fuzzy matching: normalize and check substring + token Jaccard
function normalize(s) {
  return s
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, " ")
    .trim();
}

function tokens(s) {
  return new Set(normalize(s).split(/\s+/).filter((t) => t.length >= 2));
}

function bigrams(s) {
  const n = normalize(s).replace(/\s+/g, "");
  const set = new Set();
  for (let i = 0; i + 2 <= n.length; i++) set.add(n.slice(i, i + 2));
  return set;
}

function jaccard(a, b) {
  const inter = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return union.size === 0 ? 0 : inter.size / union.size;
}

// Asymmetric containment: how much of A is covered by B
function containment(a, b) {
  if (a.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / a.size;
}

function matches(goldText, extractedText) {
  const g = normalize(goldText);
  const e = normalize(extractedText);
  // Direct substring of a meaningful prefix
  if (g.length >= 15 && e.includes(g.slice(0, Math.min(40, g.length)))) return true;
  if (e.length >= 15 && g.includes(e.slice(0, Math.min(40, e.length)))) return true;
  // Sliding chunk substring
  for (let i = 0; i + 20 <= g.length; i += 10) {
    if (e.includes(g.slice(i, i + 20))) return true;
  }
  // Token Jaccard (works for English-heavy text)
  if (jaccard(tokens(goldText), tokens(extractedText)) >= 0.4) return true;
  // Character bigram containment — handles Korean morphology / paraphrase
  // (e.g. "프로브 선행" vs "프로브를 먼저 진행")
  const gb = bigrams(goldText);
  const eb = bigrams(extractedText);
  // Either the gold's bigrams are mostly in extracted, or vice versa
  if (containment(gb, eb) >= 0.55 || containment(eb, gb) >= 0.55) return true;
  return false;
}

const perDoc = [];
for (const [source, gold] of Object.entries(goldBySource)) {
  const docPath = resolve(docsRoot, source);
  let body;
  try {
    body = readFileSync(docPath, "utf8");
  } catch (err) {
    console.error(`  SKIP ${source}: ${err.message}`);
    continue;
  }
  const title = basename(source, ".md");
  console.error(`  extracting from ${source} (gold=${gold.length}) ...`);
  const t0 = Date.now();
  let extracted = [];
  let error = null;
  try {
    extracted = await extractDecisionsFromDoc(apiKey, model, title, body);
  } catch (err) {
    error = err.message;
    console.error(`    ERROR: ${err.message}`);
  }
  const ms = Date.now() - t0;

  // Match each gold to first matching extracted (1:1)
  const usedExtracted = new Set();
  const matched = [];
  for (const g of gold) {
    let hit = null;
    for (let i = 0; i < extracted.length; i++) {
      if (usedExtracted.has(i)) continue;
      if (matches(g.text, extracted[i].text)) {
        hit = { extracted_index: i, extracted_text: extracted[i].text };
        usedExtracted.add(i);
        break;
      }
    }
    matched.push({ gold_id: g.id, gold_text: g.text, hit });
  }

  const hits = matched.filter((m) => m.hit !== null).length;
  const recall = gold.length === 0 ? null : hits / gold.length;
  const unmatchedExtracted = extracted
    .map((e, i) => ({ index: i, text: e.text, reasoning: e.reasoning, matched: usedExtracted.has(i) }))
    .filter((e) => !e.matched);

  perDoc.push({
    source,
    doc_path: docPath,
    gold_count: gold.length,
    extracted_count: extracted.length,
    hits,
    recall,
    latency_ms: ms,
    error,
    matched,
    unmatched_extracted: unmatchedExtracted,
  });
}

// Aggregate
const totalGold = perDoc.reduce((s, d) => s + d.gold_count, 0);
const totalHits = perDoc.reduce((s, d) => s + d.hits, 0);
const totalExtracted = perDoc.reduce((s, d) => s + d.extracted_count, 0);
const overallRecall = totalGold === 0 ? null : totalHits / totalGold;
// "Coverage": of extracted items, how many matched ANY gold (not a true precision —
// see header comment — but a useful directional signal)
const totalMatched = perDoc.reduce(
  (s, d) => s + d.matched.filter((m) => m.hit !== null).length,
  0,
);
const coverage = totalExtracted === 0 ? null : totalMatched / totalExtracted;

const report = {
  run_label: runLabel,
  model,
  dataset: datasetPath,
  docs_root: docsRoot,
  generated_at: new Date().toISOString(),
  targets: { recall: 0.7 },
  overall: {
    docs: perDoc.length,
    total_gold: totalGold,
    total_extracted: totalExtracted,
    total_hits: totalHits,
    recall: overallRecall,
    matched_extraction_coverage: coverage,
  },
  pass_overall: overallRecall != null && overallRecall >= 0.7,
  per_doc: perDoc,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(report, null, 2));

console.error("");
console.error(`=== ${runLabel} | ${model} ===`);
console.error(
  `overall: recall=${(overallRecall ?? NaN).toFixed(3)} (hits ${totalHits}/${totalGold}), extracted=${totalExtracted}, matched-coverage=${(coverage ?? NaN).toFixed(3)}`,
);
for (const d of perDoc) {
  console.error(
    `  ${d.source}: recall=${(d.recall ?? NaN).toFixed(3)} (${d.hits}/${d.gold_count}), extracted=${d.extracted_count}${d.error ? ` ERROR=${d.error.slice(0, 80)}` : ""}`,
  );
}
console.error(`pass=${report.pass_overall} (target recall>=0.70)`);
console.error(`saved → ${outPath}`);
