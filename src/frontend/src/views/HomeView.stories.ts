import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { expect, waitFor } from 'storybook/test';
import { http, HttpResponse } from 'msw';
import HomeView from './HomeView.vue';
import { demoNote } from '../../.storybook/msw-handlers';

const meta = { component: HomeView, tags: ['ai-generated'], parameters: { route: '/' } } satisfies Meta<typeof HomeView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Recommendation: Story = {
  play: async ({ canvas }) => {
    await expect((await canvas.findAllByText('城市漫步：发现日常中的小风景')).length).toBeGreaterThan(0);
    await expect(canvas.queryByText(/(?:点赞|收藏|评论)\s*\d/)).not.toBeInTheDocument();
  },
};
export const SearchSuggestion: Story = {
  play: async ({ canvas, userEvent }) => {
    await canvas.findAllByText('城市漫步：发现日常中的小风景');
    await userEvent.type(canvas.getByRole('searchbox', { name: '搜索内容' }), '城市');
    await userEvent.click(await canvas.findByRole('button', { name: /城市漫步路线/ }));
    await expect(canvas.getByRole('searchbox', { name: '搜索内容' })).toHaveValue('城市漫步路线');
    await expect(await canvas.findByRole('heading', { name: '搜索结果' })).toBeVisible();
    await expect(canvas.getByText('搜索「城市漫步路线」')).toBeVisible();
    const back = canvas.getByRole('button', { name: '返回推荐' });
    await waitFor(() => expect(back).toBeEnabled());
    await userEvent.click(back);
    await expect(await canvas.findByRole('heading', { name: '为你推荐' })).toBeVisible();
  },
};
export const FeedUnavailable: Story = {
  beforeEach: async context => {
    (context as any).msw.use(http.get('/api/feed', () => HttpResponse.json({ detail: '演示：内容服务暂不可用' }, { status: 503 })));
  },
  play: async ({ canvas }) => { await expect(await canvas.findByText('演示：内容服务暂不可用')).toBeVisible(); },
};

export const RecommendationExhausted: Story = {
  beforeEach: async context => {
    context.msw.use(http.get('/api/feed', ({ request }) => {
      const exhausted = new URL(request.url).searchParams.has('exclude_note_ids');
      return HttpResponse.json({ feed: { items: exhausted ? [] : [demoNote], total: exhausted ? 0 : 1 } });
    }));
  },
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole('button', { name: demoNote.title });
    await userEvent.click(canvas.getByRole('button', { name: '换一批' }));
    await expect(await canvas.findByText(/本轮推荐已看完/)).toBeVisible();
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: demoNote.title })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '重新浏览' }));
    await expect(await canvas.findByRole('button', { name: demoNote.title })).toBeVisible();
    await expect(canvas.queryByText(/本轮推荐已看完/)).not.toBeInTheDocument();
  },
};
