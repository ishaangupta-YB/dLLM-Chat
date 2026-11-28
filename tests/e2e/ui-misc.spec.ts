import type { Page } from '@playwright/test';
import {
  activeConversation,
  buildState,
  expect,
  installStreamStub,
  lastAssistant,
  openApp,
  paceRealRequest,
  queueChat,
  sendMessage,
  test,
  textReply,
  waitForApp,
  waitForIdle,
  type SeedConversation,
} from './fixtures';

// Voice, security, responsive layout, performance and markdown edge cases.

/* ===================================================================== voice */

/** A fake recognizer: the first instance "hears" `phrase`, later ones wait. */
async function fakeSpeech(page: Page, phrase: string) {
  await page.addInitScript((text) => {
    let used = false;
    class FakeRecognition extends EventTarget {
      continuous = false;
      interimResults = true;
      lang = 'en-US';
      maxAlternatives = 1;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: ((e: unknown) => void) | null = null;
      onstart: ((e: unknown) => void) | null = null;
      private ended = false;
      start() {
        const first = !used;
        used = true;
        setTimeout(() => this.onstart?.(new Event('start')), 10);
        if (!first) return;
        setTimeout(() => {
          const result = Object.assign([{ transcript: text }], { isFinal: true });
          this.onresult?.({ resultIndex: 0, results: [result] });
          this.finish();
        }, 150);
      }
      private finish() {
        if (this.ended) return;
        this.ended = true;
        setTimeout(() => this.onend?.(new Event('end')), 10);
      }
      stop() {
        this.finish();
      }
      abort() {
        this.ended = true;
      }
    }
    const w = window as unknown as Record<string, unknown>;
    w.SpeechRecognition = FakeRecognition;
    w.webkitSpeechRecognition = FakeRecognition;
    // No microphone in CI: the level meter reports "unsupported" and voice mode continues.
    try {
      Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    } catch {
      /* ignore */
    }
  }, phrase);
}

test.describe('voice mode', () => {
  test('button opens the overlay; Esc and End close it', async ({ page }) => {
    await fakeSpeech(page, '');
    await openApp(page, buildState({ settings: { voiceAutoSpeak: false } }));
    const button = page.getByTestId('voice-mode-button');
    await expect(button).toBeEnabled();
    await button.click();
    const overlay = page.getByTestId('voice-overlay');
    await expect(overlay).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(overlay).toHaveCount(0);
    await button.click();
    await expect(overlay).toBeVisible();
    await overlay.getByRole('button', { name: 'End voice mode' }).click();
    await expect(overlay).toHaveCount(0);
    await button.click();
    await overlay.getByRole('button', { name: 'Close voice mode' }).click();
    await expect(overlay).toHaveCount(0);
  });

  test('a voice turn is sent with voice:true and saved in the conversation', async ({ page }) => {
    await fakeSpeech(page, 'what is two plus two');
    await installStreamStub(page);
    await openApp(page, buildState({ settings: { voiceAutoSpeak: false } }));
    await queueChat(page, textReply('Two plus two is four.', { delay: 20 }));
    await page.getByTestId('voice-mode-button').click();
    const overlay = page.getByTestId('voice-overlay');
    await expect(overlay).toContainText('Two plus two is four.');
    await page.keyboard.press('Escape');
    await expect(overlay).toHaveCount(0);
    const conv = await activeConversation(page);
    expect(conv!.messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'what is two plus two'],
      ['assistant', 'Two plus two is four.'],
    ]);
    expect(conv!.messages.every((m) => (m as { voice?: boolean }).voice === true)).toBe(true);
    await expect(page.locator('.is-user')).toContainText('Voice');
    const req = (await page.evaluate(() => (window as unknown as { __chatRequests: { voice?: boolean }[] }).__chatRequests));
    expect(req[0].voice).toBe(true);
  });

  test('voice button is disabled without SpeechRecognition', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      delete w.SpeechRecognition;
      delete w.webkitSpeechRecognition;
    });
    await openApp(page);
    await expect(page.getByTestId('voice-mode-button')).toBeDisabled();
    // Dictation is hidden as well.
    await expect(page.getByRole('button', { name: 'Dictate' })).toHaveCount(0);
  });
});

