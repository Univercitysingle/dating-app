import { markCallSignalHandled, applyRemoteIceCandidate, flushQueuedRemoteCandidates } from "./callSignaling";

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


describe("remote ICE candidate delivery", () => {
  test("retains a candidate when the peer temporarily rejects it", async () => {
    const candidate = { candidate: "candidate:1" };
    const queue = [candidate];
    const peer = {
      addIceCandidate: jest.fn()
        .mockRejectedValueOnce(new Error("Remote description not ready"))
        .mockResolvedValueOnce(undefined),
    };

    expect(await flushQueuedRemoteCandidates(peer, queue)).toBe(0);
    expect(queue).toEqual([candidate]);
    expect(await flushQueuedRemoteCandidates(peer, queue)).toBe(1);
    expect(queue).toEqual([]);
    expect(peer.addIceCandidate).toHaveBeenCalledTimes(2);
  });

  test("does not report an ICE candidate as applied when the peer rejects it", async () => {
    const peer = { addIceCandidate: jest.fn().mockRejectedValue(new Error("ICE failure")) };
    expect(await applyRemoteIceCandidate(peer, { candidate: "candidate:2" })).toBe(false);
  });
});
