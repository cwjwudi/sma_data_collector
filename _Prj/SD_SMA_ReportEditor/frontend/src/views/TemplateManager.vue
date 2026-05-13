<template>
  <div class="page tm">
    <header class="hdr">
      <h2 class="page-title">模版管理</h2>
      <div>
        <button type="button" class="b" @click="mode = mode === 'list' ? 'thumbs' : 'list'">
          {{ mode === "list" ? "缩略图" : "列表" }}
        </button>
        <button type="button" class="b primary" @click="wizard = true">新建整份模版…</button>
      </div>
    </header>
    <p v-if="msg" class="msg">{{ msg }}</p>

    <table v-if="mode === 'list'" class="tbl">
      <thead>
        <tr>
          <th>名称</th>
          <th>纸张</th>
          <th>更新</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="!rows.length">
          <td colspan="4" class="empty">暂无模版</td>
        </tr>
        <tr v-for="r in rows" :key="r.id">
          <td>{{ r.name }}</td>
          <td>{{ r.dim }}</td>
          <td>{{ r.updated }}</td>
          <td>
            <a href="#" class="lnk" @click.prevent="goEditor(r.id)">编辑</a>
            <a href="#" class="lnk danger" @click.prevent="delTpl(r.id)">删除</a>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-else class="grid">
      <div v-for="r in rows" :key="'g' + r.id" class="card">
        <template v-if="cache[r.id]">
          <div class="row4">
            <div class="micro">
              <span class="micro-t">封面</span>
              <div class="micro-body">
                <TemplateMiniPage
                  :template="cache[r.id]"
                  sheet="cover"
                  :max-width-px="116"
                  :max-height-px="152"
                />
              </div>
              <button type="button" class="b-micro" @click.stop="goLayoutsNew('cover')">新建封面版式</button>
            </div>
            <div class="micro">
              <span class="micro-t">页眉 · 页脚</span>
              <div class="micro-body bands">
                <TemplateMiniBands
                  :template="cache[r.id]"
                  sheet="body"
                  gap-label="正文区（示意省略）"
                  :max-width-px="116"
                  :max-height-px="152"
                />
              </div>
              <button type="button" class="b-micro" @click.stop="goLayoutsNew('normal')">新建正文版式（眉脚）</button>
            </div>
            <div class="micro">
              <span class="micro-t">封尾 · 末页</span>
              <div class="micro-body">
                <TemplateMiniPage
                  :template="cache[r.id]"
                  sheet="back"
                  :max-width-px="116"
                  :max-height-px="152"
                />
              </div>
              <button type="button" class="b-micro" @click.stop="goLayoutsNew('back')">新建末页版式</button>
            </div>
            <div class="micro">
              <span class="micro-t">电子签名</span>
              <div class="micro-body sig">
                <TemplateMiniSignatures :template="cache[r.id]" />
              </div>
              <button type="button" class="b-micro" @click.stop="goSignaturesNew">新建签名条目…</button>
            </div>
          </div>
        </template>
        <div v-else class="skel">加载…</div>
        <div class="foot">
          <b>{{ r.name }}</b> {{ r.dim }} · {{ r.updated }}
          <a href="#" class="lnk" @click.prevent="goEditor(r.id)">编辑</a>
          <a href="#" class="lnk danger" @click.prevent="delTpl(r.id)">删</a>
        </div>
      </div>
    </div>

    <NewTemplateWizardDialog v-model="wizard" @created="created" />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from "vue";
import { useRouter } from "vue-router";
import * as api from "@/api/templates";
import { PAPER_LABEL } from "@/lib/report-template/paper";
import { cloneDeepTemplate } from "@/lib/report-template/snapshot-fingerprint";
import { loadTemplates as loadLocal, saveTemplates } from "@/lib/report-template/model";
import TemplateMiniPage from "@/components/report-template/TemplateMiniPage.vue";
import TemplateMiniBands from "@/components/report-template/TemplateMiniBands.vue";
import TemplateMiniSignatures from "@/components/report-template/TemplateMiniSignatures.vue";
import NewTemplateWizardDialog from "@/components/report-template/NewTemplateWizardDialog.vue";

const router = useRouter();
const mode = ref("thumbs");
const wizard = ref(false);
const msg = ref("");
const summaries = ref([]);
const cache = ref({});
const offline = ref(false);

const rows = computed(() =>
  summaries.value.map((s) => ({
    id: s.id,
    name: s.name,
    dim: PAPER_LABEL[s.paperKind] + (s.orientation === "landscape" ? "·横" : "·纵"),
    updated: (s.updatedAt || "").replace("T", " ").slice(0, 19),
  })),
);

