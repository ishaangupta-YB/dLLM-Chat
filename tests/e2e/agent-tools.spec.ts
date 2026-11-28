import {
  buildState,
  chatRequests,
  expect,
  installStreamStub,
  lastAssistant,
  openApp,
  paceRealRequest,
  queueChat,
  sendMessage,
  test,
  textReply,
  waitForIdle,
} from './fixtures';

// Agent tools, MCP connectors, settings and cookbook presets (workstream B).
// Real-API tests are kept to a handful (the chat route allows 40 req/min).

const withTools = (extra: Record<string, unknown> = {}) =>
  buildState({
    settings: {
      reasoningEffort: 'low',
      ...({
        tools: { enabled: true, webSearch: true, utilities: true, mcp: { deepwiki: true, context7: false }, customMcp: [] },
        agentPreset: 'general',
        aiTitles: false,
        ...extra,
      } as Record<string, unknown>),
    } as never,
  });

test.describe('agent tools (real API)', () => {
  test.setTimeout(120_000);

  test('web search shows a tool card, sources and a cited answer', async ({ page }) => {
    await openApp(page, withTools());
    await paceRealRequest(page);
    await sendMessage(page, 'Search the web: who won the 2024 Nobel Prize in Physics? Answer in one sentence with citations.');
    const card = lastAssistant(page).locator('[data-testid="tool-call"][data-tool-name="web_search"]').first();
    await expect(card).toBeVisible({ timeout: 60_000 });
    await waitForIdle(page, 90_000);
    await expect(card).toHaveAttribute('data-status', 'done');
    const sources = lastAssistant(page).getByTestId('message-sources');
    await expect(sources).toBeVisible();
    await sources.getByRole('button').first().click();
    await expect(sources.getByTestId('source-item').first()).toBeVisible();
    // The answer links at least one source inline.
    await expect(lastAssistant(page).locator('a[href^="http"]').first()).toBeVisible();
    await expect(lastAssistant(page)).toContainText(/Hopfield|Hinton/);
  });

  test('DeepWiki question runs an MCP tool', async ({ page }) => {
    await openApp(page, withTools({ tools: { enabled: true, webSearch: false, utilities: false, mcp: { deepwiki: true }, customMcp: [] } }));
    await paceRealRequest(page);
    await sendMessage(page, 'Using DeepWiki, what is the vercel/next.js repo about? Two sentences.');
    const card = lastAssistant(page).locator('[data-testid="tool-call"][data-tool-name^="deepwiki__"]').first();
    await expect(card).toBeVisible({ timeout: 60_000 });
    await expect(card).toContainText('DeepWiki');
    await waitForIdle(page, 100_000);
    await expect(lastAssistant(page)).toContainText(/React|framework/i);
  });

  test('clinic preset books an appointment', async ({ page }) => {
    await openApp(page, withTools());
    await page.locator('#composer-preset-trigger').click();
    await page.getByTestId('preset-menu').locator('[data-preset="clinic"]').click();
    await expect(page.locator('#composer-preset-trigger')).toContainText('Clinic support');
    await paceRealRequest(page);
    await sendMessage(
      page,
      'Hi, I am Jane Doe, phone 415-555-0199. Please book me the earliest available cleaning with Dr. Flossmore.',
    );
    // Three or more calls are grouped; the group collapses when tools finish.
    await expect(lastAssistant(page).locator('[data-testid="tool-call"], [data-testid="tool-group"]').first()).toBeVisible({
      timeout: 60_000,
    });
    await waitForIdle(page, 90_000);
    const group = lastAssistant(page).getByTestId('tool-group');
    if (await group.count()) await group.locator('> button').click();
    const booking = lastAssistant(page).locator('[data-tool-name="book_appointment"]').first();
    await expect(booking).toHaveAttribute('data-status', 'done');
    await expect(lastAssistant(page)).toContainText(/Flossmore/);
    await expect(lastAssistant(page)).toContainText(/\d{1,2}:\d{2}/);
  });

  test('SQL preset answers a count question', async ({ page }) => {
    await openApp(page, withTools({ agentPreset: 'sql' }));
    await expect(page.locator('#composer-preset-trigger')).toContainText('SQL analyst');
    await paceRealRequest(page);
    await sendMessage(page, 'How many orders are pending?');
    await expect(lastAssistant(page).locator('[data-tool-name="run_sql_query"]').first()).toBeVisible({ timeout: 60_000 });
    await waitForIdle(page, 90_000);
    await expect(lastAssistant(page)).toContainText(/\b3\b/);
  });
});

