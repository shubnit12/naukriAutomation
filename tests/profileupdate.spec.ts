import { test, expect, Page, Locator } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

test.use({
    launchOptions: {
        args: [
            '--deny-permission-prompts',
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-blink-features=AutomationControlled',
        ],
    },
});
const TOKEN = process.env.TOKEN;
const CHAT_ID = process.env.CHAT_ID;
test.use({ storageState: 'state.json' });

const NAUKRI_PROFILE_URL = 'https://www.naukri.com/mnjuser/profile';
const RESUME_URL = process.env.RESUME_URL ?? 'https://api.shubnit.com/resumexxx';
// Fallback used when the endpoint is down: a resume placed at the repo root.
const LOCAL_RESUME = path.join(__dirname, '..', 'resume.pdf');

test('profile update', async ({ page, context }) => {
    // Naukri's bot detection sniffs navigator.webdriver — hide it before
    // the first navigation (same init script production used).
    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    // ── Get the resume file ────────────────────────────────────────────────
    // Priority: RESUME_FILE env override → download from the endpoint →
    // local fallback (resume.pdf at the repo root) if the endpoint fails.
    let resumePath: string;
    if (process.env.RESUME_FILE) {
        resumePath = process.env.RESUME_FILE;
    } else {
        try {
            resumePath = await downloadResume(RESUME_URL);
        } catch (err) {
            console.log(
                `[naukri] resume download failed (${(err as Error).message}) — trying local fallback`,
            );
            if (!fs.existsSync(LOCAL_RESUME)) {
                throw new Error(
                    `Resume download failed AND no local fallback found at ${LOCAL_RESUME}. ` +
                        'Place your resume at the repo root as resume.pdf.',
                    { cause: err as Error },
                );
            }
            resumePath = LOCAL_RESUME;
        }
    }
    console.log(`[naukri] resume ready: ${resumePath}`);

    // ── Navigate directly to the profile editor ───────────────────────────
    await page.goto(NAUKRI_PROFILE_URL);

    // If we got bounced to /nlogin, the persisted session expired. Throw a
    // clear, actionable error instead of a cryptic "element not found".
    if (page.url().includes('/nlogin')) {
        throw new Error(
            'Naukri session expired (redirected to login page). ' +
                'Re-run naukriLogin.spec.ts to refresh state.json.',
        );
    }

    // ── Toggle the trailing dot on the headline so Naukri sees a change ───
    await page.locator('#lazyResumeHead').getByText('editOneTheme').click();

    const headlineBox = page.getByRole('textbox', { name: 'Minimum 5 words. Sample' });
    await headlineBox.click();
    const currentHeadline = await headlineBox.inputValue();
    const updatedHeadline = currentHeadline.endsWith('.')
        ? currentHeadline.slice(0, -1)
        : `${currentHeadline}.`;
    console.log(
        `[naukri] headline: "${currentHeadline.slice(0, 40)}…" → toggled trailing dot`,
    );
    await headlineBox.fill(updatedHeadline);
    await page.getByRole('button', { name: 'Save' }).click();

    // Best-effort wait for the success banner. It doesn't always appear —
    // Naukri seems to skip it on rapid re-saves. Don't fail on its absence;
    // the "Profile last updated - Today" check at the end is the real proof.
    try {
        await page.getByText('Profile updated successfully').waitFor({
            state: 'visible',
            timeout: 5_000,
        });
        console.log('[naukri] save acknowledged ("Profile updated successfully")');
    } catch {
        console.log('[naukri] no success banner — continuing (safety net will verify)');
    }

    // Dismiss the Pro promo modal if it appeared — the `.ltLayer.open`
    // layer blocks every subsequent click on the profile page until closed.
    await dismissPromoModalIfPresent(page);

    // ── Delete the existing resume (only if one is uploaded) ──────────────
    // Skipping when no resume is present keeps the run idempotent: works
    // whether the previous run left a resume in place or not.
    const deleteIcon = page.locator('span').filter({ hasText: /^deleteOneTheme$/ });
    if ((await deleteIcon.count()) > 0) {
        await deleteIcon.first().click();
        await page.getByRole('button', { name: 'Delete' }).click();
        console.log('[naukri] existing resume deleted');
    } else {
        console.log('[naukri] no existing resume — skipping delete');
    }

    // ── Upload the freshly downloaded resume ──────────────────────────────
    // The promo modal can also pop up after the delete — clear it again
    // (no-op when absent) so the next click isn't intercepted.
    await dismissPromoModalIfPresent(page);
    await page.getByText('ResumeAdd 10%70% of').click();

    // The "Upload" link opens a native file chooser — intercept it with
    // waitForEvent('filechooser'); there is no real <input type="file">.
    const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByText('Already have a resume? Upload').click(),
    ]);
    await fileChooser.setFiles(resumePath);

    // ── SAFETY NET: resume MUST be present before we exit ─────────────────
    // If a previous run died between delete and upload, the profile is left
    // without a resume — never let THIS run finish in that state.
    await page.locator('#lazyAttachCV').getByText('Resume', { exact: true }).click();
    await expect(
        page.locator('#lazyAttachCV:has-text("downloadOneTheme")'),
        'resume is not visible on the profile — the upload step silently failed',
    ).toBeVisible({ timeout: 10_000 });

    // ── Verify the Naukri SERVER registered the update ────────────────────
    // The header shows "Profile last updated - Today" only when the server
    // accepted the changes — catches the case where the UI briefly looks
    // updated but the server silently dropped it.
    await expect(
        page.getByText(/Profile last updated\s*[-–]\s*Today/i),
        'Naukri did not mark the profile as "updated Today" — changes may not have persisted server-side',
    ).toBeVisible({ timeout: 10_000 });

    console.log(
        '[naukri] resume present + profile marked "updated Today" — daily run complete',
    );

    // Persist refreshed cookies so the session keeps living. Naukri rotates
    // auth tokens on every request with a sliding TTL — saving here keeps
    // state.json valid as long as this runs regularly.
    // await context.storageState({ path: 'state.json' });
});
test.afterAll(async () => {
    await sendTelegramAlert("[naukri] resume present + profile marked 'updated Today' — daily run complete")
    
  });
