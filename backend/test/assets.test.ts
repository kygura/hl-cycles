import { describe, expect, test } from "bun:test";
import { ASSETS, ALTS } from "../src/assets";

describe("ASSETS config", () => {
  test("coins are unique", () => {
    const coins = ASSETS.map((a) => a.coin);
    expect(new Set(coins).size).toBe(coins.length);
  });

  test("every entry has a non-empty coin and sector", () => {
    for (const a of ASSETS) {
      expect(a.coin.length).toBeGreaterThan(0);
      expect(a.sector.length).toBeGreaterThan(0);
    }
  });

  test("BTC is present exactly once", () => {
    expect(ASSETS.filter((a) => a.coin === "BTC").length).toBe(1);
  });

  test("ALTS excludes BTC and covers every other coin", () => {
    expect(ALTS).not.toContain("BTC");
    expect(ALTS.length).toBe(ASSETS.length - 1);
    expect(new Set(ALTS)).toEqual(new Set(ASSETS.filter((a) => a.coin !== "BTC").map((a) => a.coin)));
  });
});
