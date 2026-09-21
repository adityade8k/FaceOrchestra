// Portable, streaming archive: HONKTAKE1\n + u32 name bytes + u64 data bytes + name + data.
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, stat, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { atomicJSON } from './storage.mjs';
const names = ['take.json', 'samples.ndjson', 'events.ndjson', 'audio.ndjson', 'audio.pcm', 'audio.wav'];
const magic = Buffer.from('HONKTAKE1\n');
export async function exportTake(dir, output) {
  output.write(magic);
  const metadata=JSON.parse(await readFile(join(dir,'take.json'),'utf8'));
  const assets=metadata.assetsBundled?Object.keys(metadata.build.assets).map(path=>`assets${path}`):[];
  for (const name of [...names,...assets]) {
    const path = join(dir, name);
    let info; try { info = await stat(path); } catch { continue; }
    const header = Buffer.alloc(12); header.writeUInt32LE(Buffer.byteLength(name)); header.writeBigUInt64LE(BigInt(info.size), 4);
    if (!output.write(Buffer.concat([header, Buffer.from(name)]))) await once(output, 'drain');
    if(info.size)for await (const chunk of createReadStream(path,{start:0,end:info.size-1})) if (!output.write(chunk)) await once(output, 'drain');
  }
  output.end(Buffer.alloc(12));
}
export async function importTake(root, input) {
  const iterator = input[Symbol.asyncIterator](); let buffer = Buffer.alloc(0), total = 0;
  async function bytes(n) {
    while (buffer.length < n) { const item = await iterator.next(); if (item.done) throw new Error('Truncated take archive.'); buffer = Buffer.concat([buffer, item.value]); }
    const result = buffer.subarray(0, n); buffer = buffer.subarray(n); return result;
  }
  if (!(await bytes(magic.length)).equals(magic)) throw new Error('Not a HONKTAKE1 archive.');
  const id = randomUUID(), dir = join(root, id); await mkdir(dir, { recursive: true }); const seen = new Set();
  try {
    while (true) {
      const header = await bytes(12), n = header.readUInt32LE(), size = Number(header.readBigUInt64LE(4));
      if (!n && !size) break;
      total += size;
      if (n > 300 || size > 4 * 1024 ** 3 || total > 8 * 1024 ** 3) throw new Error('Archive exceeds local import limits.');
      const name = (await bytes(n)).toString();
      if ((!names.includes(name) && !/^assets\/model\/[\w/ .-]+\.(glb|png|jpe?g)$/i.test(name)) || name.includes('..') || seen.has(name)) throw new Error('Unexpected or duplicate archive entry.');
      seen.add(name);await mkdir(dirname(join(dir,name)),{recursive:true}); const out = createWriteStream(join(dir, name));
      try { for (let remaining = size; remaining > 0;) { const chunk = await bytes(Math.min(remaining, 65536)); remaining -= chunk.length; if (!out.write(chunk)) await once(out, 'drain'); } out.end(); await once(out, 'finish'); }
      catch (error) { out.destroy(); throw error; }
    }
    const meta = JSON.parse(await readFile(join(dir, 'take.json'), 'utf8'));
    if (meta.version !== 1 || ![44100,48000,96000].includes(meta.audio?.sampleRate) || meta.audio?.channels !== 2) throw new Error('Unsupported take version/audio.');
    if(meta.assetsBundled)for(const [path,hash] of Object.entries(meta.build?.assets||{})) {
      if(!seen.has(`assets${path}`))throw new Error(`Missing portable asset ${path}`);
      const actual=createHash('sha256');for await(const chunk of createReadStream(join(dir,`assets${path}`)))actual.update(chunk);
      if(actual.digest('hex')!==hash)throw new Error(`Portable asset checksum mismatch: ${path}`);
    }
    await atomicJSON(join(dir, 'take.json'), { ...meta, originalId: meta.id, id }); return id;
  } catch (error) { await rm(dir, { recursive: true, force: true }); throw error; }
}

// Standard ustar sequence for Premiere and other local tools, streamed from disk.
export async function exportFrames(dir, output) {
  const { readdir } = await import('node:fs/promises');
  const files=(await readdir(dir)).filter(n=>/^(frame-\d{6}\.png|audio\.wav|project\.json|README\.txt)$/.test(n)).sort();
  for(const name of files) {
    const info=await stat(join(dir,name)),header=Buffer.alloc(512);
    header.write(name,0,100);header.write('0000644\0',100);header.write('0000000\0',108);header.write('0000000\0',116);
    header.write(info.size.toString(8).padStart(11,'0')+'\0',124);header.write('00000000000\0',136);header.fill(32,148,156);header.write('0',156);header.write('ustar\0',257);header.write('00',263);
    const sum=header.reduce((n,b)=>n+b,0);header.write(sum.toString(8).padStart(6,'0')+'\0 ',148);
    if(!output.write(header))await once(output,'drain');
    for await(const chunk of createReadStream(join(dir,name)))if(!output.write(chunk))await once(output,'drain');
    const padding=(512-info.size%512)%512;if(padding)output.write(Buffer.alloc(padding));
  }
  output.end(Buffer.alloc(1024));
}
