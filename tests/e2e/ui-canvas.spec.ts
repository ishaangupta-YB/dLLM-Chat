import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import {
  buildState,
  expect,
  installStreamStub,
  lastAssistant,
  openApp,
  queueChat,
  readStore,
  sendMessage,
  test,
  waitForApp,
  waitForIdle,
} from './fixtures';

// Code canvas (CodeMirror per fenced block) and FIM ghost-text autocomplete.

const PY = 'def add(a, b):\n    return a + b\n\n\nprint(add(2, 3))';
const JS = 'const greet = (n) => `hi ${n}`;\nconsole.log(greet("x"));';

function canvasState(content: string, settings: Record<string, unknown> = { fimEnabled: false }) {
  return buildState({
    conversations: [
      {
        id: 'k',
        title: 'Code chat',
        messages: [
          { role: 'user', content: 'give me code' },
          { role: 'assistant', content, model: 'mercury-3', mode: 'streaming', durationMs: 300 },
        ],
      },
    ],
    activeId: 'k',
    settings,
  });
}

const canvases = (page: Page) => page.locator('[data-testid="code-canvas"]');

async function editorOf(page: Page, i = 0) {
  const card = canvases(page).nth(i);
  await expect(card).toHaveAttribute('data-state', 'editor');
  return card.locator('.cm-content');
}

async function storedAssistantContent(page: Page) {
  const s = await readStore(page);
  return s!.state.conversations.k.messages[1].content;
}

/** Replace the whole document with `text` (no auto-indent / bracket closing). */
async function replaceDoc(page: Page, i: number, text: string) {
  const ed = await editorOf(page, i);
  await ed.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(text);
}

