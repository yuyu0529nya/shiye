<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, getUserId, isDemoMode, type DiscoveryTopic } from '../services/api';
import TopBar from '../components/TopBar.vue';

const router = useRouter();
const route = useRoute();
const query = ref('');
const submittedQuery = ref('');
const searchInput = ref<HTMLInputElement | null>(null);
const items = ref<any[]>([]);
const backendPage = ref(1);
const preloadBuffer = ref<any[]>([]);
const hasMore = ref(false);
const resultTotal = ref<number | null>(null);
const feedSessionKey = ref('');
const currentScene = ref<'search' | 'rec'>('rec');
const loading = ref(false);
const errorMsg = ref('');
const recExhausted = ref(false);
const featuredTopics = ref<DiscoveryTopic[]>([]);
const heroCover = ref('');
const expandedTopics = ref(false);
const galleryOnly = ref(false);
const recentSearches = ref<string[]>([]);
const latencyMs = ref<number | null>(null);
const stageMs = ref<Record<string, number> | null>(null);
const loadAnchor = ref<HTMLElement | null>(null);
const suggestItems = ref<Array<{ text: string; hint: string }>>([]);
const suggestOpen = ref(false);
const suggestTimer = ref<number | null>(null);
const refreshSeenNoteIds = ref<number[]>([]);
const feedExclusions = ref<number[]>([]);
const brokenImages = ref<Record<string, boolean>>({});
let observer: IntersectionObserver | null = null;
const HOME_CACHE_KEY = isDemoMode ? 'qilin_demo_home_cache_v2' : 'qilin_home_cache_v3';
const DETAIL_SEED_KEY = 'qilin_detail_seed';
const loadError = '暂时无法读取笔记，请重试。';
const pageSize = 20;

const uid = getUserId();
if (uid == null) router.replace('/login');

const historyKey = `shiye-${isDemoMode ? 'demo' : 'live'}-searches-${uid}`;
try {
  const stored: unknown = JSON.parse(localStorage.getItem(historyKey) || '[]');
  if (Array.isArray(stored)) recentSearches.value = stored.filter((s): s is string => typeof s === 'string' && !!s.trim()).slice(0, 6);
} catch { /* Search also works when storage is unavailable. */ }

function setRecentSearches(terms: string[]) {
  recentSearches.value = terms;
  try { localStorage.setItem(historyKey, JSON.stringify(terms)); } catch { /* Keep in-memory history. */ }
}

function cardKey(it: any) {
  return `${it?.request_id ?? 0}-${it?.note_idx ?? 0}`;
}

function titleTags(it: any) {
  return Array.isArray(it?.topic_tokens) ? it.topic_tokens.slice(0, 3) : [];
}

function hasCover(it: any) {
  const key = cardKey(it);
  return Boolean(it?.cover_image) && !brokenImages.value[key];
}

function markImageBroken(it: any) {
  brokenImages.value = { ...brokenImages.value, [cardKey(it)]: true };
}

function feedItems(feed: any): any[] {
  if (!Array.isArray(feed?.items)) return [];
  const stageEnabled = {
    preranking: typeof feed?.stages?.preranking?.enabled === 'boolean' ? feed.stages.preranking.enabled : undefined,
    ranking: typeof feed?.stages?.ranking?.enabled === 'boolean' ? feed.stages.ranking.enabled : undefined,
  };
  return feed.items.map((item: any) => ({ ...item, stage_enabled: stageEnabled }));
}

function saveHomeCache() {
  try {
    sessionStorage.setItem(
      HOME_CACHE_KEY,
      JSON.stringify({
        uid,
        query: submittedQuery.value,
        galleryOnly: galleryOnly.value,
        items: items.value,
        preloadBuffer: preloadBuffer.value,
        hasMore: hasMore.value,
        resultTotal: resultTotal.value,
        backendPage: backendPage.value,
        feedSessionKey: feedSessionKey.value,
        currentScene: currentScene.value,
        latencyMs: latencyMs.value,
        stageMs: stageMs.value,
        refreshSeenNoteIds: refreshSeenNoteIds.value,
        recExhausted: recExhausted.value,
        feedExclusions: feedExclusions.value,
        savedAt: Date.now(),
      })
    );
  } catch {
  }
}

