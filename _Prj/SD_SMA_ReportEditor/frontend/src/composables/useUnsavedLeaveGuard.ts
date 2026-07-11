import { onBeforeUnmount, onMounted, ref, type Ref } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { appConfirmSaveLeave } from "@/composables/useAppConfirm";
import { stableFingerprintPart } from "@/lib/report-template/snapshot-fingerprint";

/**
 * 编辑页未保存离开守卫：侧栏切页、返回列表、关闭窗口前询问是否保存。
 */
export function useUnsavedLeaveGuard(options: {
  isDirty: () => boolean;
  /** 返回 true 表示保存成功且可离开 */
  save: () => Promise<boolean>;
  entityLabel: string;
}) {
  const skipLeaveGuard = ref(false);
  let prompting = false;

  async function ensureCanLeave(): Promise<boolean> {
    if (skipLeaveGuard.value || !options.isDirty()) return true;
    if (prompting) return false;
    prompting = true;
    try {
      const choice = await appConfirmSaveLeave({
        title: "未保存的更改",
        message: `当前${options.entityLabel}有未保存的修改。是否保存后再离开？`,
        saveText: "保存",
        discardText: "不保存",
        cancelText: "取消",
      });
      if (choice === "cancel") return false;
      if (choice === "save") {
        const ok = await options.save();
        if (!ok) return false;
        if (options.isDirty()) return false;
      }
      skipLeaveGuard.value = true;
      return true;
    } finally {
      prompting = false;
    }
  }

  onBeforeRouteLeave(async () => {
    return await ensureCanLeave();
  });

  function onBeforeUnload(ev: BeforeUnloadEvent) {
    if (skipLeaveGuard.value || !options.isDirty()) return;
    ev.preventDefault();
    ev.returnValue = "";
  }

  onMounted(() => {
    window.addEventListener("beforeunload", onBeforeUnload);
  });
  onBeforeUnmount(() => {
    window.removeEventListener("beforeunload", onBeforeUnload);
  });

  return { ensureCanLeave, skipLeaveGuard };
}

/** 用稳定指纹比较当前编辑对象与上次保存基线 */
export function useSavedFingerprintBaseline(getCurrent: () => unknown): {
  markClean: () => void;
  clearBaseline: () => void;
  isDirty: () => boolean;
  baselineFp: Ref<string | null>;
} {
  const baselineFp = ref<string | null>(null);

  function markClean() {
    const cur = getCurrent();
    baselineFp.value = cur == null ? null : stableFingerprintPart(cur);
  }

  function clearBaseline() {
    baselineFp.value = null;
  }

  function isDirty() {
    const cur = getCurrent();
    if (cur == null || baselineFp.value == null) return false;
    return stableFingerprintPart(cur) !== baselineFp.value;
  }

  return { markClean, clearBaseline, isDirty, baselineFp };
}
