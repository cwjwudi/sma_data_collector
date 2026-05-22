import { ref } from "vue";
import {
  adjustIntegerColumnPercentsAfterEdit,
  TABLE_COLUMN_WIDTH_PERCENT_MIN,
} from "@/lib/report-template/table-cell-metrics";

/**
 * 表格列宽（%）输入：编辑过程中用本地草稿，避免受控 :value 在键入时被 computed 覆盖；
 * 在 change（含 spinner、blur 确认）时提交并写回 tableColWidthsPx。
 */
export function useTableColPercentInput(getPercents: () => number[]) {
  const editingIndex = ref<number | null>(null);
  const editingRaw = ref("");

  function inputValue(ci: number): string | number {
    if (editingIndex.value === ci) return editingRaw.value;
    return getPercents()[ci] ?? TABLE_COLUMN_WIDTH_PERCENT_MIN;
  }

  function onFocus(ci: number) {
    editingIndex.value = ci;
    editingRaw.value = String(getPercents()[ci] ?? TABLE_COLUMN_WIDTH_PERCENT_MIN);
  }

  function onInput(ev: Event) {
    editingRaw.value = (ev.target as HTMLInputElement).value;
  }

  function onBlur() {
    editingIndex.value = null;
    editingRaw.value = "";
  }

  function onChange(ci: number, ev: Event, onCommit: (next: number[]) => void) {
    const raw = (ev.target as HTMLInputElement).value;
    editingIndex.value = null;
    editingRaw.value = "";
    const prev = getPercents().slice();
    onCommit(adjustIntegerColumnPercentsAfterEdit(prev, ci, raw));
  }

  return { inputValue, onFocus, onInput, onBlur, onChange };
}
