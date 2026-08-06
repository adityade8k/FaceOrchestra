export function migrateV2ToV3(source = {}) {
  const migrated = clonePlain(source);
  migrated.schemaVersion = 3;
  migrated.instruments = Array.isArray(migrated.instruments) ? migrated.instruments : [];
  for (const instrument of migrated.instruments) {
    if (instrument?.kind !== "looper" || !instrument.controls) continue;
    instrument.controls = { ...instrument.controls };
    delete instrument.controls.speed;
  }
  migrated.relationships = {
    honkLocks: [...(migrated.relationships?.honkLocks || [])],
    looperConnections: [...(migrated.relationships?.looperConnections || [])],
    metronomeConnections: [],
  };
  migrated.equipment = {
    preferredStickType: "default",
    ...(migrated.equipment || {}),
  };
  return migrated;
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}
