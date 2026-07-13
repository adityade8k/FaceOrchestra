import { STICK_SETTINGS } from "../../config/stick.js";

export class StickEquipmentSystem {
  constructor({ controllerResolver = null, transform = STICK_SETTINGS, preferredStickType = "default" } = {}) {
    this.controllerResolver = controllerResolver;
    this.transform = transform;
    this.stickByControllerId = new Map();
    this.controllerIdByStickId = new Map();
    this.preferredStickType = preferredStickType;
  }

  equip(stick, controllerOrId, { controllerObject = null, transform = this.transform } = {}) {
    if (!stick?.id) {
      throw new TypeError("StickEquipmentSystem requires a StickInstrument.");
    }
    const controllerId = getControllerId(controllerOrId);
    const controller = controllerObject || getControllerObject(controllerOrId) || this.controllerResolver?.(controllerId);
    if (!controllerId || !controller?.add) {
      throw new Error(`Cannot equip ${stick.id}; controller ${String(controllerId)} is unavailable.`);
    }

    const previousStick = this.stickByControllerId.get(controllerId);
    if (previousStick && previousStick !== stick) {
      this.unequip(previousStick);
    }
    const previousControllerId = this.controllerIdByStickId.get(stick.id);
    if (previousControllerId && previousControllerId !== controllerId) {
      this.unequip(stick);
    }

    stick.root.removeFromParent?.();
    controller.add(stick.root);
    applyLocalTransform(stick.root, transform);
    stick.equip(controllerId);
    this.preferredStickType = stick.stickType || this.preferredStickType;
    this.stickByControllerId.set(controllerId, stick);
    this.controllerIdByStickId.set(stick.id, controllerId);
    return stick;
  }

  unequip(stickOrControllerId) {
    const stick = typeof stickOrControllerId === "string"
      ? this.stickByControllerId.get(stickOrControllerId)
      : stickOrControllerId;
    if (!stick) {
      return null;
    }
    const controllerId = this.controllerIdByStickId.get(stick.id) || stick.controllerId;
    stick.unequip();
    stick.root.removeFromParent?.();
    if (controllerId) {
      this.stickByControllerId.delete(controllerId);
    }
    this.controllerIdByStickId.delete(stick.id);
    return stick;
  }

  getEquippedStick(controllerId) {
    return this.stickByControllerId.get(controllerId) || null;
  }

  getEquipmentPreference() {
    return { preferredStickType: this.preferredStickType };
  }

  restoreEquipmentPreference(preference = {}) {
    if (typeof preference.preferredStickType === "string" && preference.preferredStickType) {
      this.preferredStickType = preference.preferredStickType;
    }
  }

  reset() {
    for (const stick of [...this.stickByControllerId.values()]) {
      this.unequip(stick);
    }
  }
}

export function applyLocalTransform(object, config = {}) {
  const position = config.position || {};
  const rotation = config.rotationDegrees || {};
  const size = config.size ?? config.scale ?? 1;
  object.position?.set?.(position.x ?? 0, position.y ?? 0, position.z ?? 0);
  object.rotation?.set?.(
    degreesToRadians(rotation.x ?? 0),
    degreesToRadians(rotation.y ?? 0),
    degreesToRadians(rotation.z ?? 0),
  );
  if (Number.isFinite(size)) {
    object.scale?.setScalar?.(size);
  } else {
    object.scale?.set?.(size?.x ?? 1, size?.y ?? 1, size?.z ?? 1);
  }
}

function getControllerId(controllerOrId) {
  if (typeof controllerOrId === "string") return controllerOrId;
  return controllerOrId?.userData?.controllerId
    || controllerOrId?.userData?.handedness
    || (Number.isFinite(controllerOrId?.userData?.index) ? `controller-${controllerOrId.userData.index}` : null);
}

function getControllerObject(controllerOrId) {
  return typeof controllerOrId === "object" ? controllerOrId : null;
}

function degreesToRadians(value) {
  return value * Math.PI / 180;
}
