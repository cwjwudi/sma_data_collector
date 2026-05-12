<template>
  <ul class="tree">
    <li v-for="n in nodes" :key="n.node_id || n.browse_name" class="item">
      <div class="row">
        <button type="button" class="link" @click="$emit('pick', n)">{{ n.display_name || n.browse_name || n.node_id }}</button>
        <button v-if="n.node_id" type="button" class="link plus" @click="$emit('expand', n)">展开</button>
      </div>
      <OpcUaTree
        v-if="n.children?.length"
        :nodes="n.children"
        @expand="$emit('expand', $event)"
        @pick="$emit('pick', $event)"
      />
    </li>
  </ul>
</template>

<script setup>
defineOptions({ name: 'OpcUaTree' })
defineProps({ nodes: { type: Array, default: () => [] } })
defineEmits(['expand', 'pick'])
</script>

<style scoped>
.tree {
  list-style: none;
  padding-left: 8px;
  margin: 0;
}
.item {
  margin: 4px 0;
}
.row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.link {
  background: none;
  border: none;
  color: #2563eb;
  cursor: pointer;
  padding: 0;
  font-size: 13px;
}
.plus {
  color: #6b7280;
  font-size: 12px;
}
</style>
