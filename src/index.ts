#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { Telemetry } from "./telemetry.js";
import { buildServer } from "./server.js";

async function runServe(): Promise<void> {
  const cfg = loadConfig();
  const telemetry = new Telemetry(cfg);
  const info = telemetry.installInfo();
  telemetry.logEvent("server_start", {
    installId: info.installId,
    vaultSet: Boolean(cfg.vaultPath),
    linearSet: Boolean(cfg.linearApiKey),
    anthropicSet: Boolean(cfg.anthropicApiKey),
  });

  const server = buildServer(cfg, telemetry);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // McpServer keeps running over stdio; process exits when the transport closes.
}

function runStats(): void {
  const cfg = loadConfig();
  const telemetry = new Telemetry(cfg);
  const info = telemetry.installInfo();
  const usage = telemetry.readUsage();
  const toolCounts: Record<string, number> = {};
  const days = new Set<string>();
  for (const row of usage) {
    const tool = (row["tool"] as string | undefined) ?? (row["event"] as string);
    toolCounts[tool] = (toolCounts[tool] ?? 0) + 1;
    const ts = row["ts"] as string | undefined;
    if (ts) days.add(ts.slice(0, 10));
  }
  const report = {
    installId: info.installId,
    firstRunAt: info.firstRunAt,
    telemetryDir: cfg.telemetryDir,
    totalEvents: usage.length,
    distinctDaysUsed: days.size,
    counts: toolCounts,
  };
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}

function runHelp(): void {
  process.stdout.write(
    `orgmem-probe — Phase 0 read-only MCP wrapper (docs + tasks + decisions)

Usage:
  orgmem-probe serve       Start the MCP server over stdio (default)
  orgmem-probe stats       Print local install + usage stats as JSON
  orgmem-probe --help      Show this help
  orgmem-probe --version   Show version

Env vars:
  ORGMEM_VAULT             Absolute path to your Obsidian vault (required for docs_*)
  LINEAR_API_KEY           Linear personal API key (required for tasks_*)
  ANTHROPIC_API_KEY        Anthropic key (required for decisions_*)
  ORGMEM_DECISIONS_MODEL   Override Anthropic model id (default: claude-haiku-4-5-20251001)
  ORGMEM_TELEMETRY=off     Disable local usage logging
`
  );
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!arg || arg === "serve") {
    await runServe();
    return;
  }
  if (arg === "stats") {
    runStats();
    return;
  }
  if (arg === "--version" || arg === "-v") {
    process.stdout.write("orgmem-probe 0.1.0\n");
    return;
  }
  if (arg === "--help" || arg === "-h" || arg === "help") {
    runHelp();
    return;
  }
  process.stderr.write(`Unknown command: ${arg}\nRun 'orgmem-probe --help' for usage.\n`);
  process.exit(2);
}

main().catch((err) => {
  process.stderr.write(`fatal: ${(err as Error).stack ?? String(err)}\n`);
  process.exit(1);
});
