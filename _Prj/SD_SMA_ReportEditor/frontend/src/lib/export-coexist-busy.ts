/**
 * 035 结批期降载：导出进行中且档位 coexistPause=full 时，暂停侧栏探活等。
 */
import { ref, type Ref } from "vue";
import type { ExportPerfCoexistPause } from "@/lib/export-perf-tier";
import { shouldPauseCoexistTasks } from "@/lib/export-perf-tier";

type Session = { coexistPause: ExportPerfCoexistPause };

const sessions: Session[] = [];

/** 是否应暂停侧栏探活 / Dashboard / AI pending */
export const pdfExportCoexistPauseActive: Ref<boolean> = ref(false);

function sync(): void {
  pdfExportCoexistPauseActive.value = sessions.some((s) =>
    shouldPauseCoexistTasks(true, s.coexistPause),
  );
}

export function beginExportCoexistSession(coexistPause: ExportPerfCoexistPause): void {
  sessions.push({ coexistPause });
  sync();
}

export function endExportCoexistSession(): void {
  sessions.pop();
  sync();
}

/** 测试用 */
export function resetExportCoexistBusyForTests(): void {
  sessions.length = 0;
  sync();
}
