<template>
  <div v-if="el" class="lpep">
    <h5 class="lpep-h">属性</h5>
    <div class="lpep-grid">
      <label v-if="el.type !== 'pageNumber'" class="lpep-lab"
        >文字<input v-model.trim="el.text" class="lpep-inp"
      /></label>
      <label v-if="el.type === 'date'" class="lpep-lab"
        >日期格式<input v-model.trim="el.dateFormat" class="lpep-inp"
      /></label>
      <label v-if="el.type === 'image'" class="lpep-lab"
        >图片来源 URL / data<input v-model.trim="el.imageSrc" class="lpep-inp"
      /></label>
      <template v-if="el.type === 'pageNumber'">
        <label class="lpep-lab">形式</label>
        <select v-model="el.pageNumberMode" class="lpep-inp">
          <option value="plain">仅数字</option>
          <option value="slashTotal">当前页/总页数</option>
          <option value="cnPage">第N页</option>
          <option value="circle">圆形框</option>
        </select>
      </template>
      <label class="lpep-lab">字号<input v-model.number="el.fontSize" type="number" min="8" max="72" class="lpep-inp" /></label>
      <label class="lpep-lab">X<input v-model.number="el.x" type="number" class="lpep-inp" /></label>
      <label class="lpep-lab">Y<input v-model.number="el.y" type="number" class="lpep-inp" /></label>
      <label class="lpep-lab">W<input v-model.number="el.w" type="number" class="lpep-inp" /></label>
      <label class="lpep-lab">H<input v-model.number="el.h" type="number" class="lpep-inp" /></label>
      <button type="button" class="lpep-del" @click="$emit('remove')">删除选中</button>
    </div>
  </div>
  <div v-else class="lpep-grey">
    <p>在画布上点选控件后在编辑属性。</p>
  </div>
</template>

<script setup lang="ts">
import type { LayoutZoneElement } from "@/lib/report-template/layout-zone-element";

defineProps<{
  el: LayoutZoneElement | null;
}>();

defineEmits<{
  remove: [];
}>();
</script>

<style scoped>
.lpep-h {
  margin: 0 0 8px;
  font-size: 13px;
}
.lpep-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
}
.lpep-lab {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.lpep-inp {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #e4e4e7;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 12px;
}
.lpep-del {
  margin-top: 4px;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid rgb(239 68 68);
  color: rgb(185 28 28);
  background: #fff;
  cursor: pointer;
}
.lpep-grey {
  font-size: 13px;
  color: #71717a;
}
</style>
