'use client';

// "Open in new tab": the bundled document travels deflated + base64url in the
// URL fragment of /preview-frame, which is never sent to the server. The route's
// CSP `sandbox` directive keeps the new tab on an opaque origin. Never open a
// blob: URL of generated HTML: a top-level blob document runs with the app's origin.

export const PREVIEW_PATH = '/preview-frame';

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function previewTabUrl(html: string): Promise<string> {
  const stream = new Blob([html]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return `${PREVIEW_PATH}#doc=${toBase64Url(bytes)}`;
}

export async function openPreviewInNewTab(html: string): Promise<void> {
  const url = await previewTabUrl(html);
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function downloadBlob(data: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
