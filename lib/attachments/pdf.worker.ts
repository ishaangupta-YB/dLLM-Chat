// pdf.js worker entry. Loaded by lib/attachments/extract.ts with
// `new Worker(new URL('./pdf.worker.ts', import.meta.url), { type: 'module' })`
// so the bundler serves it from this origin (CSP worker-src 'self').
// Importing the module is enough: it wires its message handler to `self`.
import 'pdfjs-dist/build/pdf.worker.mjs';