/* ================================================================== security */

test.describe('security', () => {
  test('the API key never reaches the browser', async ({ page, baseURL }) => {
    const key = process.env.INCEPTION_API_KEY || process.env.DLLM_API_KEY;
    test.skip(!key, 'no key in the test runner env');
    const leaks: string[] = [];
    const pending: Promise<void>[] = [];
    page.on('response', (res) => {
      if (!res.url().startsWith(baseURL!)) return;
      pending.push(
        res
          .text()
          .then((body) => {
            if (body.includes(key!)) leaks.push(res.url());
          })
          .catch(() => {}),
      );
    });
    // Load the app with a code block so the lazy editor chunks are fetched too.
    await openApp(
      page,
      buildState({
        conversations: [
          {
            id: 's',
            title: 'Sec',
            messages: [
              { role: 'user', content: 'code' },
              { role: 'assistant', content: '```python\nprint(1)\n```' },
            ],
          },
        ],
        activeId: 's',
      }),
    );
    await expect(page.locator('[data-testid="code-canvas"]')).toHaveAttribute('data-state', 'editor');
    await paceRealRequest(page);
    await sendMessage(page, 'Reply with the single word: ok');
    await waitForIdle(page);
    await page.waitForLoadState('networkidle');
    await Promise.all(pending);
    const html = await page.content();
    expect(html.includes(key!), 'key in DOM').toBe(false);
    const inGlobals = await page.evaluate((k) => {
      const seen = new Set<unknown>();
      const scan = (o: unknown, depth: number): boolean => {
        if (typeof o === 'string') return o.includes(k);
        if (!o || typeof o !== 'object' || depth > 3 || seen.has(o)) return false;
        seen.add(o);
        try {
          return Object.values(o as Record<string, unknown>).some((v) => scan(v, depth + 1));
        } catch {
          return false;
        }
      };
      const w = window as unknown as Record<string, unknown>;
      return ['__NEXT_DATA__', 'process', '__next_f', 'ENV', 'env'].some((n) => scan(w[n], 0)) || JSON.stringify(localStorage).includes(k);
    }, key!);
    expect(inGlobals, 'key in window globals or storage').toBe(false);
    expect(leaks, 'responses containing the key').toEqual([]);
  });

  test('/api/chat and /api/fim reject a foreign Origin', async ({ page }) => {
    const body = { messages: [{ role: 'user', content: 'x' }], model: 'mercury-3', mode: 'streaming', reasoningEffort: 'instant' };
    const chat = await page.request.post('/api/chat', { headers: { Origin: 'https://evil.example' }, data: body });
    expect(chat.status()).toBe(403);
    expect((await chat.json()).error.code).toBe('forbidden_origin');
    const fim = await page.request.post('/api/fim', {
      headers: { Origin: 'https://evil.example' },
      data: { prompt: 'a', suffix: 'b' },
    });
    expect(fim.status()).toBe(403);
    const referer = await page.request.post('/api/chat', {
      headers: { Origin: '', Referer: 'https://evil.example/page' },
      data: body,
    });
    expect(referer.status()).toBe(403);
  });

  test('security headers are set', async ({ page }) => {
    const res = await page.request.get('/');
    const h = res.headers();
    expect(h['permissions-policy'] ?? '').toContain('microphone=(self)');
    expect(h['x-powered-by']).toBeUndefined();
  });
});

/* ================================================================ responsive */

