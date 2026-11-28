import type { Page } from '@playwright/test';
import { BASE_SETTINGS, expect, seed, STORAGE_KEY, test } from './fixtures';

// Coding agent mode. One test uses the real model (lean: a single prompt);
// the others seed crafted projects so they are fast and deterministic.
// Set V2C_SHOTS=<dir> to also save screenshots.

const SHOTS = process.env.V2C_SHOTS;
const VERSIONS_KEY = 'dllm-chat:code-versions';

function codeState(opts: { files?: Record<string, string>; messages?: unknown[]; appMode?: 'chat' | 'code'; id?: string } = {}) {
  const id = opts.id ?? 'code-1';
  const t = Date.now();
  return {
    state: {
      conversations: {
        [id]: {
          id,
          title: 'Crafted project',
          createdAt: t - 5000,
          updatedAt: t - 1000,
          titleSource: 'user',
          kind: 'code',
          messages: opts.messages ?? [],
          project: { files: opts.files ?? {}, version: 1 },
        },
      },
      activeId: id,
      settings: { ...BASE_SETTINGS, appMode: opts.appMode ?? 'code', reasoningEffort: 'low' },
    },
    version: 1,
  };
}

async function seedVersions(page: Page, value: unknown) {
  await page.addInitScript(
    ({ key, v }) => {
      try {
        if (!sessionStorage.getItem('__e2e_versions')) {
          localStorage.setItem(key, v);
          sessionStorage.setItem('__e2e_versions', '1');
        }
      } catch {
        /* sandboxed frames */
      }
    },
    { key: VERSIONS_KEY, v: JSON.stringify(value) },
  );
}

const previewFrame = (page: Page) => page.frameLocator('[data-testid="preview-iframe"]');

async function openConsole(page: Page) {
  const btn = page.getByTestId('preview-console').getByRole('button', { name: /Console/ });
  if ((await btn.getAttribute('aria-expanded')) !== 'true') await btn.click();
  return page.locator('#preview-console-list');
}

