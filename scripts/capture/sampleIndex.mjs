import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

// Byte ranges start at full keyframes. Build by streaming, never materializing
// the take. A trailing incomplete record is left for recovery to repair.
export async function sampleIndex(path) {
  const info = await stat(path),
    chunks = [];
  let pending = Buffer.alloc(0),
    offset = 0,
    frames = 0,
    duration = 0;
  for await (const bytes of createReadStream(path)) {
    pending = pending.length ? Buffer.concat([pending, bytes]) : bytes;
    let start = 0,
      end;
    while ((end = pending.indexOf(10, start)) >= 0) {
      const line = pending.subarray(start, end);
      if (line.length) {
        const packet = JSON.parse(line.toString("utf8"));
        if (packet.data.full)
          chunks.push({
            offset: offset + start,
            t: packet.t,
            segment: packet.data.segment,
            frame: frames,
          });
        frames++;
        duration = packet.t;
      }
      start = end + 1;
    }
    offset += start;
    pending = pending.subarray(start);
    if (pending.length > 8 * 1024 * 1024)
      throw new Error("Oversized presentation sample");
  }
  if (!chunks.length || chunks[0].frame !== 0)
    throw new Error("Missing initial full sample");
  for (let i = 0; i < chunks.length; i++)
    chunks[i].end = (chunks[i + 1]?.offset ?? offset) - 1;
  return {
    version: 1,
    bytes: info.size,
    modified: info.mtimeMs,
    frames,
    duration,
    chunks,
  };
}
