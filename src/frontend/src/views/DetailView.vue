<script setup lang="ts">
import PageIntro from "../components/PageIntro.vue";
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import TopBar from '../components/TopBar.vue';
import { api } from '../services/api';

const route = useRoute();
const router = useRouter();
const detail = ref<any>(null);
const detailError = ref('');
const stageEnabled = ref<Partial<Record<'preranking' | 'ranking', boolean>>>({});
const detailLoading = ref(true);
const actionPending = ref(false);
const actionMessage = ref('');
const latencyMs = ref<number | null>(null);
const sceneRef = ref('search');
const userIdxRef = ref(0);
const requestIdRef = ref(0);
const noteIdxRef = ref(0);
const queryRef = ref('');
const enterAtMs = ref(0);
const actionState = ref({ like: false, collect: false, comment: false, share: false });
const imageIdx = ref(0);
const fullImage = ref(false);
const brokenImages = ref<Record<number, boolean>>({});
const imageOrientations = ref<Record<number, 'landscape' | 'portrait'>>({});
const DETAIL_SEED_KEY = 'qilin_detail_seed';
const pageTitle = '笔记详情';
const actionLabels = { like: '点赞', collect: '收藏', comment: '评论', share: '分享' } as const;
const copy = {
  noTitle: '\uFF08\u65E0\u6807\u9898\uFF09',
  noImage: '\u6682\u65E0\u56FE\u7247',
  noContent: '\u6682\u65E0\u5185\u5BB9',
  backHome: '\u8FD4\u56DE\u9996\u9875',
  close: '\u5173\u95ED',
  rankNote: '最终位置对应这次首页请求返回的结果顺序。',
};

function stageRank(stage: 'preranking' | 'ranking') {
  if (stageEnabled.value[stage] === false) return '未启用';
  const rank = detail.value?.stage_top500_ranks?.[stage];
  if (!Number.isInteger(Number(rank)) || Number(rank) <= 0) return '暂无记录';
  return stageEnabled.value[stage] === true ? rank : String(rank) + '（状态未确认）';
}

const stageRows = computed(() => [
  { key: 'recall', label: '召回', value: detail.value?.stage_top500_ranks?.recall || '暂无记录' },
  { key: 'preranking', label: '粗排', value: stageRank('preranking') },
  { key: 'ranking', label: '精排', value: stageRank('ranking') },
  { key: 'rerank', label: '最终位置', value: detail.value?.stage_top500_ranks?.rerank || '暂无记录' },
]);

function goHomeKeepFeed() {
  router.push('/?preserve=1');
}

function imageList() {
  return Array.isArray(detail.value?.images) ? detail.value.images : [];
}

function curImage() {
  const arr = imageList();
  if (!arr.length) return '';
  const idx = Math.max(0, Math.min(imageIdx.value, arr.length - 1));
  return arr[idx] || '';
}

const currentImageFrameClass = computed(() => imageOrientations.value[imageIdx.value] || 'landscape');

function hasCurrentImage() {
  return Boolean(curImage()) && !brokenImages.value[imageIdx.value];
}

function currentPlaceholderTags() {
  return Array.isArray(detail.value?.topic_tokens) ? detail.value.topic_tokens.slice(0, 4) : [];
}

function onImgError() {
  brokenImages.value = { ...brokenImages.value, [imageIdx.value]: true };
}

function onImgLoad(event: Event) {
  const img = event.target as HTMLImageElement | null;
  if (!img) return;
  imageOrientations.value = {
    ...imageOrientations.value,
    [imageIdx.value]: img.naturalWidth >= img.naturalHeight ? 'landscape' : 'portrait',
  };
}

function moveImage(step: number) {
  const arr = imageList();
  if (!arr.length) return;
  const n = arr.length;
  imageIdx.value = (imageIdx.value + step + n) % n;
}

function onImageWheel(e: WheelEvent) {
  if (!fullImage.value || imageList().length <= 1) return;
  if (e.deltaY > 0) moveImage(1);
  else if (e.deltaY < 0) moveImage(-1);
}

function openFullImage() {
  if (!hasCurrentImage()) return;
  fullImage.value = true;
}

function closeFullImage() {
  fullImage.value = false;
}

