import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refreshAssets } from "../src/refresh";
import { loadCandles } from "../src/store";
import { ALTS } from "../src/assets";
import { __resetWeightLogForTests } from "../src/sources/hyperliquid";

describe("refreshAssets", () => {
  test("one alt's candle fetch failing still refreshes the other alts, and the failure appears in the returned errors", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hl-cycles-refresh-test-"));
    const prevDataDir = process.env.DATA_DIR;
    process.env.DATA_DIR = dir;
    __resetWeightLogForTests(); // isolate this file's ~34 real-shaped calls from any other test file's budget

    const failingCoin = ALTS[0]!;
    const okCoin = ALTS[1]!;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if (body.type === "candleSnapshot" && body.req.coin === failingCoin && body.req.interval === "15m") {
        throw new Error("network down");
      }
      if (body.type === "metaAndAssetCtxs") {
        // Full universe/assetCtx for every alt so the shared OI task succeeds cleanly -- this
        // test isolates a single alt's CANDLE fetch failing, not an OI failure for everyone.
        const universe = ALTS.map((coin) => ({ szDecimals: 0, name: coin, maxLeverage: 20, marginTableId: 1 }));
        const assetCtxs = ALTS.map(() => ({
          funding: "0", openInterest: "0", prevDayPx: "0", dayNtlVlm: "0", premium: "0",
          oraclePx: "0", markPx: "0", midPx: "0", impactPxs: null, dayBaseVlm: "0",
        }));
        return new Response(JSON.stringify([{ universe }, assetCtxs]), { status: 200 });
      }
      // candleSnapshot (other coins/intervals) and fundingHistory both accept an empty array page.
      return new Response(JSON.stringify([]), { status: 200 });
    }) as unknown as typeof fetch;

    try {
      const errors = await refreshAssets();

      expect(errors.some((e) => e.startsWith(`${failingCoin}-15m:`))).toBe(true);
      // the failing coin's OTHER tasks are independent entries and still ran without error.
      expect(errors.some((e) => e.startsWith(`${failingCoin}-1h:`))).toBe(false);
      expect(errors.some((e) => e.startsWith(`${failingCoin}-funding:`))).toBe(false);
      // a different alt's candles were still refreshed (file written, no error for it).
      expect(errors.some((e) => e.startsWith(`${okCoin}-`))).toBe(false);
      expect(await loadCandles(`hl-${okCoin}-1h`)).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
      if (prevDataDir === undefined) delete process.env.DATA_DIR;
      else process.env.DATA_DIR = prevDataDir;
    }
  }, 15_000);
});
