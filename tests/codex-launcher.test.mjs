import { describe, expect, it } from "vitest";
import { codexArgs, MODES, parseArgs } from "../scripts/codex-launcher.mjs";

describe("Codex model launcher", () => {
  it("maps the economy profile to the low-usage model", () => {
    expect(MODES.economy).toMatchObject({ model: "gpt-5.6-luna", effort: "low" });
    expect(codexArgs("economy")).toEqual([
      "-m",
      "gpt-5.6-luna",
      "-c",
      'model_reasoning_effort="low"',
    ]);
  });

  it("uses balanced mode only when explicitly selected", () => {
    expect(parseArgs(["--mode", "balanced", "--", "--cd", "C:/repo"])).toEqual({
      mode: "balanced",
      dryRun: false,
      forwarded: ["--cd", "C:/repo"],
      help: false,
    });
  });

  it("rejects unknown modes instead of silently increasing usage", () => {
    expect(() => parseArgs(["--mode", "ultra"])).toThrow("Nepoznat nacin rada");
  });
});
