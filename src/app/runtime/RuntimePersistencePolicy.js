export function savePersistedSceneForRuntime(runtime) {
  if (runtime.debugMode || !canPersistMode(runtime.sessionMode)) return false;
  return runtime.scenePersistence.save();
}

export async function restorePersistedSceneForRuntime(runtime) {
  if (runtime.debugMode || !canPersistMode(runtime.sessionMode)) return { instruments: [], skipped: [] };
  return runtime.scenePersistence.restore();
}

export function canPersistMode(mode = 'play') { return mode === 'play' || mode === 'launch'; }
