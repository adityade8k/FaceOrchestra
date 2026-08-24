import {
  SPAWN_CATALOG_ENTRIES,
  SPAWN_RADIAL_CATEGORIES,
} from "../config/spawning.js";

export class SpawnCatalog {
  constructor(entries = SPAWN_CATALOG_ENTRIES, categories = SPAWN_RADIAL_CATEGORIES) {
    this.entries = entries.map((entry) => Object.freeze({ ...entry }));
    this.byId = new Map(this.entries.map((entry) => [entry.id, entry]));
    if (this.byId.size !== this.entries.length) {
      throw new Error("Spawn catalog entry IDs must be unique.");
    }
    this.radialCategories = resolveRadialCategories(categories, this.byId);
  }

  get(id) {
    return this.byId.get(id) || null;
  }

  getRadialEntries() {
    return this.entries.filter((entry) => entry.visibleInRadial !== false);
  }

  getRadialCategories() {
    return this.radialCategories;
  }

  getByAction(action) {
    return this.entries.filter((entry) => entry.action === action);
  }
}

export function resolveCatalogInstrumentSpawn(entry, fallbackComponentId) {
  return {
    componentId: entry?.componentId || entry?.id || fallbackComponentId,
    options: {
      bpm: entry?.bpm,
    },
  };
}

function resolveRadialCategories(categories, entriesById) {
  const categoryIds = new Set();
  const childIds = new Set();
  return Object.freeze(categories.map((category) => {
    if (categoryIds.has(category.id) || entriesById.has(category.id)) {
      throw new Error(`Duplicate radial category ID: ${category.id}`);
    }
    categoryIds.add(category.id);
    const entries = category.childIds.map((childId) => {
      if (childIds.has(childId)) {
        throw new Error(`Duplicate radial child ID: ${childId}`);
      }
      childIds.add(childId);
      const entry = entriesById.get(childId);
      if (!entry) {
        throw new Error(`Missing radial child entry: ${childId}`);
      }
      if (entry.visibleInRadial === false) {
        throw new Error(`Hidden catalog entry cannot be a radial child: ${childId}`);
      }
      return entry;
    });
    return Object.freeze({
      id: category.id,
      label: category.label,
      color: category.color,
      entries: Object.freeze(entries),
    });
  }));
}
