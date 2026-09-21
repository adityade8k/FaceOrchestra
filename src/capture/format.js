export const TAKE_VERSION = 1;
export const STREAMS = ['samples', 'events', 'audio'];
export const LIMITS = Object.freeze({ message: 8 * 1024 * 1024, queue: 32 * 1024 * 1024, spool: 128 * 1024 * 1024 });
export const takeId = () => crypto.randomUUID();

export function timeMap(videoTime, { a = 1, b = 0 } = {}) { return a * videoTime + b; }
export function fitTimeMap(first, second = null) {
  if (![first?.video, first?.scene].every(Number.isFinite)) throw new Error('Enter finite anchor times.');
  if (!second) return { a: 1, b: first.scene - first.video };
  if (![second.video, second.scene].every(Number.isFinite) || Math.abs(second.video - first.video) < 1) throw new Error('Sync anchors must be at least one second apart.');
  const a = (second.scene - first.scene) / (second.video - first.video);
  if (!(a > 0.9 && a < 1.1)) throw new Error('Implausible clock drift; check the anchors.');
  return { a, b: first.scene - a * first.video };
}
export function exportTimes({ start, end, fps }) {
  if (![start, end, fps].every(Number.isFinite) || start < 0 || end <= start || ![30, 60].includes(fps)) throw new Error('Invalid trim or frame rate.');
  return { count: Math.ceil((end - start) * fps - 1e-7), at: index => start + index / fps };
}
export function poseData(pose) {
  if (!pose) return null;
  const { position: p, orientation: q } = pose.transform;
  return { p: [p.x, p.y, p.z], q: [q.x, q.y, q.z, q.w], emulated: Boolean(pose.emulatedPosition) };
}
export function validateEnvelope(packet) {
  if (!packet || !STREAMS.includes(packet.stream) || !Number.isSafeInteger(packet.seq) || packet.seq < 0 || !Number.isFinite(packet.t) || packet.t < -1 || packet.t > 86400 || !packet.data || typeof packet.data !== 'object') throw new Error('Invalid stream packet.');
  const data=packet.data;
  if(packet.stream==='events'&&data.kind==='resource-part'&&(!Number.isSafeInteger(data.parts)||data.parts<1||data.parts>512||!Number.isSafeInteger(data.part)||data.part<0||data.part>=data.parts||typeof data.id!=='string'||data.id.length>100||typeof data.text!=='string'||data.text.length>256*1024))throw new Error('Invalid bounded resource fragment.');
  return packet;
}
// Independent ordered streams. A gap is rejected, never acknowledged as saved.
export function sequenceDecision(last, seq) {
  if (seq <= last) return 'duplicate';
  return seq === last + 1 ? 'append' : 'gap';
}
