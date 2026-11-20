import { markCallSignalHandled } from "./callSignaling";

describe("markCallSignalHandled", () => {
  test("does not consume a signaling message when negotiation fails", () => {
    const seen = new Set();
    expect(markCallSignalHandled(seen, "signal-1", false)).toBe(false);
    expect(seen.has("signal-1")).toBe(false);
  });

  test("records a signaling message after successful processing", () => {
    const seen = new Set();
    expect(markCallSignalHandled(seen, "signal-1")).toBe(true);
    expect(seen.has("signal-1")).toBe(true);
  });

  test("ignores missing identifiers and invalid sets", () => {
    expect(markCallSignalHandled(new Set(), "")).toBe(false);
    expect(markCallSignalHandled(null, "signal-1")).toBe(false);
  });
});