/**
 * Downloads the latest resume from the given URL into the OS temp dir and
 * returns the absolute path, ready for fileChooser.setFiles().
 */
async function downloadResume(url: string): Promise<string> {
    // Bounded so a hanging endpoint counts as a failure (and triggers the
    // local fallback) instead of stalling the whole run.
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });

    if (!res.ok) {
        throw new Error(
            `Resume fetch failed: ${res.status} ${res.statusText} (url: ${url})`,
        );
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0) {
        throw new Error(`Resume fetch returned an empty body (url: ${url})`);
    }

    const filename = inferFilename(res) ?? 'naukri-resume.pdf';
    const targetPath = path.join(os.tmpdir(), filename);
    fs.writeFileSync(targetPath, buffer);

    return targetPath;
}

/**
 * Extracts a filename from the Content-Disposition header, if present.
 */
function inferFilename(res: Response): string | null {
    const disposition = res.headers.get('content-disposition');
    if (!disposition) return null;
    const match = disposition.match(/filename="?([^";]+)"?/i);
    return match?.[1] ?? null;
}

/**
 * Naukri sometimes shows a "Power up your profile with Pro" promo modal
 * after profile updates (`.ltLayer.open`) that blocks all pointer events
 * beneath it. Try Escape first; fall back to clicking the close icon.
 */
async function dismissPromoModalIfPresent(page: Page): Promise<void> {
    const layer = page.locator('.ltLayer.open');

    if ((await layer.count()) === 0) {
        console.log('[naukri] no promo modal to dismiss');
        return;
    }

    console.log('[naukri] promo modal detected — dismissing');

    // Strategy 1: Escape. Works reliably headed; in headless the key event
    // sometimes doesn't reach the page, so fall through to clicking the X.
    await page.keyboard.press('Escape');
    try {
        await waitForCount(layer, 0, 2_000);
        console.log('[naukri] promo modal closed via Escape');
        return;
    } catch {
        // Escape didn't work — fall through to the click strategy.
    }

    // Strategy 2: click the close icon (icon-font glyph "CrossLayer", same
    // pattern as "editOneTheme"/"deleteOneTheme"); attribute selectors kept
    // as fallbacks in case the markup changes.
    const closeIcon = layer
        .getByText('CrossLayer', { exact: true })
        .or(
            layer.locator(
                '[name="close"], [class*="cross" i], [class*="close" i], [aria-label*="lose" i]',
            ),
        );
    if ((await closeIcon.count()) > 0) {
        await closeIcon.first().click({ force: true });
        await waitForCount(layer, 0, 5_000);
        console.log('[naukri] promo modal closed via close-icon click');
        return;
    }

    throw new Error(
        'Pro promo modal is open but neither Escape nor a close-icon click dismissed it. ' +
            'Capture the X-button selector via `npx playwright codegen` and add it here.',
    );
}

/**
 * Polls locator.count() until it equals `expected`, throwing if it doesn't
 * within `timeout` ms. Used for waiting on modal disappearance.
 */
async function waitForCount(
    locator: Locator,
    expected: number,
    timeout = 5_000,
): Promise<void> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        if ((await locator.count()) === expected) return;
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(
        `Locator did not reach count ${expected} within ${timeout}ms (last count: ${await locator.count()})`,
    );
}


async function sendTelegramAlert(text:any) {
    await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: CHAT_ID, text }),
    });
    console.log("text ---> ", text)
}