const richConversation: SeedConversation = {
  id: 'r',
  title: 'A rich conversation with a long title that should truncate nicely in narrow layouts',
  messages: [
    { role: 'user', content: 'Show me everything ' + 'x'.repeat(300) },
    {
      role: 'assistant',
      content:
        '## Table\n\n| Model | Speed | Notes |\n| --- | --- | --- |\n| Mercury 3 | ~1000 tok/s | diffusion, very fast and very long note text here |\n| Other | 80 tok/s | autoregressive |\n\n' +
        '```python\n' +
        'very_long_line = "' +
        'y'.repeat(400) +
        '"\nprint(very_long_line)\n```\n\nA long url: https://example.com/' +
        'segment/'.repeat(40) +
        '\n\nunbroken ' +
        'z'.repeat(800),
      model: 'mercury-3',
      mode: 'streaming',
      durationMs: 500,
    },
  ],
};

async function expectNoHorizontalOverflow(page: Page) {
  const { sw, iw } = await page.evaluate(() => ({
    sw: document.scrollingElement!.scrollWidth,
    iw: window.innerWidth,
  }));
  expect(sw, 'document scrollWidth <= innerWidth').toBeLessThanOrEqual(iw);
  // The chat column itself must not scroll sideways either.
  const inner = await page.evaluate(() => {
    const log = document.querySelector('[role="log"]') as HTMLElement | null;
    return log ? log.scrollWidth - log.clientWidth : 0;
  });
  expect(inner, 'thread has no horizontal scroll').toBeLessThanOrEqual(1);
}

