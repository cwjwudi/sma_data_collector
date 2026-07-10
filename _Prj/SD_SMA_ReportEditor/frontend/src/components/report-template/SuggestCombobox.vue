<template>
  <div ref="rootRef" class="scb">
    <div class="scb-row">
      <input
        ref="inputRef"
        :value="inputDisplay"
        type="text"
        class="scb-inp"
        :class="inputClass"
        :placeholder="placeholder"
        :spellcheck="false"
        autocomplete="off"
        role="combobox"
        :aria-expanded="open"
        :aria-controls="listboxId"
        aria-autocomplete="list"
        @input="onInput"
        @focus="onFocus"
        @keydown="onKeydown"
      />
      <button
        type="button"
        class="scb-toggle"
        :aria-label="open ? '收起列表' : '展开列表'"
        :aria-expanded="open"
        @mousedown.prevent
        @click="toggleOpen"
      >
        ▾
      </button>
    </div>
    <Teleport to="body">
      <ul
        v-if="open"
        :id="listboxId"
        ref="listRef"
        class="scb-list"
        role="listbox"
        :style="listStyle"
        @mousedown.prevent
        @wheel.stop
      >
        <li v-if="filtered.length === 0" class="scb-empty" role="presentation">无匹配项</li>
        <li
          v-for="(opt, i) in filtered"
          :key="opt"
          class="scb-opt"
          role="option"
          :class="{ 'scb-opt--active': i === activeIndex, 'scb-opt--selected': opt === model }"
          :aria-selected="opt === model"
          :style="optPreviewStyle?.(opt)"
          @mouseenter="activeIndex = i"
          @click="pick(opt)"
        >
          {{ opt }}
        </li>
      </ul>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    options: readonly string[];
    placeholder?: string;
    inputClass?: string | Record<string, boolean> | (string | Record<string, boolean>)[];
    /** 选项预览样式（如字体名用自身字体渲染） */
    optPreviewStyle?: (opt: string) => Record<string, string> | undefined;
    /** 下拉最大高度（px） */
    maxListHeight?: number;
  }>(),
  {
    placeholder: "",
    inputClass: undefined,
    optPreviewStyle: undefined,
    maxListHeight: 280,
  },
);

const model = defineModel<string>({ default: "" });

const open = ref(false);
/** 仅在用户输入时启用过滤；展开列表时不过滤当前选中值，避免只剩一项 */
const filterQuery = ref<string | null>(null);
const activeIndex = ref(0);
const rootRef = ref<HTMLElement | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);
const listRef = ref<HTMLElement | null>(null);
const listStyle = ref<Record<string, string>>({});
const listboxId = `scb-lb-${Math.random().toString(36).slice(2, 11)}`;

const inputDisplay = computed(() => (filterQuery.value !== null ? filterQuery.value : model.value));

const filtered = computed(() => {
  const q = (filterQuery.value ?? "").trim().toLowerCase();
  if (!q) return [...props.options];
  return props.options.filter((o) => o.toLowerCase().includes(q));
});

function placeList() {
  const el = inputRef.value ?? rootRef.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  const maxH = Math.max(160, props.maxListHeight);
  const spaceBelow = window.innerHeight - r.bottom - 8;
  const spaceAbove = r.top - 8;
  const openUp = spaceBelow < Math.min(180, maxH) && spaceAbove > spaceBelow;
  const avail = Math.max(160, openUp ? spaceAbove : spaceBelow);
  const height = Math.min(maxH, avail);
  const rowW = rootRef.value?.getBoundingClientRect().width ?? r.width;
  const width = Math.max(r.width, rowW);
  listStyle.value = {
    position: "fixed",
    left: `${Math.max(8, Math.min(r.left, window.innerWidth - width - 8))}px`,
    width: `${width}px`,
    maxHeight: `${height}px`,
    height: "auto",
    overflowY: "auto",
    overflowX: "hidden",
    zIndex: "10050",
    ...(openUp
      ? { bottom: `${window.innerHeight - r.top + 4}px`, top: "auto" }
      : { top: `${r.bottom + 4}px`, bottom: "auto" }),
  };
}

