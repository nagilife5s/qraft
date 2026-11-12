// 画面の表示テストの設定。web/ をそのまま配る小さなサーバーを立て、Firebase はエミュレーター（?emu=1）につなぐ
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: ['smoke.spec.mjs', 'a11y.spec.mjs', 'settings.spec.mjs', 'join.spec.mjs'],
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'test-results/report' }]] : 'list',
  outputDir: 'test-results/artifacts',
  use: { baseURL: 'http://127.0.0.1:8800', screenshot: 'only-on-failure' },
  webServer: { command: 'python3 -m http.server 8800 --bind 127.0.0.1 --directory ..', url: 'http://127.0.0.1:8800/index.html', reuseExistingServer: !process.env.CI, stdout: 'ignore', stderr: 'pipe' },
});
