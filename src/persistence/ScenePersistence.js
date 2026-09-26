export class ScenePersistence {
  constructor({ store, serializer, restorer }) {
    Object.assign(this, { store, serializer, restorer });
    this.dirty = false;
    this.pending = Promise.resolve();
  }

  save() {
    if (
      this.restoreReport?.skipped?.length ||
      this.restoreReport?.skippedConnections?.length
    )
      return false;
    return this.store.save(this.serializer.serialize());
  }

  markDirty() {
    this.dirty = true;
    // One bounded delay, never extended by a held controller. Serialization
    // runs in a timer task, outside the XR animation callback.
    if (!this.timer)
      this.timer = setTimeout(() => {
        this.timer = null;
        if (this.canCheckpoint?.() !== false) this.checkpoint();
      }, 1500);
  }

  checkpoint({ force = false } = {}) {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.dirty && !force) return this.pending;
    this.dirty = false;
    this.pending = this.pending
      .catch(() => false)
      .then(async () => {
        if (this.canCheckpoint?.() === false) return false;
        try {
          const saved = await this.save();
          if (!saved) this.dirty = true;
          this.onStatus?.(this.store.status);
          return saved;
        } catch (error) {
          this.dirty = true;
          this.onStatus?.({ state: "failed", error });
          return false;
        }
      });
    return this.pending;
  }

  async restore() {
    const data = await this.store.load();
    if (!data) return { instruments: [], skipped: [] };
    this.restoreReport = await this.restorer.restore(data);
    return this.restoreReport;
  }

  dispose() {
    clearTimeout(this.timer);
    this.timer = null;
  }
}
