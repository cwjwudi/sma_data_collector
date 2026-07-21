<template>
  <label class="lff">
    <span class="lff-lab">字体</span>
    <SuggestCombobox
      v-model="model"
      :options="options"
      placeholder="留空则跟随系统默认；点 ▾ 浏览全部"
      :opt-preview-style="fontPreviewStyle"
      :max-list-height="320"
    />
    <div class="lff-actions">
      <button type="button" class="lff-btn" :disabled="loading" @click="onRefresh">
        {{ loading ? "读取中…" : "刷新本机字体列表" }}
      </button>
      <button v-if="model" type="button" class="lff-btn lff-btn-muted" @click="model = ''">清除</button>
    </div>
    <p v-if="availabilityHint" class="lff-hint">{{ availabilityHint }}</p>
    <p v-else-if="hint" class="lff-hint">{{ hint }}</p>
    <p v-else class="lff-hint lff-hint-muted">点 ▾ 可浏览全部字体并滚动；输入文字可过滤。刷新需允许访问本机字体。</p>
  </label>
</template>

<script setup lang="ts">
import { computed } from "vue";
import SuggestCombobox from "@/components/report-template/SuggestCombobox.vue";
import { useLayoutFontChoices } from "@/composables/useLayoutFontChoices";
import {
  BUNDLED_CJK_FAMILY,
  checkFontFamilySync,
} from "@/lib/report-template/font-availability";

const model = defineModel<string>({ default: "" });

const { options, loading, hint, refresh } = useLayoutFontChoices();

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
