<template>
  <label class="lff">
    <span class="lff-lab">字体</span>
    <SuggestCombobox
      v-model="model"
      :options="options"
      placeholder="留空则跟随系统默认"
      :opt-preview-style="fontPreviewStyle"
      :max-list-height="300"
    />
    <button type="button" class="lff-btn" :disabled="loading" @click="onRefresh">
      {{ loading ? "读取中…" : "刷新本机字体列表" }}
    </button>
    <p v-if="hint" class="lff-hint">{{ hint }}</p>
  </label>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import SuggestCombobox from "@/components/report-template/SuggestCombobox.vue";
import { useLayoutFontChoices } from "@/composables/useLayoutFontChoices";

const model = defineModel<string>({ default: "" });

const { options, loading, hint, refresh } = useLayoutFontChoices();

function fontPreviewStyle(opt: string): Record<string, string> {
  return { fontFamily: opt };
}

function onRefresh() {
  void refresh();
}

onMounted(() => {
  void refresh();
});
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
</style>
