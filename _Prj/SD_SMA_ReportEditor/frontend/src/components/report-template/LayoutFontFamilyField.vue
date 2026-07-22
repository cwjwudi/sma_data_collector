<template>
  <label class="lff">
    <span class="lff-lab">字体</span>
    <SuggestCombobox
      v-model="model"
      :options="options"
      :placeholder="defaultPlaceholder"
      :format-option="formatFontOption"
      :opt-preview-style="fontPreviewStyle"
      :max-list-height="320"
    />
    <div class="lff-actions">
      <button type="button" class="lff-btn" :disabled="loading" @click="onRefresh">
        {{ loading ? "读取中…" : "刷新本机字体列表" }}
      </button>
      <button v-if="model" type="button" class="lff-btn lff-btn-muted" @click="model = ''">
        恢复默认
      </button>
    </div>
    <p v-if="availabilityHint" class="lff-hint">{{ availabilityHint }}</p>
    <p v-else-if="hint" class="lff-hint">{{ hint }}</p>
    <p v-else class="lff-hint lff-hint-muted">
      留空即使用软件自带默认字体「{{ DEFAULT_LAYOUT_FONT_FAMILY }}」。点 ▾ 可浏览；输入可过滤。
    </p>
  </label>
</template>

<script setup lang="ts">
import { computed } from "vue";
import SuggestCombobox from "@/components/report-template/SuggestCombobox.vue";
import {
  DEFAULT_LAYOUT_FONT_FAMILY,
  useLayoutFontChoices,
} from "@/composables/useLayoutFontChoices";
import {
  BUNDLED_CJK_FAMILY,
  checkFontFamilySync,
} from "@/lib/report-template/font-availability";

const model = defineModel<string>({ default: "" });

const { options, loading, hint, refresh } = useLayoutFontChoices();

/** Q2=A：空值不写死进模版，输入框占位显示真实默认字体名 */
const defaultPlaceholder = `${DEFAULT_LAYOUT_FONT_FAMILY}（默认）`;

function formatFontOption(opt: string): string {
  return opt === DEFAULT_LAYOUT_FONT_FAMILY ? `${opt}（默认）` : opt;
}

const availabilityHint = computed(() => {
  const f = String(model.value || "").trim();
  if (!f) return "";
  const r = checkFontFamilySync(f, (css) => {
    try {
      return typeof document !== "undefined" && !!document.fonts?.check?.(css);
    } catch {
      return false;
    }
  });
  if (r.availableOnHost || r.coveredByBundle) return "";
  return `本机可能没有「${f}」。导出将回退到随包「${BUNDLED_CJK_FAMILY}」。`;
});

function fontPreviewStyle(opt: string): Record<string, string> {
  return { fontFamily: `"${opt.replace(/"/g, "")}", sans-serif` };
}

function onRefresh() {
  void refresh();
}
</script>

<style scoped>
.lff {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.lff-lab {
  font-size: 12px;
  color: #52525b;
}
.lff-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.lff-btn {
  align-self: flex-start;
  padding: 6px 10px;
  font-size: 11px;
  border-radius: 6px;
  border: 1px solid #c7d2fe;
  background: #eef2ff;
  color: #3730a3;
  cursor: pointer;
}
.lff-btn-muted {
  border-color: #e4e4e7;
  background: #fafafa;
  color: #52525b;
}
.lff-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.lff-hint {
  margin: 0;
  font-size: 11px;
  color: #a16207;
  line-height: 1.4;
}
.lff-hint-muted {
  color: #a1a1aa;
}
</style>
