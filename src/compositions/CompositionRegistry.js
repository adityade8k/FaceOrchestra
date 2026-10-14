import { validateComposition } from "./CompositionDefinition.js";
export { validateComposition } from "./CompositionDefinition.js";

// Metadata is cheap. Loading imports only the chosen composition and adapter.
export class CompositionRegistry {
  constructor(entries = []) {
    this.entries = new Map();
    this.loaded = new Map();
    entries.forEach((e) => this.register(e));
  }
  register({ load, ...metadata }) {
    if (
      !metadata.id ||
      !metadata.title ||
      !metadata.version ||
      typeof load !== "function" ||
      this.entries.has(metadata.id)
    )
      throw new Error("Invalid or duplicate catalog entry");
    this.entries.set(metadata.id, { metadata: Object.freeze(metadata), load });
  }
  list() {
    return [...this.entries.values()].map((e) => e.metadata);
  }
  async load(id, { signal } = {}) {
    const entry = this.entries.get(id);
    if (!entry) throw new Error("Unknown composition");
    signal?.throwIfAborted();
    if (!this.loaded.has(id))
      this.loaded.set(
        id,
        entry
          .load()
          .then(async (module) => {
            validateComposition(module.definition);
            if (!module.definition.contentHash) {
              const bytes = new TextEncoder().encode(
                JSON.stringify(module.definition),
              );
              const hash = await globalThis.crypto.subtle.digest(
                "SHA-256",
                bytes,
              );
              module.definition.contentHash = [...new Uint8Array(hash)]
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("");
            }
            if (
              module.definition.id !== id ||
              module.definition.title !== entry.metadata.title ||
              module.definition.contentVersion !== entry.metadata.version
            )
              throw new Error("Catalog and definition disagree");
            return module;
          })
          .catch((error) => {
            this.loaded.delete(id);
            throw error;
          }),
      );
    const module = await this.loaded.get(id);
    signal?.throwIfAborted();
    return module;
  }
}
export const compositionRegistry = new CompositionRegistry([
  {
    id: "virag-2-jog-study",
    title: "Raag Jog",
    version: 3,
    load: () => import("./jog.js"),
  },
  {
    id: "kuch-to-hua-hai",
    title: "Kuch To Hua Hai",
    version: 7,
    load: () => import("./kuch.js"),
  },
  {
    id: "rishte-naate",
    title: "rishte naate.mid",
    version: 3,
    load: () => import("./rishte.js"),
  },
  {
    id: "tu-kisi-rail-si",
    title: "Tu Kisi Rail Si",
    version: 2,
    load: () => import("./tu-kisi-rail-si.js"),
  },
  {
    id: "nazariya-honk-bends",
    title: "Nazariya Ki Maari",
    version: 5,
    load: () => import("./nazariya-honk-bends.js"),
  },
]);
export function libraryPage(registry, mode, page = 0, size = 2) {
  const rows =
    mode === "tutorials"
      ? [{ id: "basics", title: "Basics", version: 1 }, ...registry.list()]
      : registry.list();
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const index = Math.max(0, Math.min(page, pages - 1));
  return { rows: rows.slice(index * size, (index + 1) * size), index, pages };
}
