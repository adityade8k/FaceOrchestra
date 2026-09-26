export function savePersistedSceneForRuntime(runtime) {
  if (runtime.debugMode || !canPersistMode(runtime.sessionMode)) return false;
  return runtime.scenePersistence.save();
}

export async function restorePersistedSceneForRuntime(runtime) {
  if (runtime.debugMode || !canPersistMode(runtime.sessionMode))
    return { instruments: [], skipped: [] };
  const report = await runtime.scenePersistence.restore();
  const status = runtime.scenePersistence.store?.status;
  if (
    ["corrupt", "unsupported", "unavailable", "recovered"].includes(
      status?.state,
    )
  )
    runtime.showRuntimeFeedback?.(
      `Play storage: ${status.state}. Previous data is retained for recovery.`,
    );
  if (report.skipped?.length)
    runtime.showRuntimeFeedback?.(
      `Scene recovery: skipped ${report.skipped.length} objects and ${report.skippedConnections?.length || 0} clock connections. Original save preserved; autosave paused.`,
    );
  return report;
}

export function canPersistMode(mode = "play") {
  return mode === "play" || mode === "launch";
}
