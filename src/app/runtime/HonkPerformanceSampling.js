const REFERENCE_FRAME_MS = 1000 / 60;

export function captureCanonicalHonkPerformance(honkState, squeezeGateThreshold = 0.025) {
  if (honkState?.kind !== "honk" || !honkState.root?.visible) return null;
  const rawLive = honkState.getLivePerformanceState?.();
  if (!rawLive) return null;
  const live = honkState.getProcessedLivePerformanceState?.() || rawLive;
  return {
    musicalOnset: Number(rawLive.squeeze || 0) > squeezeGateThreshold,
    gateActive: Number(rawLive.squeeze || 0) > squeezeGateThreshold,
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

// Follow continuous recorded motion directly. Only discontinuities contribute a
// decaying visual offset; processed live motion never passes through another filter.
export function advanceHonkPresentation(previous, target, live, automationRevision, deltaMs) {
  const state = previous || {
    squeeze: live.squeeze ?? 0, bend: live.bend ?? 0,
    targetSqueeze: live.squeeze ?? 0, targetBend: live.bend ?? 0,
    automationRevision,
  };
  const membershipChanged = state.automationRevision !== automationRevision;
  const released = target.squeeze === 0 && state.targetSqueeze > 0;
  const attack = target.squeeze > state.targetSqueeze;
  const decay = 1 - getTimeBasedSmoothingAlpha(0.18, deltaMs);
  for (const field of ["squeeze", "bend"]) {
    const key = field === "squeeze" ? "targetSqueeze" : "targetBend";
    const value = target[field] ?? 0;
    const jump = value - state[key];
    const automatedJump = value !== (live[field] ?? 0) &&
      Math.abs(jump) > 0.012 * Math.max(deltaMs, REFERENCE_FRAME_MS);
    const transition = membershipChanged || released || (automatedJump && !attack);
    let offset = transition ? state[field] - value : state[field] - state[key];
    if (attack && !membershipChanged) offset = 0;
    state[field] = value + offset * decay;
    if (Math.abs(state[field] - value) < 0.0001) state[field] = value;
    state[key] = value;
  }
  state.squeeze = Math.min(Math.max(state.squeeze, 0), 1);
  state.bend = Math.min(Math.max(state.bend, -1), 1);
  state.automationRevision = automationRevision;
  return state;
}