test.describe('code canvas', () => {
  test('streamed fenced block renders a canvas; editor mounts after streaming', async ({ page }) => {
    await installStreamStub(page);
    await openApp(page, buildState({ settings: { fimEnabled: false } }));
    const reply = 'Here you go:\n\n```python\n' + PY + '\n```\n\nThat prints 5.';
    const chunks: string[] = [];
    for (let i = 0; i < reply.length; i += 6) chunks.push(reply.slice(i, i + 6));
    await queueChat(page, {
      steps: [
        ...chunks.map((v) => ({ delay: 40, event: { t: 'text' as const, v } })),
        { event: { t: 'finish' as const, reason: 'stop' } },
      ],
    });
    await sendMessage(page, 'code please');
    const card = canvases(page).first();
    await expect(card).toHaveAttribute('data-state', 'streaming');
    await expect(card.locator('.cm-editor')).toHaveCount(0);
    await waitForIdle(page);
    await expect(card).toHaveAttribute('data-state', 'editor');
    await expect(card.locator('.cm-editor')).toHaveCount(1);
    await expect(card.locator('[data-testid="code-canvas-language"]')).toHaveText(/python/i);
    await expect(card.locator('.cm-content')).toContainText('def add(a, b):');
    await expect(lastAssistant(page)).toContainText('That prints 5.');
    // The fence markers are not shown as prose.
    await expect(lastAssistant(page).getByText('```')).toHaveCount(0);
  });

  test('edit + Ctrl/Cmd+S saves into the message content', async ({ page }) => {
    await openApp(page, canvasState('Before\n\n```python\n' + PY + '\n```\n\nAfter'));
    const ed = await editorOf(page);
    await ed.click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText('\nprint("edited")');
    await expect(canvases(page).first().locator('[data-testid="code-canvas-dirty"]')).toBeVisible();
    await page.keyboard.press('ControlOrMeta+S');
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Saved to chat' })).toBeVisible();
    await expect(canvases(page).first().locator('[data-testid="code-canvas-dirty"]')).toHaveCount(0);
    await expect
      .poll(() => storedAssistantContent(page))
      .toBe('Before\n\n```python\n' + PY + '\nprint("edited")\n```\n\nAfter');
    // Survives a reload.
    await page.reload();
    await waitForApp(page);
    await expect(await editorOf(page)).toContainText('print("edited")');
  });

  test('clicking outside the canvas saves', async ({ page }) => {
    await openApp(page, canvasState('```python\n' + PY + '\n```'));
    const ed = await editorOf(page);
    await ed.click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText('\n# outside');
    await page.locator('header h1').click();
    await expect.poll(() => storedAssistantContent(page)).toBe('```python\n' + PY + '\n# outside\n```');
  });

  test('copy puts the exact code on the clipboard', async ({ page, context, baseURL }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL });
    await openApp(page, canvasState('```js\n' + JS + '\n```'));
    await editorOf(page);
    await canvases(page).first().getByTestId('code-canvas-copy').click();
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Copied to clipboard' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(JS);
    // Copy reflects unsaved edits too.
    await replaceDoc(page, 0, 'let x = 1;');
    await canvases(page).first().getByTestId('code-canvas-copy').click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('let x = 1;');
  });

  test('download saves the code with the right extension', async ({ page }) => {
    await openApp(page, canvasState('```python\n' + PY + '\n```'));
    await editorOf(page);
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      canvases(page).first().getByTestId('code-canvas-download').click(),
    ]);
    expect(dl.suggestedFilename()).toBe('snippet.py');
    expect(await readFile((await dl.path())!, 'utf8')).toBe(PY);
  });

  test('maximize and restore with Esc and the Restore button; edits survive', async ({ page }) => {
    await openApp(page, canvasState('```python\n' + PY + '\n```'));
    await editorOf(page);
    const card = canvases(page).first();
    await card.getByTestId('code-canvas-maximize').click();
    const overlay = page.getByTestId('code-canvas-overlay');
    await expect(overlay).toBeVisible();
    await expect(overlay.locator('.cm-editor')).toHaveCount(1);
    await expect(card.locator('.cm-editor')).toHaveCount(0);
    const box = await overlay.boundingBox();
    expect(box!.height).toBeGreaterThan(500);
    // Type in the maximized editor, then Esc closes it.
    await overlay.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText('\n# big');
    await page.keyboard.press('Escape');
    await expect(overlay).toHaveCount(0);
    await expect(card.locator('.cm-content')).toContainText('# big');
    // Restore via the toolbar button.
    await card.getByTestId('code-canvas-maximize').click();
    await expect(overlay).toBeVisible();
    await overlay.getByRole('button', { name: 'Restore' }).first().click();
    await expect(overlay).toHaveCount(0);
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  });

  test('resize handle changes the editor height', async ({ page }) => {
    const long = Array.from({ length: 60 }, (_, i) => `line_${i} = ${i}`).join('\n');
    await openApp(page, canvasState('```python\n' + long + '\n```'));
    await editorOf(page);
    const card = canvases(page).first();
    const h0 = (await card.boundingBox())!.height;
    const handle = card.getByTestId('code-canvas-resize');
    const hb = (await handle.boundingBox())!;
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2, hb.y - 150, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => (await card.boundingBox())!.height).toBeLessThan(h0 - 100);
    const h1 = (await card.boundingBox())!.height;
    // Keyboard resizing works too.
    await handle.focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect.poll(async () => (await card.boundingBox())!.height).toBeGreaterThan(h1 + 60);
  });

  test('multiple code blocks save into the right block', async ({ page }) => {
    const content = 'Two files:\n\n```python\n' + PY + '\n```\n\nand\n\n```js\n' + JS + '\n```\n\nDone.';
    await openApp(page, canvasState(content));
    await expect(canvases(page)).toHaveCount(2);
    await replaceDoc(page, 1, 'console.log("second block edited");');
    await page.keyboard.press('ControlOrMeta+S');
    await expect
      .poll(() => storedAssistantContent(page))
      .toBe('Two files:\n\n```python\n' + PY + '\n```\n\nand\n\n```js\nconsole.log("second block edited");\n```\n\nDone.');
    await replaceDoc(page, 0, 'print("first block edited")');
    await page.keyboard.press('ControlOrMeta+S');
    await expect
      .poll(() => storedAssistantContent(page))
      .toBe(
        'Two files:\n\n```python\nprint("first block edited")\n```\n\nand\n\n```js\nconsole.log("second block edited");\n```\n\nDone.',
      );
  });

  test('code containing ``` saves without breaking the markdown', async ({ page }) => {
    await openApp(page, canvasState('Intro\n\n```markdown\n# Title\n```\n\nOutro text stays prose.'));
    const tricky = '# Title\n\n```js\nconsole.log(1)\n```\n\nend';
    await replaceDoc(page, 0, tricky);
    await page.keyboard.press('ControlOrMeta+S');
    await expect.poll(() => storedAssistantContent(page)).toContain('````markdown');
    await page.reload();
    await waitForApp(page);
    await expect(canvases(page)).toHaveCount(1);
    const ed = await editorOf(page);
    await expect(ed).toContainText('```js');
    await expect(ed).toContainText('end');
    await expect(lastAssistant(page).locator('p', { hasText: 'Outro text stays prose.' })).toBeVisible();
  });

  test('regenerating a reply with a code block replaces the canvas content', async ({ page }) => {
    await installStreamStub(page);
    await openApp(page, canvasState('```python\nold_code = 1\n```'));
    await expect(await editorOf(page)).toContainText('old_code');
    await queueChat(page, {
      steps: [
        { event: { t: 'text', v: '```python\nnew_code = 2\n```' } },
        { event: { t: 'finish', reason: 'stop' } },
      ],
    });
    await lastAssistant(page).getByRole('button', { name: 'Regenerate response' }).click();
    await waitForIdle(page);
    await expect(await editorOf(page)).toContainText('new_code');
    await expect(canvases(page).first()).not.toContainText('old_code');
  });
});