onMounted(async () => {
  const scene = String(route.query.scene || 'search');
  const userIdx = Number(route.query.user_idx || 0);
  const requestId = Number(route.query.request_id || 0);
  const noteIdx = Number(route.query.note_idx || 0);
  const query = String(route.query.query || '');
  const homeRank = Number(route.query.home_rank || 0);
  sceneRef.value = scene;
  userIdxRef.value = userIdx;
  requestIdRef.value = requestId;
  noteIdxRef.value = noteIdx;
  queryRef.value = query;
  enterAtMs.value = Date.now();
  try {
    const raw = sessionStorage.getItem(DETAIL_SEED_KEY);
    if (raw) {
      const seed = JSON.parse(raw);
      if (
        String(seed?.scene || '') === scene
        && Number(seed?.user_idx || -1) === userIdx
        && Number(seed?.request_id || -1) === requestId
        && Number(seed?.note_idx || -1) === noteIdx
        && Date.now() - Number(seed?.savedAt || 0) <= 10 * 60 * 1000
      ) {
        detail.value = seed.detail || null;
        for (const stage of ['preranking', 'ranking'] as const) {
          const enabled = seed.detail?.stage_enabled?.[stage];
          if (typeof enabled === 'boolean') stageEnabled.value[stage] = enabled;
        }
      }
    }
  } catch {
  }
  try {
    const result = await api.note(scene, userIdx, requestId, noteIdx, query);
    if (!result.detail) throw new Error('暂未找到这篇内容。');
    const tags = detail.value?.topic_tokens;
    detail.value = { ...result.detail };
    if (!Array.isArray(detail.value.topic_tokens) && Array.isArray(tags)) detail.value.topic_tokens = tags;
    for (const action of Object.keys(actionLabels) as Array<keyof typeof actionLabels>) {
      const value = result.detail.interaction_state?.[action];
      if (typeof value === 'boolean') actionState.value[action] = value;
    }
    for (const stage of ['preranking', 'ranking'] as const) {
      const enabled = detail.value?.stage_enabled?.[stage];
      if (typeof enabled === 'boolean') stageEnabled.value[stage] = enabled;
    }
    imageIdx.value = 0;
    brokenImages.value = {};
    imageOrientations.value = {};
    fullImage.value = false;
    if (detail.value && homeRank > 0) {
      detail.value.stage_top500_ranks = {
        ...(detail.value.stage_top500_ranks || {}),
        rerank: homeRank,
      };
      detail.value.stage_rank_note ||= copy.rankNote;
    }
    latencyMs.value = result.latency_ms ?? null;
  } catch (error) {
    detailError.value = error instanceof Error ? error.message : '内容加载失败，请返回首页重试。';
  } finally {
    detailLoading.value = false;
  }
});

onUnmounted(async () => {
  try {
    const dwellSec = Math.max(0, (Date.now() - Number(enterAtMs.value || Date.now())) / 1000);
    const hasAction = Object.values(actionState.value).some(Boolean);
    if (!detail.value || (!hasAction && dwellSec < 1)) return;
    await api.engage(
      sceneRef.value,
      Number(userIdxRef.value),
      Number(noteIdxRef.value),
      Number(requestIdRef.value),
      queryRef.value,
      {
        like: actionState.value.like ? 1 : 0,
        collect: actionState.value.collect ? 1 : 0,
        comment: actionState.value.comment ? 1 : 0,
        share: actionState.value.share ? 1 : 0,
        pageTime: dwellSec,
      }
    );
  } catch {
  }
});

async function engage(kind: keyof typeof actionLabels) {
  if (!detail.value || detailLoading.value || actionPending.value) return;
  actionPending.value = true;
  actionMessage.value = '';
  const prev = { ...actionState.value };
  const nextFlag = !prev[kind];
  actionState.value = { ...prev, [kind]: nextFlag };
  const payload = {
    like: actionState.value.like ? 1 : 0,
    collect: actionState.value.collect ? 1 : 0,
    comment: actionState.value.comment ? 1 : 0,
    share: actionState.value.share ? 1 : 0,
    pageTime: 0,
  };
  try {
    const result = await api.engage(
      sceneRef.value,
      Number(userIdxRef.value),
      Number(noteIdxRef.value),
      Number(requestIdRef.value),
      queryRef.value,
      payload,
    );
    if (result?.accepted === false) throw new Error('互动未保存');
    actionMessage.value = nextFlag ? `已记录${actionLabels[kind]}` : `已撤销${actionLabels[kind]}`;
  } catch {
    actionState.value = prev;
    actionMessage.value = '互动记录保存失败，请重试。';
  } finally {
    actionPending.value = false;
  }
}

