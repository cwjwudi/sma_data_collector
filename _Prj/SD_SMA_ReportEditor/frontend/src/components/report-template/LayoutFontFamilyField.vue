<template>
  <label class="lff">
    <span class="lff-lab">字体</span>
    <input
      v-model="model"
      type="text"
      class="lff-inp"
      :list="listId"
      placeholder="留空则跟随系统默认"
      spellcheck="false"
      autocomplete="off"
    />
    <datalist :id="listId">
      <option v-for="f in options" :key="f" :value="f" />
    </datalist>
    <button type="button" class="lff-btn" :disabled="loading" @click="onRefresh">
      {{ loading ? "读取中…" : "刷新本机字体列表" }}
    </button>
    <p v-if="hint" class="lff-hint">{{ hint }}</p>
  </label>
</template>

<script setup lang="ts">
import { useLayoutFontChoices } from "@/composables/useLayoutFontChoices";

const model = defineModel<string>({ default: "" });

const listId = `lff-dl-${Math.random().toString(36).slice(2, 11)}`;

const { options, loading, hint, refresh } = useLayoutFontChoices();

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
.lff-inp {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #e4e4e7;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 12px;
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