function indexOfCurrent(): number {
  const cur = model.value;
  if (!cur) return 0;
  const i = filtered.value.indexOf(cur);
  return i >= 0 ? i : 0;
}

function openList() {
  open.value = true;
  filterQuery.value = null;
  activeIndex.value = indexOfCurrent();
  void nextTick(() => {
    placeList();
    scrollActiveIntoView();
  });
}

function closeList() {
  open.value = false;
  filterQuery.value = null;
  activeIndex.value = 0;
}

function toggleOpen() {
  if (open.value) closeList();
  else openList();
}

function onFocus() {
  openList();
}

function onInput(e: Event) {
  const t = e.target as HTMLInputElement;
  filterQuery.value = t.value;
  model.value = t.value;
  if (!open.value) {
    open.value = true;
    void nextTick(() => placeList());
  } else {
    placeList();
  }
  activeIndex.value = 0;
}

function pick(opt: string) {
  model.value = opt;
  filterQuery.value = null;
  closeList();
  inputRef.value?.focus();
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    if (open.value) {
      e.preventDefault();
      filterQuery.value = null;
      closeList();
    }
    return;
  }
  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (!open.value) openList();
    else activeIndex.value = Math.min(filtered.value.length - 1, activeIndex.value + 1);
    scrollActiveIntoView();
    return;
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    if (!open.value) openList();
    else activeIndex.value = Math.max(0, activeIndex.value - 1);
    scrollActiveIntoView();
    return;
  }
  if (e.key === "Enter" && open.value && filtered.value.length) {
    e.preventDefault();
    const i = Math.min(activeIndex.value, filtered.value.length - 1);
    pick(filtered.value[i]!);
  }
}

function scrollActiveIntoView() {
  void nextTick(() => {
    const list = listRef.value;
    if (!list) return;
    const item = list.querySelector<HTMLElement>(".scb-opt--active");
    item?.scrollIntoView({ block: "nearest" });
  });
}

function onDocPointerDown(e: PointerEvent) {
  if (!open.value) return;
  const t = e.target as Node | null;
  if (rootRef.value?.contains(t)) return;
  if (listRef.value?.contains(t)) return;
  closeList();
}

function onWinChange() {
  if (open.value) placeList();
}

watch(
  () => props.options.length,
  () => {
    if (open.value) placeList();
  },
);

onMounted(() => {
  document.addEventListener("pointerdown", onDocPointerDown, true);
  window.addEventListener("resize", onWinChange);
  window.addEventListener("scroll", onWinChange, true);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocPointerDown, true);
  window.removeEventListener("resize", onWinChange);
  window.removeEventListener("scroll", onWinChange, true);
});
</script>

<style scoped>
.scb {
  width: 100%;
  min-width: 0;
}
.scb-row {
  display: flex;
  align-items: stretch;
  gap: 0;
  width: 100%;
  min-width: 0;
}
.scb-inp {
  flex: 1 1 auto;
  min-width: 0;
  box-sizing: border-box;
  border: 1px solid #e4e4e7;
  border-right: none;
  border-radius: 6px 0 0 6px;
  padding: 6px 8px;
  font-size: 12px;
  background: #fff;
}
.scb-inp:focus {
  outline: none;
  border-color: #a5b4fc;
  z-index: 1;
}
.scb-toggle {
  flex: 0 0 auto;
  width: 28px;
  border: 1px solid #e4e4e7;
  border-radius: 0 6px 6px 0;
  background: #fafafa;
  color: #52525b;
  cursor: pointer;
  font-size: 11px;
  line-height: 1;
  padding: 0;
}
.scb-toggle:hover {
  background: #f4f4f5;
}
</style>

<style>
.scb-list {
  margin: 0;
  padding: 4px 0;
  list-style: none;
  box-sizing: border-box;
  background: #fff;
  border: 1px solid #e4e4e7;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgb(24 24 27 / 0.12);
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
.scb-opt {
  padding: 6px 10px;
  font-size: 12px;
  color: #18181b;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.scb-opt--active,
.scb-opt:hover {
  background: #eef2ff;
  color: #3730a3;
}
.scb-opt--selected {
  font-weight: 600;
}
.scb-empty {
  padding: 10px;
  font-size: 12px;
  color: #a1a1aa;
  text-align: center;
}
</style>