function restoreHomeCache(): boolean {
  try {
    const raw = sessionStorage.getItem(HOME_CACHE_KEY);
    if (!raw) return false;
    const obj = JSON.parse(raw);
    if (!obj || Number(obj.uid) !== Number(uid)) return false;
    if (Date.now() - Number(obj.savedAt || 0) > 30 * 60 * 1000) return false;
    query.value = String(obj.query || '');
    submittedQuery.value = query.value;
    galleryOnly.value = isDemoMode && !!obj.galleryOnly;
    items.value = Array.isArray(obj.items) ? obj.items : [];
    preloadBuffer.value = Array.isArray(obj.preloadBuffer) ? obj.preloadBuffer : [];
    hasMore.value = typeof obj.hasMore === 'boolean' ? obj.hasMore : items.value.length >= 15;
    resultTotal.value = typeof obj.resultTotal === 'number' ? obj.resultTotal : null;
    backendPage.value = Math.max(1, Number(obj.backendPage || 1));
    feedSessionKey.value = String(obj.feedSessionKey || '');
    currentScene.value = (obj.currentScene === 'search' ? 'search' : 'rec');
    latencyMs.value = typeof obj.latencyMs === 'number' ? obj.latencyMs : null;
    stageMs.value = (obj.stageMs && typeof obj.stageMs === 'object') ? obj.stageMs : null;
    refreshSeenNoteIds.value = Array.isArray(obj.refreshSeenNoteIds) ? obj.refreshSeenNoteIds : [];
    recExhausted.value = obj.recExhausted === true;
    feedExclusions.value = Array.isArray(obj.feedExclusions) ? obj.feedExclusions : [];
    brokenImages.value = {};
    return items.value.length > 0;
  } catch {
    return false;
  }
}

function collectShownNoteIds(limit = 1200) {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const row of items.value) {
    const nid = Number(row?.note_idx);
    if (!Number.isFinite(nid) || seen.has(nid)) continue;
    seen.add(nid);
    out.push(nid);
    if (out.length >= limit) break;
  }
  return out;
}

function mergeRefreshExclusions(nextIds: number[]) {
  const merged = Array.from(new Set([...refreshSeenNoteIds.value, ...nextIds.filter((x) => Number.isFinite(x) && x >= 0)]));
  refreshSeenNoteIds.value = merged.slice(-1600);
  return refreshSeenNoteIds.value;
}

function applyFeedStatus(feed: any, responseLatency: unknown, page: number, count: number) {
  const latency = feed?.latency_ms ?? responseLatency;
  latencyMs.value = typeof latency === 'number' ? latency : null;
  stageMs.value = feed?.stage_ms && typeof feed.stage_ms === 'object' ? feed.stage_ms : null;
  resultTotal.value = Number.isInteger(feed?.total) && feed.total >= 0 ? feed.total : null;
  const size = Number(feed?.page_size) || pageSize;
  hasMore.value = count > 0 && (resultTotal.value == null ? count >= size : page * size < resultTotal.value);
}

async function load(reset = false) {
  if (uid == null || loading.value) return;
  loading.value = true;
  errorMsg.value = '';
  if (reset) {
    recExhausted.value = false;
    submittedQuery.value = query.value.trim();
    currentScene.value = submittedQuery.value ? 'search' : 'rec';
    backendPage.value = 1;
    items.value = [];
    preloadBuffer.value = [];
    hasMore.value = false;
    resultTotal.value = null;
    brokenImages.value = {};
    feedExclusions.value = [];
    feedSessionKey.value = currentScene.value === 'rec' ? `rec-${Date.now()}` : '';
  }
  try {
    const reqPage = backendPage.value;
    const r = await api.feed(currentScene.value, uid, submittedQuery.value, reqPage, pageSize, feedSessionKey.value, feedExclusions.value, galleryOnly.value);
    const f = r.feed;
    const batch = feedItems(f);
    applyFeedStatus(f, r.latency_ms, reqPage, batch.length);
    const seen = new Set(items.value.map((x) => Number(x.note_idx)));
    const unique = batch.filter((x: any) => {
      const nid = Number(x?.note_idx);
      if (!Number.isFinite(nid) || seen.has(nid)) return false;
      seen.add(nid);
      return true;
    });
    const head = unique.slice(0, 15);
    const tail = unique.slice(15, 20);
    items.value.push(...head);
    preloadBuffer.value.push(...tail);
    backendPage.value += 1;
  } catch (e: any) {
    errorMsg.value = e?.message || loadError;
  } finally {
    loading.value = false;
    saveHomeCache();
  }
}