test.describe('coding agent', () => {
  test('real model builds a counter app: files, live preview, console, versions', async ({ page }) => {
    test.setTimeout(180_000);
    await seed(page, { state: { conversations: {}, activeId: null, settings: { ...BASE_SETTINGS, reasoningEffort: 'low' } }, version: 1 });
    await page.goto('/');
    await expect(page.locator('#composer-input')).toBeVisible();

    // Switch to Code mode with the header switch.
    await page.getByRole('radio', { name: 'Code' }).click();
    await expect(page.getByTestId('code-agent')).toBeVisible();
    await expect(page.getByTestId('code-suggestions')).toBeVisible();
    await expect(page.getByTestId('runtime-menu')).toBeVisible();

    const input = page.locator('#code-agent-input');
    await input.fill(
      'Build a simple counter page with a button labeled "Increment" that increases a number shown in an element with id "count" (starting at 0). Each click must call console.log("count", value).',
    );
    await input.press('Enter');

    // Tool chips appear while the agent works, then the turn finishes.
    await expect(page.getByTestId('tool-chip').first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: 'Stop' })).toHaveCount(0, { timeout: 150_000 });
    await expect(page.getByTestId('code-assistant-message').last()).not.toContainText('error', { ignoreCase: true });

    // Version checkpoint for the turn.
    await expect(page.getByTestId('version-checkpoint').last()).toContainText('v1');

    // Preview: the button works inside the sandboxed iframe.
    const frame = previewFrame(page);
    const count = frame.locator('#count');
    await expect(count).toHaveText(/0/, { timeout: 20_000 });
    await frame.getByRole('button', { name: /Increment/i }).click();
    await expect(count).toHaveText(/1/);

    // Console panel captured the log from the frame.
    const list = await openConsole(page);
    await expect(list).toContainText('count');

    if (SHOTS) await page.screenshot({ path: `${SHOTS}/v2c-desktop-light.png` });

    // Code tab: the file tree lists index.html and the editor opens it.
    await page.getByRole('tab', { name: 'Code' }).click();
    await expect(page.getByTestId('file-index.html')).toBeVisible();
    await page.getByTestId('file-index.html').click();
    await expect(page.getByTestId('editor-path')).toHaveText('index.html');
    await expect(page.getByTestId('code-editor').locator('.cm-content')).toContainText('count');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/v2c-code-light.png` });

    // Switching back to chat mode works.
    await page.getByRole('radio', { name: 'Chat' }).click();
    await expect(page.getByTestId('code-agent')).toHaveCount(0);
    await expect(page.locator('#composer-input')).toBeVisible();
  });

  test('preview is sandboxed: no parent storage, cookies or DOM; opaque origin', async ({ page }) => {
    const probe = `<!doctype html><html><head><title>probe</title></head><body><h1 id="h">Probe</h1>
<script>
var out = [];
try { var v = parent.localStorage.getItem('${STORAGE_KEY}'); out.push('LEAK-parent-storage:' + (v ? v.length : 'null')); } catch (e) { out.push('blocked-parent-storage'); }
try { parent.document.title; out.push('LEAK-parent-dom'); } catch (e) { out.push('blocked-parent-dom'); }
try { localStorage.setItem('k', 'v'); out.push('shim-storage:' + localStorage.getItem('k') + ':' + localStorage.getItem('${STORAGE_KEY}')); } catch (e) { out.push('storage-throws'); }
out.push('cookie:' + JSON.stringify(document.cookie));
out.push('origin:' + self.origin);
console.log('PROBE ' + out.join(' '));
</script></body></html>`;
    await seed(page, codeState({ files: { 'index.html': probe } }));
    await page.goto('/');
    const frame = previewFrame(page);
    await expect(frame.locator('#h')).toHaveText('Probe');

    const list = await openConsole(page);
    await expect(list).toContainText('PROBE');
    const text = (await list.textContent()) ?? '';
    expect(text).toContain('blocked-parent-storage');
    expect(text).toContain('blocked-parent-dom');
    expect(text).toContain('shim-storage:v:null');
    expect(text).toContain('cookie:""');
    expect(text).toContain('origin:null');
    expect(text).not.toContain('LEAK');

    // Same checks from the test side.
    const handle = await page.locator('[data-testid="preview-iframe"]').elementHandle();
    const f = await handle!.contentFrame();
    const res = await f!.evaluate(() => {
      const r: Record<string, string> = { origin: self.origin };
      try {
        r.parent = String(window.parent.localStorage.length);
      } catch (e) {
        r.parent = 'blocked:' + (e as Error).name;
      }
      return r;
    });
    expect(res.origin).toBe('null');
    expect(res.parent).toMatch(/^blocked/);
    expect(await handle!.getAttribute('sandbox')).toBe('allow-scripts allow-forms allow-modals');
  });

  test('multi-file project renders, console captures logs and errors, open in new tab', async ({ page, context, allowConsole }) => {
    allowConsole(/Boom from app/);
    const files = {
      'index.html':
        '<!doctype html><html><head><link rel="stylesheet" href="styles.css"></head><body><h1 id="t">Multi file</h1><button id="b">0</button><script src="script.js" defer></script></body></html>',
      'styles.css': 'h1{color:rgb(255, 0, 0)}',
      'script.js':
        'var n=0;document.getElementById("b").addEventListener("click",function(){n++;this.textContent=n;console.log("clicked",n)});console.log("hello from script");console.error("Boom from app");',
    };
    await seed(page, codeState({ files }));
    await page.goto('/');
    const frame = previewFrame(page);
    await expect(frame.locator('#t')).toHaveCSS('color', 'rgb(255, 0, 0)');
    await frame.locator('#b').click();
    await expect(frame.locator('#b')).toHaveText('1');

    const list = await openConsole(page);
    await expect(list).toContainText('hello from script');
    await expect(list).toContainText('clicked 1');
    await expect(list.locator('[data-level="error"]')).toContainText('Boom from app');
    await expect(page.getByTestId('preview-console')).toContainText('1 error');

    // Device width toggle.
    await page.getByTestId('device-mobile').click();
    await expect.poll(async () => (await page.locator('[data-testid="preview-iframe"]').boundingBox())?.width ?? 0).toBeLessThan(400);
    await page.getByTestId('device-desktop').click();

    // Open in new tab: fragment URL on the sandboxed route.
    const [tab] = await Promise.all([context.waitForEvent('page'), page.getByTestId('preview-open-tab').click()]);
    await tab.waitForLoadState();
    expect(new URL(tab.url()).pathname).toBe('/preview-frame');
    expect(new URL(tab.url()).hash).toMatch(/^#doc=[\w-]+$/);
    await expect(tab.locator('#t')).toHaveText('Multi file');
    await expect(tab.locator('#t')).toHaveCSS('color', 'rgb(255, 0, 0)');
    const tabInfo = await tab.evaluate(() => ({ origin: self.origin, stored: localStorage.getItem('dllm-chat:v2') }));
    expect(tabInfo).toEqual({ origin: 'null', stored: null });
    await tab.close();
  });

  test('version restore swaps the project and updates the preview', async ({ page }) => {
    const v1 = { 'index.html': '<!doctype html><h1 id="v">Version one</h1>' };
    const v2 = { 'index.html': '<!doctype html><h1 id="v">Version two</h1>' };
    const t = Date.now();
    const messages = [
      { id: 'u1', role: 'user', content: 'Make v1', createdAt: t - 4000 },
      { id: 'a1', role: 'assistant', content: 'Done v1', createdAt: t - 3000, filesChanged: ['index.html'], toolCalls: [{ id: 'c1', name: 'write_file', args: '{"path":"index.html"}', status: 'done', startedAt: t - 3000 }] },
      { id: 'u2', role: 'user', content: 'Make v2', createdAt: t - 2000 },
      { id: 'a2', role: 'assistant', content: 'Done v2', createdAt: t - 1000, filesChanged: ['index.html'], toolCalls: [{ id: 'c2', name: 'edit_file', args: '{"path":"index.html"}', status: 'done', startedAt: t - 1000 }] },
    ];
    await seedVersions(page, {
      state: {
        byConversation: {
          'code-1': [
            { id: 'v1', messageId: 'a1', n: 1, files: v1, createdAt: t - 3000 },
            { id: 'v2', messageId: 'a2', n: 2, files: v2, createdAt: t - 1000 },
          ],
        },
      },
      version: 1,
    });
    await seed(page, codeState({ files: v2, messages }));
    await page.goto('/');
    const frame = previewFrame(page);
    await expect(frame.locator('#v')).toHaveText('Version two');
    await expect(page.getByText('Wrote index.html')).toBeVisible();
    await expect(page.getByText('Edited index.html')).toBeVisible();

    const checkpoints = page.getByTestId('version-checkpoint');
    await expect(checkpoints.nth(1)).toContainText('v2 · Current');
    await checkpoints.nth(0).getByRole('button', { name: /v1 · Restore/ }).click();
    await expect(frame.locator('#v')).toHaveText('Version one');
    await expect(checkpoints.nth(0)).toContainText('v1 · Current');

    // And back via the toolbar version menu.
    await page.getByTestId('version-menu').click();
    await page.getByRole('menuitem', { name: /Version 2/ }).click();
    await expect(frame.locator('#v')).toHaveText('Version two');

    // Persisted in the project.
    const files = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').state.conversations['code-1'].project.files, STORAGE_KEY);
    expect(files['index.html']).toContain('Version two');
  });

  test('editing a file in the Code tab updates the project and the preview', async ({ page }) => {
    await seed(page, codeState({ files: { 'index.html': '<!doctype html><h1 id="x">Hello</h1>' } }));
    await page.goto('/');
    await expect(previewFrame(page).locator('#x')).toHaveText('Hello');
    await page.getByRole('tab', { name: 'Code' }).click();
    const content = page.getByTestId('code-editor').locator('.cm-content');
    await expect(content).toContainText('Hello');
    await content.click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type('<p id="y">Edited by hand</p>');
    await page.keyboard.press('ControlOrMeta+s');
    await page.getByRole('tab', { name: 'Preview' }).click();
    await expect(previewFrame(page).locator('#y')).toHaveText('Edited by hand');
  });

  test('sandbox runtime is shown as coming soon', async ({ page }) => {
    await seed(page, codeState());
    await page.goto('/');
    await page.getByTestId('runtime-menu').click();
    const item = page.getByTestId('sandbox-coming-soon');
    await expect(item).toContainText('Coming soon');
    await expect(item).toHaveAttribute('aria-disabled', 'true');
  });

  test('main app headers unchanged; preview route has its own CSP', async ({ request }) => {
    const app = (await request.get('/')).headers();
    expect(app['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(app['content-security-policy']).toContain("default-src 'self'");
    expect(app['x-frame-options']).toBe('DENY');
    expect(app['cross-origin-opener-policy']).toBe('same-origin');

    const pv = (await request.get('/preview-frame')).headers();
    const csp = pv['content-security-policy'] ?? '';
    expect(csp).toContain('sandbox allow-scripts allow-forms allow-modals');
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toContain('allow-same-origin');
    expect(pv['x-frame-options']).toBeUndefined();
  });
});

test.describe('coding agent @responsive', () => {
  test('mobile uses Chat | Preview | Code tabs', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', 'mobile only');
    await seed(page, codeState({
      files: { 'index.html': '<!doctype html><meta name="viewport" content="width=device-width"><h1 id="m" style="font-family:sans-serif">Mobile preview</h1>' },
      messages: [{ id: 'u', role: 'user', content: 'Build a mobile page', createdAt: Date.now() - 1000 }, { id: 'a', role: 'assistant', content: 'Built a page.', createdAt: Date.now() }],
    }));
    await page.goto('/');
    await expect(page.getByRole('tab', { name: 'Chat' })).toBeVisible();
    await expect(page.locator('#code-agent-input')).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/v2c-mobile-chat.png` });
    await page.getByRole('tab', { name: 'Preview' }).click();
    await expect(previewFrame(page).locator('#m')).toHaveText('Mobile preview');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/v2c-mobile-preview.png` });
    await page.getByRole('tab', { name: 'Code' }).click();
    await expect(page.getByTestId('code-editor')).toBeVisible();
  });
});