</script>

<template>
  <TopBar :title="pageTitle" :latency-ms="latencyMs" />
  <main class="container">
    <PageIntro v-if="!detail" title="内容详情" description="阅读内容，查看推荐链路与互动反馈。" />
    <section v-if="!detail" class="panel detail-status" role="status">
      <h3>{{ detailError ? '暂时无法展示内容' : '正在加载内容' }}</h3>
      <p class="meta">{{ detailError || '正在读取笔记与本次请求的排序信息。' }}</p>
      <button v-if="detailError" class="btn" @click="goHomeKeepFeed">返回首页</button>
    </section>
    <template v-if="detail">
    <section class="panel detail-panel detail-panel-hero">
      <div class="detail-toolbar">
        <button class="btn" @click="goHomeKeepFeed">{{ copy.backHome }}</button>
        <div class="meta">{{ sceneRef === 'search' ? '来自搜索' : '来自推荐' }} · 请求 {{ requestIdRef }}</div>
      </div>
      <div class="detail-layout">
        <figure class="detail-media">
      <div class="img-pager" :class="{ 'img-pager-multiple': imageList().length > 1 }">
        <button v-if="imageList().length > 1" class="btn img-nav-btn" aria-label="上一张" @click="moveImage(-1)">‹</button>
        <div class="img-stage-shell">
          <div class="img-stage" :class="currentImageFrameClass" @click="openFullImage"
            :tabindex="hasCurrentImage() ? 0 : undefined" @keydown.enter.self.prevent="openFullImage">
            <img v-if="hasCurrentImage()" :src="api.imageUrl(curImage())" :alt="`笔记图片 ${imageIdx + 1}`" loading="lazy" @error="onImgError" @load="onImgLoad" />
            <div v-else class="media-placeholder detail-placeholder">
              {{ copy.noImage }}
            </div>
          </div>
        </div>
        <button v-if="imageList().length > 1" class="btn img-nav-btn" aria-label="下一张" @click="moveImage(1)">›</button>
      </div>
      <div class="thumb-pages" v-if="imageList().length > 1">
        <button
          v-for="(img, idx) in imageList()"
          :key="`thumb-${img}-${idx}`"
          class="thumb-btn"
          :class="{ active: idx === imageIdx }"
          :aria-label="`查看第 ${Number(idx) + 1} 张图片`"
          :aria-pressed="idx === imageIdx"
          @click="imageIdx = Number(idx)"
        >
          <img :src="api.imageUrl(img)" alt="" loading="lazy" />
        </button>
      </div>
        </figure>
        <div class="detail-copy">
          <h1 class="note-title">{{ detail.title || copy.noTitle }}</h1>
          <ul v-if="currentPlaceholderTags().length" class="note-topics" aria-label="笔记话题">
            <li v-for="tag in currentPlaceholderTags()" :key="tag">#{{ tag }}</li>
          </ul>
          <p class="note-content">{{ detail.content || copy.noContent }}</p>
          <div class="action-row" aria-label="笔记互动">
            <button
              v-for="(label, kind) in actionLabels"
              :key="kind"
              type="button"
              class="action-btn"
              :class="{ active: actionState[kind] }"
              :aria-pressed="actionState[kind]"
              :disabled="detailLoading || actionPending"
              @click="engage(kind)"
            >
              {{ label }}
            </button>
          </div>
          <div class="feedback-row">
            <span class="meta" role="status">{{ actionMessage }}</span>
            <router-link to="/user">查看最近行为 →</router-link>
          </div>
        </div>
      </div>
    </section>
    <section class="panel request-panel" aria-labelledby="request-title">
      <div class="request-heading">
        <h2 id="request-title">本次结果的排序路径</h2>
        <span class="meta">{{ sceneRef === 'search' ? '搜索请求' : '推荐请求' }}<template v-if="queryRef"> · {{ queryRef }}</template></span>
      </div>
      <dl class="rank-path">
        <div v-for="stage in stageRows" :key="stage.key" :class="{ 'rank-final': stage.key === 'rerank' }">
          <dt>{{ stage.label }}</dt>
          <dd>{{ stage.value === '-' ? '暂无记录' : stage.value }}</dd>
        </div>
      </dl>
      <p v-if="detail.stage_rank_note" class="meta rank-note">{{ detail.stage_rank_note }}</p>
    </section>
    </template>
  </main>

  <div v-if="fullImage" class="full-mask" @click.self="closeFullImage" @wheel.prevent="onImageWheel">
    <button class="btn" style="position:absolute;top:16px;right:16px;z-index:2;" @click="closeFullImage">{{ copy.close }}</button>
    <button class="btn img-nav-btn" style="position:absolute;left:16px;top:50%;transform:translateY(-50%);z-index:2;" :disabled="imageList().length<=1" @click="moveImage(-1)"><</button>
    <img v-if="hasCurrentImage()" class="full-img" :src="api.imageUrl(curImage())" :alt="`笔记图片 ${imageIdx + 1}（放大）`" @error="onImgError" />
    <button class="btn img-nav-btn" style="position:absolute;right:16px;top:50%;transform:translateY(-50%);z-index:2;" :disabled="imageList().length<=1" @click="moveImage(1)">></button>
  </div>
