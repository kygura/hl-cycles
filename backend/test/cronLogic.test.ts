import { describe, expect, test } from "bun:test";
import { shouldFail } from "../src/cronLogic";

describe("shouldFail", () => {
  test("no errors -> false", () => {
    expect(shouldFail([], [], 10)).toBe(false);
  });

  test("any BTC error -> true, even with no alt errors", () => {
    expect(shouldFail(["hl-1h: network down"], [], 10)).toBe(true);
  });

  test("a single flaky alt (1 of 10) -> false", () => {
    expect(shouldFail([], ["SOL-15m: timeout"], 10)).toBe(false);
  });

  test("exactly half the alts failing -> false (needs MORE than half)", () => {
    const altErrors = ["A-15m: x", "B-15m: x", "C-15m: x", "D-15m: x", "E-15m: x"];
    expect(shouldFail([], altErrors, 10)).toBe(false);
  });

  test("more than half the alts failing -> true", () => {
    const altErrors = ["A-15m: x", "B-15m: x", "C-15m: x", "D-15m: x", "E-15m: x", "F-15m: x"];
    expect(shouldFail([], altErrors, 10)).toBe(true);
  });

  test("multiple failing tasks for the same alt count as one alt", () => {
    const altErrors = ["A-15m: x", "A-1h: x", "A-funding: x", "A-oi: x"];
    expect(shouldFail([], altErrors, 10)).toBe(false); // only 1 of 10 alts affected
  });

  test("no alts configured -> never fails on alt errors", () => {
    expect(shouldFail([], [], 0)).toBe(false);
  });
});
