/**
 * 属性面板几何字段：输入过程中不强制最小值，失焦/回车时再提交并 clamp。
 * 避免用户输入 150 时先键入 1/15 就被 snap 到最小宽高。
 */

import { computed, ref, type WritableComputedRef } from "vue";

export type GeomField = "x" | "y" | "w" | "h";

export type GeomTarget = { x: number; y: number; w: number; h: number };

export function parseGeomInput(raw: string): number | null {
  const t = String(raw ?? "").trim();
  if (t === "" || t === "-" || t === "." || t === "-.") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** 为 el 的 x/y/w/h 生成字符串代理：编辑中写草稿，commit 时写回并 onCommit。 */
export function useDeferredGeomField(
  getEl: () => GeomTarget | null | undefined,
  field: GeomField,
  onCommit: () => void,
): { model: WritableComputedRef<string>; commit: () => void } {
  const editing = ref(false);
  const draft = ref("");

  const model = computed({
    get(): string {
      if (editing.value) return draft.value;
      const el = getEl();
      if (!el) return "";
      const n = el[field];
      return Number.isFinite(n) ? String(n) : "";
    },
    set(v: string) {
      editing.value = true;
      draft.value = v;
    },
  });

  function commit() {
    const el = getEl();
    if (!el) {
      editing.value = false;
      return;
    }
    const parsed = parseGeomInput(editing.value ? draft.value : model.value);
    if (parsed != null) el[field] = parsed;
    editing.value = false;
    onCommit();
  }

  return { model, commit };
}
