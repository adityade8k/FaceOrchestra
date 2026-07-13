export const SCENE_SCHEMA_VERSION = 2;
export const SCENE_STORAGE_KEY = "face-orchestra:scene:v2";
export const LEGACY_SCENE_STORAGE_KEYS = Object.freeze([
  "face-orchestra:spawned-instruments:v1",
]);

export function createEmptySceneData() {
  return {
    schemaVersion: SCENE_SCHEMA_VERSION,
    instruments: [],
    relationships: {
      honkLocks: [],
      looperConnections: [],
    },
    equipment: {
      preferredStickType: "default",
    },
  };
}
