const REFERENCE_FRAME_MS = 1000 / 60;

export function captureCanonicalHonkPerformance(honkState, squeezeGateThreshold = 0.025) {
  if (honkState?.kind !== "honk" || !honkState.root?.visible) return null;
  const live = honkState.getLivePerformanceState?.();
  if (!live) return null;
  return {
    musicalOnset: Number(live.squeeze || 0) > squeezeGateThreshold,
    squeeze: live.squeeze ?? 0,
    bend: live.bend ?? 0,
    earLeft: live.earLeft ?? 0,
    earRight: live.earRight ?? 0,
    nose: live.nose ?? 0,
    vowel: live.vowel ?? "neutral",
  };
}

export function getTimeBasedSmoothingAlpha(frameFactor, deltaMs) {
  const safeFactor = Math.min(Math.max(frameFactor, 0), 1);
  const safeDeltaMs = Math.max(Number.isFinite(deltaMs) ? deltaMs : REFERENCE_FRAME_MS, 0);
  return 1 - (1 - safeFactor) ** (safeDeltaMs / REFERENCE_FRAME_MS);
}

export function resolvePresentationValue(previous, target, frameFactor, deltaMs, hasAutomation) {
  if (hasAutomation) return target;
  const alpha = getTimeBasedSmoothingAlpha(frameFactor, deltaMs);
  return previous + (target - previous) * alpha;
}

export { REFERENCE_FRAME_MS };
