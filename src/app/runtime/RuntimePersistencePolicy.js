export function savePersistedSceneForRuntime(runtime) {
  if (runtime.debugMode || !canPersistMode(runtime.sessionMode)) return false;
  return runtime.scenePersistence.save();
}

export async function restorePersistedSceneForRuntime(runtime) {
  if (runtime.debugMode || !canPersistMode(runtime.sessionMode)) return { instruments: [], skipped: [] };
  const report = await runtime.scenePersistence.restore();
  if (report.skipped?.length) runtime.showRuntimeFeedback?.(
    `Scene recovery: skipped ${report.skipped.length} objects and ${report.skippedConnections?.length || 0} clock connections. Original save preserved; autosave paused.`,
  );
  return report;
}

export function canPersistMode(mode = 'play') { return mode === 'play' || mode === 'launch'; }
