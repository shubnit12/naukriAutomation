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
let numberofCommentsLiked=0
const WAIT = 2000;
const TOKEN = process.env.TOKEN;
const CHAT_ID = process.env.CHAT_ID;
test.use({ storageState: 'instagram.json' });
let successfullyApplied = 0
let TotalJobsFound = 0
test.setTimeout(18000000)
test('Instagram title', async ({ page, context }) => {
    page.setDefaultTimeout(30000);
    let x = 0
    console.log("Telegram : ", TOKEN, CHAT_ID)
    await page.goto('https://www.instagram.com/', {
        timeout: 60000
      });
while (x < 10) {
    x++

    await page.waitForTimeout(WAIT);
    const loaded = await scrollTheFeed(page, 6);
    await page.waitForTimeout(WAIT);
    console.log('posts available:', loaded);

    const posts = page.locator('article');

    await page.waitForTimeout(WAIT);
    await posts.first().waitFor({ state: 'visible' });
    await page.waitForTimeout(WAIT);

    await page.waitForTimeout(WAIT);
    const allPosts = await posts.all();
    await page.waitForTimeout(WAIT);
    console.log("allPosts count:", allPosts.length);

    for (const post of allPosts) {

        await page.waitForTimeout(WAIT);
        await post.scrollIntoViewIfNeeded();
        await page.waitForTimeout(WAIT);

        const timeEl = post.locator('time').first();
        if (await timeEl.count()) {
            const age = (await timeEl.innerText()).trim();
            const iso = await timeEl.getAttribute('datetime');
            const title = await timeEl.getAttribute('title');
            console.log(`post age: ${age} | posted: ${title} (${iso})`);
            const ageInDays = iso ? (Date.now() - new Date(iso).getTime()) / 86_400_000 : Infinity;
            if (ageInDays > 7) continue;
        } else {
            console.log('post age: <no time element>');
        }

        await page.waitForTimeout(WAIT);
        await post.getByRole('button', { name: 'Comment' }).click({ timeout: 10000 });
        await page.waitForTimeout(WAIT);

        try {
            const dialog = page.getByRole('dialog');
            const likeButtons = dialog.locator('ul li')
                .getByRole('button', { name: 'Like', exact: true });

            await page.waitForTimeout(WAIT);
            const countTotalComments = await likeButtons.count();
            await page.waitForTimeout(WAIT);
            console.log('Total comment like buttons:', countTotalComments);

            const commentsWithStory = dialog.locator('ul li')
                .filter({ has: page.locator('[role="button"]:not([aria-disabled="true"]):has(img)') })
                .filter({ has: page.getByRole('button', { name: 'Like', exact: true }) });

            await page.waitForTimeout(WAIT);
            const count = await commentsWithStory.count();
            await page.waitForTimeout(WAIT);
            console.log('story comments with a like button:', count);

            for (let i = 0; i < count; i++) {
                await page.waitForTimeout(WAIT);
                await commentsWithStory.nth(i).scrollIntoViewIfNeeded();
                await page.waitForTimeout(WAIT);

                await page.waitForTimeout(WAIT);
                await commentsWithStory.nth(i)
                .getByRole('button', { name: 'Like', exact: true })
                .first()
                .click();
                console.log(`${i}th comment is liked`)
                numberofCommentsLiked = numberofCommentsLiked+1
                await page.waitForTimeout(WAIT);
            }

            await page.waitForTimeout(WAIT);
            await page.getByRole('button', { name: 'Close' }).first().click({ timeout: 10000 });
            await page.waitForTimeout(WAIT);

        } catch (error) {
            console.log('post failed:', (error as Error).message);
            const close = page.getByRole('button', { name: 'Close' });
            if (await close.count()) {
                await page.waitForTimeout(WAIT);
                await close.first().click({ timeout: 5000 }).catch(() => {});
                await page.waitForTimeout(WAIT);
            }
        }
    }
}
})


test.afterAll(async () => {
    console.log(`Total Number of Comments liked were = ${numberofCommentsLiked}`)
    await sendTelegramAlert(`Total Number of Comments liked were = ${numberofCommentsLiked}`)
    
  });

async function sendTelegramAlert(text: any) {
    await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: CHAT_ID, text }),
    });
    console.log("text ---> ", text)
}

async function scrollTheFeed(page: Page, target = 6): Promise<number> {
    await page.waitForTimeout(WAIT);
    const posts = page.locator('article');
    await posts.first().waitFor({ state: 'visible' });
    await page.waitForTimeout(WAIT);

    const MAX_SCROLLS = 15;
    let stagnant = 0;

    for (let s = 1; s <= MAX_SCROLLS; s++) {
        const count = await posts.count();
        console.log(`scroll ${s}: ${count} articles in DOM`);

        if (count >= target) {
            console.log(`target reached (${count} >= ${target}) — done scrolling`);
            return count;
        }

        await page.waitForTimeout(WAIT);
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await page.waitForTimeout(WAIT);

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
