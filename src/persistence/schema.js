export const SCENE_SCHEMA_VERSION = 4;
export const SCENE_STORAGE_KEY = "face-orchestra:scene:v4";
export const LEGACY_SCENE_STORAGE_KEYS = Object.freeze([
  "face-orchestra:scene:v3",
  "face-orchestra:scene:v2",
  "face-orchestra:spawned-instruments:v1",
]);

export function createEmptySceneData() {
  return {
    schemaVersion: SCENE_SCHEMA_VERSION,
    instruments: [],
    relationships: {
      honkLocks: [],
      looperConnections: [],
      metronomeConnections: [],
    },
    equipment: {
      preferredStickType: "default",
    },
  };
}
