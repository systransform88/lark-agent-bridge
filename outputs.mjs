import { realpathSync, statSync } from 'node:fs';
import { resolve, relative, isAbsolute, extname, basename } from 'node:path';
import { createHash } from 'node:crypto';

export function parseTaskResult(text) {
  const result = JSON.parse(text);
  if (!result || typeof result.reply !== 'string' || !Array.isArray(result.attachments) ||
      result.attachments.some(p => typeof p !== 'string')) throw new Error('Codex returned an invalid file-delivery manifest.');
  if(result.memory_updates!==undefined&&!Array.isArray(result.memory_updates))throw new Error('Codex returned invalid memory updates.');
  return result;
}
export function outputFile(directory, candidate) {
  if (!candidate || isAbsolute(candidate) || /^[a-z]+:/i.test(candidate)) throw new Error('Output paths must be relative to this task output folder.');
  const root = realpathSync(directory);
  const path = realpathSync(resolve(root,candidate));
  const rel = relative(root,path);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Output file is outside this task output folder.');
  const stat = statSync(path);
  if (!stat.isFile() || stat.size === 0) throw new Error('Output must be a nonempty file.');
  if (stat.size > 30 * 1024 * 1024) throw new Error('Output exceeds the 30 MB attachment limit.');
  const image = ['.png','.jpg','.jpeg','.webp','.gif'].includes(extname(path).toLowerCase()) && stat.size <= 10 * 1024 * 1024;
  return { path, relativePath: './' + rel.replaceAll('\\','/'), image };
}
export async function deliverOutputs({directory, paths, messageId, cfg, run}) {
  const sent = []; const errors = []; const unique = [...new Set(paths)]; const seen = new Set();
  for (const [index,candidate] of unique.slice(0,10).entries()) {
    try {
      const file = outputFile(directory,candidate);
      if (seen.has(file.path.toLowerCase())) continue;
      seen.add(file.path.toLowerCase());
      const key = createHash('sha256').update(`${messageId}:output:${index}`).digest('hex').slice(0,40);
      const result = await run(cfg.larkScript,['im','+messages-reply','--message-id',messageId,
        file.image ? '--image' : '--file',file.relativePath,'--as','bot','--idempotency-key',key],{cwd:directory,timeout:120000});
      if (result.code !== 0) throw new Error((result.stderr || result.stdout || 'Lark upload failed').slice(-1200));
      sent.push(basename(file.path));
    } catch (error) { errors.push(`${basename(candidate)}: ${error.message}`); }
  }
  if (unique.length > 10) errors.push('Only the first 10 output files were sent. Ask for the remaining files in another task.');
  return {sent,errors};
}
