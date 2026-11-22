<script setup lang="ts">
import PageIntro from "../components/PageIntro.vue";
import { computed, onMounted, onUnmounted, ref } from 'vue';
import TopBar from '../components/TopBar.vue';
import { api, getUserId } from '../services/api';

const userByScene = ref<Record<string, any>>({});
const loading = ref(false);
const errorMsg = ref('');
const latencyMs = ref<number | null>(null);
const detailModal = ref<any>(null);
const detailLoading = ref(false);
const detailError = ref('');
const deletingBatch = ref(false);
const selectedBehaviorKeys = ref<string[]>([]);
const menuVisible = ref(false);
const menuRow = ref<any>(null);
const menuX = ref(0);
const menuY = ref(0);
const pageTitle = '拾页 \u6700\u8FD1\u884C\u4E3A';
const copy = {
  noTitle: '\uFF08\u65E0\u6807\u9898\uFF09',
  needLogin: '\u5F53\u524D\u672A\u767B\u5F55\u7528\u6237\uFF0C\u65E0\u6CD5\u67E5\u770B\u6700\u8FD1\u884C\u4E3A',
  noBehavior: '\u672A\u83B7\u53D6\u5230\u8BE5\u7528\u6237\u7684\u6700\u8FD1\u884C\u4E3A',
  loadError: '\u52A0\u8F7D\u6700\u8FD1\u884C\u4E3A\u5931\u8D25',
  detailError: '\u52A0\u8F7D\u5E16\u5B50\u8BE6\u60C5\u5931\u8D25',
  deleteError: '\u5220\u9664\u884C\u4E3A\u5931\u8D25',
  batchDelete: '\u6279\u91CF\u5220\u9664',
  cancelSelect: '\u53D6\u6D88\u52FE\u9009',
  selectAll: '\u5168\u9009',
  loading: '\u52A0\u8F7D\u4E2D...',
};

const interactionLabels = [
  ['like', '点赞'], ['collect', '收藏'], ['comment', '评论'], ['share', '分享'],
] as const;

function describeInteraction(row: any) {
  const labels = interactionLabels.filter(([key]) => Number(row[key]) > 0).map(([, label]) => label);
  if (labels.length) return labels.join(' · ');
  if (row.action === 'training_history') return '历史浏览';
  return Number(row.click) > 0 || row.action === 'click' ? '打开笔记' : '浏览';
}

function fmt(v: any) {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(4);
  if (v == null || v === '') return '-';
  return String(v);
}

function fmtTitle(v: any) {
  if (v == null) return copy.noTitle;
  const s = String(v).trim();
  if (!s) return copy.noTitle;
  const sl = s.toLowerCase();
  if (sl === 'nan' || sl === 'none' || sl === 'null' || sl === 'undefined') return copy.noTitle;
  return s;
}

function fmtTime(ts: any) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return '-';
  const ms = n > 1e12 ? n : n * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '-';
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function collapseBehaviorRows(rows: any[]) {
  const merged = new Map<string, any>();
  for (const row of rows || []) {
    const key = [
      String(row?.scene || ''),
      String(row?.request_id || ''),
      String(row?.note_idx || ''),
      String(row?.query || ''),
    ].join('|');
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, row);
      continue;
    }
    const prevScore = Number(prev?.interaction_score || 0);
    const nextScore = Number(row?.interaction_score || 0);
    const prevTs = Number(prev?.ts || 0);
    const nextTs = Number(row?.ts || 0);
    if (nextScore > prevScore || (nextScore === prevScore && nextTs >= prevTs)) {
      merged.set(key, { ...prev, ...row, interaction_score: Math.max(prevScore, nextScore) });
    }
  }
  return Array.from(merged.values()).sort((a, b) => Number(b?.ts || 0) - Number(a?.ts || 0)).slice(0, 40);
}

function behaviorRowKey(row: any) {
  return [
    String(row?.scene || ''),
    String(row?.request_id || ''),
    String(row?.note_idx || ''),
    String(row?.ts || ''),
    String(row?.query || ''),
  ].join('|');
}

async function load() {
  const uid = getUserId();
  if (uid == null) {
    errorMsg.value = copy.needLogin;
    return;
  }
  loading.value = true;
  errorMsg.value = '';
  try {
    const [resSearch, resRec] = await Promise.allSettled([
      api.user('search', uid),
      api.user('rec', uid),
    ]);
    const nextByScene: Record<string, any> = {};
    let totalLatency = 0;
    if (resSearch.status === 'fulfilled' && resSearch.value?.user) {
      nextByScene.search = resSearch.value.user;
      totalLatency += Number(resSearch.value?.latency_ms || 0);
    }
    if (resRec.status === 'fulfilled' && resRec.value?.user) {
      nextByScene.rec = resRec.value.user;
      totalLatency += Number(resRec.value?.latency_ms || 0);
    }
    userByScene.value = nextByScene;
    latencyMs.value = totalLatency;
    selectedBehaviorKeys.value = [];
    if (!Object.keys(nextByScene).length) {
      errorMsg.value = copy.noBehavior;
    }
  } catch (e: any) {
    userByScene.value = {};
    errorMsg.value = e?.message || copy.loadError;
  } finally {
    loading.value = false;
  }
}

