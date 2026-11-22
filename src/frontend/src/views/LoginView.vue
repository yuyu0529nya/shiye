<script setup lang="ts">
import PageIntro from "../components/PageIntro.vue";
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, getScene, isDemoMode, setUserId } from '../services/api';
import TopBar from '../components/TopBar.vue';

const router = useRouter();
const userIdx = ref('');
const msg = ref('');
const scene = getScene();
const users = ref<any[]>([]);
const loadingUsers = ref(false);
const listOffset = ref(0);
const latencyMs = ref<number | null>(null);
const loggingIn = ref(false);

async function login(selectedUser = userIdx.value) {
  if (loggingIn.value) return;
  const rawUid = String(selectedUser || '').trim() || '15128';
  const uid = Number(rawUid);
  if (!Number.isInteger(uid) || uid < 0) {
    msg.value = 'user_idx 需为非负整数';
    return;
  }
  userIdx.value = String(uid);
  msg.value = '';
  loggingIn.value = true;
  try {
    const r = await api.login(scene, uid);
    latencyMs.value = r?.latency_ms ?? null;
    setUserId(uid);
    await router.replace({ path: '/', query: { refresh: String(Date.now()) } });
  } catch (e: any) {
    msg.value = e?.message || '登录失败，请检查后端服务';
  } finally {
    loggingIn.value = false;
  }
}

function mergeUsers(next: any[]) {
  const seen = new Set(users.value.map((x: any) => Number(x.user_idx)));
  for (const u of next) {
    const uid = Number(u?.user_idx);
    if (Number.isFinite(uid) && !seen.has(uid)) {
      users.value.push(u);
      seen.add(uid);
    }
  }
}

async function loadUsers(reset = false) {
  if (loadingUsers.value) return;
  loadingUsers.value = true;
  try {
    if (reset) {
      users.value = [];
      listOffset.value = 0;
    }
    const r = await api.users(scene, 30, listOffset.value, true);
    latencyMs.value = r?.latency_ms ?? null;
    const rows = Array.isArray(r.users) ? r.users : [];
    mergeUsers(rows);
    listOffset.value += rows.length;
    if (reset && rows.length === 0) {
      msg.value = '当前场景暂无可展示用户';
    }
  } catch (e: any) {
    msg.value = e?.message || '加载用户列表失败';
    if (reset) users.value = [];
  } finally {
    loadingUsers.value = false;
  }
}

async function refreshUsers() {
  await loadUsers(true);
}

function onUserScroll(e: Event) {
  const el = e.target as HTMLElement;
  if (!el) return;
  const remain = el.scrollHeight - el.scrollTop - el.clientHeight;
  if (remain < 80) {
    loadUsers(false);
  }
}

onMounted(refreshUsers);

function formatGender(v: any) {
  const s = String(v ?? '').trim();
  if (!s || s === '-' || s === '0') return '-';
  if (s === '1' || s.toLowerCase() === 'male') return '男';
  if (s === '2' || s.toLowerCase() === 'female') return '女';
  return s;
}

function formatAge(v: any) {
  const s = String(v ?? '').trim();
  if (s && s !== '-' && s !== '0' && Number.isNaN(Number(s))) return s;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return '-';
  return String(Math.round(n));
}

function formatPlain(v: any) {
  const s = String(v ?? '').trim();
  return s && s !== '0' ? s : '-';
}
</script>

