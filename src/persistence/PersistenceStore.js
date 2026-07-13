import { LEGACY_SCENE_STORAGE_KEYS, SCENE_STORAGE_KEY } from "./schema.js";
import { migrateSceneData } from "./migrations/index.js";

export class PersistenceStore {
  constructor({ storage = globalThis.localStorage, key = SCENE_STORAGE_KEY, legacyKeys = LEGACY_SCENE_STORAGE_KEYS } = {}) {
    this.storage = storage;
    this.key = key;
    this.legacyKeys = [...legacyKeys];
  }

  save(data) {
    if (!this.storage) return false;
    this.storage.setItem(this.key, JSON.stringify(data));
    return true;
  }

  load() {
    if (!this.storage) return null;
    const current = this.read(this.key);
    if (current) return migrateSceneData(current);

    for (const legacyKey of this.legacyKeys) {
      const legacy = this.read(legacyKey);
      if (!legacy) continue;
      const migrated = migrateSceneData(legacy);
      if (migrated) {
        this.save(migrated);
        return migrated;
      }
    }
    return null;
  }

  clear() {
    this.storage?.removeItem(this.key);
  }

  read(key) {
    const serialized = this.storage?.getItem(key);
    if (!serialized) return null;
    try {
      return JSON.parse(serialized);
    } catch (error) {
      console.warn(`Could not parse persisted scene at ${key}:`, error);
      return null;
    }
  }
}
