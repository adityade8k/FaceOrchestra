import { RADIAL_MENU_SETTINGS } from "../config/spawning.js";
import { RadialMenuPhase, resolvePullPhase } from "./radialMenuNavigation.js";

export class SpawnMenuController {
  constructor({ view, catalog, settings = RADIAL_MENU_SETTINGS }) {
    this.view = view;
    this.catalog = catalog;
    this.settings = settings;
  }

  createView() {
    return this.view.create(this.catalog.getRadialCategories());
  }

  open(controller, state) {
    this.view.open(controller, state);
  }

  update(controller, state) {
    if (!state?.radialMenuOpen) return;
    const pullDistance = this.view.updatePullDistance(controller, state);
    if (state.radialMenuPhase === RadialMenuPhase.parent) {
      this.view.updateParentSelection(controller, state);
      if (resolvePullPhase(state.radialMenuPhase, pullDistance, this.settings) === RadialMenuPhase.child) {
        this.view.beginChildLayer(controller, state);
        state.radialMenuPhase = RadialMenuPhase.child;
      }
    } else if (resolvePullPhase(state.radialMenuPhase, pullDistance, this.settings) === RadialMenuPhase.parent) {
      this.view.returnToParentLayer(controller, state);
      state.radialMenuPhase = RadialMenuPhase.parent;
    } else {
      this.view.updateChildSelection(controller, state);
    }
    this.view.updateVisuals(controller, state);
  }

  cancel(controller, state) {
    this.view.cancel(controller, state);
  }

  confirm(controller, state) {
    if (!state?.radialMenuOpen) return null;
    this.update(controller, state);
    let selected = null;
    if (!state.radialMenuCancelled && state.radialMenuPhase === RadialMenuPhase.child) {
      const category = this.catalog.getRadialCategories()[state.radialMenuLatchedParentIndex];
      selected = category?.entries[state.radialMenuChildSelectedIndex] || null;
    }
    this.view.close(controller, state);
    return selected;
  }

  close(controller, state) {
    this.view.close(controller, state);
  }
}
