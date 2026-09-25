import { mkdir, open, readFile, rename, stat, readdir } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { TAKE_VERSION, STREAMS, sequenceDecision, validateEnvelope } from '../../src/capture/format.js';

export const safeId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id);
export async function atomicJSON(path, value) {
  await (await import('node:fs/promises')).writeFile(`${path}.tmp`, JSON.stringify(value, null, 2));
  await rename(`${path}.tmp`, path);
}
export async function* readLines(path) {
  try {
    await stat(path);
    const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
    for await (const line of lines) { if (line.trim()) yield JSON.parse(line); }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
export class TakeStore {
  constructor(root) { this.root = root; this.takes = new Map(); }
  async load(id) {
    if (!safeId(id)) throw new Error('Invalid take ID.');
    if (this.takes.has(id)) return this.takes.get(id);
    const dir = join(this.root, id);
    const metadata = JSON.parse(await readFile(join(dir, 'take.json'), 'utf8'));
    const take = { dir, metadata, last: { samples: -1, events: -1, audio: -1 }, lastTimes:{samples:0,events:0,audio:0}, handles: {}, duration: 0 };
    for (const stream of STREAMS) {
      // Only newline-terminated records were durable enough to acknowledge.
      let size = 0;
      try {
        const file = await open(join(dir, `${stream}.ndjson`), 'a+');
        const info = await file.stat();
        if (info.size) {
          const tail = Buffer.alloc(Math.min(info.size, 8 * 1024 * 1024 + 1));
          await file.read(tail, 0, tail.length, info.size - tail.length);
          const lastNewline = tail.lastIndexOf(10);
          size = lastNewline < 0 ? 0 : info.size - tail.length + lastNewline + 1;
          if (size < info.size) await file.truncate(size);
        }
        take.handles[stream] = file;
      } catch (error) { throw new Error(`Cannot reopen ${stream}: ${error.message}`); }
      for await (const packet of readLines(join(dir, `${stream}.ndjson`))) {
        if (packet.seq !== take.last[stream] + 1) throw new Error(`Stored ${stream} sequence gap.`);
        if(stream==='events'&&packet.data?.performance&&take.metadata.performance)Object.assign(take.metadata.performance,packet.data.performance);
        take.last[stream] = packet.seq;
        take.duration = Math.max(take.duration, packet.t);
        take.lastTimes[stream]=packet.stream==='audio'?packet.data.sceneTime+packet.data.frames/metadata.audio.sampleRate:packet.t;
      }
    }
    take.handles.pcm = await open(join(dir, 'audio.pcm'), 'a+');
    // r+ permits sparse positioned writes (append mode ignores positions).
    await take.handles.pcm.close();
    take.handles.pcm = await open(join(dir, 'audio.pcm'), 'r+');
    this.takes.set(id, take);
    return take;
  }
  async create(metadata) {
    if (metadata.version !== TAKE_VERSION || !safeId(metadata.id) || !metadata.audio || ![44100, 48000, 96000].includes(metadata.audio.sampleRate) || metadata.audio.channels !== 2) throw new Error('Unsupported take metadata/audio format.');
    await mkdir(this.root, { recursive: true });
    const dir = join(this.root, metadata.id);
    await mkdir(dir); // Never overwrite an existing take.
    await atomicJSON(join(dir, 'take.json'), { ...metadata, status: 'recording', complete: false });
    return this.load(metadata.id);
  }
  async append(id, packet) {
    validateEnvelope(packet);
    const take = await this.load(id);
    const decision = sequenceDecision(take.last[packet.stream], packet.seq);
    if (decision === 'duplicate') return take.last[packet.stream];
    if (decision === 'gap') throw new Error(`Sequence gap: ${packet.stream} expected ${take.last[packet.stream] + 1}`);
    if (take.metadata.status === 'complete') throw new Error('Take is already complete.');
    let stored = packet;
    if (packet.stream === 'audio') {
      const { pcm, sampleIndex, contextFrame, frames, sceneTime } = packet.data;
      if (typeof pcm !== 'string' || !Number.isSafeInteger(sampleIndex) || sampleIndex < 0 || !Number.isSafeInteger(contextFrame) || !Number.isSafeInteger(frames) || frames < 1 || frames > 8192 || !Number.isFinite(sceneTime) || sceneTime < 0 || sceneTime > 86400) throw new Error('Invalid PCM block.');
      const bytes = Buffer.from(pcm, 'base64');
      if (bytes.length !== frames * 4) throw new Error('PCM block size mismatch.');
      const offset = Math.round(sceneTime * take.metadata.audio.sampleRate) * 4;
      await take.handles.pcm.write(bytes, 0, bytes.length, offset);
      await take.handles.pcm.datasync();
      stored = { ...packet, data: { sampleIndex, contextFrame, frames, sceneTime, offset } };
      take.duration = Math.max(take.duration, sceneTime + frames / take.metadata.audio.sampleRate);
    }
    await take.handles[packet.stream].write(`${JSON.stringify(stored)}\n`);
    await take.handles[packet.stream].datasync();
    if(packet.stream==='events'&&packet.data?.performance&&take.metadata.performance)Object.assign(take.metadata.performance,packet.data.performance);
    take.last[packet.stream] = packet.seq;
    take.lastTimes[packet.stream]=packet.stream==='audio'?packet.data.sceneTime+packet.data.frames/take.metadata.audio.sampleRate:packet.t;
    take.duration = Math.max(take.duration, packet.t);
    return packet.seq;
  }
  async finalize(id, { expected = {}, gaps = [], reason = 'interrupted', duration = 0, metrics = null, performance = null } = {}) {
    const take = await this.load(id);
    if (take.metadata.complete) return take.metadata;
    if(performance&&take.metadata.performance)Object.assign(take.metadata.performance,performance);
    const missing = STREAMS.filter(s => expected[s] !== take.last[s]);
    const complete = missing.length === 0 && gaps.length === 0 && reason === 'stop';
    const pcmSize = (await take.handles.pcm.stat()).size;
    if (pcmSize > 0xffffffff - 44) throw new Error('WAV exceeded RIFF size limit; split the take.');
    const wav = createWriteStream(join(take.dir, 'audio.wav'));
    wav.write(wavHeader(pcmSize, take.metadata.audio.sampleRate, 2));
    await pipeline(createReadStream(join(take.dir, 'audio.pcm')), wav);
    const missingIntervals=missing.map(stream=>({stream,start:take.lastTimes[stream],end:duration||null,reason:'expected-sequence-not-received'}));
    take.metadata = { ...take.metadata, status: complete ? 'complete' : 'incomplete', complete, reason, gaps, missingIntervals, missingStreams: missing, last: { ...take.last }, lastTimes:take.lastTimes, duration: Math.max(duration, take.duration), metrics };
    await atomicJSON(join(take.dir, 'take.json'), take.metadata);
    return take.metadata;
  }
  async list() {
    await mkdir(this.root, { recursive: true });
    const rows = [];
    for (const id of await readdir(this.root)) {
      if (!safeId(id)) continue;
      try { rows.push(JSON.parse(await readFile(join(this.root, id, 'take.json'), 'utf8'))); } catch { /* incomplete creation */ }
    }
    return rows.sort((a, b) => (b.created || '').localeCompare(a.created || ''));
  }
  async close() { for (const take of this.takes.values()) for (const handle of Object.values(take.handles)) await handle.close(); this.takes.clear(); }
}
export function wavHeader(size, rate, channels = 2) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(size + 36, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(size, 40); return header;
}
