import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import {
  assistantMessages,
  buildState,
  chatRequests,
  expect,
  installStreamStub,
  lastAssistant,
  openApp,
  queueChat,
  readStore,
  sendMessage,
  test,
  textReply,
  userMessages,
  waitForApp,
  waitForIdle,
  type SeedConversation,
} from './fixtures';

// Persistence (localStorage "dllm-chat:v2") and the conversations sidebar.

const item = (page: Page, title: string) => page.locator(`[data-sidebar="menu-button"][title="${title}"]`);

async function openItemMenu(page: Page, title: string) {
  await item(page, title).hover();
  await page.getByRole('button', { name: `Options for ${title}` }).click();
}

const three: SeedConversation[] = [
  {
    id: 'a',
    title: 'Alpha chat',
    messages: [
      { role: 'user', content: 'alpha question' },
      { role: 'assistant', content: 'alpha answer' },
    ],
  },
  {
    id: 'b',
    title: 'Bravo chat',
    messages: [
      { role: 'user', content: 'bravo question' },
      { role: 'assistant', content: 'bravo answer' },
    ],
  },
  {
    id: 'c',
    title: 'Charlie chat',
    messages: [
      { role: 'user', content: 'charlie question' },
      { role: 'assistant', content: 'charlie answer' },
    ],
  },
];