const mergedBehaviorList = computed(() => {
  const s = Array.isArray(userByScene.value.search?.recent_behaviors) ? userByScene.value.search.recent_behaviors : [];
  const r = Array.isArray(userByScene.value.rec?.recent_behaviors) ? userByScene.value.rec.recent_behaviors : [];
  return collapseBehaviorRows([...s, ...r]);
});
const userFeatures = computed(() => (userByScene.value.search || userByScene.value.rec)?.features || {});
const profileFields = [
  ['gender', '性别'], ['age', '年龄'], ['platform', '平台'], ['location', '地区'],
] as const;
const visibleFields = computed(() => profileFields.filter(([key]) => userFeatures.value[key] != null && fmt(userFeatures.value[key]) !== '-'));

const selectedBehaviorSet = computed(() => new Set(selectedBehaviorKeys.value));
const selectedBehaviorRows = computed(() =>
  mergedBehaviorList.value.filter((row) => selectedBehaviorSet.value.has(behaviorRowKey(row)))
);
const allSelected = computed(() =>
  mergedBehaviorList.value.length > 0
  && selectedBehaviorRows.value.length === mergedBehaviorList.value.length
);

async function openBehavior(row: any) {
  const uid = getUserId();
  if (uid == null) return;
  detailModal.value = null;
  detailError.value = '';
  detailLoading.value = true;
  try {
    const res = await api.note(
      String(row?.scene || 'search'),
      uid,
      Number(row?.request_id || 0),
      Number(row?.note_idx || 0),
      String(row?.query || ''),
    );
    detailModal.value = res?.detail || null;
  } catch (e: any) {
    detailError.value = e?.message || copy.detailError;
  } finally {
    detailLoading.value = false;
  }
}

async function removeBehavior(row: any) {
  const uid = getUserId();
  if (uid == null) return;
  try {
    await api.deleteBehavior(
      String(row?.scene || 'search'),
      uid,
      Number(row?.note_idx || 0),
      Number(row?.ts || 0),
      Number(row?.request_id || 0),
    );
    await load();
  } catch (e: any) {
    errorMsg.value = e?.message || copy.deleteError;
  }
}

function isSelected(row: any) {
  return selectedBehaviorSet.value.has(behaviorRowKey(row));
}

function toggleSelect(row: any) {
  const key = behaviorRowKey(row);
  if (selectedBehaviorSet.value.has(key)) {
    selectedBehaviorKeys.value = selectedBehaviorKeys.value.filter((x) => x !== key);
    return;
  }
  selectedBehaviorKeys.value = [...selectedBehaviorKeys.value, key];
}

function toggleSelectAll() {
  if (allSelected.value) {
    selectedBehaviorKeys.value = [];
    return;
  }
  selectedBehaviorKeys.value = mergedBehaviorList.value.map((row) => behaviorRowKey(row));
}

async function removeSelectedBehaviors() {
  const uid = getUserId();
  if (uid == null || !selectedBehaviorRows.value.length || deletingBatch.value) return;
  deletingBatch.value = true;
  errorMsg.value = '';
  try {
    await api.deleteBehaviorsBatch(
      uid,
      selectedBehaviorRows.value.map((row) => ({
        scene: String(row?.scene || 'search'),
        note_idx: Number(row?.note_idx || 0),
        ts: Number(row?.ts || 0),
        request_id: Number(row?.request_id || 0),
      })),
    );
    selectedBehaviorKeys.value = [];
    await load();
  } catch (e: any) {
    errorMsg.value = e?.message || copy.deleteError;
  } finally {
    deletingBatch.value = false;
  }
}

function closeDetail() {
  detailModal.value = null;
  detailError.value = '';
}

function openContextMenu(event: MouseEvent, row: any) {
  event.preventDefault();
  menuVisible.value = true;
  menuRow.value = row;
  menuX.value = event.clientX;
  menuY.value = event.clientY;
}

function closeContextMenu() {
  menuVisible.value = false;
  menuRow.value = null;
}

async function confirmDelete() {
  const row = menuRow.value;
  closeContextMenu();
  if (!row) return;
  await removeBehavior(row);
}

