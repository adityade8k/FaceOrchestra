export function validateComposition(definition) {
  const d = definition;
  if (!d || d.schemaVersion !== 1 || !d.id || !d.title || !d.contentVersion)
    throw new Error("Invalid composition identity/version");
  if (!Number.isFinite(d.bpm) || d.bpm < 30 || d.bpm > 240)
    throw new Error("Unsupported composition tempo");
  if (
    !Array.isArray(d.lessons) ||
    !d.lessons.length ||
    !d.lessons.some((l) => l.completePerformance)
  )
    throw new Error(
      "Composition requires complete guided lessons and a final performance",
    );
  const ids = new Set();
  for (const lesson of d.lessons) {
    if (
      !lesson.id ||
      ids.has(lesson.id) ||
      !lesson.goal ||
      !lesson.practice ||
      !lesson.demonstration ||
      !lesson.assessment ||
      !lesson.skip
    )
      throw new Error("Incomplete guided lesson");
    ids.add(lesson.id);
  }
  if (!d.recording || !d.liveRole || !d.score || !d.arrangement)
    throw new Error(
      "Composition requires one score, arrangement, live role and recording policy",
    );
  const plain = (value) => {
    if (value === null || ["string", "boolean"].includes(typeof value)) return;
    if (typeof value === "number" && Number.isFinite(value)) return;
    if (Array.isArray(value)) {
      value.forEach(plain);
      return;
    }
    if (
      typeof value === "object" &&
      Object.getPrototypeOf(value) === Object.prototype
    ) {
      Object.values(value).forEach(plain);
      return;
    }
    throw new Error("Composition must contain finite serializable plain data");
  };
  plain(d);
  return d;
}

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
    version: 2,
    load: () => import("./kuch.js"),
  },
  {
    id: "rishte-naate",
    title: "rishte naate.mid",
    version: 1,
    load: () => Promise.all([
      import("./MidiPerformance.js"),
      import("./rishte-naate/composition.json", { with: { type: "json" } }),
    ]).then(([runtime, score]) => runtime.midiPerformance(score.default)),
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