</template>

<style scoped>
.detail-toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 7px 12px; margin-bottom: 20px; }
.detail-layout { display: grid; grid-template-columns: minmax(0, 1.22fr) minmax(0, 1fr); align-items: start; gap: 27px; }
.detail-media { min-width: 0; margin: 0; }
.img-pager { display: grid; grid-template-columns: minmax(0, 1fr); gap: 5px; align-items: center; }
.img-pager-multiple { grid-template-columns: auto minmax(0, 1fr) auto; }
.img-nav-btn { width: 33px; min-height: 35px; padding: 0; font-size: 23px; line-height: 1; }
.img-stage-shell { min-width: 0; }
.img-stage { position: relative; width: 100%; height: clamp(190px, 33vw, 465px); background: var(--bg-deep); border-radius: var(--radius-md); overflow: hidden; cursor: zoom-in; }
.img-stage.portrait { height: clamp(230px, 40vw, 510px); }
.img-stage img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
.detail-placeholder { display: grid; width: 100%; height: 100%; place-items: center; color: var(--muted); cursor: default; }
.thumb-pages { display: flex; flex-wrap: wrap; justify-content: center; gap: 5px; margin-top: 8px; }
.thumb-btn { padding: 2px; }
.thumb-btn img { display: block; width: 40px; height: 40px; object-fit: cover; border-radius: 4px; }
.thumb-btn.active { border-color: var(--accent); color: var(--surface); background: var(--accent); }
.full-mask { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; background: var(--media-overlay); }
.full-img { max-width: 92vw; max-height: 92vh; object-fit: contain; }
.note-title { margin: 0; font: 700 clamp(26px,3.1vw,46px)/1.25 var(--title-font); overflow-wrap: anywhere; }
.note-topics { display: flex; flex-wrap: wrap; gap: 5px; margin: 13px 0; padding: 0; list-style: none; }
.note-topics li { padding: 3px 7px; border: 1px solid var(--tag-line); border-radius: 4px; color: var(--tag-text); background: var(--tag-surface); font-size: 11px; }
.note-content { margin: 14px 0 0; white-space: pre-wrap; line-height: 1.9; overflow-wrap: anywhere; color: var(--muted); }
.action-row { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 8px; margin-top: 16px; }
.action-btn { display: inline-flex; justify-content: center; align-items: center; gap: 6px; padding: 9px 5px; }
.action-btn.active { color: var(--accent); background: var(--accent-soft); border-color: var(--accent-line); }
.feedback-row { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: flex-end; gap: 7px 12px; margin-top: 10px; }
.feedback-row .meta { margin-right: auto; }
.feedback-row a { color: var(--accent); font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
.request-heading { display: flex; flex-wrap: wrap; gap: 7px 14px; justify-content: space-between; align-items: baseline; }
.request-heading h2 { margin: 0; font: 700 24px/1.25 var(--title-font); }
.request-heading .meta { overflow-wrap: anywhere; }
.rank-path { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 9px; margin: 13px 0 0; }
.rank-path > div { padding: 12px 14px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--bg); }
.rank-path .rank-final { background: var(--highlight); border-color: var(--accent-line); }
.rank-path dt { color: var(--muted); font-size: 12px; }
.rank-path dd { margin: 4px 0 0; color: var(--accent); font-size: 16px; font-weight: 650; overflow-wrap: anywhere; }
.rank-note { margin: 10px 0 0; }
@media (max-width: 800px) {
  .detail-layout { grid-template-columns: 1fr; gap: 15px; }
}
@media (max-width: 480px) {
  .action-row, .rank-path { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .img-nav-btn { width: 28px; }
}
</style>
