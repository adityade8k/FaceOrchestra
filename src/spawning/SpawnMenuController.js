import { RADIAL_MENU_SETTINGS } from "../config/spawning.js";
import { RadialMenuPhase, resolvePullPhase } from "./radialMenuNavigation.js";

export class SpawnMenuController {
  constructor({ view, catalog, settings = RADIAL_MENU_SETTINGS, onStateChange = () => {} }) {
    this.view = view;
    this.catalog = catalog;
    this.settings = settings;
    this.onStateChange = onStateChange;
  }

  createView() {
    return this.view.create(this.catalog.getRadialCategories());
  }

  open(controller, state) {
    const wasOpen = Boolean(state?.radialMenuOpen);
    this.view.open(controller, state);
    if (!wasOpen && state?.radialMenuOpen) this.emitStateChange(controller, state, "open");
  }

  update(controller, state) {
    if (!state?.radialMenuOpen) return;
    const pullDistance = this.view.updatePullDistance(controller, state);
    if (state.radialMenuPhase === RadialMenuPhase.parent) {
      const previousSelection = state.radialMenuParentSelectedIndex;
      this.view.updateParentSelection(controller, state);
      if (state.radialMenuParentSelectedIndex !== previousSelection) {
        this.emitStateChange(controller, state, "selection", {
          layer: RadialMenuPhase.parent,
          selectedIndex: state.radialMenuParentSelectedIndex,
        });
      }
      if (resolvePullPhase(state.radialMenuPhase, pullDistance, this.settings) === RadialMenuPhase.child) {
        this.view.beginChildLayer(controller, state);
        state.radialMenuPhase = RadialMenuPhase.child;
        this.emitStateChange(controller, state, "layer", { phase: RadialMenuPhase.child });
      }
    } else if (resolvePullPhase(state.radialMenuPhase, pullDistance, this.settings) === RadialMenuPhase.parent) {
      this.view.returnToParentLayer(controller, state);
      state.radialMenuPhase = RadialMenuPhase.parent;
      this.emitStateChange(controller, state, "layer", { phase: RadialMenuPhase.parent });
    } else {
      const previousSelection = state.radialMenuChildSelectedIndex;
      this.view.updateChildSelection(controller, state);
      if (state.radialMenuChildSelectedIndex !== previousSelection) {
        this.emitStateChange(controller, state, "selection", {
          layer: RadialMenuPhase.child,
          selectedIndex: state.radialMenuChildSelectedIndex,
        });
      }
    }
    this.view.updateVisuals(controller, state);
  }

  cancel(controller, state) {
    const wasOpen = Boolean(state?.radialMenuOpen);
    this.view.cancel(controller, state);
    if (wasOpen) this.emitStateChange(controller, state, "cancel");
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
    this.emitStateChange(controller, state, selected ? "confirm" : "dismiss", {
      selectedId: selected?.id || null,
    });
    return selected;
  }

  close(controller, state) {
    const wasOpen = Boolean(state?.radialMenuOpen);
    this.view.close(controller, state);
    if (wasOpen) this.emitStateChange(controller, state, "close");
  }

  emitStateChange(controller, state, type, details = {}) {
    this.onStateChange(controller, { type, ...details }, state);
  }
}
