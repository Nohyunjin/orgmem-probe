import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import matter from "gray-matter";

export interface DocSummary {
  path: string;
  title: string;
  frontmatter: Record<string, unknown>;
  excerpt: string;
  size: number;
  modifiedAt: string;
}

export interface DocFull extends DocSummary {
  body: string;
}

const SKIP_DIRS = new Set([".git", ".obsidian", "node_modules", ".trash", ".DS_Store"]);

function walkMarkdown(root: string): string[] {
  const out: string[] = [];
  const stack: string[] = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (SKIP_DIRS.has(name)) continue;
      const full = join(dir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        stack.push(full);
      } else if (st.isFile() && (name.endsWith(".md") || name.endsWith(".mdx"))) {
        out.push(full);
      }
    }
  }
  return out;
}

export function assertInsideVault(vault: string, target: string): string {
  const resolvedVault = resolve(vault);
  const resolvedTarget = resolve(vault, target);
  const rel = relative(resolvedVault, resolvedTarget);
  if (rel.startsWith("..") || rel.split(sep).includes("..")) {
    throw new Error(`Path escapes vault: ${target}`);
  }
  return resolvedTarget;
}

function excerpt(body: string, max = 240): string {
  const clean = body.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : clean.slice(0, max) + "…";
}

function titleFrom(frontmatter: Record<string, unknown>, body: string, fallback: string): string {
  const fm = frontmatter.title;
  if (typeof fm === "string" && fm.trim()) return fm.trim();
  const h1 = body.match(/^\s*#\s+(.+)$/m);
  if (h1) return h1[1].trim();
  return fallback;
}

export function loadDoc(vault: string, relPath: string): DocFull {
  const abs = assertInsideVault(vault, relPath);
  const raw = readFileSync(abs, "utf8");
  const parsed = matter(raw);
  const st = statSync(abs);
  const rel = relative(vault, abs);
  const fm = (parsed.data ?? {}) as Record<string, unknown>;
  return {
    path: rel,
    title: titleFrom(fm, parsed.content, rel),
    frontmatter: fm,
    excerpt: excerpt(parsed.content),
    size: st.size,
    modifiedAt: st.mtime.toISOString(),
    body: parsed.content,
  };
}

export function listDocs(vault: string, limit = 500): DocSummary[] {
  const files = walkMarkdown(vault).slice(0, limit);
  const out: DocSummary[] = [];
  for (const abs of files) {
    try {
      const raw = readFileSync(abs, "utf8");
      const parsed = matter(raw);
      const st = statSync(abs);
      const rel = relative(vault, abs);
      const fm = (parsed.data ?? {}) as Record<string, unknown>;
      out.push({
        path: rel,
        title: titleFrom(fm, parsed.content, rel),
        frontmatter: fm,
        excerpt: excerpt(parsed.content),
        size: st.size,
        modifiedAt: st.mtime.toISOString(),
      });
    } catch {
      // skip unreadable
    }
  }
  return out.sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : -1));
}

export interface SearchHit {
  path: string;
  title: string;
  score: number;
  matches: string[];
}

export function searchDocs(vault: string, query: string, limit = 20): SearchHit[] {
  if (!query.trim()) return [];
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  if (!terms.length) return [];

  const files = walkMarkdown(vault);
  const hits: SearchHit[] = [];
  for (const abs of files) {
    let text: string;
    try {
      text = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const parsed = matter(text);
    const body = parsed.content;
    const lower = (parsed.content + "\n" + JSON.stringify(parsed.data)).toLowerCase();

    let score = 0;
    const matches: string[] = [];
    for (const t of terms) {
      const count = countOccurrences(lower, t);
      if (count === 0) {
        score = 0;
        break;
      }
      score += count;
      const ctx = contextLine(body, t);
      if (ctx) matches.push(ctx);
    }
    if (score > 0) {
      const rel = relative(vault, abs);
      const fm = (parsed.data ?? {}) as Record<string, unknown>;
      hits.push({
        path: rel,
        title: titleFrom(fm, body, rel),
        score,
        matches: matches.slice(0, 3),
      });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}

function contextLine(body: string, term: string): string | null {
  const lower = body.toLowerCase();
  const idx = lower.indexOf(term);
  if (idx === -1) return null;
  const start = Math.max(0, idx - 60);
  const end = Math.min(body.length, idx + term.length + 60);
  return (start > 0 ? "…" : "") + body.slice(start, end).replace(/\s+/g, " ").trim() + (end < body.length ? "…" : "");
}
