<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { clearUserId, getUserId, isDemoMode } from '../services/api';

const props = defineProps<{
  title: string;
  latencyMs?: number | null;
  stageMs?: Record<string, number> | null;
}>();

const emit = defineEmits<{
  (e: 'home'): void;
}>();

const router = useRouter();
const route = useRoute();
const userId = getUserId();

const serviceLatency = computed(() => {
  const n = Number(props.latencyMs ?? 0);
  const hasLatency = props.latencyMs != null;
  const src = props.stageMs && typeof props.stageMs === 'object' ? props.stageMs : {};
  const stageTotal = ['recall', 'preranking', 'ranking'].reduce((sum, key) => {
    const value = Number((src as any)?.[key] ?? 0);
    return Number.isFinite(value) && value > 0 ? sum + value : sum;
  }, 0);
  const display = Math.max(
    Number.isFinite(n) && n > 0 ? n : 0,
    Number.isFinite(stageTotal) && stageTotal > 0 ? stageTotal : 0,
  );
  return display > 0 || hasLatency || props.stageMs ? `${display.toFixed(1)} ms` : null;
});

const stageEntries = computed(() => {
  const src = props.stageMs && typeof props.stageMs === 'object' ? props.stageMs : {};
  const pairs = [
    ['召回', src.recall],
    ['粗排', src.preranking],
    ['精排', src.ranking],
  ] as Array<[string, number]>;
  return pairs.filter(([, value]) => Number.isFinite(value) && value > 0).map(([label, value]) => ({
    label,
    value: `${value.toFixed(1)} ms`,
  }));
});

function logout() {
  clearUserId();
  router.push('/login');
}

function goHomeNav() {
  if (route.path === '/') {
    emit('home');
    return;
  }
  router.push({ path: '/', query: { refresh: String(Date.now()) } });
}
</script>

<template>
  <header class="topbar-shell topbar-sticky-shell">
    <div class="topbar topbar-premium topbar-sticky">
      <div class="topbar-main">
        <div class="topbar-left topbar-left-premium">
          <button class="brand-button" @click="goHomeNav" aria-label="拾页工作台">
            <span class="brand-symbol" aria-hidden="true">拾</span>
            <span class="topbar-title">拾页</span>
          </button>

          <nav v-if="route.path !== '/login'" class="topbar-nav" aria-label="主导航">
            <button
              type="button"
              class="nav-tile nav-tile-button"
              :class="{ 'nav-tile-active': route.path === '/' }"
              :aria-current="route.path === '/' ? 'page' : undefined"
              @click="goHomeNav"
            >
              发现
            </button>
            <router-link to="/user" class="nav-tile">最近行为</router-link>
          </nav>
          <div v-if="route.path !== '/login' && userId != null" class="topbar-side">
            <span class="user-chip-value">用户 {{ userId }}</span>
            <button class="nav-chip logout-button" @click="logout">切换用户</button>
          </div>
        </div>
      </div>

      <div v-if="!isDemoMode && serviceLatency" class="topbar-metric-row">
        <span class="current-view">{{ props.title }}</span>
        <div class="topbar-metrics">
          <div class="metric-chip metric-chip-strong metric-chip-wide">
            <span class="metric-label">&#x670D;&#x52A1;&#x5EF6;&#x8FDF;</span>
            <span class="metric-value metric-value-topbar">{{ serviceLatency }}</span>
          </div>
          <div v-for="item in stageEntries" :key="item.label" class="metric-chip metric-chip-soft">
            <span class="metric-label">{{ item.label }}</span>
            <span class="metric-value metric-value-topbar">{{ item.value }}</span>
          </div>
        </div>
      </div>

      <div v-if="$slots.actions" class="topbar-actions topbar-actions-premium">
        <slot name="actions" />
      </div>
    </div>
  </header>
</template>

<style scoped>
.topbar-shell {
  position: sticky;
  top: 0;
  z-index: 40;
  border-bottom: 1px solid var(--line);
  background: var(--surface);
}
.topbar { max-width: 1320px; margin-inline: auto; padding: 0 36px; }
.topbar-left, .topbar-metric-row, .topbar-metrics, .topbar-side {
  display: flex;
  align-items: center;
  gap: 14px;
}
.topbar-left { min-height: 64px; gap: 32px; }
.brand-button {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 0;
  border: 0;
  background: transparent;
  white-space: nowrap;
}
.brand-symbol {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 6px 6px 10px 6px;
  background: var(--brand);
  color: var(--brand-ink);
  font: 700 18px/1 var(--title-font);
}
.topbar-title { font: 700 23px/1 var(--title-font); }
.topbar-nav { display: flex; flex: 1; align-items: center; gap: 4px; }
.nav-tile {
  display: inline-flex;
  align-items: center;
  padding: 7px 13px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--muted);
  font-weight: 550;
  white-space: nowrap;
}
.nav-tile:hover { background: var(--bg); color: var(--text); }
.nav-tile-active,.nav-tile.router-link-exact-active { color: var(--accent); background: var(--accent-soft); }
.topbar-metric-row {
  justify-content: space-between;
  gap: 13px;
  min-height: 39px;
  padding: 5px 0;
  border-top: 1px solid var(--line);
}
.current-view { color: var(--muted); font-size: 11px; }
.topbar-metrics { flex: 1; justify-content: flex-end; }
.metric-chip { gap: 4px; white-space: nowrap; }
.topbar-side { flex-shrink: 0; margin-left: auto; color: var(--muted); }
.logout-button { padding: 5px 10px; color: var(--accent); font-size: 12px; white-space: nowrap; }
.topbar-actions { padding: 0 0 12px; }

@media (max-width: 800px) {
  .topbar { padding-inline: 16px; }
  .topbar-left { min-height: 54px; gap: 18px; }
  .topbar-metrics, .topbar-side { gap: 7px; }
  .metric-chip-soft { display: none; }
}
@media (max-width: 540px) {
  .topbar-left { gap: 8px; }
  .nav-tile { padding: 6px 8px; font-size: 12px; }
  .topbar-title { font-size: 20px; }
  .brand-symbol { width: 28px; height: 28px; }
  .current-view { display: none; }
  .topbar-metrics { justify-content: flex-start; }
  .topbar-side .user-chip-value { display: none; }
}
@media (max-width: 360px) { .topbar-title { display: none; } }
</style>