async function refreshRec() {
  if (loading.value || currentScene.value !== 'rec' || uid == null) return;
  if (recExhausted.value) {
    await returnToRecommendationHome();
    return;
  }
  const excludeIds = mergeRefreshExclusions(collectShownNoteIds());
  loading.value = true;
  errorMsg.value = '';
  try {
    const nextRefreshKey = `rec-${Date.now()}`;
    const r = await api.feed('rec', uid, '', 1, pageSize, nextRefreshKey, excludeIds);
    const f = r.feed || {};
    const batch = feedItems(f);
    if (!batch.length && items.value.length) {
      recExhausted.value = true;
      return;
    }
    applyFeedStatus(f, r.latency_ms, 1, batch.length);
    brokenImages.value = {};
    items.value = batch.slice(0, 15);
    preloadBuffer.value = batch.slice(15);
    feedSessionKey.value = String(f.feed_session_key || nextRefreshKey);
    feedExclusions.value = excludeIds;
    backendPage.value = 2;
  } catch (e: any) {
    errorMsg.value = e?.message || loadError;
  } finally {
    loading.value = false;
    saveHomeCache();
  }
}

async function returnToRecommendationHome() {
  if (loading.value) return;
  query.value = '';
  galleryOnly.value = false;
  refreshSeenNoteIds.value = [];
  await load(true);
}

async function consumeMore() {
  if (loading.value) return;
  if (preloadBuffer.value.length > 0) {
    items.value.push(...preloadBuffer.value.splice(0, 15));
    saveHomeCache();
    return;
  }
  if (hasMore.value) await load(false);
}

async function loadSuggest() {
  const q = query.value.trim();
  if (!q) {
    suggestItems.value = [];
    suggestOpen.value = false;
    return;
  }
  try {
    const res = await api.suggest('search', q, 8);
    if (query.value.trim() !== q || document.activeElement !== searchInput.value) return;
    suggestItems.value = Array.isArray(res?.items)
      ? res.items
          .map((item: any) => {
            if (typeof item === 'string') {
              return { text: item, hint: item === q ? '当前输入' : '猜你想搜' };
            }
            return {
              text: String(item?.text || ''),
              hint: String(item?.hint || (item?.source || '猜你想搜')),
            };
          })
          .filter((item: any) => item.text)
      : [];
    suggestOpen.value = suggestItems.value.length > 0;
  } catch {
    if (query.value.trim() !== q) return;
    suggestItems.value = [];
    suggestOpen.value = false;
  }
}

function submitSearch(text = query.value) {
  const term = text.trim();
  if (!term || loading.value) return;
  galleryOnly.value = false;
  setRecentSearches([term, ...recentSearches.value.filter(old => old.toLowerCase() !== term.toLowerCase())].slice(0, 6));
  query.value = term;
  searchInput.value?.blur();
  suggestOpen.value = false;
  load(true);
}

function setGalleryFilter(enabled: boolean) {
  if (loading.value || galleryOnly.value === enabled) return;
  galleryOnly.value = enabled;
  query.value = submittedQuery.value;
  load(true);
}

function closeSuggest(event: FocusEvent) {
  if (event.relatedTarget instanceof Node && (event.currentTarget as HTMLElement).contains(event.relatedTarget)) return;
  suggestOpen.value = false;
}

watch(query, () => {
  suggestItems.value = [];
  suggestOpen.value = false;
  if (suggestTimer.value != null) {
    window.clearTimeout(suggestTimer.value);
  }
  suggestTimer.value = window.setTimeout(() => {
    loadSuggest();
  }, 140);
});

