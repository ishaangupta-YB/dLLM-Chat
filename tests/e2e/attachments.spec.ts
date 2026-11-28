import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  activeConversation,
  buildState,
  installStreamStub,
  lastAssistant,
  openApp,
  queueChat,
  textReply,
  userMessages,
  waitForApp,
  waitForIdle,
} from './fixtures';

/** A minimal valid one-page PDF with a single line of text (xref offsets computed). */
function makePdf(text: string): Buffer {
  const esc = text.replace(/[\\()]/g, (c) => `\\${c}`);
  const stream = `BT /F1 18 Tf 72 720 Td (${esc}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

// 1x1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

const chips = (page: Page) => page.getByTestId('composer-attachments').getByTestId('attachment-chip');

async function attach(page: Page, files: { name: string; mimeType: string; buffer: Buffer }[]) {
  await page.getByTestId('composer-file-input').setInputFiles(files);
}

test.describe('attachments', () => {
  test('txt + pdf: chips, send, model uses the content, reload keeps chips, preview works', async ({ page }) => {
    test.setTimeout(120_000);
    await openApp(page);
    await attach(page, [
      { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('The secret code word is PELICAN-913.\n') },
      { name: 'brief.pdf', mimeType: 'application/pdf', buffer: makePdf('The secret color is TEAL-42.') },
    ]);
    await expect(chips(page)).toHaveCount(2);
    await expect(chips(page).nth(0)).toHaveAttribute('data-status', 'ready');
    // PDF text comes from pdf.js running in a same-origin worker (CSP worker-src 'self').
    await expect(chips(page).nth(1)).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
    await expect(chips(page).nth(1)).toContainText('brief.pdf');
    await expect(chips(page).nth(1)).toContainText('PDF');

    const input = page.locator('#composer-input');
    await input.fill('From the attached files: what is the code word and what is the color? Reply with just the two values.');
    await input.press('Enter');
    await expect(chips(page)).toHaveCount(0);
    await waitForIdle(page, 90_000);
    await expect(lastAssistant(page)).toContainText(/PELICAN-913/i);
    await expect(lastAssistant(page)).toContainText(/TEAL-42/i);

    const conv = await activeConversation(page);
    const user = conv!.messages[0] as { attachments?: { name: string; text: string }[] };
    expect(user.attachments?.map((a) => a.name)).toEqual(['notes.txt', 'brief.pdf']);
    expect(user.attachments?.[1].text).toContain('TEAL-42');

    await page.reload();
    await waitForApp(page);
    const sent = userMessages(page).first().getByTestId('attachment-chip');
    await expect(sent).toHaveCount(2);
    await sent.nth(1).click();
    const dialog = page.getByTestId('attachment-preview');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('attachment-preview-text')).toContainText('The secret color is TEAL-42.');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('docx is extracted; attachments-only send formats the file into the request', async ({ page }) => {
    await installStreamStub(page);
    await openApp(page);
    await attach(page, [
      {
        name: 'plan.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: readFileSync(path.join(__dirname, 'fixtures', 'sample.docx')),
      },
    ]);
    await expect(chips(page).first()).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
    await expect(chips(page).first()).toContainText('DOCX');
    const send = page.getByRole('button', { name: 'Send message' });
    await expect(send).toBeEnabled();
    await queueChat(page, textReply('Got the plan.'));
    await send.click();
    await expect(lastAssistant(page)).toContainText('Got the plan.');
    const reqs = await page.evaluate(
      () => (window as unknown as { __chatRequests: { messages: { content: string }[] }[] }).__chatRequests,
    );
    const content = reqs[0].messages.at(-1)!.content;
    expect(content).toContain('Attached file: plan.docx');
    expect(content).toContain('Project codename: HERON-58.');
  });

  test('images are rejected with a clear message; oversize text is truncated', async ({ page }) => {
    await openApp(page);
    await attach(page, [{ name: 'photo.png', mimeType: 'image/png', buffer: PNG }]);
    await expect(chips(page).first()).toHaveAttribute('data-status', 'error');
    await expect(page.getByText(/text-only model/).first()).toBeVisible();
    // Only an errored file: nothing to send.
    await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled();
    await chips(page).first().getByRole('button', { name: 'Remove photo.png' }).click();
    await expect(chips(page)).toHaveCount(0);

    const big = 'lorem ipsum dolor sit amet\n'.repeat(3000); // ~81k chars > 60k per-file cap
    await attach(page, [{ name: 'big.log', mimeType: 'text/plain', buffer: Buffer.from(big) }]);
    await expect(chips(page).first()).toHaveAttribute('data-status', 'ready');
    await expect(chips(page).first().getByTestId('attachment-truncated')).toBeVisible();

    // Binary content with a text extension is refused.
    await attach(page, [{ name: 'weird.txt', mimeType: 'text/plain', buffer: Buffer.from([0x00, 0x01, 0x02, 0x41]) }]);
    await expect(chips(page).nth(1)).toHaveAttribute('data-status', 'error');
  });

  test('drop anywhere over the chat and paste into the textarea attach files', async ({ page }) => {
    await openApp(page, buildState({}));
    // Drag over the thread (not the composer): the overlay appears, the drop attaches.
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(['dropped content'], 'dropped.md', { type: 'text/markdown' }));
      const target = document.querySelector('[data-slot="sidebar-inset"]') ?? document.body;
      target.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
      (window as unknown as { __dt: DataTransfer }).__dt = dt;
    });
    await expect(page.getByTestId('file-drop-overlay')).toBeVisible();
    await page.evaluate(() => {
      const dt = (window as unknown as { __dt: DataTransfer }).__dt;
      const target = document.querySelector('[data-slot="sidebar-inset"]') ?? document.body;
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    });
    await expect(page.getByTestId('file-drop-overlay')).toHaveCount(0);
    await expect(chips(page)).toHaveCount(1);
    await expect(chips(page).first()).toContainText('dropped.md');

    await page.locator('#composer-input').evaluate((el) => {
      const dt = new DataTransfer();
      dt.items.add(new File(['a,b\n1,2\n'], 'table.csv', { type: 'text/csv' }));
      el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
    });
    await expect(chips(page)).toHaveCount(2);
    await expect(chips(page).nth(1)).toContainText('table.csv');
    // Backspace in the empty textarea removes the last chip.
    await page.locator('#composer-input').press('Backspace');
    await expect(chips(page)).toHaveCount(1);
  });
});