test.describe('responsive @responsive', () => {
  test('phone 390x844: sidebar sheet, usable composer, no horizontal scroll, canvas fits', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installStreamStub(page);
    const other: SeedConversation = { id: 'o', title: 'Other chat', messages: [{ role: 'user', content: 'hi other' }, { role: 'assistant', content: 'other answer' }] };
    await openApp(page, buildState({ conversations: [richConversation, other], activeId: 'r' }));

    // Sidebar is hidden and opens as a sheet.
    await expect(page.locator('[data-sidebar="menu-button"][title="Other chat"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Toggle Sidebar' }).first().click();
    const sheet = page.locator('[data-mobile="true"]');
    await expect(sheet).toBeVisible();
    const sheetBox = (await sheet.boundingBox())!;
    expect(sheetBox.width).toBeLessThanOrEqual(390);
    await sheet.locator('[data-sidebar="menu-button"][title="Other chat"]').click();
    await expect(sheet).toHaveCount(0);
    await expect(page.locator('header h1')).toHaveText('Other chat');
    await page.getByRole('button', { name: 'Toggle Sidebar' }).first().click();
    await page.locator('[data-mobile="true"] [data-sidebar="menu-button"][title^="A rich conversation"]').click();
    await expect(page.locator('[data-mobile="true"]')).toHaveCount(0);

    await expect(page.locator('[data-testid="code-canvas"]').first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
    const canvasBox = (await page.locator('[data-testid="code-canvas"]').first().boundingBox())!;
    expect(canvasBox.x).toBeGreaterThanOrEqual(0);
    expect(canvasBox.x + canvasBox.width).toBeLessThanOrEqual(390);
    const table = page.locator('table').first();
    const tb = (await table.boundingBox())!;
    expect(tb.x + Math.min(tb.width, 390)).toBeLessThanOrEqual(390 + 1);

    // Composer is usable and fully on screen.
    const composer = page.locator('#composer-input');
    const cb = (await composer.boundingBox())!;
    expect(cb.x).toBeGreaterThanOrEqual(0);
    expect(cb.x + cb.width).toBeLessThanOrEqual(390);
    expect(cb.y + cb.height).toBeLessThanOrEqual(844);
    const send = page.getByRole('button', { name: 'Send message' });
    const sb = (await send.boundingBox())!;
    expect(sb.x + sb.width).toBeLessThanOrEqual(390);
    await queueChat(page, textReply('Mobile reply works.'));
    await composer.click();
    await composer.fill('hello from a phone');
    await send.click();
    await expect(lastAssistant(page)).toContainText('Mobile reply works.');
    await expectNoHorizontalOverflow(page);

    // Maximized canvas fits the viewport.
    await waitForIdle(page);
    await page.getByTestId('code-canvas-maximize').first().click();
    const overlay = page.getByTestId('code-canvas-overlay');
    await expect(overlay).toBeVisible();
    const ob = (await overlay.boundingBox())!;
    expect(ob.x).toBeGreaterThanOrEqual(0);
    expect(ob.x + ob.width).toBeLessThanOrEqual(390);
    await page.keyboard.press('Escape');
    await expect(overlay).toHaveCount(0);
  });

  for (const vp of [
    { width: 768, height: 1024 },
    { width: 1920, height: 1080 },
  ]) {
    test(`no horizontal overflow at ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await openApp(page, buildState({ conversations: [richConversation], activeId: 'r' }));
      await expect(page.locator('[data-testid="code-canvas"]').first()).toBeVisible();
      await expectNoHorizontalOverflow(page);
      // Empty state too.
      await page.keyboard.press('Control+Shift+O');
      await expect(page.getByRole('button', { name: /Detect a cycle/ })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  }

  test('empty state on a phone has no horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openApp(page);
    await expect(page.getByRole('button', { name: /Detect a cycle/ })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

/* =============================================================== performance */

test.describe('performance', () => {
  test('no long task > 250ms during a long real streaming reply', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop budget only');
    test.setTimeout(150_000);
    await openApp(page);
    await page.evaluate(() => {
      const w = window as unknown as { __longTasks: number[] };
      w.__longTasks = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__longTasks.push(Math.round(e.duration));
      }).observe({ type: 'longtask' });
    });
    await paceRealRequest(page);
    await sendMessage(
      page,
      'Write a detailed essay of about 1100 words on the history of computing, from the abacus to modern GPUs. Use several headings, some bullet lists and one short Python code block.',
    );
    await waitForIdle(page, 120_000);
    // Let the final render settle.
    await page.waitForTimeout(1000);
    const conv = await activeConversation(page);
    const reply = conv!.messages[1];
    expect(reply.error).toBeUndefined();
    expect(reply.content.length, 'a long reply').toBeGreaterThan(4000);
    const tasks = await page.evaluate(() => (window as unknown as { __longTasks: number[] }).__longTasks);
    testInfo.annotations.push({ type: 'long tasks (ms)', description: JSON.stringify(tasks) });
    expect(Math.max(0, ...tasks), `long tasks: ${JSON.stringify(tasks)}`).toBeLessThanOrEqual(250);
  });

  test('60 seeded messages render and scroll without errors', async ({ page }) => {
    const messages = Array.from({ length: 60 }, (_, i) =>
      i % 2 === 0
        ? { role: 'user' as const, content: `Question number ${i / 2}` }
        : {
            role: 'assistant' as const,
            content:
              `### Answer ${(i - 1) / 2}\n\nSome **bold** text and a list:\n\n- a\n- b\n\n` +
              (i % 6 === 1 ? '```js\nconsole.log(' + i + ');\n```\n' : '') +
              `Final line of answer ${(i - 1) / 2}.`,
            model: 'mercury-3',
            mode: 'streaming',
            durationMs: 100,
          },
    );
    const t0 = Date.now();
    await openApp(page, buildState({ conversations: [{ id: 'big', title: 'Big chat', messages }], activeId: 'big' }));
    await expect(page.locator('.is-user')).toHaveCount(30);
    await expect(page.locator('.is-assistant')).toHaveCount(30);
    expect(Date.now() - t0).toBeLessThan(15_000);
    // Starts at the bottom.
    await expect(page.getByText('Final line of answer 29.')).toBeInViewport();
    // Scroll to the very top.
    const log = page.locator('[role="log"]');
    for (let i = 0; i < 40; i++) {
      await log.hover();
      await page.mouse.wheel(0, -2000);
      if (await page.getByText('Question number 0', { exact: true }).isVisible()) {
        const inView = await page
          .getByText('Question number 0', { exact: true })
          .evaluate((el) => el.getBoundingClientRect().top >= 0);
        if (inView) break;
      }
    }
    await expect(page.getByText('Question number 0', { exact: true })).toBeInViewport();
    const scrollBtn = page.getByRole('button', { name: 'Scroll to latest message' });
    await expect(scrollBtn).toBeVisible();
    await scrollBtn.click();
    await expect(page.getByText('Final line of answer 29.')).toBeInViewport();
    // Code canvases in view have mounted the editor.
    await expect(page.locator('[data-testid="code-canvas"][data-state="editor"]').last()).toBeVisible();
  });
});