async function openDetail(it: any) {
  saveHomeCache();
  try {
    if (uid != null) {
      void api.click(
        String(it?.scene || currentScene.value || 'rec'),
        Number(uid),
        Number(it?.note_idx || 0),
        Number(it?.request_id || 0),
        submittedQuery.value,
      ).catch(() => {});
    }
  } catch {
  }
  try {
    sessionStorage.setItem(
      DETAIL_SEED_KEY,
      JSON.stringify({
        scene: it.scene,
        user_idx: it.user_idx,
        request_id: it.request_id,
        note_idx: it.note_idx,
        query: submittedQuery.value,
        detail: {
          title: it.title || '',
          content: it.content || '',
          cover_image: it.cover_image || '',
          images: it.images?.length ? it.images : it.cover_image ? [it.cover_image] : [],
          scene: it.scene,
          request_id: it.request_id,
          note_idx: it.note_idx,
          accum_like_num: Number(it.accum_like_num || 0),
          accum_collect_num: Number(it.accum_collect_num || 0),
          accum_comment_num: Number(it.accum_comment_num || 0),
          accum_share_num: Number(it.accum_share_num || 0),
          stats_available: it.stats_available,
          stage_enabled: it.stage_enabled,
          stage_top500_ranks: {
            recall: Number(it?.stage_ranks?.recall || 0) || '-',
            preranking: Number(it?.stage_ranks?.preranking || 0) || '-',
            ranking: Number(it?.stage_ranks?.ranking || 0) || '-',
            rerank: Number((it?.stage_ranks?.rerank ?? it?.stage_ranks?.ranking ?? 0)) || '-',
          },
          topic_tokens: Array.isArray(it?.topic_tokens) ? it.topic_tokens : [],
        },
        savedAt: Date.now(),
      })
    );
  } catch {
  }
  const homeRank = Number(it?.stage_ranks?.rerank ?? it?.stage_ranks?.ranking ?? 0);
  const rankArg = Number.isFinite(homeRank) && homeRank > 0 ? `&home_rank=${homeRank}` : '';
  router.push(`/detail?scene=${it.scene}&user_idx=${it.user_idx}&request_id=${it.request_id}&note_idx=${it.note_idx}&query=${encodeURIComponent(submittedQuery.value)}${rankArg}`);
}

onMounted(async () => {
  if (isDemoMode) {
    void api.demoTopics().then(({ topics, hero_cover }) => {
      featuredTopics.value = topics;
      heroCover.value = hero_cover || '';
    }).catch(() => {});
  }
  if (route.query.refresh) {
    await consumeHomeRefresh();
  } else if (!restoreHomeCache()) {
    await load(true);
  }
  await nextTick();
  if (loadAnchor.value) {
    observer = new IntersectionObserver(async (entries) => {
      const hit = entries.some((x) => x.isIntersecting);
      if (hit) await consumeMore();
    }, { threshold: 0.1 });
    observer.observe(loadAnchor.value);
  }
});

onUnmounted(() => {
  if (suggestTimer.value != null) {
    window.clearTimeout(suggestTimer.value);
  }
  if (observer) {
    observer.disconnect();
    observer = null;
  }
});

async function consumeHomeRefresh() {
  const { refresh, ...otherParams } = route.query;
  await router.replace({ path: route.path, query: otherParams, hash: route.hash });
  await returnToRecommendationHome();
}

watch(
  () => route.query.refresh,
  async (val, prev) => {
    if (val && val !== prev) {
      await consumeHomeRefresh();
    }
  }
);
</script>

