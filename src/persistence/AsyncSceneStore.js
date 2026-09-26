import { migrateSceneData } from "./migrations/index.js";

// Structured-clone storage keeps long timelines out of localStorage/JSON.
// Current and previous are committed in the same transaction. The legacy
// source is retained indefinitely; migration never deletes its recovery copy.
export class AsyncSceneStore {
  constructor(legacy, { indexedDB } = {}) {
    this.legacy = legacy;
    this.status = { state: "empty" };
    try {
      this.indexedDB =
        indexedDB === undefined ? globalThis.indexedDB : indexedDB;
    } catch (error) {
      this.status = { state: "unavailable", error };
    }
  }
  async database() {
    if (!this.indexedDB) return null;
    return (this.opening ||= new Promise((resolve, reject) => {
      const request = this.indexedDB.open("honk-orchestra-workspaces", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("scenes");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        this.opening = null;
        reject(request.error);
      };
      request.onblocked = () => {
        this.opening = null;
        reject(new Error("Scene database upgrade blocked"));
      };
    }));
  }
  async load() {
    try {
      const db = await this.database();
      if (db) {
        const values = await new Promise((resolve, reject) => {
          const tx = db.transaction("scenes", "readonly"),
            store = tx.objectStore("scenes");
          const current = store.get("play"),
            previous = store.get("play:previous");
          tx.oncomplete = () => resolve([current.result, previous.result]);
          tx.onabort = tx.onerror = () => reject(tx.error);
        });
        for (const [index, value] of values.entries()) {
          if (!value) continue;
          let scene;
          try {
            scene = migrateSceneData(value);
          } catch (error) {
            this.protected = true;
            this.status = { state: "corrupt", error };
            continue;
          }
          if (scene) {
            this.status = { state: index ? "recovered" : "loaded" };
            return scene;
          }
          this.protected = true;
          this.status = { state: "unsupported" };
        }
      }
    } catch (error) {
      this.status = { state: "unavailable", error };
      this.protected = true;
    }
    const legacy = this.legacy.load();
    this.protected ||= this.legacy.protected;
    if (legacy) this.status = { state: "legacy", source: this.legacy.status };
    return legacy;
  }
  async save(scene) {
    if (this.protected || this.legacy.protected) return false;
    try {
      const db = await this.database();
      if (!db) {
        const saved = this.legacy.save(scene);
        this.status = this.legacy.status;
        return saved;
      }
      await new Promise((resolve, reject) => {
        const tx = db.transaction("scenes", "readwrite"),
          store = tx.objectStore("scenes");
        const prior = store.get("play");
        prior.onsuccess = () => {
          if (prior.result) store.put(prior.result, "play:previous");
          store.put(scene, "play");
        };
        tx.oncomplete = resolve;
        tx.onabort = tx.onerror = () => reject(tx.error);
      });
      // A committed transaction is durable; read back before declaring success.
      const verified = await this.load();
      if (!verified) throw new Error("Scene verification failed");
      this.status = { state: "saved" };
      return true;
    } catch (error) {
      this.status = {
        state: error.name === "QuotaExceededError" ? "quota" : "unavailable",
        error,
      };
      return false;
    }
  }
  async close() {
    try {
      (await this.opening)?.close();
    } finally {
      this.opening = null;
    }
  }
}
