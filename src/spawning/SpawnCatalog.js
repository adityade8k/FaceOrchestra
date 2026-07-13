import { SPAWN_CATALOG_ENTRIES } from "../config/spawning.js";

export class SpawnCatalog {
  constructor(entries = SPAWN_CATALOG_ENTRIES) {
    this.entries = entries.map((entry) => Object.freeze({ ...entry }));
    this.byId = new Map(this.entries.map((entry) => [entry.id, entry]));
  }

  get(id) {
    return this.byId.get(id) || null;
  }

  getRadialEntries() {
    return this.entries.filter((entry) => entry.visibleInRadial !== false);
  }

  getByAction(action) {
    return this.entries.filter((entry) => entry.action === action);
  }
}
