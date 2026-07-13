export class SpawnMenuController {
  constructor({ view, catalog }) {
    this.view = view;
    this.catalog = catalog;
  }

  createView() {
    return this.view.create(this.catalog.getRadialEntries());
  }

  open(controller, state) {
    this.view.open(controller, state);
  }

  update(controller, state) {
    this.view.update(controller, state);
  }

  cancel(controller, state) {
    this.view.cancel(controller, state);
  }

  confirm(controller, state) {
    const entries = this.catalog.getRadialEntries();
    const selected = entries[this.view.getSelectedIndex(controller, state)] || null;
    this.view.close(controller, state);
    return state?.radialMenuCancelled ? null : selected;
  }

  close(controller, state) {
    this.view.close(controller, state);
  }
}