test.describe('persistence', () => {
  test('conversations, active chat and settings survive a reload', async ({ page }) => {
    await installStreamStub(page);
    await openApp(page, buildState({ conversations: three, activeId: 'b' }));
    await expect(page.locator('header h1')).toHaveText('Bravo chat');
    await expect(page.getByText('bravo answer')).toBeVisible();

    // Change every setting through the UI.
    await page.getByRole('button', { name: /^Model: Mercury 3/ }).click();
    await page.getByRole('option', { name: /Mercury 2\.5/ }).click();
    await expect(page.getByRole('button', { name: /^Model: Mercury 2\.5/ })).toBeVisible();
    await page.getByRole('radio', { name: 'Diffusion' }).click();
    await page.getByRole('combobox', { name: 'Reasoning effort' }).click();
    await page.getByRole('option', { name: /High/ }).click();
    // FIM autocomplete lives in the composer's settings menu.
    await page.getByRole('button', { name: 'Chat settings' }).click();
    const fim = page.getByRole('menuitemcheckbox', { name: /Code autocomplete \(FIM\)/ });
    await expect(fim).toHaveAttribute('aria-checked', 'true');
    await fim.click();
    await expect(fim).toHaveAttribute('aria-checked', 'false');
    await page.keyboard.press('Escape');

    // Add a message in the active chat.
    await queueChat(page, {
      steps: [
        { event: { t: 'frame', v: 'n0isy', p: 0.1 } },
        { delay: 20, event: { t: 'frame', v: 'Persisted reply.', p: 1 } },
        { event: { t: 'finish', reason: 'stop' } },
      ],
    });
    await sendMessage(page, 'persist me');
    await expect(lastAssistant(page)).toContainText('Persisted reply.');
    await waitForIdle(page);

    await page.reload();
    await waitForApp(page);
    await expect(page.locator('header h1')).toHaveText('Bravo chat');
    await expect(userMessages(page)).toHaveCount(2);
    await expect(lastAssistant(page)).toContainText('Persisted reply.');
    await expect(page.getByRole('button', { name: /^Model: Mercury 2\.5/ })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Diffusion' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('combobox', { name: 'Reasoning effort' })).toContainText('High');
    await page.getByRole('button', { name: 'Chat settings' }).click();
    await expect(page.getByRole('menuitemcheckbox', { name: /Code autocomplete \(FIM\)/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await page.keyboard.press('Escape');
    for (const c of three) await expect(item(page, c.title)).toBeVisible();

    const s = await readStore(page);
    expect(s).not.toBeNull();
    expect(s!.version).toBe(1);
    expect(Object.keys(s!.state).sort()).toEqual(['activeId', 'conversations', 'settings']);
    expect(s!.state.activeId).toBe('b');
    expect(s!.state.settings).toEqual({
      model: 'mercury-2.5',
      mode: 'diffusing',
      reasoningEffort: 'high',
      fimEnabled: false,
      voiceAutoSpeak: true,
      // v2 settings (not seeded) are filled with their defaults.
      appMode: 'chat',
      tools: {
        enabled: true,
        webSearch: true,
        utilities: true,
        mcp: { deepwiki: true, context7: true },
        customMcp: [],
      },
      aiTitles: true,
      voiceEngine: 'browser',
      agentPreset: 'general',
    });
    const b = s!.state.conversations.b;
    expect(b).toMatchObject({ id: 'b', title: 'Bravo chat' });
    expect(typeof b.createdAt).toBe('number');
    expect(typeof b.updatedAt).toBe('number');
    expect(b.messages).toHaveLength(4);
    for (const m of b.messages) {
      expect(typeof m.id).toBe('string');
      expect(['user', 'assistant']).toContain(m.role);
      expect(typeof m.content).toBe('string');
      expect(m.pending).toBeFalsy();
    }
    expect(b.messages[3]).toMatchObject({
      role: 'assistant',
      content: 'Persisted reply.',
      model: 'mercury-2.5',
      mode: 'diffusing',
      finishReason: 'stop',
    });
  });

  test('a reload before any output leaves an interrupted error, not a pending message', async ({ page }) => {
    await installStreamStub(page);
    await openApp(page);
    await queueChat(page, { steps: [], hang: true });
    await sendMessage(page, 'will be interrupted');
    await expect(lastAssistant(page)).toContainText('Thinking');
    await page.reload();
    await waitForApp(page);
    const alert = lastAssistant(page).getByRole('alert');
    await expect(alert).toContainText('interrupted');
    await expect(alert.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible();
    await expect(page.locator('.is-assistant').getByText('Thinking')).toHaveCount(0);
    // Retry works after the reload.
    await queueChat(page, textReply('Answer after reload.'));
    await alert.getByRole('button', { name: 'Retry' }).click();
    await expect(lastAssistant(page)).toContainText('Answer after reload.');
  });

  test('a reload mid-stream keeps partial text and marks it interrupted', async ({ page }) => {
    await installStreamStub(page);
    await openApp(page);
    await queueChat(page, { steps: [{ event: { t: 'text', v: 'Partial streamed words' } }], hang: true });
    await sendMessage(page, 'stream then reload');
    await expect(lastAssistant(page)).toContainText('Partial streamed words');
    await page.reload();
    await waitForApp(page);
    await expect(lastAssistant(page)).toContainText('Partial streamed words');
    await expect(lastAssistant(page)).toContainText('Interrupted');
    await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible();
    // The partial reply is kept as context for the next turn.
    await queueChat(page, textReply('continued'));
    await sendMessage(page, 'go on');
    await expect(lastAssistant(page)).toContainText('continued');
    const req = (await chatRequests(page)) as { messages: { role: string; content: string }[] }[];
    expect(req[0].messages).toEqual([
      { role: 'user', content: 'stream then reload' },
      { role: 'assistant', content: 'Partial streamed words' },
      { role: 'user', content: 'go on' },
    ]);
    const s = await readStore(page);
    const msgs = s!.state.conversations[s!.state.activeId!].messages;
    expect(msgs.every((m) => !m.pending)).toBe(true);
  });

  test('corrupted localStorage does not crash the app', async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('__e2e_seeded')) {
        localStorage.setItem('dllm-chat:v2', '{"state":{"conversations":{"x":{"id":5},"y":null,"z":{"id":"z","messages":[{"role":"system","content":1},{"role":"user","content":"ok"}]}},"activeId":"nope","settings":{"model":"gpt-9","mode":"weird","fimEnabled":"yes"}},"version":1}');
        sessionStorage.setItem('__e2e_seeded', '1');
      }
    });
    await page.goto('/');
    await waitForApp(page);
    await expect(item(page, 'New chat')).toHaveCount(1);
    await expect(page.getByRole('button', { name: /^Model: Mercury 3/ })).toBeVisible();
    await item(page, 'New chat').click();
    await expect(userMessages(page)).toHaveCount(1);
  });
});

test.describe('sidebar', () => {
  test('new chat via button and Ctrl+Shift+O, without duplicate empty chats', async ({ page }) => {
    await openApp(page, buildState({ conversations: three, activeId: 'a' }));
    await page.locator('[data-sidebar="menu-button"]', { hasText: 'New chat' }).first().click();
    await expect(page.locator('header h1')).toHaveText('New chat');
    await expect(page.getByRole('button', { name: /Detect a cycle/ })).toBeVisible();
    await expect(page.locator('#composer-input')).toBeFocused();
    const count = async () => Object.keys((await readStore(page))?.state.conversations ?? {}).length;
    await expect.poll(count).toBe(4);

    // Again: reuses the empty chat.
    await page.locator('[data-sidebar="menu-button"]', { hasText: 'New chat' }).first().click();
    await page.keyboard.press('Control+Shift+O');
    await expect.poll(count).toBe(4);

    // Switch away and create again: still reuses the existing empty chat.
    await item(page, 'Bravo chat').click();
    await expect(page.locator('header h1')).toHaveText('Bravo chat');
    await page.keyboard.press('Control+Shift+O');
    await expect(page.locator('header h1')).toHaveText('New chat');
    await expect(page.getByRole('button', { name: /Detect a cycle/ })).toBeVisible();
    await expect.poll(count).toBe(4);
    await expect(item(page, 'New chat')).toHaveCount(1);
  });

  test('switching chats shows the right messages', async ({ page }) => {
    await openApp(page, buildState({ conversations: three, activeId: 'a' }));
    await expect(page.getByText('alpha answer')).toBeVisible();
    await item(page, 'Charlie chat').click();
    await expect(page.locator('header h1')).toHaveText('Charlie chat');
    await expect(page.getByText('charlie answer')).toBeVisible();
    await expect(page.getByText('alpha answer')).toHaveCount(0);
    await expect(item(page, 'Charlie chat')).toHaveAttribute('aria-current', 'page');
    await expect.poll(async () => (await readStore(page))?.state.activeId).toBe('c');
  });

  test('search filters chats', async ({ page }) => {
    await openApp(page, buildState({ conversations: three, activeId: 'a' }));
    const search = page.getByRole('textbox', { name: 'Search chats' });
    await search.fill('brav');
    await expect(item(page, 'Bravo chat')).toBeVisible();
    await expect(item(page, 'Alpha chat')).toHaveCount(0);
    await expect(item(page, 'Charlie chat')).toHaveCount(0);
    await search.fill('zzz');
    await expect(page.getByText(/No chats match/)).toBeVisible();
    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(search).toHaveValue('');
    for (const c of three) await expect(item(page, c.title)).toBeVisible();
  });

  test('rename via menu and double-click', async ({ page }) => {
    await openApp(page, buildState({ conversations: three, activeId: 'a' }));
    await openItemMenu(page, 'Alpha chat');
    await page.getByRole('menuitem', { name: 'Rename' }).click();
    const input = page.getByRole('textbox', { name: 'Rename chat' });
    await expect(input).toBeFocused();
    await input.fill('Renamed alpha');
    await input.press('Enter');
    await expect(item(page, 'Renamed alpha')).toBeVisible();
    await expect(page.locator('header h1')).toHaveText('Renamed alpha');
    await expect.poll(async () => (await readStore(page))?.state.conversations.a.title).toBe('Renamed alpha');

    await item(page, 'Bravo chat').dblclick();
    const input2 = page.getByRole('textbox', { name: 'Rename chat' });
    await expect(input2).toBeFocused();
    await input2.fill('Should not apply');
    await input2.press('Escape');
    await expect(item(page, 'Bravo chat')).toBeVisible();
    await expect(item(page, 'Should not apply')).toHaveCount(0);
  });

  test('pin moves a chat to Pinned and persists', async ({ page }) => {
    await openApp(page, buildState({ conversations: three, activeId: 'a' }));
    await expect(page.getByText('Pinned', { exact: true })).toHaveCount(0);
    await openItemMenu(page, 'Charlie chat');
    await page.getByRole('menuitem', { name: 'Pin' }).click();
    const pinnedGroup = page.locator('[data-sidebar="group"]', { hasText: 'Pinned' });
    await expect(pinnedGroup).toBeVisible();
    await expect(pinnedGroup.locator('[data-sidebar="menu-button"]')).toHaveText(['Charlie chat']);
    // Pinned group is first.
    await expect(page.locator('[data-sidebar="group-label"]').first()).toHaveText('Pinned');
    await expect.poll(async () => (await readStore(page))?.state.conversations.c.pinned).toBe(true);
    await page.reload();
    await waitForApp(page);
    await expect(page.locator('[data-sidebar="group-label"]').first()).toHaveText('Pinned');
    await openItemMenu(page, 'Charlie chat');
    await page.getByRole('menuitem', { name: 'Unpin' }).click();
    await expect(page.getByText('Pinned', { exact: true })).toHaveCount(0);
  });

  test('delete with confirm; deleting the active chat switches to the most recent one', async ({ page }) => {
    await openApp(page, buildState({ conversations: three, activeId: 'a' }));
    // Cancel keeps the chat.
    await openItemMenu(page, 'Bravo chat');
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Bravo chat');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(item(page, 'Bravo chat')).toBeVisible();

    // Delete the active chat (Alpha, most recent): Bravo becomes active.
    await openItemMenu(page, 'Alpha chat');
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
    await expect(item(page, 'Alpha chat')).toHaveCount(0);
    await expect(page.locator('header h1')).toHaveText('Bravo chat');
    await expect(page.getByText('bravo answer')).toBeVisible();
    const s = await readStore(page);
    expect(Object.keys(s!.state.conversations).sort()).toEqual(['b', 'c']);
    expect(s!.state.activeId).toBe('b');

    // Delete a non-active chat: active stays.
    await openItemMenu(page, 'Charlie chat');
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
    await expect(item(page, 'Charlie chat')).toHaveCount(0);
    await expect(page.locator('header h1')).toHaveText('Bravo chat');
  });

  test('export all downloads valid JSON', async ({ page }) => {
    await openApp(page, buildState({ conversations: three, activeId: 'a' }));
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export all chats' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^dllm-chat-export-\d{4}-\d{2}-\d{2}\.json$/);
    const data = JSON.parse(await readFile((await download.path())!, 'utf8'));
    expect(data.app).toBe('dllm-chat');
    expect(data.version).toBe(1);
    expect(data.conversations).toHaveLength(3);
    expect(data.conversations.map((c: { title: string }) => c.title).sort()).toEqual([
      'Alpha chat',
      'Bravo chat',
      'Charlie chat',
    ]);
    expect(data.conversations[0].messages[0]).toHaveProperty('content');

    // Single chat export from the item menu.
    await openItemMenu(page, 'Bravo chat');
    const [one] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: 'Export JSON' }).click(),
    ]);
    expect(one.suggestedFilename()).toBe('dllm-chat-bravo-chat.json');
    const oneData = JSON.parse(await readFile((await one.path())!, 'utf8'));
    expect(oneData.conversations).toHaveLength(1);
  });

  test('import adds valid chats; malformed files show an error and do not corrupt state', async ({ page }) => {
    await openApp(page, buildState({ conversations: three.slice(0, 1), activeId: 'a' }));
    const input = page.locator('input[type="file"][accept="application/json,.json"]');
    const snapshot = async () => {
      const convs = (await readStore(page))!.state.conversations;
      return Object.values(convs).map((c) => ({ id: c.id, title: c.title, messages: c.messages.map((m) => [m.id, m.role, m.content]) }));
    };
    const before = await snapshot();

    // Not JSON at all.
    await input.setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{not json') });
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Import failed' })).toBeVisible();
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'not valid JSON' })).toBeVisible();
    // Valid JSON, no chats.
    await input.setInputFiles({
      name: 'empty.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ hello: 'world', conversations: [{ nope: true }, 42, null] })),
    });
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'No valid chats found' })).toBeVisible();
    expect(await snapshot()).toEqual(before);
    await expect(item(page, 'Alpha chat')).toBeVisible();

    // A valid export with two chats (one has an invalid message that is dropped).
    const file = {
      app: 'dllm-chat',
      version: 1,
      conversations: [
        {
          id: 'imp1',
          title: 'Imported one',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [
            { id: 'm1', role: 'user', content: 'imported q' },
            { id: 'm2', role: 'assistant', content: 'imported a', pending: true },
            { id: 'm3', role: 'system', content: 'drop me' },
          ],
        },
        { id: 'imp2', title: 'Imported two', messages: [] },
      ],
    };
    await input.setInputFiles({ name: 'ok.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Imported 2 chats' })).toBeVisible();
    await expect(item(page, 'Imported one')).toBeVisible();
    await expect(item(page, 'Imported two')).toBeVisible();
    await expect(item(page, 'Alpha chat')).toBeVisible();
    await item(page, 'Imported one').click();
    await expect(page.getByText('imported a')).toBeVisible();
    await expect(page.getByText('drop me')).toHaveCount(0);
    const s = await readStore(page);
    expect(s!.state.conversations.imp1.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(s!.state.conversations.imp1.messages[1].pending).toBeFalsy();
  });

  test('clear all removes every chat after confirmation', async ({ page }) => {
    await openApp(page, buildState({ conversations: three, activeId: 'a' }));
    await page.getByRole('button', { name: 'Clear all' }).click();
    const dialog = page.getByRole('alertdialog');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(item(page, 'Alpha chat')).toBeVisible();
    await page.getByRole('button', { name: 'Clear all' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Clear all' }).click();
    await expect(page.getByText('Your chats will show up here.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Detect a cycle/ })).toBeVisible();
    const s = await readStore(page);
    expect(s!.state.conversations).toEqual({});
    expect(s!.state.activeId).toBeNull();
    await expect(page.getByRole('button', { name: 'Clear all' })).toBeDisabled();
    await page.reload();
    await waitForApp(page);
    await expect(page.getByText('Your chats will show up here.')).toBeVisible();
  });

  test('deleting the chat that is streaming stops it cleanly', async ({ page }) => {
    await installStreamStub(page);
    await openApp(page, buildState({ conversations: three.slice(0, 1), activeId: 'a' }));
    await page.keyboard.press('Control+Shift+O');
    await queueChat(page, { steps: [{ event: { t: 'text', v: 'streaming...' } }], hang: true });
    await sendMessage(page, 'doomed chat');
    await expect(lastAssistant(page)).toContainText('streaming...');
    await openItemMenu(page, 'doomed chat');
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
    await expect(item(page, 'doomed chat')).toHaveCount(0);
    await expect(page.locator('header h1')).toHaveText('Alpha chat');
    await waitForIdle(page);
    // The app is usable afterwards.
    await queueChat(page, textReply('still works'));
    await sendMessage(page, 'next');
    await expect(lastAssistant(page)).toContainText('still works');
    await expect(assistantMessages(page)).toHaveCount(2);
  });
});
