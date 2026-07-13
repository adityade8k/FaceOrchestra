import { SCENE_SCHEMA_VERSION } from "../schema.js";
import { migrateV1ToV2 } from "./v1ToV2.js";

export function migrateSceneData(data) {
  if (!data || typeof data !== "object") return null;
  const version = Number(data.schemaVersion ?? data.version ?? 1);
  if (version === SCENE_SCHEMA_VERSION) return clonePlain(data);
  if (version === 1) return migrateV1ToV2(data);
  return null;
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}
