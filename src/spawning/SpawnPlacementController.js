export class SpawnPlacementController {
  constructor({ scene, createEntry, previewFactory, onPlaced = () => {}, onCancelled = () => {} }) {
    this.scene = scene;
    this.createEntry = createEntry;
    this.previewFactory = previewFactory;
    this.onPlaced = onPlaced;
    this.onCancelled = onCancelled;
    this.preview = null;
  }

  begin(controller, catalogEntry) {
    this.cancel();
    const instruments = this.createEntry(catalogEntry) || [];
    if (!instruments.length) return null;
    this.preview = this.previewFactory({ controller, instruments, catalogEntry });
    return this.preview;
  }

  scale(controller, direction, applyStep) {
    if (this.preview?.controller === controller) this.preview.setScaleDirection(direction, applyStep);
  }

  place(controller) {
    if (this.preview?.controller !== controller) return [];
    const preview = this.preview;
    this.preview = null;
    const instruments = preview.place(this.scene);
    this.onPlaced(instruments);
    return instruments;
  }

  cancel(removeInstrument = () => {}) {
    if (!this.preview) return;
    const preview = this.preview;
    this.preview = null;
    preview.cancel(removeInstrument);
    this.onCancelled();
  }

  reset(removeInstrument) {
    this.cancel(removeInstrument);
  }
}
