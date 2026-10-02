root@localhost:~/naukriAutomation# cat tests/naukriLogin.spec.ts 
import { test, expect } from '@playwright/test';
test.use({
  headless: false,
  viewport: null,
  deviceScaleFactor: undefined,
  launchOptions: {
    args: [
      '--deny-permission-prompts',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1024,768',
      '--window-position=100,50',
      '--ignore-gpu-blocklist',
    ],
  },
});

test('has title', async ({ page, context }) => {
  await page.goto('https://www.instagram.com/');

  await page.pause()
  await context.storageState({ path: 'instagram.json' });
  await page.pause()
  
});
