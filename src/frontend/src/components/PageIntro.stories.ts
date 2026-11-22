import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { expect } from 'storybook/test';
import PageIntro from './PageIntro.vue';

const meta = {
  component: PageIntro,
  tags: ['ai-generated'],
  decorators: [() => ({ template: '<main class="container"><story /></main>' })],
  args: { eyebrow: '拾页', title: '选择体验用户', description: '搜索感兴趣的笔记，查看当前用户的推荐与互动记录。' },
} satisfies Meta<typeof PageIntro>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const LongDescription: Story = { args: { title: '从搜索开始发现笔记', description: '输入关键词或点击笔记下方的话题继续搜索。打开一篇笔记，可以查看图片、记录互动，并查看这条结果在本次请求中的排序信息。' } };
export const CssCheck: Story = {
  play: async ({ canvas }) => {
    await expect(getComputedStyle(canvas.getByText('拾页')).color).toBe('rgb(49, 91, 69)');
  },
};
