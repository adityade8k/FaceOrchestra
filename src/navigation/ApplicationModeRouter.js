// One transition owner. Prepare validates/loads before outgoing scene mutation.
// Queued requests execute in order; rollback is provided by the scene adapter.
export class ApplicationModeRouter {
  constructor({
    identity = "play",
    checkpoint,
    quiesce,
    rollback,
    onChange = () => {},
  }) {
    Object.assign(this, { identity, checkpoint, quiesce, rollback, onChange });
    this.pending = Promise.resolve();
    this.disposed = false;
  }
  enter(id, prepare, commit) {
    const operation = async () => {
      if (this.disposed)
        throw new DOMException("Application closed", "AbortError");
      const cancellation = new AbortController();
      this.cancellation = cancellation;
      const previous = this.identity;
      this.onChange({ state: "loading", id });
      let prepared,
        quiesced = false;
      try {
        prepared = await prepare(cancellation.signal);
        cancellation.signal.throwIfAborted();
        if (previous === "play") await this.checkpoint();
        cancellation.signal.throwIfAborted();
        quiesced = true;
        await this.quiesce();
        cancellation.signal.throwIfAborted();
        await commit(prepared);
        this.identity = id;
        this.onChange({ state: "ready", id });
        return true;
      } catch (error) {
        await prepared?.disposeAbandoned?.();
        // A cancelled/failed loader has not touched the outgoing workspace.
        // Restoring Play here would discard a still-active lesson's takes.
        if (!this.disposed && quiesced) await this.rollback(previous);
        this.onChange(
          error.name === "AbortError"
            ? { state: "ready", id: previous }
            : { state: "error", id, error },
        );
        throw error;
      }
    };
    const next = this.pending.catch(() => {}).then(operation);
    this.pending = next;
    return next;
  }
  dispose() {
    this.disposed = true;
    this.cancellation?.abort();
  }
}
