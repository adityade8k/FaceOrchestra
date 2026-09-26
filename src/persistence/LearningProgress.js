// Separate namespace and version identity; these writes can never replace Play.
export class LearningProgress {
  key(id, version) {
    return `honk-orchestra:progress:${id}:${version}`;
  }
  load(id, version) {
    try {
      return JSON.parse(
        globalThis.localStorage?.getItem(this.key(id, version)) || "null",
      );
    } catch {
      return null;
    }
  }
  save(id, version, value) {
    try {
      globalThis.localStorage?.setItem(
        this.key(id, version),
        JSON.stringify(value),
      );
      return true;
    } catch {
      return false;
    }
  }
}