test.describe('FIM autocomplete', () => {
  const FIM_DOC = 'def add(a, b):\n    return a + b\n\n\ndef multiply(a, b):\n    return a';

  test('ghost text from /api/fim; Tab accepts; Esc dismisses', async ({ page }) => {
    await openApp(page, canvasState('```python\n' + FIM_DOC + '\n```', { fimEnabled: true }));
    const ed = await editorOf(page);
    await ed.click();
    await page.keyboard.press('ControlOrMeta+End');
    const ghost = page.locator('.cm-fim-ghost, .cm-fim-ghost-block');

    // Type to trigger a real completion request.
    let fimResponse = page.waitForResponse((r) => r.url().includes('/api/fim') && r.request().method() === 'POST');
    await page.keyboard.type(' ');
    expect((await fimResponse).status()).toBe(200);
    await expect(ghost.first()).toBeVisible({ timeout: 15_000 });
    // Ghost text without the "Tab" hint pill.
    const suggestion = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.cm-fim-ghost, .cm-fim-ghost-block'))
        .map((el) => {
          const c = el.cloneNode(true) as HTMLElement;
          c.querySelectorAll('.cm-fim-hint').forEach((h) => h.remove());
          return c.textContent ?? '';
        })
        .join(''),
    );
    expect(suggestion.trim().length).toBeGreaterThan(0);
    await expect(page.getByTestId('code-canvas-fim-status').first()).toContainText('accept');

    await page.keyboard.press('Tab');
    await expect(ghost).toHaveCount(0);
    const docText = await ed.innerText();
    expect(docText.replace(/\s+/g, '')).toContain(('return a ' + suggestion).replace(/\s+/g, ''));

    // New suggestion, then Esc dismisses without changing the doc.
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.press('Enter');
    fimResponse = page.waitForResponse((r) => r.url().includes('/api/fim'));
    await page.keyboard.type('print(multiply(');
    await fimResponse;
    await expect(ghost.first()).toBeVisible({ timeout: 15_000 });
    const docOnly = () =>
      ed.evaluate((el) => {
        const c = el.cloneNode(true) as HTMLElement;
        c.querySelectorAll('.cm-fim-ghost, .cm-fim-ghost-block, .cm-fim-hint').forEach((g) => g.remove());
        return Array.from(c.querySelectorAll('.cm-line')).map((l) => l.textContent).join('\n');
      });
    const before = await docOnly();
    expect(before).toContain('print(multiply(');
    await page.keyboard.press('Escape');
    await expect(ghost).toHaveCount(0);
    expect(await docOnly()).toBe(before);
  });

  test('turning Autocomplete off stops requests and persists', async ({ page }) => {
    await openApp(page, canvasState('```python\n' + FIM_DOC + '\n```', { fimEnabled: true }));
    const ed = await editorOf(page);
    const fimRequests: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/fim')) fimRequests.push(r.url());
    });
    const toggle = canvases(page).first().getByRole('switch', { name: 'Autocomplete' });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId('code-canvas-fim-status').first()).toContainText('Autocomplete off');
    // The composer settings menu mirrors the setting.
    await page.getByRole('button', { name: 'Chat settings' }).click();
    await expect(page.getByRole('menuitemcheckbox', { name: /Code autocomplete \(FIM\)/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await page.keyboard.press('Escape');
    await ed.click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type(' * b\n\nprint(1');
    await page.waitForTimeout(1500);
    expect(fimRequests).toEqual([]);
    await expect(page.locator('.cm-fim-ghost, .cm-fim-ghost-block')).toHaveCount(0);
    await expect.poll(async () => (await readStore(page))?.state.settings.fimEnabled).toBe(false);

    await page.reload();
    await waitForApp(page);
    await editorOf(page);
    await expect(canvases(page).first().getByRole('switch', { name: 'Autocomplete' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });
});
