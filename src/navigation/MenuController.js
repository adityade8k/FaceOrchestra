import * as THREE from "three";

// Menu pose/visibility and input ownership are independent of musical mode.
export class MenuController {
  constructor({ panel, states, hit, quiesce = () => {}, onEvent = () => {} }) {
    Object.assign(this, { panel, states, hit, quiesce, onEvent });
    this.visible = true;
    this.blocked = new Set();
    this.offset = new THREE.Matrix4();
    this.world = new THREE.Matrix4();
  }
  toggle() {
    this.setVisible(!this.visible);
  }
  setVisible(visible) {
    this.cancelDrag();
    this.visible = visible;
    this.panel.setVisible(visible);
    this.onEvent(visible ? "menu.show" : "menu.hide");
  }
  cancelDrag() {
    if (this.drag) this.blocked.add(this.drag);
    this.drag = null;
  }
  capture(intent, state) {
    const controller = intent.controller;
    if (controller?.userData?.virtualTutorial) return false;
    if (intent.type === "menu.toggle") {
      this.toggle();
      return true;
    }
    const held =
      state.trigger || state.grip || state.primary || state.secondary;
    if (this.blocked.has(controller)) {
      if (!held) {
        if (this.drag === controller) this.cancelDrag();
        this.blocked.delete(controller);
      } else if (this.drag === controller && !state.grip) this.cancelDrag();
      return true;
    }
    if (!this.visible) return false;
    const target = this.hit(controller);
    if (!target) return false;
    // The panel is an occluder for every binding, including delete and spawn.
    if (intent.type === "interaction.grip.begin") {
      this.quiesce(controller);
      this.blocked.add(controller);
      if (target.object.userData.menuHandle && !this.drag) {
        controller.updateWorldMatrix(true, false);
        this.panel.group.updateWorldMatrix(true, false);
        this.offset
          .copy(controller.matrixWorld)
          .invert()
          .multiply(this.panel.group.matrixWorld);
        this.drag = controller;
      }
      return true;
    }
    if (intent.type === "interaction.trigger.begin") {
      this.quiesce(controller);
      this.blocked.add(controller);
      if (target.object.userData.action && !target.object.userData.disabled)
        this.panel.activate(target.object);
      return true;
    }
    if (!intent.type.endsWith(".end")) {
      if (held) {
        this.quiesce(controller);
        this.blocked.add(controller);
      }
      return true;
    }
    return false;
  }
  update() {
    if (!this.drag) return;
    if (!this.states.get(this.drag)?.grip || !this.drag.userData.gamepad) {
      this.cancelDrag();
      return;
    }
    this.drag.updateWorldMatrix(true, false);
    this.world.multiplyMatrices(this.drag.matrixWorld, this.offset);
    if (this.panel.group.parent) {
      this.panel.group.parent.updateWorldMatrix(true, false);
      this.world.premultiply(
        new THREE.Matrix4().copy(this.panel.group.parent.matrixWorld).invert(),
      );
    }
    this.world.decompose(
      this.panel.group.position,
      this.panel.group.quaternion,
      this.panel.group.scale,
    );
    this.panel.group.updateMatrixWorld(true);
    this.onEvent("menu.move");
  }
  recenter(camera) {
    this.cancelDrag();
    this.panel.recenter(camera);
    this.onEvent("menu.recenter");
  }
  referenceChanged(camera) {
    this.cancelDrag();
    this.blocked.clear();
    this.recenter(camera);
  }
  disconnect(controller) {
    if (this.drag === controller) this.cancelDrag();
    this.blocked.delete(controller);
  }
}
