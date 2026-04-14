import { homedir } from "node:os";
import { resolve, isAbsolute } from "node:path";
import { existsSync, statSync } from "node:fs";

export interface Config {
  vaultPath: string | null;
  linearApiKey: string | null;
  anthropicApiKey: string | null;
  decisionsModel: string;
  telemetryDir: string;
  telemetryEnabled: boolean;
}

function expandHome(p: string): string {
  if (p.startsWith("~/")) return resolve(homedir(), p.slice(2));
  if (p === "~") return homedir();
  return p;
}

export function loadConfig(): Config {
  const rawVault = process.env.ORGMEM_VAULT ?? null;
  let vaultPath: string | null = null;
  if (rawVault) {
    const expanded = expandHome(rawVault);
    vaultPath = isAbsolute(expanded) ? expanded : resolve(process.cwd(), expanded);
    if (!existsSync(vaultPath) || !statSync(vaultPath).isDirectory()) {
      // Keep it set so tool can return a structured error; don't crash startup
      // (the server must still respond to list_tools for discoverability).
    }
  }

  const telemetryDir = resolve(homedir(), ".orgmem-probe");
  const telemetryEnabled = process.env.ORGMEM_TELEMETRY !== "off";

  return {
    vaultPath,
    linearApiKey: process.env.LINEAR_API_KEY ?? null,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? null,
    decisionsModel: process.env.ORGMEM_DECISIONS_MODEL ?? "claude-haiku-4-5-20251001",
    telemetryDir,
    telemetryEnabled,
  };
}

export function vaultRequired(cfg: Config): string {
  if (!cfg.vaultPath) {
    throw new Error(
      "ORGMEM_VAULT env var is not set. Set it to the absolute path of your Obsidian vault (or any directory of markdown files)."
    );
  }
  if (!existsSync(cfg.vaultPath) || !statSync(cfg.vaultPath).isDirectory()) {
    throw new Error(`ORGMEM_VAULT path does not exist or is not a directory: ${cfg.vaultPath}`);
  }
  return cfg.vaultPath;
}
