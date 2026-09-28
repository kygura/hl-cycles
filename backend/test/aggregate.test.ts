import { describe, expect, test } from "bun:test";
import { componentWord, readSentence, summaryText } from "../src/model/composite";

const EPS = 1e-9;

describe("componentWord", () => {
  test("trend boundaries", () => {
    expect(componentWord("trend", 0.25)).toBe("uptrend");
    expect(componentWord("trend", 0.25 - EPS)).toBe("sideways");
    expect(componentWord("trend", -0.25)).toBe("downtrend");
    expect(componentWord("trend", -0.25 + EPS)).toBe("sideways");
    expect(componentWord("trend", 1)).toBe("uptrend");
    expect(componentWord("trend", -1)).toBe("downtrend");
    expect(componentWord("trend", null)).toBeNull();
  });

  test("heat boundaries", () => {
    expect(componentWord("heat", 0.75)).toBe("hot");
    expect(componentWord("heat", 0.2)).toBe("warm");
    expect(componentWord("heat", -0.35)).toBe("cool");
    expect(componentWord("heat", -0.35 + EPS)).toBe("mild");
    expect(componentWord("heat", -0.6)).toBe("cold");
    expect(componentWord("heat", -0.6 + EPS)).toBe("cool");
    expect(componentWord("heat", 1)).toBe("hot");
    expect(componentWord("heat", -1)).toBe("cold");
    expect(componentWord("heat", null)).toBeNull();
  });

  test("leverage boundaries", () => {
    expect(componentWord("leverage", 0.5)).toBe("crowded");
    expect(componentWord("leverage", 0.2)).toBe("building");
    expect(componentWord("leverage", -0.25)).toBe("shorting");
    expect(componentWord("leverage", -0.25 + EPS)).toBe("balanced");
    expect(componentWord("leverage", -0.5)).toBe("squeezable");
    expect(componentWord("leverage", -0.5 + EPS)).toBe("shorting");
    expect(componentWord("leverage", 1)).toBe("crowded");
    expect(componentWord("leverage", -1)).toBe("squeezable");
    expect(componentWord("leverage", null)).toBeNull();
  });

  test("momentum boundaries", () => {
    expect(componentWord("momentum", 0.6)).toBe("surging");
    expect(componentWord("momentum", 0.3)).toBe("rising");
    expect(componentWord("momentum", -0.3)).toBe("falling");
    expect(componentWord("momentum", -0.3 + EPS)).toBe("flat");
    expect(componentWord("momentum", -0.6)).toBe("plunging");
    expect(componentWord("momentum", 1)).toBe("surging");
    expect(componentWord("momentum", -1)).toBe("plunging");
    expect(componentWord("momentum", null)).toBeNull();
  });
});

describe("readSentence / summaryText", () => {
  test("summaryText === readSentence + bias clause", () => {
    const s = summaryText("expansion", "crowded_long", 0.34);
    expect(s).toBe(`${readSentence("expansion", "crowded_long")} Bias: bullish (+0.34).`);
  });

  test("existing summary regression", () => {
    expect(summaryText("expansion", "crowded_long", 0.34)).toBe(
      "HTF expansion: trend is up and not yet overheated; perps are crowded long (funding and premium hot). Bias: bullish (+0.34).",
    );
    expect(summaryText(null, "neutral", null)).toBe("HTF data insufficient; short-term neutral. Bias: unavailable.");
  });

  test("null phase with insufficient_data state", () => {
    expect(readSentence(null, "insufficient_data")).toBe("HTF data insufficient; LTF data insufficient.");
  });
});