<template>
  <TopBar :title="submittedQuery ? '搜索' : '个性化推荐'" :latency-ms="latencyMs" :stage-ms="stageMs" @home="returnToRecommendationHome" />
  <main class="container discovery-page">
    <section class="discovery-hero" aria-labelledby="discovery-title">
      <img v-if="heroCover" :src="api.imageUrl(heroCover)" alt="" class="hero-photo" @error="heroCover = ''" />
      <div class="hero-shade" aria-hidden="true"></div>
      <div class="hero-copy">
        <h1 id="discovery-title">发现笔记</h1>
      </div>
      <form class="home-search-row" role="search" @submit.prevent="submitSearch()">
        <div class="search-shell" @focusout="closeSuggest" @keydown.esc="suggestOpen = false">
          <input
            ref="searchInput"
            v-model="query"
            class="search-input"
            type="search"
            required
            autocomplete="off"
            aria-label="搜索内容"
            placeholder="搜索标题、内容或话题"
            @focus="loadSuggest"
          />
          <div v-if="suggestOpen && suggestItems.length" class="suggest-panel">
            <button
              v-for="item in suggestItems"
              :key="item.text"
              class="suggest-item"
              type="button"
              @mousedown.prevent
              @click="submitSearch(item.text)"
            >
              <span>{{ item.text }}</span>
              <span class="suggest-item-meta">{{ item.hint }}</span>
            </button>
          </div>
        </div>
        <button class="btn-primary" type="submit" :disabled="loading">搜索</button>
      </form>
      <div v-if="recentSearches.length" class="history-strip" aria-label="最近搜索">
        <span>最近搜过</span>
        <button v-for="term in recentSearches.slice(0, 3)" :key="term" type="button" :title="term" :disabled="loading" @click="submitSearch(term)">{{ term }}</button>
        <button class="clear-history" type="button" aria-label="清除搜索历史" @click="setRecentSearches([])">清除</button>
      </div>
      <button v-if="heroCover" class="hero-link" type="button" :disabled="loading" @click="submitSearch('雪山')">探索雪山笔记 ↗</button>
    </section>

    <section v-if="featuredTopics.length" class="topic-section" aria-labelledby="topic-title">
      <div class="topic-heading">
        <h2 id="topic-title">按话题浏览</h2>
        <button v-if="featuredTopics.length > 4" class="all-topics" type="button" :aria-expanded="expandedTopics" aria-controls="topic-list" @click="expandedTopics = !expandedTopics">{{ expandedTopics ? '收起话题' : '全部话题' }} <span aria-hidden="true">{{ expandedTopics ? '↑' : '↓' }}</span></button>
      </div>
      <div id="topic-list" class="topic-list" :class="{ expanded: expandedTopics }">
        <button
          v-for="topic in featuredTopics"
          :key="topic.label"
          type="button"
          :aria-pressed="submittedQuery === topic.label"
          :disabled="loading"
          @click="submitSearch(topic.label)"
        >
          <img v-if="topic.cover_image" :src="api.imageUrl(topic.cover_image)" alt="" loading="lazy" />
          <strong>{{ topic.label }}</strong>
        </button>
      </div>
    </section>

    <section class="feed-section" :aria-busy="loading" aria-labelledby="feed-title">
      <div class="feed-heading">
        <div>
          <h2 id="feed-title">{{ currentScene === 'search' ? '搜索结果' : '为你推荐' }}</h2>
          <p v-if="submittedQuery" class="result-query">搜索「{{ submittedQuery }}」</p>
        </div>
        <div class="feed-actions">
          <button v-if="currentScene === 'rec'" class="btn batch-button" :disabled="loading || !items.length" @click="refreshRec">{{ recExhausted ? '重新浏览' : '换一批' }}</button>
          <button v-else class="btn batch-button" :disabled="loading" @click="returnToRecommendationHome">返回推荐</button>
        </div>
      </div>

      <div v-if="isDemoMode && currentScene === 'search'" class="filter-bar" aria-label="筛选搜索结果">
        <button type="button" :aria-pressed="!galleryOnly" :disabled="loading" @click="setGalleryFilter(false)">全部笔记</button>
        <button type="button" :aria-pressed="galleryOnly" :disabled="loading" @click="setGalleryFilter(true)">多图笔记</button>
      </div>
      <div v-if="errorMsg" class="panel feed-error" role="alert">
        <span>{{ errorMsg }}</span>
        <button v-if="!items.length" class="btn" @click="load()">重试</button>
      </div>
      <p v-if="currentScene === 'rec' && recExhausted" class="feed-notice" role="status">本轮推荐已看完。可以重新浏览，或搜索其他话题。</p>

      <div class="grid note-grid">
        <article v-for="it in items" :key="cardKey(it)" class="card">
          <button type="button" class="note-entry" :aria-label="it.title" @click="openDetail(it)">
            <span class="note-media">
              <img v-if="hasCover(it)" :src="api.imageUrl(it.cover_image)" alt="" loading="lazy" @error="markImageBroken(it)" />
              <span v-else class="note-no-image" aria-hidden="true">{{ it.cover_image ? '封面暂不可用' : '纯文字笔记' }}</span>
            </span>
            <span class="card-preview">
              <span class="card-title">{{ it.title }}</span>
              <span v-if="it.content" class="note-excerpt">{{ it.content }}</span>
            </span>
          </button>
          <div class="card-meta">
            <div v-if="titleTags(it).length" class="card-topics" aria-label="搜索相关话题">
              <button v-for="tag in titleTags(it)" :key="tag" type="button" :title="`搜索话题：${tag}`" :disabled="loading" @click="submitSearch(tag)">#{{ tag }}</button>
            </div>
            <span v-if="it.recommendation_reason" class="recommendation-reason">{{ it.recommendation_reason }}</span>
          </div>
        </article>
      </div>

      <div v-if="!items.length && !loading && !errorMsg" class="panel empty-feed">
        <h3>{{ currentScene === 'search' ? '没有找到相关笔记' : '暂无推荐笔记' }}</h3>
        <p class="meta">{{ currentScene === 'search' ? '试试更短的关键词，或返回推荐继续浏览。' : '你可以尝试搜索关键词，或切换到其他用户。' }}</p>
      </div>

      <div ref="loadAnchor" class="feed-footer">
        <span v-if="loading" class="meta" role="status">正在加载笔记…</span>
        <button v-else-if="items.length && (hasMore || preloadBuffer.length)" type="button" class="btn" @click="consumeMore">加载更多</button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.discovery-hero { position: relative; isolation: isolate; display: grid; align-content: center; gap: 16px; min-height: 254px; margin-bottom: 28px; padding: clamp(24px, 3.5vw, 46px); border-radius: var(--radius-xl); background: #294b39; color: #fffef5; }
.hero-photo, .hero-shade { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: inherit; z-index: -1; }
.hero-photo { object-fit: cover; object-position: 50% 48%; }
.hero-shade { background: linear-gradient(90deg, #102f25f5, #15382ad9 32%, #18352846 70%, #172b2020); }
.hero-copy h1 { margin: 0; color: inherit; font: 700 clamp(36px, 4vw, 55px)/1.15 var(--title-font); }
.home-search-row { display: flex; width: min(100%, 490px); gap: 6px; min-width: 0; padding: 4px; border-radius: 10px; background: var(--surface); }
.home-search-row input { border: 0; }
.hero-link { position: absolute; right: 20px; bottom: 18px; padding: 5px 12px; border: 1px solid #ffffff75; border-radius: 20px; color: white; background: #152d24cc; font-size: 12px; }
.hero-link:hover { background: #153425; }
.history-strip { display: flex; align-items: center; flex-wrap: wrap; gap: 5px 9px; width: min(100%, 490px); font-size: 12px; }
.history-strip button { max-width: 115px; padding: 2px 8px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; border-color: #ffffff55; background: #16382bd9; color: white; }
.history-strip .clear-history { text-decoration: underline; border: 0; background: transparent; }
.home-search-row > button { flex-shrink: 0; padding-inline: 20px; }
.search-shell { position: relative; flex: 1; min-width: 0; }
.search-input { min-width: 0; height: 47px; }
.suggest-panel {
  position: absolute;
  z-index: 5;
  top: calc(100% + 6px);
  inset-inline: 0;
  display: grid;
  gap: 2px;
  padding: 5px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow-lg);
}
.suggest-item { display: grid; gap: 2px; min-width: 0; text-align: left; border-color: transparent; overflow-wrap: anywhere; }
.suggest-item-meta { color: var(--muted); font-size: 11px; }
.topic-section { margin-bottom: 30px; }
.topic-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.topic-heading h2 { margin: 0; font: 700 22px/1.3 var(--title-font); }
.all-topics { color: var(--accent); border: 0; padding: 5px; background: transparent; font-size: 13px; }
.topic-list { display: grid; grid-template-columns: repeat(6, minmax(0,1fr)); gap: 8px; }
.topic-list button { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 8px; text-align: left; }
.topic-list:not(.expanded) button:nth-child(n+7) { display: none; }
.topic-list button[aria-pressed="true"] { border-color: var(--accent); background: var(--highlight); }
.topic-list img { width: clamp(34px, 3vw, 47px); aspect-ratio: 1; object-fit: cover; border-radius: 6px; }
.filter-bar { display: flex; gap: 4px; margin: -3px 0 16px; }
.filter-bar button { padding: 5px 13px; border-radius: 20px; font-size: 12px; }
.filter-bar button[aria-pressed="true"] { color: white; background: var(--primary); border-color: var(--primary); }
.feed-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; }
.feed-heading h2 { margin: 0; font: 700 clamp(24px, 3vw, 30px)/1.25 var(--title-font); }
.result-query { margin: 4px 0 0; color: var(--accent); overflow-wrap: anywhere; }
.feed-actions { display: flex; align-items: center; gap: 12px; }
.batch-button { border-color: var(--accent-line); color: var(--accent); white-space: nowrap; }
.feed-error { display: flex; justify-content: space-between; align-items: center; gap: 12px; color: var(--danger); overflow-wrap: anywhere; }
.feed-notice { margin: 0 0 14px; padding: 9px 13px; border: 1px solid var(--accent-line); border-radius: var(--radius-md); background: var(--highlight); color: var(--tag-text); }
.note-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
.note-grid .card { display: flex; flex-direction: column; cursor: default; }
.note-entry { display: block; width: 100%; padding: 0; border: 0; border-radius: 0; background: transparent; text-align: left; }
.note-entry:hover { background: transparent; color: var(--accent); }
.note-entry:focus-visible { outline-offset: -3px; }
.note-media { position: relative; display: block; width: 100%; aspect-ratio: 3 / 2; background: var(--bg-deep); overflow: hidden; }
.note-media img { position: absolute; inset: 0; height: 100%; object-fit: cover; object-position: center 42%; }
.note-media:has(.note-no-image) { aspect-ratio: 3 / 1; }
.note-no-image { display: grid; height: 100%; place-items: center; color: var(--muted); font-size: 12px; }
.card-preview { display: grid; gap: 6px; padding: 14px 16px 0; }
.card-title, .note-excerpt { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.card-title { min-height: auto; font-size: 17px; }
.note-excerpt { min-height: 2.9em; color: var(--muted); font-size: 13px; line-height: 1.45; overflow-wrap: anywhere; }
.card-meta { display: grid; gap: 10px; padding: 12px 16px; margin-top: auto; }
.card-topics { display: flex; flex-wrap: wrap; gap: 4px; }
.card-topics > button {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  padding: 2px 6px;
  border: 1px solid var(--tag-line);
  border-radius: 4px;
  background: var(--tag-surface);
  color: var(--tag-text);
  font-size: 11px;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.card-topics > button:hover { background: var(--accent-soft); border-color: var(--line-strong); }
.recommendation-reason { color: var(--muted); font-size: 11px; }
.feed-footer { display: grid; min-height: 32px; margin-top: 14px; place-items: center; }
.empty-feed { text-align: center; padding-block: 36px; }
.empty-feed h3, .empty-feed p { margin: 0; }
.empty-feed h3 { margin-bottom: 4px; }

@media (max-width: 1000px) {
  .topic-list { grid-template-columns: repeat(4,minmax(0,1fr)); }
  .topic-list:not(.expanded) button:nth-child(n+5) { display: none; }
}
@media (max-width: 800px) {
  .discovery-hero { grid-template-columns: minmax(0, 1fr); }
  .hero-link { position: static; justify-self: start; }
  .note-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
}
@media (max-width: 480px) {
  .discovery-hero { padding: 20px; margin-bottom: 24px; }
  .feed-actions { gap: 7px; }
  .batch-button { padding: 6px 9px; }
  .topic-list { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  .topic-list button { padding: 7px 9px; }
  .topic-section { margin-bottom: 22px; }
  .card-preview { padding: 10px 10px 0; }
  .card-meta { padding: 8px 10px 10px; gap: 7px; }
  .card-title { font-size: 14px; }
}
</style>
