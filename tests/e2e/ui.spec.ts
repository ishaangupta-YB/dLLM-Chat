import {
  activeConversation,
  assistantMessages,
  buildState,
  chatRequests,
  expect,
  installStreamStub,
  lastAssistant,
  openApp,
  paceRealRequest,
  queueChat,
  readStore,
  sendMessage,
  test,
  textReply,
  userMessages,
  waitForIdle,
} from './fixtures';

// Core chat flows: empty state, streaming, multi-turn, diffusion, stop/retry,
// regenerate/edit and error handling.

test.describe('empty state', () => {
  test('renders and a suggestion chip sends a message', async ({ page }) => {
    await installStreamStub(page);
    await openApp(page);

    await expect(page.getByRole('heading', { name: 'dLLM Chat', level: 1 })).toBeVisible();
    const chips = page.getByRole('button', { name: /Detect a cycle in a linked list/ });
    await expect(chips).toHaveCount(1);
    await expect(page.getByRole('button', { name: /Watch a story diffuse/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /What's new in Next.js 16\?/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Build a landing page/ })).toBeVisible();

    await queueChat(page, textReply('Here is a cycle detector using Floyd’s algorithm.', { delay: 20 }));
    await page.getByRole('button', { name: /Detect a cycle in a linked list/ }).click();

    await expect(userMessages(page)).toHaveCount(1);
    await expect(userMessages(page).first()).toContainText('detect a cycle in a linked list');
    await expect(lastAssistant(page)).toContainText('Floyd’s algorithm');
    await waitForIdle(page);
    // Empty state is gone; header shows the derived title.
    await expect(page.getByRole('button', { name: /Fix a race condition/ })).toHaveCount(0);
    await expect(page.locator('header h1')).toContainText('Write a Python function to detect a cycle');
    const req = (await chatRequests(page)) as { messages: { role: string; content: string }[] }[];
    expect(req[0].messages).toEqual([
      { role: 'user', content: 'Write a Python function to detect a cycle in a linked list, with tests.' },
    ]);
  });

  test('the diffusion suggestion switches to diffusion mode', async ({ page }) => {
    await installStreamStub(page);
    await openApp(page);
    await queueChat(page, {
      steps: [
        { delay: 50, event: { t: 'frame', v: 'Th# l!ghth*use k##per', p: 0.3 } },
        { delay: 50, event: { t: 'frame', v: 'The lighthouse keeper heard it.', p: 1 } },
        { event: { t: 'finish', reason: 'stop' } },
      ],
    });
    await page.getByRole('button', { name: /Watch a story diffuse/ }).click();
    await expect(lastAssistant(page)).toContainText('The lighthouse keeper heard it.');
    const req = (await chatRequests(page)) as { mode: string }[];
    expect(req[0].mode).toBe('diffusing');
    await expect(page.getByRole('radio', { name: 'Diffusion' })).toHaveAttribute('aria-checked', 'true');
  });
});

test.describe('real API', () => {
  test('streams a reply progressively, then shows meta line and sidebar entry', async ({ page }) => {
    await openApp(page);
    // Record every distinct length of the assistant text while it streams.
    await page.evaluate(() => {
      const w = window as unknown as { __lens: number[] };
      w.__lens = [];
      new MutationObserver(() => {
        const el = document.querySelectorAll('.is-assistant');
        const last = el[el.length - 1];
        if (!last) return;
        const len = (last.textContent ?? '').length;
        if (w.__lens[w.__lens.length - 1] !== len) w.__lens.push(len);
      }).observe(document.body, { subtree: true, childList: true, characterData: true });
    });
    await paceRealRequest(page);
    const prompt = 'Write a 250 word paragraph about the history of lighthouses.';
    await sendMessage(page, prompt);
    await expect(page.getByRole('button', { name: 'Stop generating' })).toBeVisible();
    await waitForIdle(page);

    const lens = await page.evaluate(() => (window as unknown as { __lens: number[] }).__lens);
    expect(new Set(lens).size, 'assistant text grew in several steps').toBeGreaterThanOrEqual(4);

    const reply = lastAssistant(page);
    await expect(reply).toContainText(/lighthouse/i);
    await expect(reply).toContainText('Mercury 3');
    await expect(reply).toContainText(/\d+(\.\d+)? (ms|s)/);
    await expect(reply).toContainText(/[\d,]+ tok\/s/);
    await expect(reply.getByRole('button', { name: 'Regenerate response' })).toBeVisible();

    // After the first reply the AI names the chat (lib/chat/title.ts); the
    // active sidebar entry and the header show that title live.
    await expect
      .poll(async () => ((await activeConversation(page)) as { titleSource?: string } | null)?.titleSource, { timeout: 30_000 })
      .toBe('ai');
    const conv = await activeConversation(page);
    expect(conv?.title.length).toBeGreaterThan(2);
    expect(conv?.title).not.toBe(prompt);
    const item = page.locator('[data-sidebar="menu-button"][aria-current="page"]');
    await expect(item).toHaveText(conv!.title);
    await expect(page.locator('header h1')).toHaveText(conv!.title);
    expect(conv?.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(conv?.messages[1].pending).toBeFalsy();
    expect(conv?.messages[1].content.length).toBeGreaterThan(200);
  });

  test('keeps multi-turn context', async ({ page }) => {
    await openApp(page);
    await paceRealRequest(page);
    await sendMessage(page, 'Remember this code word: ZEBRA-7731. Reply with just "OK".');
    await waitForIdle(page);
    await expect(assistantMessages(page)).toHaveCount(1);
    await paceRealRequest(page);
    await sendMessage(page, 'What was the code word I gave you? Reply with only the code word.');
    await waitForIdle(page);
    await expect(assistantMessages(page)).toHaveCount(2);
    await expect(lastAssistant(page)).toContainText('ZEBRA-7731');
  });

  test('diffusion mode renders frames, then clean markdown', async ({ page }) => {
    await openApp(page);
    await page.getByRole('radio', { name: 'Diffusion' }).click();
    await page.evaluate(() => {
      const w = window as unknown as { __sawDiffusion: boolean };
      w.__sawDiffusion = false;
      new MutationObserver(() => {
        if (document.querySelector('[aria-label="Response is being generated"]')) w.__sawDiffusion = true;
      }).observe(document.body, { subtree: true, childList: true });
    });
    await paceRealRequest(page);
    await sendMessage(page, 'Write a short paragraph (about 120 words) about rivers, with one **bold** phrase.');
    await waitForIdle(page);
    expect(await page.evaluate(() => (window as unknown as { __sawDiffusion: boolean }).__sawDiffusion)).toBe(true);
    const reply = lastAssistant(page);
    await expect(reply.locator('[aria-label="Response is being generated"]')).toHaveCount(0);
    await expect(reply.locator('[title="Diffusion mode"]')).toBeVisible();
    const conv = await activeConversation(page);
    const msg = conv!.messages[1];
    expect(msg.mode).toBe('diffusing');
    expect(msg.content.length).toBeGreaterThan(80);
    // Rendered as markdown: the raw ** markers are not visible.
    await expect(reply.locator('[data-streamdown], .prose, p').first()).toBeVisible();
    const text = await reply.innerText();
    expect(text).not.toContain('**');
  });
});

test.describe('diffusion (stubbed)', () => {
  test('frames render in the diffusion view; the clean final wins over late noise', async ({ page }) => {
    await installStreamStub(page);
    await openApp(page, buildState({ settings: { mode: 'diffusing' } }));
    const final = 'Rivers **carve** valleys.\n\n- one\n- two';
    await queueChat(page, {
      steps: [
        { delay: 100, event: { t: 'frame', v: 'R#v%rs **c@rve** v$ll#ys.\n\n- o#e\n- t%o', p: 0.2 } },
        { delay: 300, event: { t: 'frame', v: 'Riv%rs **carve** v$lleys.\n\n- one\n- t%o', p: 0.6 } },
        { delay: 300, event: { t: 'frame', v: final, p: 1 } },
        // A late noisy frame after the clean final must never overwrite it.
        { delay: 10, event: { t: 'frame', v: 'LATE NOISE !!!', p: 0.5 } },
        { event: { t: 'finish', reason: 'stop' } },
        { event: { t: 'usage', usage: { promptTokens: 5, completionTokens: 12, serverLatencyMs: 50 } } },
      ],
    });
    await sendMessage(page, 'rivers');
    const canvas = lastAssistant(page).locator('[aria-label="Response is being generated"]');
    await expect(canvas).toBeVisible();
    await expect(canvas).toContainText(/R.v.rs/);
    await expect(lastAssistant(page).getByText(/step \d+/)).toBeVisible();

    await waitForIdle(page);
    const reply = lastAssistant(page);
    await expect(canvas).toHaveCount(0);
    await expect(reply.locator('[data-streamdown="strong"], strong').filter({ hasText: 'carve' })).toBeVisible();
    await expect(reply.locator('li')).toHaveText(['one', 'two']);
    await expect(reply).not.toContainText('LATE NOISE');
    await expect(reply).not.toContainText('#');
    const conv = await activeConversation(page);
    expect(conv!.messages[1].content).toBe(final);
  });

  test('without a p=1 frame the last frame becomes the final text', async ({ page }) => {
    await installStreamStub(page);
    await openApp(page, buildState({ settings: { mode: 'diffusing' } }));
    await queueChat(page, {
      steps: [
        { delay: 30, event: { t: 'frame', v: 'n#is_', p: 0.2 } },
        { delay: 30, event: { t: 'frame', v: 'Final answer here.', p: 0.9 } },
        { event: { t: 'finish', reason: 'stop' } },
      ],
    });
    await sendMessage(page, 'x');
    await waitForIdle(page);
    await expect(lastAssistant(page)).toContainText('Final answer here.');
    expect((await activeConversation(page))!.messages[1].content).toBe('Final answer here.');
  });
});

test.describe('stop and retry', () => {
  test('stop mid-stream keeps the partial content', async ({ page }) => {
    await installStreamStub(page);
    await openApp(page);
    const words = Array.from({ length: 60 }, (_, i) => `word${i} `);
    await queueChat(page, {
      steps: [
        ...words.map((v) => ({ delay: 120, event: { t: 'text' as const, v } })),
        { event: { t: 'finish' as const, reason: 'stop' } },
      ],
    });
    await sendMessage(page, 'long please');
    await expect(lastAssistant(page)).toContainText('word3');
    await page.getByRole('button', { name: 'Stop generating' }).click();
    await waitForIdle(page);
    const reply = lastAssistant(page);
    await expect(reply).toContainText('word0');
    await expect(reply).toContainText('Stopped');
    await expect(reply.getByRole('alert')).toHaveCount(0);
    await page.waitForTimeout(500);
    await expect(reply).not.toContainText('word59');
    const msg = (await activeConversation(page))!.messages[1];
    expect(msg.pending).toBeFalsy();
    expect(msg.finishReason).toBe('stopped');
    expect(msg.content).toContain('word0');
    expect(msg.error).toBeUndefined();
    // Composer is usable again.
    await expect(page.locator('#composer-input')).toBeEditable();
  });

  test('stop before output shows an error with Retry; Retry works', async ({ page }) => {
    await installStreamStub(page);
    await openApp(page);
    await queueChat(page, { steps: [], hang: true });
    await sendMessage(page, 'hello there');
    await expect(lastAssistant(page)).toContainText('Thinking');
    await page.getByRole('button', { name: 'Stop generating' }).click();
    const alert = lastAssistant(page).getByRole('alert');
    await expect(alert).toContainText('Stopped before any output.');
    await queueChat(page, textReply('Recovered reply text.'));
    await alert.getByRole('button', { name: 'Retry' }).click();
    await expect(lastAssistant(page)).toContainText('Recovered reply text.');
    await waitForIdle(page);
    await expect(assistantMessages(page)).toHaveCount(1);
    await expect(page.locator('.is-assistant [role=alert]')).toHaveCount(0);
    const req = (await chatRequests(page)) as { messages: unknown[] }[];
    expect(req[1].messages).toEqual([{ role: 'user', content: 'hello there' }]);
  });
});

test.describe('regenerate and edit', () => {
  test('regenerate replaces the last assistant reply', async ({ page }) => {
    await installStreamStub(page);
    await openApp(page);
    await queueChat(page, textReply('First reply alpha.'));
    await sendMessage(page, 'hi');
    await expect(lastAssistant(page)).toContainText('First reply alpha.');
    await waitForIdle(page);
    await queueChat(page, textReply('Second reply beta.'));
    await lastAssistant(page).getByRole('button', { name: 'Regenerate response' }).click();
    await expect(lastAssistant(page)).toContainText('Second reply beta.');
    await waitForIdle(page);
    await expect(assistantMessages(page)).toHaveCount(1);
    await expect(page.getByText('First reply alpha.')).toHaveCount(0);
    const conv = await activeConversation(page);
    expect(conv!.messages.map((m) => m.content)).toEqual(['hi', 'Second reply beta.']);
  });

  test('edit and resend truncates the following messages', async ({ page }) => {
    await installStreamStub(page);
    await openApp(
      page,
      buildState({
        conversations: [
          {
            id: 'c1',
            title: 'Edit test',
            messages: [
              { role: 'user', content: 'first question' },
              { role: 'assistant', content: 'first answer' },
              { role: 'user', content: 'second question' },
              { role: 'assistant', content: 'second answer' },
            ],
          },
        ],
        activeId: 'c1',
      }),
    );
    await expect(userMessages(page)).toHaveCount(2);
    const first = userMessages(page).first();
    await first.hover();
    await first.getByRole('button', { name: 'Edit message' }).click();
    const box = page.getByRole('textbox', { name: 'Edit message' });
    await expect(box).toBeFocused();
    await box.fill('edited question');
    await queueChat(page, textReply('edited answer'));
    await box.press('Enter');
    await expect(lastAssistant(page)).toContainText('edited answer');
    await waitForIdle(page);
    await expect(userMessages(page)).toHaveCount(1);
    await expect(assistantMessages(page)).toHaveCount(1);
    await expect(page.getByText('second question')).toHaveCount(0);
    const req = (await chatRequests(page)) as { messages: unknown[] }[];
    expect(req[0].messages).toEqual([{ role: 'user', content: 'edited question' }]);
    const conv = await activeConversation(page);
    expect(conv!.messages.map((m) => m.content)).toEqual(['edited question', 'edited answer']);
    // Title is kept (not re-derived) after an edit.
    expect(conv!.title).toBe('Edit test');
  });

  test('escape cancels an edit without changes', async ({ page }) => {
    await openApp(
      page,
      buildState({
        conversations: [
          { id: 'c1', title: 'T', messages: [{ role: 'user', content: 'keep me' }, { role: 'assistant', content: 'ok' }] },
        ],
        activeId: 'c1',
      }),
    );
    const msg = userMessages(page).first();
    await msg.hover();
    await msg.getByRole('button', { name: 'Edit message' }).click();
    const box = page.getByRole('textbox', { name: 'Edit message' });
    await box.fill('changed');
    await box.press('Escape');
    await expect(box).toHaveCount(0);
    await expect(userMessages(page).first()).toContainText('keep me');
    await expect(assistantMessages(page)).toHaveCount(1);
  });
});

test.describe('error handling', () => {
  for (const [status, message] of [
    [429, 'Too many requests. Try again in 17s.'],
    [500, 'Upstream exploded (test).'],
  ] as const) {
    test(`HTTP ${status} shows inline error + toast and the app stays usable`, async ({ page, allowConsole }) => {
      allowConsole(new RegExp(`status of ${status}`));
      await openApp(page);
      let calls = 0;
      await page.route('**/api/chat', async (route) => {
        calls++;
        if (calls === 1) {
          await route.fulfill({
            status,
            contentType: 'application/json',
            body: JSON.stringify({ error: { message, code: 'x', status } }),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/x-ndjson',
            body:
              JSON.stringify({ t: 'text', v: 'Back to normal.' }) +
              '\n' +
              JSON.stringify({ t: 'finish', reason: 'stop' }) +
              '\n',
          });
        }
      });
      await sendMessage(page, 'trigger error');
      await expect(lastAssistant(page).getByRole('alert')).toContainText(message);
      await expect(page.locator('[data-sonner-toast]').filter({ hasText: message })).toBeVisible();
      await waitForIdle(page);
      // Still usable: the next message goes through.
      await sendMessage(page, 'again');
      await expect(lastAssistant(page)).toContainText('Back to normal.');
      // The failed turn is not sent as context.
      const msgs = (await activeConversation(page))!.messages;
      expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
      expect(msgs[1].error).toBe(message);
    });
  }

  test('network failure shows an error', async ({ page, allowConsole }) => {
    allowConsole(/Failed to load resource|ERR_/);
    await openApp(page);
    await page.route('**/api/chat', (route) => route.abort('internetdisconnected'));
    await sendMessage(page, 'offline?');
    const alert = lastAssistant(page).getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).not.toBeEmpty();
    await expect(alert.getByRole('button', { name: 'Retry' })).toBeVisible();
    await waitForIdle(page);
    expect((await activeConversation(page))!.messages[1].pending).toBeFalsy();
  });

  test('empty response with finish_reason length shows a helpful message', async ({ page }) => {
    await installStreamStub(page);
    await openApp(page);
    await queueChat(page, { steps: [{ event: { t: 'finish', reason: 'length' } }] });
    await sendMessage(page, 'think hard');
    await expect(lastAssistant(page).getByRole('alert')).toContainText('token budget on reasoning');
  });

  test('stream error event mid-reply keeps text and shows the error', async ({ page }) => {
    await installStreamStub(page);
    await openApp(page);
    await queueChat(page, {
      steps: [
        { event: { t: 'text', v: 'Partial answer ' } },
        { delay: 50, event: { t: 'error', message: 'Upstream stream broke.' } },
      ],
    });
    await sendMessage(page, 'go');
    await expect(lastAssistant(page)).toContainText('Partial answer');
    await expect(lastAssistant(page).getByRole('alert')).toContainText('Upstream stream broke.');
  });

  test('send while a reply is streaming is not possible and keeps the draft', async ({ page }) => {
    await installStreamStub(page);
    await openApp(page);
    await queueChat(page, { steps: [{ event: { t: 'text', v: 'slow...' } }], hang: true });
    await sendMessage(page, 'first');
    await expect(lastAssistant(page)).toContainText('slow...');
    const input = page.locator('#composer-input');
    await input.fill('queued draft');
    await input.press('Enter');
    await expect(input).toHaveValue('queued draft');
    await expect(userMessages(page)).toHaveCount(1);
    await page.getByRole('button', { name: 'Stop generating' }).click();
    await waitForIdle(page);
    const s = await readStore(page);
    expect(Object.keys(s!.state.conversations)).toHaveLength(1);
  });
});
