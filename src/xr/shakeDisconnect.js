export function resolveShakeTarget(state) {
  if (!state?.gripHeld) return null;
  const target = state.gripSourceInstrumentState || state.gripInstrumentState?.source || state.gripInstrumentState;
  return target && ['honk', 'looper'].includes(target.kind) && !target.pendingPlacement && !target.disposed && target.root?.visible ? target : null;
}

export function disconnectShakenTarget(runtime, target) {
  if (target.kind === 'looper') return Boolean(runtime.metronomeConnectionManager.disconnectTarget('looper', target.id, 'shake'));
  if (target.kind !== 'honk') return false;
  let changed = false;
  for (const {looperState, track} of runtime.getLooperConnectionsForHonk(target)) {
    changed = Boolean(runtime.disconnectLooperTrack(looperState, track.index)) || changed;
  }
  return changed;
}
