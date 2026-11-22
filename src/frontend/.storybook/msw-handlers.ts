import { http, HttpResponse } from 'msw';

export const demoNote = {
  scene: 'rec', user_idx: 15128, request_id: 4201, note_idx: 101,
  title: '城市漫步：发现日常中的小风景',
  content: '沿河走过石桥，再沿小街慢慢逛回老码头。傍晚的光适合拍照。',
  images: [], cover_image: '', topic_tokens: ['城市漫步', '生活记录'],
  accum_like_num: 32, accum_collect_num: 8, accum_comment_num: 2, accum_share_num: 1,
  stage_top500_ranks: { recall: 12, preranking: 8, ranking: 3, rerank: 3 },
};
export const demoUser = {
  user_idx: 15128, request_count_in_test: 0,
  features: { gender: '—', age: '—', platform: 'Web', location: '演示用户', fans_num: 0, follows_num: 0 },
  recent_behaviors: [
    { scene: 'search', request_id: 4201, note_idx: 101, title: demoNote.title, query: '城市漫步', ts: 1732706090, interaction_score: 1 },
    { scene: 'rec', request_id: 4202, note_idx: 102, title: '周末阅读清单', query: '', ts: 1732706089, interaction_score: 1 },
  ],
};
export const mswHandlers = [
  http.get('/api/users', () => HttpResponse.json({ users: [{ user_idx: 15128, platform: 'Web', location: '演示用户' }], latency_ms: 2 })),
  http.get('/api/user', ({ request }) => {
    const scene = new URL(request.url).searchParams.get('scene');
    return HttpResponse.json({ user: { ...demoUser, recent_behaviors: demoUser.recent_behaviors.filter(row => row.scene === scene) }, latency_ms: 2 });
  }),
  http.get('/api/login', () => HttpResponse.json({ ok: true, user: demoUser, latency_ms: 3 })),
  http.get('/api/feed', ({ request }) => {
    const query = new URL(request.url).searchParams;
    const items = Number(query.get('page') || 1) === 1
      ? Array.from({ length: 15 }, (_, i) => ({ ...demoNote, note_idx: 101 + i, title: i ? `演示内容 · 生活灵感 ${i}` : demoNote.title, scene: query.get('scene'), stage_ranks: { recall: i + 1, preranking: i + 1, ranking: i + 1, rerank: i + 1 } }))
      : [];
    return HttpResponse.json({ feed: { items, latency_ms: 175, stage_ms: { recall: 90, preranking: 25, ranking: 40 } } });
  }),
  http.get('/api/suggest', () => HttpResponse.json({ items: [{ text: '城市漫步路线', hint: '演示建议' }] })),
  http.get('/api/note', () => HttpResponse.json({ detail: demoNote, latency_ms: 3 })),
  http.post('/api/behavior/engage', () => HttpResponse.json({ ok: true })),
  http.post('/api/behavior/click', () => HttpResponse.json({ ok: true })),
  http.post('/api/behavior/view', () => HttpResponse.json({ ok: true })),
];
