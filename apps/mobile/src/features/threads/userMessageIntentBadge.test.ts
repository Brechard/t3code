import { describe, expect, it } from "@effect/vitest";

import { resolveUserMessageIntentBadge } from "./userMessageIntentBadge";

describe("user message intent badge", () => {
  it("does not label ordinary turn-start messages", () => {
    expect(resolveUserMessageIntentBadge(undefined)).toBeNull();
    expect(resolveUserMessageIntentBadge("turn_start")).toBeNull();
  });

  it("explains that messages originally queued have since been sent", () => {
    expect(resolveUserMessageIntentBadge("queued_turn")).toEqual({
      label: "queued",
      accessibilityLabel: "Sent from queue",
      explanation:
        "This message was originally queued and has since been sent to the agent. It is no longer waiting in the queue.",
      tone: "queued",
    });
  });

  it("labels messages that steer the active turn", () => {
    expect(resolveUserMessageIntentBadge("steer")).toEqual({
      label: "steer",
      accessibilityLabel: "Steered the active turn",
      explanation: "This message was sent to the agent while its turn was still running.",
      tone: "steer",
    });
  });

  it("preserves the queued origin after promotion to steer", () => {
    expect(resolveUserMessageIntentBadge("promoted_queued_to_steer")).toEqual({
      label: "queued → steer",
      accessibilityLabel: "Originally queued, then promoted to steer the active turn",
      explanation:
        "This message was originally queued, then sent to the agent while its turn was still running. It is no longer waiting in the queue.",
      tone: "steer",
    });
  });
});
