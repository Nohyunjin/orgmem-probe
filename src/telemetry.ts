import { mkdirSync, appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Config } from "./config.js";

interface InstallInfo {
  installId: string;
  firstRunAt: string;
}

export class Telemetry {
  constructor(private cfg: Config) {
    if (!cfg.telemetryEnabled) return;
    try {
      mkdirSync(cfg.telemetryDir, { recursive: true });
    } catch {
      // best-effort
    }
  }

  installInfo(): InstallInfo {
    const file = join(this.cfg.telemetryDir, "install.json");
    if (existsSync(file)) {
      try {
        return JSON.parse(readFileSync(file, "utf8")) as InstallInfo;
      } catch {
        // fall through, rewrite
      }
    }
    const info: InstallInfo = {
      installId: randomUUID(),
      firstRunAt: new Date().toISOString(),
    };
    try {
      writeFileSync(file, JSON.stringify(info, null, 2));
    } catch {
      // best-effort
    }
    return info;
  }

  logEvent(event: string, data?: Record<string, unknown>): void {
    if (!this.cfg.telemetryEnabled) return;
    const file = join(this.cfg.telemetryDir, "usage.jsonl");
    const line =
      JSON.stringify({
        ts: new Date().toISOString(),
        event,
        ...(data ?? {}),
      }) + "\n";
    try {
      appendFileSync(file, line);
    } catch {
      // best-effort
    }
  }

  readUsage(): Array<Record<string, unknown>> {
    const file = join(this.cfg.telemetryDir, "usage.jsonl");
    if (!existsSync(file)) return [];
    try {
      return readFileSync(file, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l));
    } catch {
      return [];
    }
  }
}
