import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "./config.js";
import { vaultRequired } from "./config.js";
import { Telemetry } from "./telemetry.js";
import { listDocs, loadDoc, searchDocs } from "./obsidian.js";
import { getIssue, listIssues } from "./linear.js";
import { classifyDecision, extractDecisionsFromDoc } from "./decisions.js";

const SERVER_NAME = "orgmem-probe";
const SERVER_VERSION = "0.1.0";

function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function textResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: toJson(value) }],
  };
}

function errorResult(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

export function buildServer(cfg: Config, telemetry: Telemetry): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  // ---------------- docs ----------------
  server.registerTool(
    "docs_search",
    {
      title: "Search Obsidian vault",
      description:
        "Keyword search across markdown files in the configured Obsidian vault (ORGMEM_VAULT). Returns top matches with snippets.",
      inputSchema: {
        query: z.string().min(1).describe("Keywords to search for (space-separated, 2+ chars each)"),
        limit: z.number().int().positive().max(50).optional(),
      },
    },
    async ({ query, limit }) => {
      try {
        const vault = vaultRequired(cfg);
        const hits = searchDocs(vault, query, limit ?? 20);
        telemetry.logEvent("tool", { tool: "docs_search", query, hits: hits.length });
        return textResult({ vault, query, hits });
      } catch (err) {
        return errorResult((err as Error).message);
      }
    }
  );

  server.registerTool(
    "docs_list",
    {
      title: "List vault docs",
      description: "List markdown files in the configured vault, most recently modified first.",
      inputSchema: {
        limit: z.number().int().positive().max(500).optional(),
      },
    },
    async ({ limit }) => {
      try {
        const vault = vaultRequired(cfg);
        const docs = listDocs(vault, limit ?? 50);
        telemetry.logEvent("tool", { tool: "docs_list", returned: docs.length });
        return textResult({ vault, count: docs.length, docs });
      } catch (err) {
        return errorResult((err as Error).message);
      }
    }
  );

  server.registerTool(
    "docs_read",
    {
      title: "Read a vault doc",
      description:
        "Read the full markdown body + frontmatter of a single doc. Path must be relative to the vault root; escaping outside the vault is rejected.",
      inputSchema: {
        path: z.string().min(1).describe("Path relative to the vault root (e.g. 'notes/payment-spec.md')"),
      },
    },
    async ({ path }) => {
      try {
        const vault = vaultRequired(cfg);
        const doc = loadDoc(vault, path);
        telemetry.logEvent("tool", { tool: "docs_read", path });
        return textResult(doc);
      } catch (err) {
        return errorResult((err as Error).message);
      }
    }
  );

  // ---------------- tasks ----------------
  server.registerTool(
    "tasks_list",
    {
      title: "List Linear issues",
      description:
        "List Linear issues using the LINEAR_API_KEY env var. Supports optional keyword filter, team key, and 'assigned to me' filter.",
      inputSchema: {
        query: z.string().optional(),
        teamKey: z.string().optional().describe("Linear team key, e.g. 'PLAT'"),
        assignedToMe: z.boolean().optional(),
        limit: z.number().int().positive().max(100).optional(),
      },
    },
    async ({ query, teamKey, assignedToMe, limit }) => {
      try {
        if (!cfg.linearApiKey) {
          return errorResult("LINEAR_API_KEY is not set. Export a personal API key (Linear → Settings → API) to use tasks_list.");
        }
        const issues = await listIssues(cfg.linearApiKey, {
          query,
          teamKey,
          assignedToMe,
          limit: limit ?? 25,
        });
        telemetry.logEvent("tool", { tool: "tasks_list", returned: issues.length, query, teamKey });
        return textResult({ count: issues.length, issues });
      } catch (err) {
        return errorResult((err as Error).message);
      }
    }
  );

  server.registerTool(
    "tasks_get",
    {
      title: "Get a Linear issue",
      description: "Fetch a single Linear issue by identifier (e.g. 'PLAT-142') or internal UUID.",
      inputSchema: {
        id: z.string().min(1),
      },
    },
    async ({ id }) => {
      try {
        if (!cfg.linearApiKey) {
          return errorResult("LINEAR_API_KEY is not set.");
        }
        const issue = await getIssue(cfg.linearApiKey, id);
        telemetry.logEvent("tool", { tool: "tasks_get", id, found: Boolean(issue) });
        if (!issue) return errorResult(`Issue not found: ${id}`);
        return textResult(issue);
      } catch (err) {
        return errorResult((err as Error).message);
      }
    }
  );

  // ---------------- decisions ----------------
  server.registerTool(
    "decisions_extract",
    {
      title: "Extract decisions from a doc",
      description:
        "On-the-fly: read a vault doc and use an LLM to extract committed decisions (choices, deferrals, agreements). Requires ANTHROPIC_API_KEY. Output schema matches the Phase 1 eval harness.",
      inputSchema: {
        path: z.string().min(1).describe("Path relative to the vault root"),
      },
    },
    async ({ path }) => {
      try {
        const vault = vaultRequired(cfg);
        if (!cfg.anthropicApiKey) {
          return errorResult("ANTHROPIC_API_KEY is not set. Required for decisions_extract.");
        }
        const doc = loadDoc(vault, path);
        const decisions = await extractDecisionsFromDoc(
          cfg.anthropicApiKey,
          cfg.decisionsModel,
          doc.title,
          doc.body
        );
        telemetry.logEvent("tool", {
          tool: "decisions_extract",
          path,
          extracted: decisions.length,
          model: cfg.decisionsModel,
        });
        return textResult({ path: doc.path, title: doc.title, model: cfg.decisionsModel, decisions });
      } catch (err) {
        return errorResult((err as Error).message);
      }
    }
  );

  server.registerTool(
    "decisions_classify",
    {
      title: "Classify a snippet as decision vs non_decision",
      description:
        "Binary classifier matching the eval dataset schema (decision | non_decision). Useful for the Phase 1 precision/recall gate.",
      inputSchema: {
        text: z.string().min(1),
      },
    },
    async ({ text }) => {
      try {
        if (!cfg.anthropicApiKey) {
          return errorResult("ANTHROPIC_API_KEY is not set.");
        }
        const result = await classifyDecision(cfg.anthropicApiKey, cfg.decisionsModel, text);
        telemetry.logEvent("tool", {
          tool: "decisions_classify",
          label: result.label,
          model: cfg.decisionsModel,
        });
        return textResult({ model: cfg.decisionsModel, ...result });
      } catch (err) {
        return errorResult((err as Error).message);
      }
    }
  );

  return server;
}