async function load() {
  msg.value = "";
  try {
    const list = await api.listTemplateSummaries();
    summaries.value = list;
    offline.value = false;
  } catch {
    offline.value = true;
    const local = loadLocal();
    summaries.value = local.map((t) => ({
      id: t.id,
      name: t.name,
      updatedAt: t.updatedAt,
      paperKind: t.paperKind,
      orientation: t.orientation,
    }));
    msg.value = "无法连接后端，已显示本地模版摘要。";
    cache.value = Object.fromEntries(local.map((t) => [t.id, t]));
  }
}

async function hydrateThumbs() {
  for (const s of summaries.value) {
    if (cache.value[s.id]) continue;
    try {
      const t = await api.getTemplate(s.id);
      cache.value[s.id] = t;
    } catch {
      cache.value[s.id] = null;
    }
  }
}

watch(
  () => mode.value,
  async (m) => {
    if (m === "thumbs" && !offline.value) await hydrateThumbs();
  },
);

function goLayoutsNew(role) {
  router.push({
    path: "/layouts",
    query: role ? { new: "1", role } : { new: "1" },
  });
}

function goSignaturesNew() {
  router.push({
    path: "/signatures",
    query: { new: "1" },
  });
}

function goEditor(id) {
  router.push({ name: "TemplateEditor", params: { id } });
}

async function delTpl(id) {
  if (!confirm("删除此模版？")) return;
  try {
    await api.deleteTemplate(id);
  } catch {
    /* ignore offline */
  }
  summaries.value = summaries.value.filter((x) => x.id !== id);
  delete cache.value[id];
}

async function created(t) {
  try {
    await api.putTemplate(t.id, t);
  } catch {
    const list = loadLocal();
    if (!list.some((x) => x.id === t.id)) {
      list.push(t);
      saveTemplates(list);
    }
    msg.value += " 新建模版已写入本机 localStorage；可在「设置 › 浏览器数据迁移」上传到服务器。";
  }
  cache.value[t.id] = cloneDeepTemplate(t);
  summaries.value = [
    {
      id: t.id,
      name: t.name,
      updatedAt: t.updatedAt,
      paperKind: t.paperKind,
      orientation: t.orientation,
    },
    ...summaries.value.filter((x) => x.id !== t.id),
  ];
  goEditor(t.id);
}

onMounted(async () => {
  await load();
  if (mode.value === "thumbs" && !offline.value) await hydrateThumbs();
});
</script>

<style scoped>
.tm {
  padding: 0 4px;
  touch-action: manipulation;
}
.hdr {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.b {
  margin-left: 8px;
  padding: 8px 14px;
  min-height: 44px;
  box-sizing: border-box;
  border-radius: 6px;
  border: 1px solid #d4d4d8;
  background: #fff;
  cursor: pointer;
  touch-action: manipulation;
}
.b.primary {
  background: #4f46e5;
  color: #fff;
  border-color: #4338ca;
}
.msg {
  font-size: 12px;
  color: #b45309;
  margin: 8px 0;
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
  text-align: left;
}
.empty {
  color: #71717a;
  padding: 24px;
  text-align: center;
}
.lnk {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  margin-right: 10px;
  padding: 2px 2px;
  color: #4f46e5;
  cursor: pointer;
  touch-action: manipulation;
}
.lnk.danger {
  color: #b91c1c;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(620px, 1fr));
  gap: 14px;
  margin-top: 16px;
}
.card {
  border: 1px solid #e4e4e7;
  border-radius: 10px;
  padding: 10px;
  background: #fff;
  touch-action: manipulation;
}
.row4 {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  align-items: stretch;
}
@media (max-width: 780px) {
  .row4 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.micro {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: 1px solid #eef0f6;
  border-radius: 8px;
  background: #fcfcfd;
}
.micro-t {
  font-size: 12px;
  font-weight: 600;
  color: #52525b;
}
.micro-body {
  min-height: 156px;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  width: 100%;
}
.micro-body.sig {
  align-items: stretch;
}
.micro-body.bands {
  margin-top: 4px;
}
.b-micro {
  width: 100%;
  min-height: 44px;
  padding: 8px 10px;
  font-size: 11px;
  border-radius: 6px;
  border: 1px solid #c7d2fe;
  background: #eef2ff;
  color: #3730a3;
  cursor: pointer;
  touch-action: manipulation;
}
.b-micro:hover {
  background: #e0e7ff;
}
.foot {
  margin-top: 8px;
  font-size: 12px;
}
.skel {
  min-height: 120px;
  color: #71717a;
  display: flex;
  align-items: center;
  justify-content: center;
}
.page-title {
  font-size: 24px;
  font-weight: 600;
}
</style>
