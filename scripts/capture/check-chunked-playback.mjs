// Check an imported take without changing the original archive or saved edits.
import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importTake } from './archive.mjs';
import { startServer } from './server.mjs';
import { launchChrome } from './chrome.mjs';

const archive = process.argv[2];
if (!archive) throw new Error('Usage: node scripts/capture/check-chunked-playback.mjs <take.honk>');
const root = await mkdtemp(join(tmpdir(), 'honk-chunked-playback-'));
const output = 'test-results/capture-chunked-playback';
let service, browser;
try {
  const id = await importTake(root, createReadStream(archive));
  service = await startServer({ host: '127.0.0.1', port: 0, plain: true, dataRoot: root, pairCode: '123456' });
  if (process.platform === 'darwin') process.env.CAPTURE_SOFTWARE_GL ??= '0';
  browser = await launchChrome();
  await browser.navigate(`http://127.0.0.1:${service.port}/capture/`);
  const report = await browser.evaluate(`(async () => {
    await fetch('/api/pair', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({code:'123456'})});
    while (!window.captureEditor) await new Promise(r => setTimeout(r, 50));
    const ed = captureEditor;
    await ed.loadTake(${JSON.stringify(id)});
    const timeline = ed.timeline, check = (ok, message) => { if (!ok) throw new Error(message); };
    check(timeline.constructor.name === 'ChunkedTimeline', 'Take does not use the chunked playback path');
    const positions = ed.take.initialSnapshot.instruments.map(h => h.transform.position);
    const center = [0,1,2].map(axis => (Math.min(...positions.map(p => p[axis])) + Math.max(...positions.map(p => p[axis]))) / 2);
    ed.setProject({camera:{position:[center[0],center[1],center[2]+3],rotation:[0,0,0],fov:55,center:[0,0]},
      layers:{instruments:true,labels:false,wires:false,tutorial:false,rays:false,controllers:false,controllerRays:false,headset:false}});
    const canvas = document.getElementById('composite'), ctx = canvas.getContext('2d');
    const visiblePixels = () => {
      const data = ctx.getImageData(0,0,canvas.width,canvas.height).data;
      let count = 0; for (let i=3;i<data.length;i+=4) if (data[i]) count++;
      return count;
    };
    const normalSeek = timeline.seek.bind(timeline), loadRange = timeline.loadRange;
    let boundaries = 0, renderedBoundaries = 0, legacyBlankBoundaries = 0, minPixels = Infinity, maxCachedChunks = 0;
    for (let i=1;i<timeline.indexData.chunks.length;i++) {
      await Promise.all(timeline.pending.values());
      timeline.cache.clear();
      await timeline.ensure(timeline.indexData.chunks[i-1].t);
      const time = timeline.indexData.chunks[i].t + .001;
      const expected = timeline.cache.get(i-1).seek(time);
      let release;
      const gate = new Promise(resolve => release = resolve);
      timeline.loadRange = async (...args) => { await gate; return loadRange(...args); };
      try {
        const frame = normalSeek(time);
        check(frame && JSON.stringify(frame) === JSON.stringify(expected), 'Missing or inaccurate frame at boundary '+time);
        boundaries++;
        // Render the first ten boundaries, including an artificially slow
        // range load. This is the actual editor compositing path, not a mock.
        if (i <= 10) {
          timeline.seek = t => timeline.cache.has(timeline.chunkAt(t)) ? normalSeek(t) : null;
          ed.render({time,transparent:true,calibration:false});
          check(visiblePixels() === 0, 'Legacy cache miss did not reproduce the blank overlay');
          legacyBlankBoundaries++;
          timeline.seek = normalSeek;
          ed.render({time,transparent:true,calibration:false});
          const pixels = visiblePixels();
          check(pixels > 1000, 'Honk overlay disappeared while the next range loaded');
          minPixels = Math.min(minPixels, pixels);
          renderedBoundaries++;
        }
      } finally {
        timeline.seek = normalSeek;
        timeline.loadRange = loadRange;
        release();
        await Promise.all(timeline.pending.values());
      }
      maxCachedChunks = Math.max(maxCachedChunks, timeline.cache.size);
      check(timeline.cache.size <= 3 && timeline.requests <= 2, 'Cache or requests grew without bounds');
    }
    check(ed.replay.issues.length === 0, 'Replay reported missing resources: '+ed.replay.issues.join('; '));
    return {originalId:ed.take.originalId,frames:timeline.indexData.frames,chunks:timeline.indexData.chunks.length,
      boundaries,renderedBoundaries,legacyBlankBoundaries,missingFramesAfterFix:0,minPixels,maxCachedChunks,
      gaps:ed.take.gaps,resourceIssues:ed.replay.issues};
  })()`);
  assert.deepEqual(browser.errors, []);
  await mkdir(output, { recursive: true });
  await writeFile(join(output, 'browser.json'), JSON.stringify(report, null, 2)+'\n');
  console.log(JSON.stringify(report));
} finally {
  if (browser?.errors.length) console.error(browser.errors);
  await browser?.close();
  await service?.close();
  await rm(root, { recursive: true, force: true });
}
