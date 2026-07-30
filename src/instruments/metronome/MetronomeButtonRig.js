import { METRONOME_EYE_CONTROLS } from "../../config/metronome.js";

export class MetronomeButtonRig {
  constructor({ root, configs = METRONOME_EYE_CONTROLS } = {}) {
    this.root = root;
    this.buttons = new Map();
    for (const config of configs) this.createButton(config);
  }

  createButton(config) {
    const node = this.root?.getObjectByName?.(config.nodeName);
    if (!node?.position) {
      console.warn(`Metronome eye node "${config.nodeName}" was not found; ${config.action} disabled.`);
      return;
    }
    this.buttons.set(config.action, {
      config,
      node,
      target: null,
      restPosition: readPosition(node.position),
      pressed: false,
      releaseAtMs: null,
    });
  }

  attachTarget(action, target) {
    const button = this.buttons.get(action);
    if (!button) return false;
    button.target = target;
    return true;
  }

  press(action, now = performance.now()) {
    const button = this.buttons.get(action);
    if (!button) return false;
    this.setPressed(action, true);
    button.releaseAtMs = button.config.latching
      ? null
      : now + Math.max(finite(button.config.releaseDelayMs, 0), 0);
    return true;
  }

  setPressed(action, pressed) {
    const button = this.buttons.get(action);
    if (!button) return false;
    const offset = pressed ? button.config.pressedOffset : null;
    writePosition(button.node.position, {
      x: button.restPosition.x + finite(offset?.x, 0),
      y: button.restPosition.y + finite(offset?.y, 0),
      z: button.restPosition.z + finite(offset?.z, 0),
    });
    button.pressed = Boolean(pressed);
    if (!button.pressed) button.releaseAtMs = null;
    button.node.updateMatrixWorld?.(true);
    return button.pressed;
  }

  isPressed(action) {
    return Boolean(this.buttons.get(action)?.pressed);
  }

  update(now = performance.now()) {
    for (const [action, button] of this.buttons) {
      if (Number.isFinite(button.releaseAtMs) && now >= button.releaseAtMs) {
        this.setPressed(action, false);
      }
    }
  }

  reset() {
    for (const action of this.buttons.keys()) this.setPressed(action, false);
  }

  dispose() {
    this.reset();
    for (const button of this.buttons.values()) {
      const target = button.target;
      if (!target) continue;
      target.removeFromParent?.();
      target.geometry?.dispose?.();
      for (const material of Array.isArray(target.material) ? target.material : [target.material]) {
        material?.dispose?.();
      }
      button.target = null;
    }
    this.buttons.clear();
  }
}

function readPosition(position) {
  return {
    x: finite(position?.x, 0),
    y: finite(position?.y, 0),
    z: finite(position?.z, 0),
  };
}

function writePosition(position, value) {
  if (typeof position?.set === "function") {
    position.set(value.x, value.y, value.z);
    return;
  }
  if (!position) return;
  position.x = value.x;
  position.y = value.y;
  position.z = value.z;
}

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}
