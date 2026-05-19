<template>
  <span class="conn-led" :class="ledClass" :title="title" role="img" :aria-label="title" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ConnectionHealthState } from "@/features/datasource/connection-tab-health";

const props = withDefaults(
  defineProps<{
    state?: ConnectionHealthState;
  }>(),
  {
    state: "unknown",
  },
);

const ledClass = computed(() => ({
  "conn-led--ok": props.state === "ok",
  "conn-led--fail": props.state === "fail",
  "conn-led--checking": props.state === "checking",
}));

const title = computed(() => {
  if (props.state === "ok") return "连接正常";
  if (props.state === "fail") return "连接失败";
  if (props.state === "checking") return "正在检测连接…";
  return "尚未检测连接";
});
</script>
