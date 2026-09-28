// One-shot static export: renders every /api/* route to a JSON file, for GitHub Pages (which
// can only serve static files, no live backend). Runnable standalone (`bun run export`) or
// called from cron.ts after a fresh collection.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DEFAULT_OUT_DIR = join(import.meta.dir, "..", "..", "frontend", "dist", "api");

// file -> API path. Must match frontend/src/api.ts's VITE_STATIC mapping.
const ROUTES: Record<string, string> = {
  "health.json": "/api/health",
  "overview.json": "/api/overview",
  "htf-1d.json": "/api/htf?interval=1d",
  "htf-1w.json": "/api/htf?interval=1w",
  "ltf-4h.json": "/api/ltf?interval=4h",
  "ltf-1h.json": "/api/ltf?interval=1h",
  "signals-HTF.json": "/api/signals?frame=HTF&limit=200",
  "signals-LTF.json": "/api/signals?frame=LTF&limit=200",
};

// Returns a list of error strings (one per failed route), empty when everything exported.
// NO_SCHEDULER must be set before server.ts's module-level scheduler guard runs, hence the
// dynamic import here rather than a static one (static imports are hoisted before this
// function's own body runs).
export async function exportStatic(outDir: string = DEFAULT_OUT_DIR): Promise<string[]> {
  process.env.NO_SCHEDULER = "1";
  const { app } = await import("./server");

  await mkdir(outDir, { recursive: true });
  const errors: string[] = [];
  for (const [file, path] of Object.entries(ROUTES)) {
    const res = await app.request(path);
    if (!res.ok) {
      errors.push(`${path} -> ${res.status}`);
      continue;
    }
    await writeFile(join(outDir, file), await res.text(), "utf8");
  }
  return errors;
}

if (import.meta.main) {
  const outDir = process.argv[2] ?? DEFAULT_OUT_DIR; // optional override, mainly for tests
  const errors = await exportStatic(outDir);
  if (errors.length) {
    console.error(`export: failed routes: ${errors.join("; ")}`);
    process.exit(1);
  }
  console.log(`export: wrote ${Object.keys(ROUTES).length} files to ${outDir}`);
}
