import { LEGACY_SCENE_STORAGE_KEYS, SCENE_STORAGE_KEY } from "./schema.js";
import { migrateSceneData } from "./migrations/index.js";

// Legacy synchronous store. Never remove the previous valid value on a failed
// write or migration; callers can surface status without crashing startup.
export class PersistenceStore {
  constructor({
    storage,
    key = SCENE_STORAGE_KEY,
    legacyKeys = LEGACY_SCENE_STORAGE_KEYS,
  } = {}) {
    try {
      this.storage = storage === undefined ? globalThis.localStorage : storage;
    } catch (error) {
      this.status = { state: "unavailable", error };
    }
    this.key = key;
    this.legacyKeys = [...legacyKeys];
    this.status ||= { state: this.storage ? "empty" : "unavailable" };
  }

  save(data) {
    if (!this.storage || this.protected) return false;
    try {
      const serialized = JSON.stringify(data);
      const previous = this.storage.getItem(this.key);
      if (previous && migrateSceneData(JSON.parse(previous))) {
        this.storage.setItem(`${this.key}:recovery`, previous);
      }
      this.storage.setItem(this.key, serialized);
      if (this.storage.getItem(this.key) !== serialized)
        throw new Error("Save verification failed");
      this.status = { state: "saved" };
      return true;
    } catch (error) {
      this.status = {
        state: error.name === "QuotaExceededError" ? "quota" : "unavailable",
        error,
      };
      console.warn(`Could not persist scene at ${this.key}:`, error);
      return false;
    }
  }

  load() {
    if (!this.storage) return null;
    for (const key of [this.key, `${this.key}:recovery`, ...this.legacyKeys]) {
      const data = this.read(key);
      if (!data) continue;
      let migrated;
      try {
        migrated = migrateSceneData(data);
      } catch (error) {
        this.protected = true;
        this.status = { state: "corrupt", key, error };
        continue;
      }
      if (!migrated) {
        this.protected = true;
        this.status = { state: "unsupported", key };
        continue;
      }
      this.status = { state: key === this.key ? "loaded" : "recovered", key };
      return migrated;
    }
    return null;
  }

  clear() {
    try {
      this.storage?.removeItem(this.key);
      this.protected = false;
      return true;
    } catch (error) {
      this.status = { state: "unavailable", error };
      return false;
    }
  }

  read(key) {
    try {
      const serialized = this.storage?.getItem(key);
      if (!serialized) return null;
      try {
        return JSON.parse(serialized);
      } catch (error) {
        this.protected = true;
        this.status = { state: "corrupt", key, error };
        return null;
      }
    } catch (error) {
      this.status = { state: "unavailable", key, error };
      return null;
    }
  }
}
