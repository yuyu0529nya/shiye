# UI development

The app uses Vue 3 and Vite. Storybook and its test tools require Node 22.12 or later.

```sh
npm ci
npm run storybook -- --host 127.0.0.1
npm run typecheck
npm run typecheck-storybook
npx playwright install chromium --only-shell
npm run test-storybook
npm run build
npm run build-storybook
```

Stories use the app's CSS, Pinia, memory router, and MSW. Content and users are deterministic interface fixtures.
