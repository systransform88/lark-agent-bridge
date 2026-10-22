import { readFileSync, writeFileSync, mkdirSync, realpathSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { resolve, relative, isAbsolute, join } from 'node:path';
import { setImmediate } from 'node:timers/promises';
export function attachmentKind(path) {
  const fd = openSync(path, 'r'); const b = Buffer.alloc(16);
  try { readSync(fd, b, 0, 16, 0); } finally { closeSync(fd); }
  if (b.subarray(0, 5).toString() === '%PDF-') return 'pdf';
  if (b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ||
      (b[0] === 255 && b[1] === 216 && b[2] === 255) ||
      (b.subarray(0,4).toString() === 'RIFF' && b.subarray(8,12).toString() === 'WEBP') ||
      ['GIF87a','GIF89a'].includes(b.subarray(0,6).toString())) return 'image';
  throw new Error('Unsupported attachment. Please send a PDF, PNG, JPEG, WebP, or GIF image.');
}
export function confinedFile(workspace, candidate) {
  const root = realpathSync(join(workspace, 'lark-im-resources'));
  const path = realpathSync(resolve(workspace, candidate));
  const rel = relative(root, path);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Attachment path is outside the download folder.');
  if (statSync(path).size > 30 * 1024 * 1024) throw new Error('Attachment exceeds the 30 MB processing limit.');
  return path;
}
export async function prepareAttachment(path,{signal}={}) {
  signal?.throwIfAborted();
  const kind = attachmentKind(path);
  if (kind === 'image') return { path, kind, images: [path] };
  const mupdf = await import('mupdf');
  const doc = mupdf.Document.openDocument(new Uint8Array(readFileSync(path)), 'application/pdf');
  try {
    const pageCount = doc.countPages();
    if (pageCount > 200) throw new Error('PDF exceeds the 200-page processing limit. Please split it into smaller PDFs.');
    const pages = []; const images = []; const notes = []; let rendered = 0;
    const out = path + '.pages'; mkdirSync(out, {recursive:true});
    for (let n = 1; n <= pageCount; n++) {
      await setImmediate();signal?.throwIfAborted();
      const page = doc.loadPage(n - 1); const text = page.toStructuredText();
      const content = text.asText(); text.destroy();
      pages.push(`--- Page ${n} ---\n${content}`);
      if (n <= 2 || content.trim().length < 80) {
        if (rendered < 20) {
          const bounds = page.getBounds();
          const scale = Math.min(1.5, 1800 / Math.max(bounds[2]-bounds[0],bounds[3]-bounds[1]));
          const pixmap = page.toPixmap(mupdf.Matrix.scale(scale,scale),mupdf.ColorSpace.DeviceRGB,false,true);
          const png = join(out, `page-${n}.png`); writeFileSync(png, pixmap.asPNG()); pixmap.destroy();
          images.push(png); rendered++;
        } else notes.push(`Page ${n} has little extractable text and was not rendered: the 20-preview limit was reached.`);
      }
      page.destroy();
    }
    const textPath = path + '.txt'; writeFileSync(textPath, pages.join('\n\n'));
    return { path, kind, pages:pageCount, textPath, images, notes };
  } finally { doc.destroy(); }
}
export async function downloadAttachments(event, cfg, run,{signal}={}) {
  const r = await run(cfg.larkScript, ['im','+messages-mget','--message-ids',event.message_id,
    '--as','bot','--no-reactions','--download-resources','--format','json'], {cwd:cfg.workspace, timeout:120000});
  if (r.code !== 0) throw new Error(`Attachment download failed: ${(r.stderr || r.stdout).slice(-1500)}`);
  const result = JSON.parse(r.stdout);
  if (!result.ok) throw new Error('Lark could not read this attachment.');
  const msg = result.data.messages.find(m => m.message_id === event.message_id);
  if (!msg || msg.sender?.id !== cfg.allowedUserId || msg.chat_id !== event.chat_id) throw new Error('Attachment sender or chat does not match.');
  const resources = msg.resources || [];
  if (!resources.length) throw new Error('Lark returned no downloadable resource for this message.');
  const prepared = [];
  for (const resource of resources) {
    if (resource.error || !resource.local_path) throw new Error('Lark could not download the attachment. Check bot message-read permissions.');
    const path = confinedFile(cfg.workspace, resource.local_path);
    prepared.push({...await prepareAttachment(path,{signal}), messageId:event.message_id});
  }
  return prepared;
}
export function taskAttachments(items) {
  const images = items.flatMap(a => a.images).slice(-6);
  return { images, description: items.map(a => JSON.stringify(a)).join('\n') };
}
