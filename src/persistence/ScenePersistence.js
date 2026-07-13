export class ScenePersistence {
  constructor({ store, serializer, restorer }) {
    this.store = store;
    this.serializer = serializer;
    this.restorer = restorer;
  }

  save() {
    return this.store.save(this.serializer.serialize());
  }

  async restore() {
    const data = this.store.load();
    if (!data) return { instruments: [], skipped: [] };
    return this.restorer.restore(data);
  }
}
