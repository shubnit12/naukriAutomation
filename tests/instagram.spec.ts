import { test, expect, Page } from '@playwright/test';

test.use({
    launchOptions: {
        args: [
            '--deny-permission-prompts',
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
        ],
    },
})
const TOKEN = process.env.TOKEN;
const CHAT_ID = process.env.CHAT_ID;
test.use({ storageState: 'instagram.json' });
let successfullyApplied = 0
let TotalJobsFound = 0
test('Instagram title', async ({ page, context }) => {
    console.log("Telegram : ", TOKEN, CHAT_ID)
    let x=0
    while(x<10){
        x++


    await page.goto('https://www.instagram.com/');
    const loaded = await scrollTheFeed(page, 6);
    console.log('posts available:', loaded);
    await page.waitForTimeout(1000)
    await page.pause()
    await scrollTheFeed(page);
    const posts = page.locator('article');
    await posts.first().waitFor({ state: 'visible' });
    const allPosts = await posts.all();
    console.log("allPosts count:", allPosts.length);
    await page.waitForTimeout(1000)
    console.log("allPosts:", allPosts);
    await page.waitForTimeout(1000)

    for (const post of allPosts) {
        
        await post.scrollIntoViewIfNeeded();
        await page.waitForTimeout(1000);
        const timeEl = post.locator('time').first();
        if (await timeEl.count()) {
            const age = (await timeEl.innerText()).trim();        // "4 d"
            const iso = await timeEl.getAttribute('datetime');    // "2026-09-17T15:04:43.000Z"
            const title = await timeEl.getAttribute('title');       // "17 September 2026"
            console.log(`post age: ${age} | posted: ${title} (${iso})`);
            const ageInDays = iso ? (Date.now() - new Date(iso).getTime()) / 86_400_000 : Infinity;
            if (ageInDays > 7) continue;   // skip posts older than a week
        } else {
            console.log('post age: <no time element>');
        }

        await post.getByRole('button', { name: 'Comment' }).click({ timeout: 10000 });
        try {
            const dialog = page.getByRole('dialog');
            const likeButtons = dialog.locator('ul li')
                .getByRole('button', { name: 'Like', exact: true });
            const countTotalComments = await likeButtons.count();
            console.log('Total comment like buttons:', countTotalComments);

            const commentsWithStory = dialog.locator('ul li')
                .filter({ has: page.locator('[role="button"]:not([aria-disabled="true"]):has(img)') }) // story ring
                .filter({ has: page.getByRole('button', { name: 'Like', exact: true }) });             // AND a like heart

            const count = await commentsWithStory.count();
            console.log('story comments with a like button:', count);

            for (let i = 0; i < count; i++) {
                await commentsWithStory.nth(i).scrollIntoViewIfNeeded();
                await commentsWithStory.nth(i)
                    .getByRole('button', { name: 'Like', exact: true })
                    .first()                 // guard against expanded replies in the same <li>
                    .hover();                // .click({timeout:10000}) to actually like
                await page.waitForTimeout(1000);

            }
            await page.getByRole('button', { name: 'Close' }).first().click({ timeout: 10000 });
        } catch (error) {
            console.log('post failed:', (error as Error).message);
            const close = page.getByRole('button', { name: 'Close' });
            if (await close.count()) await close.first().click({ timeout: 5000 }).catch(() => {});          
        }
    }

    }


    await page.pause()


})


async function sendTelegramAlert(text: any) {
    await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: CHAT_ID, text }),
    });
    console.log("text ---> ", text)
}

async function scrollTheFeed(page: Page, target = 6): Promise<number> {
    const posts = page.locator('article');
    await posts.first().waitFor({ state: 'visible' });
  
    const MAX_SCROLLS = 15;
    let stagnant = 0;
  
    for (let s = 1; s <= MAX_SCROLLS; s++) {
      const count = await posts.count();
      console.log(`scroll ${s}: ${count} articles in DOM`);
  
      // ---- stop as soon as we have enough ----
      if (count >= target) {
        console.log(`target reached (${count} >= ${target}) — done scrolling`);
        return count;
      }
  
      // scroll the WINDOW, never a specific article (IG recycles them)
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await page.waitForTimeout(1500);
  
      const after = await posts.count();
      if (after >= target) {
        console.log(`target reached (${after} >= ${target}) — done scrolling`);
        return after;
      }
  
      if (after > count) {
        stagnant = 0;
      } else if (++stagnant >= 3) {
        console.log(`feed stopped growing — continuing with ${after}`);
        return after;
      }
    }
  
    const final = await posts.count();
    console.log(`max scrolls reached — continuing with ${final}`);
    return final;
  }
