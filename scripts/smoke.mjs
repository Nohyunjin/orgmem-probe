#!/usr/bin/env node
// Minimal MCP smoke test: spawn the server, run initialize + tools/list + tools/call,
// print results and exit nonzero on failure.
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";

const root = resolve(new URL(".", import.meta.url).pathname, "..");

// Build a tiny vault fixture
const vault = mkdtempSync(resolve(tmpdir(), "orgmem-vault-"));
mkdirSync(resolve(vault, "notes"), { recursive: true });
writeFileSync(
  resolve(vault, "notes", "payment-spec.md"),
  `---
id: doc-payment-spec-v2
type: Document
title: "결제 스펙 v2"
---
# 결제 스펙 v2

우리는 Stripe에서 Toss로 이전하기로 결정했다.
이유: T+1 정산, 낮은 레이턴시.
`,
);
writeFileSync(
  resolve(vault, "notes", "random.md"),
  `---
title: Random note
---
# Random note

Totally unrelated content about cats and yarn.
`,
);

const env = {
  ...process.env,
  ORGMEM_VAULT: vault,
  ORGMEM_TELEMETRY: "off",
};

const child = spawn("node", ["dist/index.js", "serve"], {
  cwd: root,
  env,
  stdio: ["pipe", "pipe", "pipe"],
});

let stderrBuf = "";
child.stderr.on("data", (d) => {
  stderrBuf += d.toString();
});

let buf = "";
const pending = new Map();
let nextId = 1;

child.stdout.on("data", (d) => {
  buf += d.toString();
  let idx;
  while ((idx = buf.indexOf("\n")) !== -1) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.id != null && pending.has(msg.id)) {
      const { resolve: r } = pending.get(msg.id);
      pending.delete(msg.id);
      r(msg);
    }
  }
});

function send(method, params) {
  return new Promise((resolve_, reject) => {
    const id = nextId++;
    pending.set(id, { resolve: resolve_, reject });
    const msg = { jsonrpc: "2.0", id, method, params };
    child.stdin.write(JSON.stringify(msg) + "\n");
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`timeout waiting for ${method}`));
      }
    }, 10000);
  });
}

function fail(msg) {
  console.error("SMOKE FAIL:", msg);
  if (stderrBuf) console.error("server stderr:\n" + stderrBuf);
  child.kill();
  process.exit(1);
}

try {
  const init = await send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "smoke", version: "0.0.1" },
  });
  if (!init.result) fail("initialize returned no result: " + JSON.stringify(init));
  console.log("initialize OK:", init.result.serverInfo);

  child.stdin.write(
    JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n",
  );

  const list = await send("tools/list", {});
  if (!list.result?.tools?.length) fail("tools/list empty");
  console.log(
    "tools/list OK:",
    list.result.tools.map((t) => t.name).join(", "),
  );

  const search = await send("tools/call", {
    name: "docs_search",
    arguments: { query: "Toss 결제" },
  });
  if (search.error) fail("docs_search error: " + JSON.stringify(search.error));
  const searchText = search.result?.content?.[0]?.text ?? "";
  console.log("docs_search OK. snippet:\n" + searchText.slice(0, 300));
  if (!searchText.includes("payment-spec")) fail("search did not find payment-spec.md");

  const list2 = await send("tools/call", {
    name: "docs_list",
    arguments: { limit: 10 },
  });
  const listText = list2.result?.content?.[0]?.text ?? "";
  console.log("docs_list OK. count preview:", listText.slice(0, 120));

  const read = await send("tools/call", {
    name: "docs_read",
    arguments: { path: "notes/payment-spec.md" },
  });
  const readText = read.result?.content?.[0]?.text ?? "";
  if (!readText.includes("Toss")) fail("docs_read did not return body");
  console.log("docs_read OK.");

  const escape = await send("tools/call", {
    name: "docs_read",
    arguments: { path: "../../../etc/passwd" },
  });
  if (!escape.result?.isError) fail("path escape was NOT rejected!");
  console.log("path-escape rejected OK:", escape.result.content[0].text);

  console.log("ALL SMOKE CHECKS PASSED");
  child.kill();
  process.exit(0);
} catch (err) {
  fail(err.stack ?? String(err));
}
