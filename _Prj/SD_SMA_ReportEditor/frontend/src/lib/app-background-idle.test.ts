import { describe, expect, it, beforeEach } from "vitest";
import {
  appBackgroundIdleActive,
  resetAppBackgroundIdleForTests,
  setAppBackgroundIdle,
  uiSecondaryTasksPaused,
} from "@/lib/app-background-idle";
import {
  beginExportCoexistSession,
  endExportCoexistSession,
  resetExportCoexistBusyForTests,
} from "@/lib/export-coexist-busy";

describe("app-background-idle", () => {
  beforeEach(() => {
    resetAppBackgroundIdleForTests();
    resetExportCoexistBusyForTests();
  });

  it("background idle pauses secondary UI tasks", () => {
    expect(uiSecondaryTasksPaused.value).toBe(false);
    setAppBackgroundIdle(true);
    expect(appBackgroundIdleActive.value).toBe(true);
    expect(uiSecondaryTasksPaused.value).toBe(true);
    setAppBackgroundIdle(false);
    expect(uiSecondaryTasksPaused.value).toBe(false);
  });

  it("export coexist also pauses secondary UI tasks", () => {
    beginExportCoexistSession("full");
    expect(uiSecondaryTasksPaused.value).toBe(true);
    endExportCoexistSession();
    expect(uiSecondaryTasksPaused.value).toBe(false);
  });
});