/* ================================================================== markdown */

test.describe('markdown edge cases', () => {
  async function render(page: Page, content: string) {
    await queueChat(page, textReply(content, { chunk: 40 }));
    await sendMessage(page, 'render');
    await waitForIdle(page);
    return lastAssistant(page);
  }

  test('tables, math, lists and a code fence nested in a list', async ({ page }) => {
    await installStreamStub(page);
    await openApp(page, buildState({ settings: { fimEnabled: false } }));
    const reply = await render(
      page,
      '| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n\n' +
        'Inline math $$a^2 + b^2 = c^2$$ costs $5 or $10 and block:\n\n$$\n\\int_0^1 x\\,dx = \\frac{1}{2}\n$$\n\n' +
        '- top\n  - nested\n    - deeper\n\n' +
        '1. Step one\n   ```bash\n   echo hi\n   ```\n2. Step two\n',
    );
    await expect(reply.locator('table th')).toHaveText(['A', 'B']);
    await expect(reply.locator('table td')).toHaveText(['1', '2', '3', '4']);
    await expect(reply.locator('.katex').first()).toBeVisible();
    expect(await reply.locator('.katex').count()).toBeGreaterThanOrEqual(2);
    // Currency is not mistaken for math.
    await expect(reply).toContainText('costs $5 or $10');
    await expect(reply.locator('ul ul ul li')).toHaveText('deeper');
    const canvas = reply.locator('[data-testid="code-canvas"]');
    await expect(canvas).toHaveCount(1);
    await expect(canvas).toHaveAttribute('data-state', 'editor');
    await expect(canvas.locator('.cm-content')).toHaveText('echo hi');
    await expect(reply.getByText('Step one')).toBeVisible();
    await expect(reply.getByText('Step two')).toBeVisible();
  });

  test('an unclosed fence streams into a canvas and becomes editable when the reply ends', async ({ page }) => {
    await installStreamStub(page);
    await openApp(page, buildState({ settings: { fimEnabled: false } }));
    await queueChat(page, {
      steps: [
        { event: { t: 'text', v: 'Code:\n\n```python\nprint("a")\n' } },
        { delay: 400, event: { t: 'text', v: 'print("b")\n' } },
        { delay: 400, event: { t: 'finish', reason: 'length' } },
      ],
    });
    await sendMessage(page, 'unclosed');
    const canvas = lastAssistant(page).locator('[data-testid="code-canvas"]');
    await expect(canvas).toHaveAttribute('data-state', 'streaming');
    await expect(canvas).toContainText('print("a")');
    await expect(lastAssistant(page)).not.toContainText('```');
    await waitForIdle(page);
    await expect(canvas).toHaveAttribute('data-state', 'editor');
    await expect(canvas.locator('.cm-content')).toContainText('print("b")');
    await expect(canvas).not.toContainText('Writing…');
  });

  test('a very long single line does not break the layout', async ({ page }) => {
    await installStreamStub(page);
    await openApp(page);
    const reply = await render(page, 'Start ' + 'W'.repeat(5000) + ' end. Also `' + 'c'.repeat(1000) + '` code.');
    await expect(reply).toContainText('end.');
    await expectNoHorizontalOverflow(page);
    const box = (await reply.boundingBox())!;
    const vw = page.viewportSize()!.width;
    expect(box.x + box.width).toBeLessThanOrEqual(vw);
    // Long user messages wrap too.
    await queueChat(page, textReply('ok'));
    await sendMessage(page, 'U'.repeat(3000));
    await waitForIdle(page);
    await expectNoHorizontalOverflow(page);
  });

  test('HTML / script injection in model output is not executed', async ({ page, allowConsole }) => {
    allowConsole(/Failed to load resource/);
    await installStreamStub(page);
    await openApp(page);
    const reply = await render(
      page,
      'Hello <img src=x onerror="window.__xss1=1"> and <script>window.__xss2=1</script> ' +
        '<iframe src="javascript:window.__xss3=1"></iframe> ' +
        '[click me](javascript:window.__xss4=1) <a href="javascript:window.__xss5=1">raw link</a> ' +
        '<svg onload="window.__xss6=1"></svg> <div onmouseover="window.__xss7=1">hover zone</div> done.',
    );
    await expect(reply).toContainText('done.');
    await reply.getByText('hover zone').hover().catch(() => {});
    const links = reply.getByText(/click me|raw link/);
    for (let i = 0; i < (await links.count()); i++) await links.nth(i).click({ force: true }).catch(() => {});
    await page.waitForTimeout(300);
    const flags = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      return [1, 2, 3, 4, 5, 6, 7].filter((i) => w[`__xss${i}`] !== undefined);
    });
    expect(flags).toEqual([]);
    expect(await reply.locator('script, iframe, [onerror], [onload], [onmouseover]').count()).toBe(0);
    expect(await reply.locator('a[href^="javascript:"]').count()).toBe(0);
    expect(page.url()).toMatch(/\/$/);
  });

  test('injection in an imported conversation is not executed', async ({ page, allowConsole }) => {
    allowConsole(/Failed to load resource/);
    await openApp(page);
    const evil = {
      conversations: [
        {
          id: 'evil',
          title: '<img src=x onerror="window.__xss8=1">Evil title',
          messages: [
            { role: 'user', content: '<script>window.__xss9=1</script><img src=x onerror="window.__xss10=1">' },
            {
              role: 'assistant',
              content: '<img src=x onerror="window.__xss11=1"> **bold** <script>window.__xss12=1</script>',
              error: '<img src=x onerror="window.__xss13=1">',
            },
          ],
        },
      ],
    };
    await page.locator('input[type="file"][accept*="json"]').setInputFiles({
      name: 'evil.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(evil)),
    });
    const item = page.locator('[data-sidebar="menu-button"]', { hasText: 'Evil title' });
    await expect(item).toBeVisible();
    await expect(item).toContainText('<img');
    await item.click();
    await expect(page.locator('.is-assistant')).toContainText('bold');
    await page.waitForTimeout(300);
    const flags = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      return [8, 9, 10, 11, 12, 13].filter((i) => w[`__xss${i}`] !== undefined);
    });
    expect(flags).toEqual([]);
    expect(await page.locator('main script, [onerror]').count()).toBe(0);
  });
});

/* ===================================================================== misc */

test('theme toggle switches to dark and persists', async ({ page }) => {
  await openApp(page);
  await page.emulateMedia({ colorScheme: 'light' });
  // The theme menu lives in the sidebar footer (the header dropdown is gone).
  // It is opened from the keyboard because in `next dev` the Next.js dev
  // indicator sits on top of the bottom-left corner and intercepts clicks.
  const toggle = page.locator('[data-sidebar="footer"]').getByRole('button', { name: 'Change theme' });
  await expect(toggle).toBeVisible();
  await toggle.focus();
  await page.keyboard.press('Enter');
  const dark = page.getByRole('menuitem', { name: 'Dark' });
  await expect(dark).toBeVisible();
  await dark.click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await waitForApp(page);
  await expect(page.locator('html')).toHaveClass(/dark/);
});
