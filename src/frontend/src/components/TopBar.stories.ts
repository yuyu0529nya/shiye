import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { expect, fn } from 'storybook/test';
import TopBar from './TopBar.vue';

const meta = {
  component: TopBar,
  tags: ['ai-generated'],
  args: { title: '拾页 工作台', onHome: fn() },
} satisfies Meta<typeof TopBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const HomeNavigation: Story = {
  parameters: { route: '/' },
  play: async ({ canvas, userEvent, args }) => {
    await expect(canvas.getByRole('button', { name: '发现' })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(canvas.getByRole('button', { name: /拾页工作台/ }));
    await expect(args.onHome).toHaveBeenCalledOnce();
  },
};
export const MeasuredStages: Story = {
  args: { latencyMs: 175, stageMs: { recall: 90, preranking: 25, ranking: 40 } },
};
export const UnmeasuredStages: Story = {
  args: { latencyMs: null, stageMs: null },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText('0.0 ms')).not.toBeInTheDocument();
    await expect(canvas.queryByText('服务延迟')).not.toBeInTheDocument();
  },
};
