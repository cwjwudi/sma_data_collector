import { describe, expect, it } from "vitest";

import {
  emptyReloadDraftAction,
  shouldContinueEmptyLoadWatch,
  shouldPreserveCreateDraftOnNullModel,
} from "./empty-connections-reload-policy";

describe("emptyReloadDraftAction", () => {
  it("resets draft when not already creating (first empty paint)", () => {
    expect(emptyReloadDraftAction(false)).toBe("reset");
  });

  it("preserves draft while user is creating a new connection", () => {
    expect(emptyReloadDraftAction(true)).toBe("preserve");
  });
});

describe("shouldContinueEmptyLoadWatch", () => {
  it("stops after a successful empty list fetch (steady state)", () => {
    expect(
      shouldContinueEmptyLoadWatch({
        connectionsCount: 0,
        emptyListConfirmed: true,
        ticks: 1,
      }),
    ).toBe(false);
  });

  it("continues only while empty is not yet confirmed and under max ticks", () => {
    expect(
      shouldContinueEmptyLoadWatch({
        connectionsCount: 0,
        emptyListConfirmed: false,
        ticks: 3,
      }),
    ).toBe(true);
  });

  it("stops when connections appear or ticks exceed max", () => {
    expect(
      shouldContinueEmptyLoadWatch({
        connectionsCount: 1,
        emptyListConfirmed: false,
        ticks: 1,
      }),
    ).toBe(false);
    expect(
      shouldContinueEmptyLoadWatch({
        connectionsCount: 0,
        emptyListConfirmed: false,
        ticks: 13,
      }),
    ).toBe(false);
  });
});

describe("shouldPreserveCreateDraftOnNullModel", () => {
  it("does not preserve on first immediate null (initialize defaults)", () => {
    expect(
      shouldPreserveCreateDraftOnNullModel({
        creatingNew: true,
        prevCreatingNew: undefined,
        prevModelWasNull: undefined,
      }),
    ).toBe(false);
  });

  it("preserves when still creating and parent re-sends null (empty reload)", () => {
    expect(
      shouldPreserveCreateDraftOnNullModel({
        creatingNew: true,
        prevCreatingNew: true,
        prevModelWasNull: true,
      }),
    ).toBe(true);
  });

  it("resets when entering create from a selected connection (prev model non-null)", () => {
    expect(
      shouldPreserveCreateDraftOnNullModel({
        creatingNew: true,
        prevCreatingNew: false,
        prevModelWasNull: false,
      }),
    ).toBe(false);
  });
});
