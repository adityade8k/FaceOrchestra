import { SCENE_SCHEMA_VERSION } from "../schema.js";
import { migrateV1ToV2 } from "./v1ToV2.js";
import { migrateV2ToV3 } from "./v2ToV3.js";

export function migrateSceneData(data) {
  if (!data || typeof data !== "object") return null;
  const version = Number(data.schemaVersion ?? data.version ?? 1);
  if (version === SCENE_SCHEMA_VERSION) return clonePlain(data);
  if (version === 2) return migrateV2ToV3(data);
  if (version === 1) return migrateV2ToV3(migrateV1ToV2(data));
  return null;
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}