function onWindowClick() {
  closeContextMenu();
}

function onWindowKey(event: KeyboardEvent) {
  if (event.key === 'Escape') closeContextMenu();
}

onMounted(() => {
  load();
  window.addEventListener('click', onWindowClick);
  window.addEventListener('keydown', onWindowKey);
});

onUnmounted(() => {
  window.removeEventListener('click', onWindowClick);
  window.removeEventListener('keydown', onWindowKey);
});
</script>

<template>
  <TopBar :title="pageTitle" :latency-ms="latencyMs" />
  <main class="container">
    <PageIntro title="最近行为" description="查看通过搜索或推荐打开的笔记，以及已记录的互动。" />
    <section class="profile-summary">
      <strong>用户 {{ getUserId() ?? '—' }}</strong>
      <span v-if="loading" role="status">正在读取行为…</span>
    </section>

    <section v-if="errorMsg" class="panel shell-panel">{{ errorMsg }}</section>

    <template v-else-if="Object.keys(userByScene).length">
      <section v-if="visibleFields.length" class="panel shell-panel">
        <div class="profile-panel-heading">
          <h2>用户资料</h2>
        </div>
        <dl class="profile-fields">
          <div v-for="[key, label] in visibleFields" :key="key"><dt>{{ label }}</dt><dd>{{ fmt(userFeatures[key]) }}</dd></div>
        </dl>
      </section>

      <section class="panel shell-panel">
        <div class="behavior-toolbar">
          <h2>互动记录</h2>
          <div v-if="mergedBehaviorList.length" class="behavior-actions">
            <button class="btn btn-light" type="button" @click="toggleSelectAll">
              {{ allSelected ? copy.cancelSelect : copy.selectAll }}
            </button>
            <button
              class="btn-danger"
              type="button"
              :disabled="!selectedBehaviorRows.length || deletingBatch"
              @click="removeSelectedBehaviors"
            >
              {{ deletingBatch ? copy.loading : copy.batchDelete }}
            </button>
          </div>
        </div>
        <p v-if="!mergedBehaviorList.length" class="meta empty-history">还没有行为记录。<router-link to="/">发现笔记 →</router-link></p>
        <div v-else class="data-table-scroll behavior-table" aria-label="最近行为记录">
        <table class="table">
          <thead>
            <tr>
              <th scope="col">选</th>
              <th scope="col">笔记</th>
              <th scope="col">互动</th>
              <th scope="col" class="score-column">互动分</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, idx) in mergedBehaviorList"
              :key="`${row.scene}-${row.request_id}-${row.note_idx}-${idx}`"
              class="behavior-row"
              :class="{ selected: isSelected(row) }"
              @click="openBehavior(row)"
              @contextmenu="openContextMenu($event, row)"
            >
              <td @click.stop>
                <input
                  class="behavior-checkbox"
                  :aria-label="`选择行为 ${row.note_idx}`"
                  type="checkbox"
                  :checked="isSelected(row)"
                  @change="toggleSelect(row)"
                />
              </td>
              <td>
                <button type="button" class="history-note" @click.stop="openBehavior(row)">{{ fmtTitle(row.title) }}</button>
                <div class="history-source">
                  <span class="scene-pill" :class="row.scene === 'search' ? 'scene-search' : 'scene-rec'">{{ row.scene === 'search' ? '搜索' : '推荐' }}</span>
                  <span v-if="row.query" class="meta">{{ row.query }}</span>
                </div>
              </td>
              <td>
                <div>{{ describeInteraction(row) }}</div>
                <div class="meta">{{ fmtTime(row.ts) }}</div>
              </td>
              <td class="score-column">{{ fmt(row.interaction_score) }}</td>
            </tr>
          </tbody>
        </table>
        </div>
      </section>
    </template>

    <section v-else-if="!loading" class="panel shell-panel empty-state">
      <div class="meta">&#x6682;&#x65E0;&#x53EF;&#x5C55;&#x793A;&#x7684;&#x7528;&#x6237;&#x4FE1;&#x606F;</div>
    </section>
  </main>

  <div v-if="detailModal || detailLoading || detailError" class="detail-mask" @click.self="closeDetail">
    <div class="detail-modal">
      <div class="detail-head">
        <div>
          <div class="meta">&#x5E16;&#x5B50;&#x8BE6;&#x60C5;</div>
          <h3>{{ detailModal?.title || copy.noTitle }}</h3>
        </div>
        <button class="btn" @click="closeDetail">&#x5173;&#x95ED;</button>
      </div>
      <div v-if="detailLoading" class="meta">{{ copy.loading }}</div>
      <div v-else-if="detailError" class="meta">{{ detailError }}</div>
      <template v-else-if="detailModal">
        <img
          v-if="Array.isArray(detailModal.images) && detailModal.images.length"
          class="detail-cover"
          :src="api.imageUrl(detailModal.images[0])"
          alt="detail"
        />
        <div class="detail-content">{{ detailModal.content || '暂无内容' }}</div>
      </template>
    </div>
  </div>

  <div
    v-if="menuVisible && menuRow"
    class="context-menu"
    :style="{ left: `${menuX}px`, top: `${menuY}px` }"
    @click.stop
  >
    <div class="context-menu-head">&#x5220;&#x9664;&#x884C;&#x4E3A;</div>
    <div class="context-menu-note">scene={{ String(menuRow.scene || '-').toUpperCase() }} · note={{ fmt(menuRow.note_idx) }}</div>
    <button class="btn-danger" @click="confirmDelete">&#x786E;&#x8BA4;&#x5220;&#x9664;</button>
  </div>
