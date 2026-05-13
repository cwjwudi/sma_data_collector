<template>
  <div class="page sg">
    <header class="hdr">
      <h2 class="page-title">签名库</h2>
      <button type="button" class="b primary" @click="openNew">手写新建</button>
    </header>
    <p class="muted">保存常用签字图（PNG data URL）。模版编辑器中「电子签名」控件可选用库条目并与手写共存。</p>
    <p v-if="msg" class="msg">{{ msg }}</p>

    <table class="tbl">
      <thead>
        <tr>
          <th>名称</th>
          <th>预览</th>
          <th>更新</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="!rows.length">
          <td colspan="4" class="empty">暂无签名条目。</td>
        </tr>
        <tr v-for="r in rows" :key="r.id">
          <td>{{ r.label }}</td>
          <td class="prev"><img v-if="r.preview" :src="r.preview" alt="" class="thumb" /></td>
          <td>{{ r.updated }}</td>
          <td>
            <a href="#" class="lnk" @click.prevent="rename(r.id)">改名</a>
            <a href="#" class="lnk danger" @click.prevent="remove(r.id)">删除</a>
          </td>
        </tr>
      </tbody>
    </table>

    <SignaturePadDialog v-model="dlg" title="手写签名条目" :subtitle="pendingLabel || undefined" @confirm="onPadOk" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import SignaturePadDialog from "@/components/report-template/SignaturePadDialog.vue";
import type { SignatureAsset } from "@/api/signatures";
import * as api from "@/api/signatures";

const msg = ref("");
const dlg = ref(false);
const pendingNew = ref(false);
/** 新建流程：手写板打开前已输入的名称 */
const pendingLabel = ref("");
const route = useRoute();
const router = useRouter();
const summaries = ref<Pick<SignatureAsset, "id" | "label" | "updatedAt">[]>([]);
const previews = ref<Record<string, string>>({});

const rows = computed(() =>
  summaries.value.map((s) => ({
    ...s,
    updated: (s.updatedAt || "").replace("T", " ").slice(0, 19),
    preview: previews.value[s.id],
  })),
);

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `sig_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}

async function load() {
  msg.value = "";
  try {
    summaries.value = await api.listSignatures();
    previews.value = {};
    for (const s of summaries.value) {
      try {
        const full = await api.getSignature(s.id);
        previews.value[s.id] = full.imageSrc;
      } catch {
        /* skip */
      }
    }
  } catch (e) {
    msg.value = "加载失败：" + String((e as Error).message || e);
  }
}

/** 手写新建：先起名再开板；取消或空名称不打开手写板 */
function promptForNewLabel(): string | null {
  const raw = window.prompt?.(
    "请输入签名条目显示名称（确定后将打开手写板）",
    "签名",
  );
  if (raw === null) return null;
  const n = normalizeLabel(raw);
  if (!n) return null;
  return n;
}

function openNew() {
  const name = promptForNewLabel();
  if (!name) return;
  pendingNew.value = true;
  pendingLabel.value = name;
  dlg.value = true;
}

async function openNewFromRoute() {
  if (route.query.new !== "1" && route.query.new !== 1) return;
  await router.replace({
    path: route.path,
    hash: route.hash,
    query: {},
  });
  const name = promptForNewLabel();
  if (!name) return;
  pendingNew.value = true;
  pendingLabel.value = name;
  dlg.value = true;
}

async function onPadOk(dataUrl: string) {
  const wasNew = pendingNew.value;
  const label = normalizeLabel(pendingLabel.value) || "签名";
  pendingNew.value = false;
  pendingLabel.value = "";
  dlg.value = false;
  if (!wasNew) return;
  const body: SignatureAsset = {
    id: newId(),
    label,
    imageSrc: dataUrl,
    updatedAt: new Date().toISOString(),
  };
  await save(body);
}

/** 手写板被取消或关闭时清掉待定状态（避免下一次误用旧名称） */
watch(dlg, (open) => {
  if (!open) {
    pendingNew.value = false;
    pendingLabel.value = "";
  }
});

async function save(body: SignatureAsset) {
  msg.value = "";
  try {
    await api.putSignature(body.id, body);
    msg.value = "已保存签名条目。";
    await load();
  } catch (e) {
    msg.value = "保存失败：" + String((e as Error).message || e);
  }
}

function rename(id: string) {
  const cur = summaries.value.find((x) => x.id === id);
  const name = normalizeLabel(window.prompt?.("显示名称", cur?.label || "") ?? "");
  if (!name) return;
  api
    .getSignature(id)
    .then(async (a) => {
      await save({ ...a, label: name, updatedAt: new Date().toISOString() });
    })
    .catch(() => {
      msg.value = "读取条目失败";
    });
}

async function remove(id: string) {
  if (!confirm("删除此签名条目？模版里若有 signatureAssetId 引用将断开源文件。")) return;
  msg.value = "";
  try {
    await api.deleteSignature(id);
    await load();
    msg.value = "已删除。";
  } catch (e) {
    msg.value = "删除失败：" + String((e as Error).message || e);
  }
}

function normalizeLabel(s: string) {
  return s.trim().slice(0, 128);
}

onMounted(async () => {
  await load();
  await openNewFromRoute();
});

watch(
  () => route.fullPath,
  async () => {
    await openNewFromRoute();
  },
);
</script>

<style scoped>
.sg {
  padding: 0 4px;
}
.hdr {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.muted {
  font-size: 13px;
  color: #52525b;
  margin: 8px 0;
}
.msg {
  font-size: 12px;
  color: #b45309;
}
.tbl {
  width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
  font-size: 14px;
}
.tbl th,
.tbl td {
  border: 1px solid #e4e4e7;
  padding: 8px;
  vertical-align: middle;
}
.thumb {
  max-height: 48px;
  max-width: 160px;
  object-fit: contain;
}
.prev {
  width: 180px;
}
.empty {
  text-align: center;
  color: #71717a;
  padding: 24px;
}
.lnk {
  margin-right: 10px;
  color: #4f46e5;
  cursor: pointer;
  text-decoration: none;
}
.lnk.danger {
  color: #b91c1c;
}
.b {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #d4d4d8;
  background: #fff;
  cursor: pointer;
}
.b.primary {
  background: #4f46e5;
  color: #fff;
  border-color: #4338ca;
}
.page-title {
  font-size: 24px;
  font-weight: 600;
}
</style>
