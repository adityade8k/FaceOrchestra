import { BaseInteractiveObject } from "../objects/BaseInteractiveObject.js";

export class BaseInstrument extends BaseInteractiveObject {
  constructor({
    root,
    state = null,
    componentOption = {},
    synth = null,
    disposeResources = null,
  } = {}) {
    super({ root, name: componentOption.label || "Instrument" });
    this.state = state;
    this.componentOption = componentOption;
    this.synth = synth;
    this.disposeResources = disposeResources;
    this.type = componentOption.id || "instrument";

    if (this.state) {
      this.state.sceneObject = this;
      this.state.instrument = this;
    }
  }

  registerStateColliders() {
    this.clearRaycastTargets();
    this.registerRaycastTargets(this.state?.hitTargetList || []);
  }

  cloneInstrument({ cloneRoot, state } = {}) {
    const clone = new this.constructor({
      root: cloneRoot ? cloneRoot(this.root) : this.root.clone(true),
      state,
      componentOption: this.componentOption,
      synth: this.synth,
      disposeResources: this.disposeResources,
    });
    clone.visible = this.visible;
    clone.position.copy(this.position);
    clone.quaternion.copy(this.quaternion);
    clone.scale.copy(this.scale);
    return clone;
  }

  setBaseScale(scale) {
    if (!this.state) {
      this.scale.setScalar(scale);
      return;
    }

    this.state.baseScale = scale;
    this.scale.setScalar(scale);
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.state?.debugVisuals?.dispose();
    this.disposeResources?.(this.state);
    super.dispose();
  }
}