</template>

<style scoped>
.shell-panel { background: var(--surface); border-color: var(--line); box-shadow: var(--shadow-md); }

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
}

.behavior-row {
  cursor: pointer;
}

.behavior-row.selected {
  background: var(--accent-soft);
}

.behavior-row:hover {
  background: var(--accent-soft);
}

.behavior-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.behavior-toolbar h2 { margin: 0; font: 700 23px/1.3 var(--title-font); }
.empty-history { margin: 12px 0 0; }
.empty-history a { color: var(--accent); text-decoration: underline; }

.behavior-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.behavior-checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
  cursor: pointer;
}

.btn-light {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--line);
}

.btn-danger:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}

.context-menu {
  position: fixed;
  z-index: 50;
  width: 220px;
  padding: 12px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--line);
  background: var(--surface);
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(18px);
}

.context-menu-head {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 6px;
}

.context-menu-note {
  margin-bottom: 10px;
  color: var(--muted);
  font-size: 12px;
}

.scene-pill {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.scene-search {
  background: var(--tag-surface);
  color: var(--tag-text);
}

.scene-rec {
  background: var(--gold-soft);
  color: var(--accent-gold);
}

.detail-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: var(--overlay);
  backdrop-filter: blur(8px);
}

.detail-modal {
  width: min(760px, 100%);
  max-height: min(88vh, 920px);
  overflow: auto;
  padding: 18px;
  border-radius: var(--radius-xl);
  background: var(--surface);
  box-shadow: var(--shadow-lg);
}

.detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.detail-head h3 {
  margin: 4px 0 0;
  font-size: 26px;
  letter-spacing: -0.03em;
}

.detail-cover {
  width: 100%;
  border-radius: var(--radius-lg);
  margin-bottom: 12px;
}

.detail-content {
  line-height: 1.75;
  white-space: pre-wrap;
}

.profile-summary { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 18px; margin-bottom: 16px; padding: 13px 16px; border: 1px solid var(--accent-line); border-radius: var(--radius-lg); background: var(--highlight); }
.profile-summary span { font-size: 12px; color: var(--muted); }
.profile-panel-heading { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 5px 12px; margin-bottom: 13px; }
.profile-panel-heading h2 { margin: 0; font: 700 23px/1.3 var(--title-font); }
.profile-fields { display: grid; grid-template-columns: repeat(auto-fit,minmax(105px,1fr)); gap: 7px; margin: 0; }
.profile-fields div { min-width: 0; padding: 11px 9px; border-radius: var(--radius-md); background: var(--bg); }
.profile-fields dt { color: var(--muted); font-size: 12px; }
.profile-fields dd { margin: 4px 0 0; font-weight: 600; overflow-wrap: anywhere; }
.behavior-table th, .behavior-table td { padding: 10px; }
.behavior-table th { color: var(--muted); background: var(--bg); font-size: 12px; }
.behavior-table th:first-child { width: 36px; }
.behavior-table th:nth-child(2) { width: 55%; }
.behavior-table .behavior-row { background: var(--surface); color: var(--text); font-size: 13px; }
.behavior-table .behavior-row:hover, .behavior-table .behavior-row.selected { background: var(--accent-soft); }
.history-note { padding: 0; border: 0; background: transparent; font-weight: 600; text-align: left; overflow-wrap: anywhere; }
.history-note:hover { color: var(--accent); background: transparent; text-decoration: underline; }
.history-source { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; margin-top: 4px; overflow-wrap: anywhere; }
@media (max-width: 540px) {
  .behavior-table .score-column { display: none; }
  .behavior-table th, .behavior-table td { padding: 8px 5px; }
}
</style>
