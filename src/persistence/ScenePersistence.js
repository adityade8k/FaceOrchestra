export class ScenePersistence {
  constructor({ store, serializer, restorer }) {
    this.store = store;
    this.serializer = serializer;
    this.restorer = restorer;
  }

  save() {
    // A partial restore must never overwrite the recovery source, including autosaves.
    if (this.restoreReport?.skipped?.length) return false;
    return this.store.save(this.serializer.serialize());
  }

  async restore() {
    const data = this.store.load();
    if (!data) return { instruments: [], skipped: [] };
    this.restoreReport = await this.restorer.restore(data);
    return this.restoreReport;
  }
}
