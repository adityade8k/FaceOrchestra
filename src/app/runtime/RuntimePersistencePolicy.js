export function savePersistedSceneForRuntime(runtime) {
  if (runtime.debugMode) return false;
  return runtime.scenePersistence.save();
}

export async function restorePersistedSceneForRuntime(runtime) {
  if (runtime.debugMode) return { instruments: [], skipped: [] };
  return runtime.scenePersistence.restore();
}
