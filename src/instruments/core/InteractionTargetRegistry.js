import { assertStableId, createStableId } from "./id.js";

export class InteractionTargetRegistry {
  constructor({ idFactory = () => createStableId("target") } = {}) {
    this.idFactory = idFactory;
    this.targets = new Map();
    this.targetIdsByOwner = new Map();
    this.targetIdByObject = new WeakMap();
  }

  register({ targetId = this.idFactory(), ownerId, role, object3D, handlers = {}, metadata = {} } = {}) {
    assertStableId(targetId, "Interaction target ID");
    assertStableId(ownerId, "Interaction target owner ID");
    if (typeof role !== "string" || role.length === 0) {
      throw new TypeError("Interaction target role must be a non-empty string.");
    }
    if (!object3D || (typeof object3D !== "object" && typeof object3D !== "function")) {
      throw new TypeError("Interaction targets require an Object3D-like object.");
    }
    if (this.targets.has(targetId)) {
      throw new Error(`Interaction target already registered: ${targetId}`);
    }
    const existingTargetId = this.targetIdByObject.get(object3D);
    if (existingTargetId) {
      throw new Error(`Object is already registered as interaction target: ${existingTargetId}`);
    }

    const descriptor = Object.freeze({ targetId, ownerId, role });
    const record = {
      ...descriptor,
      object3D,
      handlers: { ...handlers },
      metadata: { ...metadata },
    };
    this.targets.set(targetId, record);
    this.targetIdByObject.set(object3D, targetId);

    let ownerTargets = this.targetIdsByOwner.get(ownerId);
    if (!ownerTargets) {
      ownerTargets = new Set();
      this.targetIdsByOwner.set(ownerId, ownerTargets);
    }
    ownerTargets.add(targetId);

    object3D.userData ||= {};
    object3D.userData.interactionTarget = descriptor;
    return record;
  }

  unregister(targetOrId) {
    const targetId = typeof targetOrId === "string" ? targetOrId : this.targetIdByObject.get(targetOrId);
    const record = targetId ? this.targets.get(targetId) : null;
    if (!record) {
      return null;
    }

    this.targets.delete(record.targetId);
    this.targetIdByObject.delete(record.object3D);
    const ownerTargets = this.targetIdsByOwner.get(record.ownerId);
    ownerTargets?.delete(record.targetId);
    if (ownerTargets?.size === 0) {
      this.targetIdsByOwner.delete(record.ownerId);
    }

    if (record.object3D.userData?.interactionTarget?.targetId === record.targetId) {
      delete record.object3D.userData.interactionTarget;
    }
    return record;
  }

  unregisterOwner(ownerId) {
    const targetIds = [...(this.targetIdsByOwner.get(ownerId) || [])];
    return targetIds.map((targetId) => this.unregister(targetId)).filter(Boolean);
  }

  get(targetId) {
    return this.targets.get(targetId) || null;
  }

  has(targetId) {
    return this.targets.has(targetId);
  }

  getByOwner(ownerId) {
    return [...(this.targetIdsByOwner.get(ownerId) || [])]
      .map((targetId) => this.targets.get(targetId))
      .filter(Boolean);
  }

  getRaycastObjects({ ownerId = null, role = null, visibleOnly = true } = {}) {
    const records = ownerId === null ? this.targets.values() : this.getByOwner(ownerId);
    const objects = [];
    for (const record of records) {
      if (role !== null && record.role !== role) {
        continue;
      }
      if (visibleOnly && record.object3D?.visible === false) {
        continue;
      }
      objects.push(record.object3D);
    }
    return objects;
  }

  resolveFromObject3D(object3D, { walkParents = true } = {}) {
    let current = object3D;
    while (current) {
      const targetId = this.targetIdByObject.get(current) || current.userData?.interactionTarget?.targetId;
      if (targetId) {
        const record = this.targets.get(targetId);
        if (record) {
          return record;
        }
      }
      current = walkParents ? current.parent : null;
    }
    return null;
  }

  dispatch(targetOrId, action, context = {}) {
    const record = typeof targetOrId === "string"
      ? this.get(targetOrId)
      : this.resolveFromObject3D(targetOrId);
    const handler = record?.handlers?.[action];
    return typeof handler === "function" ? handler({ ...context, target: record }) : undefined;
  }

  clear() {
    for (const targetId of [...this.targets.keys()]) {
      this.unregister(targetId);
    }
  }
}