test.describe('tools menu and settings (no model calls)', () => {
  test('toggling tools off sends a config without them', async ({ page }) => {
    await installStreamStub(page);
    await openApp(page, withTools());
    await queueChat(page, textReply('ok'), textReply('ok'));

    await page.locator('#composer-tools-trigger').click();
    const menu = page.getByTestId('tools-menu');
    await menu.getByRole('switch', { name: 'Web search' }).click();
    await page.keyboard.press('Escape');
    await sendMessage(page, 'first');
    await waitForIdle(page);

    await page.locator('#composer-tools-trigger').click();
    await menu.getByRole('switch', { name: 'Enable tools' }).click();
    await expect(menu.getByRole('switch', { name: 'DeepWiki' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await sendMessage(page, 'second');
    await waitForIdle(page);

    const reqs = (await chatRequests(page)) as { tools?: Record<string, unknown> }[];
    expect(reqs[0].tools).toMatchObject({ preset: 'general', webSearch: false, utilities: true, mcp: ['deepwiki'] });
    // Tools off: only the preset and the conversation id (for stateful demo tools) remain.
    expect(reqs[1].tools).toEqual({ preset: 'general', sessionId: expect.any(String) });
  });

  test('settings: custom MCP server SSRF error, add and remove', async ({ page, request, baseURL }) => {
    await openApp(page, withTools());
    await page.locator('#composer-tools-trigger').click();
    await page.getByRole('button', { name: 'Manage connectors' }).click();
    const dialog = page.getByTestId('settings-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('tab', { name: /Tools/ })).toHaveAttribute('data-state', 'active');

    const form = dialog.getByRole('form', { name: 'Add a custom MCP server' });
    await form.getByLabel('Name').fill('Internal');
    await form.getByLabel(/Server URL/).fill('https://169.254.169.254/latest');
    await expect(dialog.getByTestId('mcp-url-error')).toContainText('Private, loopback and link-local addresses are not allowed');
    await expect(form.getByRole('button', { name: 'Add server' })).toBeDisabled();
    await form.getByLabel(/Server URL/).fill('http://example.com/mcp');
    await expect(dialog.getByTestId('mcp-url-error')).toContainText('Only https://');

    // The server enforces the same rules (and resolves DNS at connect time).
    for (const url of ['https://127.0.0.1/mcp', 'https://[::ffff:127.0.0.1]/', 'https://user:pw@example.com/mcp']) {
      const res = await request.post('/api/mcp/inspect', { data: { url }, headers: { Origin: baseURL ?? 'http://localhost:3000' } });
      expect(res.status()).toBe(400);
      expect((await res.json()).error.code).toBe('blocked_url');
    }

    await form.getByLabel('Name').fill('My DeepWiki');
    await form.getByLabel(/Server URL/).fill('https://mcp.deepwiki.com/mcp');
    await form.getByRole('button', { name: 'Test connection' }).click();
    await expect(dialog.getByTestId('mcp-test-result')).toContainText('ask_wiki_question', { timeout: 30_000 });
    await form.getByRole('button', { name: 'Add server' }).click();
    const item = dialog.getByTestId('custom-server');
    await expect(item).toHaveCount(1);
    await expect(item).toContainText('My DeepWiki');

    await dialog.getByRole('button', { name: 'Remove My DeepWiki' }).click();
    await expect(item).toHaveCount(0);
  });
});
