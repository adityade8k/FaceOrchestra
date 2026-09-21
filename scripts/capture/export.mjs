import { mkdir, open, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { wavHeader, atomicJSON } from './storage.mjs';
import { exportTimes, timeMap } from '../../src/capture/format.js';
export function hasFFmpeg() { return spawnSync(process.env.FFMPEG || 'ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0; }
export async function createExport(root, project) {
  const { output, trim, mapping } = project;
  const times = exportTimes({ ...trim, fps: output?.fps });
  if (![1080, 540, 270].includes(output.width) || output.height !== output.width * 16 / 9 || times.count > 108000 || !(mapping?.a > 0.9 && mapping.a < 1.1) || !Number.isFinite(mapping.b)) throw new Error('Invalid export dimensions, length or mapping.');
  const id = crypto.randomUUID(), dir = join(root, id); await mkdir(dir, { recursive: true });
  const job = { id, dir, project, frames: times.count, next: 0, ffmpeg: hasFFmpeg(), status: 'frames' };
  await atomicJSON(join(dir, 'project.json'), project); return job;
}
export async function saveFrame(job, index, bytes) {
  if (job.status !== 'frames' || index !== job.next || index >= job.frames || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('Invalid PNG frame or sequence.');
  if (bytes.readUInt32BE(16) !== job.project.output.width || bytes.readUInt32BE(20) !== job.project.output.height) throw new Error('Wrong frame dimensions.');
  await writeFile(join(job.dir, `frame-${String(index).padStart(6,'0')}.png`), bytes); job.next++;
}
// Resample from scene time to video/output time, including silence outside intact audio.
// Bounded two-second read cache; no full take in memory, no encoder dependency.
export async function renderAudio(take, job) {
  const rate = take.metadata.audio.sampleRate, samples = Math.round(job.frames / job.project.output.fps * rate);
  const input = await open(join(take.dir, 'audio.pcm'), 'r'), output = await open(join(job.dir, 'audio.wav'), 'w');
  const inputSize = (await input.stat()).size; let cache = Buffer.alloc(0), cacheStart = -1;
  await output.write(wavHeader(samples * 4, rate));
  try {
    for (let base = 0; base < samples; base += 4096) {
      const count = Math.min(4096, samples - base), result = Buffer.alloc(count * 4);
      for (let i = 0; i < count; i++) {
        const pos = timeMap(job.project.trim.start + (base + i) / rate, job.project.mapping) * rate;
        const frame = Math.floor(pos), offset = frame * 4;
        if (offset < 0 || offset + 8 > inputSize) continue;
        if (offset < cacheStart || offset + 8 > cacheStart + cache.length) {
          cacheStart = offset; cache = Buffer.alloc(Math.min(rate * 4 * 2, inputSize - offset)); await input.read(cache, 0, cache.length, offset);
        }
        for (let channel = 0; channel < 2; channel++) {
          const at = offset - cacheStart + channel * 2, a = cache.readInt16LE(at), b = cache.readInt16LE(at + 4);
          result.writeInt16LE(Math.round(a + (b - a) * (pos - frame)), i * 4 + channel * 2);
        }
      }
      await output.write(result);
    }
  } finally { await input.close(); await output.close(); }
}
export async function finishExport(take, job) {
  if (job.next !== job.frames || job.status !== 'frames') throw new Error('Export has missing frames.');
  job.status = 'encoding'; await renderAudio(take, job);
  await writeFile(join(job.dir, 'README.txt'), `Mixed Reality Capture\n${job.project.output.fps} fps, ${job.project.output.width} x ${job.project.output.height}\nPNG frames start at output time zero. Import frame-000000.png as an image sequence and place audio.wav at zero.\nVideo trim starts at ${job.project.trim.start}s. sceneTime = ${job.project.mapping.a} * videoTime + ${job.project.mapping.b}.\n${job.ffmpeg ? 'Frames contain the composite.' : 'Frames are transparent overlays. Put the identically cropped and trimmed phone video below them in Premiere. Mute phone audio.'}\n`);
  if (job.ffmpeg) {
    await new Promise((resolve, reject) => {
      const child = spawn(process.env.FFMPEG || 'ffmpeg', ['-y','-v','error','-framerate',String(job.project.output.fps),'-i',join(job.dir,'frame-%06d.png'),'-i',join(job.dir,'audio.wav'),'-c:v','libx264','-pix_fmt','yuv420p','-crf','18','-c:a','aac','-b:a','192k','-movflags','+faststart','-shortest',join(job.dir,'composite.mp4')]);
      let error = ''; child.stderr.on('data', b => { error = (error + b).slice(-8000); }); child.on('error', reject); child.on('close', code => code ? reject(new Error(error || `FFmpeg exited ${code}`)) : resolve());
    });
    await stat(join(job.dir,'composite.mp4'));
  }
  job.status = 'done'; return { id: job.id, status: job.status, frames: job.frames, ffmpeg: job.ffmpeg };
}
