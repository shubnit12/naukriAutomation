import { test, expect } from '@playwright/test';

test('has title', async ({ page, context }) => {
  await page.goto('https://www.naukri.com/');

  await page.pause()
  await context.storageState({ path: 'state.json' });
  await page.pause()
  
});
