// v4 adopts phrase-end Looper duration semantics. Existing event timing and
// explicit Gap are preserved; record-to-stop and whole-beat tail padding are
// intentionally discarded when LooperTimeline derives its musical endpoint.
export function migrateV3ToV4(source = {}) {
  const migrated = JSON.parse(JSON.stringify(source));
  migrated.schemaVersion = 4;
  migrated.instruments = Array.isArray(migrated.instruments) ? migrated.instruments : [];
  for (const instrument of migrated.instruments) {
    if (instrument?.kind !== "looper" || !instrument.timeline) continue;
    instrument.timeline.schemaVersion = 3;
    instrument.timeline.gapBeats = Math.min(
      Math.max(Math.round(instrument.timeline.gapBeats || 0), 0),
      4,
    );
  }
  return migrated;
}
