export class ScenePersistence {
  constructor({ store, serializer, restorer }) {
    this.store = store;
    this.serializer = serializer;
    this.restorer = restorer;
    this.dirty = false;
  }

  markDirty() {
    this.dirty = true;
  }

  save({ force = false } = {}) {
    if (!force && !this.dirty) return false;
    const didSave = this.store.save(this.serializer.serialize());
    if (didSave) this.dirty = false;
    return didSave;
  }

  async restore() {
    const data = this.store.load();
    if (!data) return { instruments: [], skipped: [] };
    const result = await this.restorer.restore(data);
    this.dirty = false;
    return result;
  }
}
