const KEY = "honk-orchestra:guided-play-offset-ms";
export function clampGuidedPlayOffset(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1000, Math.round(number))) : 0;
}
export class GuidedPlayOffset {
  constructor(storage) {
    try { this.storage = storage ?? globalThis.localStorage; } catch { /* unavailable storage */ }
    try { this.milliseconds = clampGuidedPlayOffset(this.storage?.getItem(KEY) ?? 0); }
    catch { this.milliseconds = 0; }
  }
  set(value) {
    this.milliseconds = clampGuidedPlayOffset(value);
    try { this.storage?.setItem(KEY, String(this.milliseconds)); } catch { /* still works for this visit */ }
    return this.milliseconds;
  }
}
export function visualCueTime(runtime, now) {
  return now + clampGuidedPlayOffset(runtime?.tutorial?.guidedPlayOffset?.milliseconds ?? 0);
}