<template>
  <div>
    <TopBar title="选择体验用户" :latency-ms="latencyMs" />
    <main class="container login-page">
      <section class="login-hero">
        <PageIntro title="选择体验用户" description="搜索感兴趣的笔记，查看当前用户的推荐与互动记录。" />
      </section>
      <section v-if="isDemoMode" class="demo-users" aria-label="演示用户">
        <button v-for="user in users" :key="user.user_idx" type="button" :disabled="loggingIn" @click="login(user.user_idx)">
          <strong>{{ user.location }}</strong>
          <span>以用户 {{ user.user_idx }} 继续 →</span>
        </button>
        <p v-if="loadingUsers" role="status" class="meta">正在读取演示用户…</p>
        <p v-if="msg" role="alert" class="meta">{{ msg }}</p>
      </section>
      <div v-else class="login-layout">
      <section class="panel login-panel">
        <h2>用户登录</h2>
        <label class="meta" for="login-user">输入用户 ID</label>
        <form class="login-form" @submit.prevent="login()">
          <input v-model="userIdx" id="login-user" aria-label="用户 ID" placeholder="例如 15128" inputmode="numeric" />
          <button type="submit" class="btn-primary" :disabled="loggingIn">{{ loggingIn ? '加载中...' : '登录' }}</button>
        </form>
        <p v-if="msg" role="alert" class="meta login-message">{{ msg }}</p>
      </section>
      <section class="panel user-list-panel">
        <div class="user-list-heading">
          <div><h2>随机用户</h2><p class="meta">选择一行即可填入用户 ID。</p></div>
          <button class="btn" @click="refreshUsers">换一批</button>
        </div>
        <div
          v-if="users.length"
          class="user-table-wrap"
          @scroll="onUserScroll"
        >
          <table class="table">
            <thead><tr><th>用户 ID</th><th>性别</th><th>年龄</th><th>平台</th><th>地区</th></tr></thead>
            <tbody>
              <tr v-for="u in users" :key="u.user_idx" tabindex="0" @click="userIdx = String(u.user_idx)"
                @keydown.enter.prevent="userIdx = String(u.user_idx)">
                <td>{{ u.user_idx }}</td>
                <td>{{ formatGender(u.gender ?? u.gender_enc) }}</td>
                <td>{{ formatAge(u.age ?? u.age_enc) }}</td>
                <td>{{ formatPlain(u.platform ?? u.platform_enc) }}</td>
                <td>{{ formatPlain(u.location ?? u.location_enc) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="meta">暂无用户列表数据。</div>
      </section>
      </div>
    </main>
  </div>
</template>

<style scoped>
.login-hero {
  margin-bottom: 20px;
  padding: 32px;
  border-radius: var(--radius-xl);
  border: 1px solid var(--accent-line);
  background: var(--highlight);
}
.login-hero :deep(.page-intro) { margin: 0; }
.demo-users { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.demo-users button { display: grid; gap: 6px; padding: 20px; text-align: left; }
.demo-users strong { font: 700 23px/1.3 var(--title-font); }
.demo-users span { color: var(--accent); }
.login-message { margin: 10px 0 0; color: var(--danger); }
.login-layout { display: grid; grid-template-columns: minmax(255px, .9fr) minmax(0, 2fr); gap: 18px; align-items: start; }
.login-layout > .panel { min-width: 0; }
.login-panel h2, .user-list-panel h2 { font: 700 24px/1.25 var(--title-font); }
.login-form { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 8px; margin-top: 9px; }
.user-list-heading { display: flex; align-items: start; justify-content: space-between; gap: 12px; margin-bottom: 13px; }
.user-list-heading p { margin: 0; }
.user-list-heading button { white-space: nowrap; }
.user-table-wrap { max-height: min(55vh, 500px); overflow: auto; border: 1px solid var(--line); border-radius: var(--radius-md); }
.user-table-wrap table { min-width: 490px; }
.user-table-wrap thead th { position: sticky; top: 0; background: var(--bg-deep); white-space: nowrap; }
.user-table-wrap tbody tr, .user-table-wrap tbody tr:first-child { cursor: pointer; color: var(--text); font-size: 13px; background: var(--surface); }
.user-table-wrap tbody tr:hover { background: var(--accent-soft); }
@media (max-width: 800px) {
  .login-hero { padding: 22px; }
  .login-layout { grid-template-columns: minmax(0,1fr); gap: 10px; }
  .login-layout .panel { margin-bottom: 0; }
}
@media (max-width: 480px) { .demo-users { grid-template-columns: minmax(0, 1fr); } }
</style>
