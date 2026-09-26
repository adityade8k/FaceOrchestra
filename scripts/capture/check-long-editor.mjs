// A generated 30-minute *data fixture*, not a real-time headset/capture soak.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, open, writeFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "./server.mjs";
import { launchChrome } from "./chrome.mjs";
import { wavHeader } from "./storage.mjs";

const root = await mkdtemp(join(tmpdir(), "honk-long-editor-"));
let service, browser;
try {
  const id = "synthetic-long",
    dir = join(root, id);
  await mkdir(dir);
  await writeFile(
    join(dir, "take.json"),
    JSON.stringify({
      version: 1,
      id,
      synthetic: true,
      status: "complete",
      complete: true,
      audio: { sampleRate: 48000, channels: 2 },
      duration: 1799.9,
      assetsBundled: true,
      gaps: [],
      build: { assets: {} },
    }),
  );
  await writeFile(
    join(dir, "audio.wav"),
    Buffer.concat([wavHeader(4, 48000), Buffer.alloc(4)]),
  );
  await writeFile(
    join(dir, "events.ndjson"),
    Array.from({ length: 30 }, (_, i) =>
      JSON.stringify({
        stream: "events",
        seq: i,
        t: 0,
        data: {
          kind: "node",
          id: `n${i}`,
          type: "Group",
          name: `Fixture ${i}`,
          layer: "instruments",
          renderOrder: 0,
        },
      }),
    ).join("\n") + "\n",
  );
  const samples = await open(join(dir, "samples.ndjson"), "w");
  try {
    for (let batch = 0; batch < 180; batch++) {
      const lines = [];
      for (let j = 0; j < 100; j++) {
        const i = batch * 100 + j;
        lines.push(
          JSON.stringify({
            stream: "samples",
            seq: i,
            t: i / 10,
            data: {
              full: i % 10 === 0,
              segment: i < 9000 ? 0 : 1,
              nodes: Object.fromEntries(
                Array.from({ length: 30 }, (_, n) => [
                  `n${n}`,
                  {
                    x: [i / 1000, n, -2, 0, 0, 0, 1, 1, 1, 1, 1],
                    morphs: 0,
                    materials: [],
                  },
                ]),
              ),
              xr: {
                viewer: { p: [i / 1000, 1.6, 0], q: [0, 0, 0, 1] },
                controllers: [],
              },
            },
          }),
        );
      }
      await samples.writeFile(lines.join("\n") + "\n");
    }
  } finally {
    await samples.close();
  }
  const bytes = (await stat(join(dir, "samples.ndjson"))).size;
  assert.ok(
    bytes > 16 * 1024 * 1024,
    "Exercise the production chunk threshold",
  );
  service = await startServer({
    host: "127.0.0.1",
    port: 0,
    plain: true,
    dataRoot: root,
    pairCode: "123456",
  });
  browser = await launchChrome();
  await browser.navigate(`http://127.0.0.1:${service.port}/capture/`);
  const result = await browser.evaluate(`(async()=>{
    await fetch('/api/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:'123456'})});
    while(!window.captureEditor)await new Promise(r=>setTimeout(r,50));
    const ed=captureEditor,start=performance.now();await ed.loadTake('synthetic-long');
    const loadMs=performance.now()-start;
    if(ed.timeline.constructor.name!=='ChunkedTimeline')throw new Error('Whole take retained');
    const times=[0,.95,7.35,899.85,900.05,1799.9,...Array.from({length:60},(_,i)=>(i*29.13)%1799)];
    const seekMs=[];
    for(const t of times){
      const at=performance.now();await ed.seek(t);const frame=ed.timeline.seek(t);seekMs.push(performance.now()-at);
      if(!frame||Math.abs(frame.nodes.n0.x[0]-t/100)>.00001)throw new Error('Incorrect indexed seek at '+t);
      if(ed.timeline.cache.size>3||ed.timeline.requests>2)throw new Error('Unbounded presentation requests/cache');
    }
    seekMs.sort((a,b)=>a-b);
    return {userAgent:navigator.userAgent,fixtureSeconds:1799.9,frames:ed.timeline.indexData.frames,chunks:ed.timeline.indexData.chunks.length,loadMs,seeks:times.length,seekP50:seekMs[Math.floor(seekMs.length*.5)],seekP95:seekMs[Math.floor(seekMs.length*.95)],seekP99:seekMs[Math.floor(seekMs.length*.99)],cachedChunks:ed.timeline.cache.size,heapBytes:performance.memory?.usedJSHeapSize};
  })()`);
  assert.deepEqual(browser.errors, []);
  await writeFile(
    "docs/audits/long-editor.json",
    JSON.stringify({ ...result, bytes, realTimeSoak: false }, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await browser?.close();
  await service?.close();
  await rm(root, { recursive: true, force: true });
}
