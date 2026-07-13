import { assertStableId } from "../core/id.js";

export class HonkLockGroup {
  constructor({
    id,
    memberIds,
    anchorId = memberIds?.[0],
    resolveInstrument,
    transformAdapter = createTransformAdapter(),
    memberLocalTransforms = null,
  } = {}) {
    this.id = assertStableId(id, "Honk lock group ID");
    this.memberIds = new Set(memberIds || []);
    if (!this.memberIds.has(anchorId)) {
      throw new Error(`Lock group anchor ${anchorId} is not a member of ${this.id}.`);
    }
    if (typeof resolveInstrument !== "function") {
      throw new TypeError("HonkLockGroup requires an instrument resolver.");
    }
    this.anchorId = anchorId;
    this.resolveInstrument = resolveInstrument;
    this.transformAdapter = transformAdapter;
    this.memberLocalTransforms = deserializeTransformMap(memberLocalTransforms);
    if (this.memberLocalTransforms.size === 0) {
      this.captureRelativeTransforms();
    }
  }

  get size() {
    return this.memberIds.size;
  }

  get root() {
    return this.resolveInstrument(this.anchorId)?.root || null;
  }

  hasMember(honkId) {
    return this.memberIds.has(honkId);
  }

  getMemberIds() {
    return [...this.memberIds];
  }

  captureRelativeTransforms() {
    const anchor = this.resolveInstrument(this.anchorId);
    if (!anchor) {
      throw new Error(`Cannot capture lock group ${this.id}; anchor ${this.anchorId} is missing.`);
    }
    this.memberLocalTransforms.clear();
    for (const memberId of this.memberIds) {
      const member = this.resolveInstrument(memberId);
      if (!member) {
        continue;
      }
      this.memberLocalTransforms.set(
        memberId,
        memberId === this.anchorId
          ? identityTransform()
          : this.transformAdapter.captureRelative(anchor, member),
      );
    }
    return this.memberLocalTransforms;
  }

  updateMemberTransforms() {
    const anchor = this.resolveInstrument(this.anchorId);
    if (!anchor) {
      return;
    }
    for (const memberId of this.memberIds) {
      if (memberId === this.anchorId) {
        continue;
      }
      const member = this.resolveInstrument(memberId);
      const relative = this.memberLocalTransforms.get(memberId);
      if (member && relative) {
        this.transformAdapter.applyRelative(anchor, member, relative);
      }
    }
  }

  reanchor(nextAnchorId) {
    if (!this.memberIds.has(nextAnchorId)) {
      throw new Error(`Cannot use non-member ${nextAnchorId} as anchor for ${this.id}.`);
    }
    this.anchorId = nextAnchorId;
    this.captureRelativeTransforms();
  }

  removeMember(memberId) {
    if (!this.memberIds.delete(memberId)) {
      return false;
    }
    this.memberLocalTransforms.delete(memberId);
    if (this.anchorId === memberId && this.memberIds.size > 0) {
      this.reanchor(this.memberIds.values().next().value);
    }
    return true;
  }

  getScale() {
    const anchor = this.resolveInstrument(this.anchorId);
    return anchor?.getScale?.() ?? averageScale(this.transformAdapter.captureWorld(anchor).scale);
  }

  setScale(scale) {
    const anchor = this.resolveInstrument(this.anchorId);
    if (!anchor) {
      return;
    }
    if (typeof anchor.setScale === "function") {
      anchor.setScale(scale);
    } else {
      const transform = this.transformAdapter.captureWorld(anchor);
      transform.scale = Array.isArray(scale) ? [...scale] : [scale, scale, scale];
      this.transformAdapter.applyWorld(anchor, transform);
    }
    this.updateMemberTransforms();
    for (const memberId of this.memberIds) {
      const member = this.resolveInstrument(memberId);
      if (!member || !Object.prototype.hasOwnProperty.call(member, "baseScale")) continue;
      const memberScale = member.getScale?.() ?? averageScale(this.transformAdapter.captureWorld(member).scale);
      if (Number.isFinite(memberScale)) member.baseScale = memberScale;
    }
  }

  serialize() {
    return {
      id: this.id,
      memberIds: this.getMemberIds(),
      anchorId: this.anchorId,
      memberLocalTransforms: Object.fromEntries(
        [...this.memberLocalTransforms].map(([memberId, transform]) => [memberId, cloneTransform(transform)]),
      ),
    };
  }
}

export function createTransformAdapter({ captureWorld = readWorldTransform, applyWorld = writeWorldTransform } = {}) {
  return {
    captureWorld,
    applyWorld,
    captureRelative(anchor, member) {
      return getRelativeTransform(captureWorld(anchor), captureWorld(member));
    },
    applyRelative(anchor, member, relative) {
      applyWorld(member, composeTransform(captureWorld(anchor), relative));
    },
  };
}

export function getRelativeTransform(anchorTransform, memberTransform) {
  const anchor = normalizeTransform(anchorTransform);
  const member = normalizeTransform(memberTransform);
  const inverseAnchorRotation = quaternionInverse(anchor.quaternion);
  const positionDelta = member.position.map((value, index) => value - anchor.position[index]);
  const unrotatedPosition = rotateVector(positionDelta, inverseAnchorRotation);
  return {
    position: unrotatedPosition.map((value, index) => safeDivide(value, anchor.scale[index])),
    quaternion: quaternionMultiply(inverseAnchorRotation, member.quaternion),
    scale: member.scale.map((value, index) => safeDivide(value, anchor.scale[index])),
  };
}

export function composeTransform(anchorTransform, relativeTransform) {
  const anchor = normalizeTransform(anchorTransform);
  const relative = normalizeTransform(relativeTransform);
  const scaledPosition = relative.position.map((value, index) => value * anchor.scale[index]);
  const rotatedPosition = rotateVector(scaledPosition, anchor.quaternion);
  return {
    position: rotatedPosition.map((value, index) => value + anchor.position[index]),
    quaternion: quaternionMultiply(anchor.quaternion, relative.quaternion),
    scale: relative.scale.map((value, index) => value * anchor.scale[index]),
  };
}

export function readWorldTransform(instrument) {
  if (!instrument) {
    return identityTransform();
  }
  if (typeof instrument.getWorldTransform === "function") {
    return normalizeTransform(instrument.getWorldTransform());
  }
  return readObjectWorldTransform(instrument.root || instrument);
}

export function writeWorldTransform(instrument, transform) {
  if (!instrument) {
    return;
  }
  const normalized = normalizeTransform(transform);
  if (typeof instrument.setWorldTransform === "function") {
    instrument.setWorldTransform(normalized);
    return;
  }
  const root = instrument.root || instrument;
  const local = root.parent
    ? getRelativeTransform(readObjectWorldTransform(root.parent), normalized)
    : normalized;
  writeTuple(root.position, local.position);
  writeTuple(root.quaternion, local.quaternion);
  root.quaternion?.normalize?.();
  writeTuple(root.scale, local.scale);
  root.updateMatrixWorld?.(true);
}

export function normalizeTransform(transform = {}) {
  return {
    position: readTuple(transform.position, 3, [0, 0, 0]),
    quaternion: normalizeQuaternion(readTuple(transform.quaternion, 4, [0, 0, 0, 1])),
    scale: readTuple(transform.scale, 3, [1, 1, 1]),
  };
}

function readObjectWorldTransform(root) {
  if (!root) {
    return identityTransform();
  }
  root.updateWorldMatrix?.(true, false);
  root.updateMatrixWorld?.(true);

  const positionTarget = root.position?.clone?.();
  const quaternionTarget = root.quaternion?.clone?.();
  const scaleTarget = root.scale?.clone?.();
  if (positionTarget && typeof root.getWorldPosition === "function") root.getWorldPosition(positionTarget);
  if (quaternionTarget && typeof root.getWorldQuaternion === "function") root.getWorldQuaternion(quaternionTarget);
  if (scaleTarget && typeof root.getWorldScale === "function") root.getWorldScale(scaleTarget);
  return normalizeTransform({
    position: positionTarget || root.position,
    quaternion: quaternionTarget || root.quaternion,
    scale: scaleTarget || root.scale,
  });
}

function deserializeTransformMap(value) {
  if (value instanceof Map) {
    return new Map([...value].map(([id, transform]) => [id, normalizeTransform(transform)]));
  }
  if (value && typeof value === "object") {
    return new Map(Object.entries(value).map(([id, transform]) => [id, normalizeTransform(transform)]));
  }
  return new Map();
}

function identityTransform() {
  return { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] };
}

function cloneTransform(transform) {
  const normalized = normalizeTransform(transform);
  return {
    position: [...normalized.position],
    quaternion: [...normalized.quaternion],
    scale: [...normalized.scale],
  };
}

function readTuple(value, length, fallback) {
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    const tuple = Array.from(value).slice(0, length);
    return tuple.length === length && tuple.every(Number.isFinite) ? tuple : [...fallback];
  }
  if (typeof value?.toArray === "function") {
    return readTuple(value.toArray(), length, fallback);
  }
  const keys = length === 4 ? ["x", "y", "z", "w"] : ["x", "y", "z"];
  const tuple = keys.map((key) => value?.[key]);
  return tuple.every(Number.isFinite) ? tuple : [...fallback];
}

function writeTuple(target, values) {
  if (!target) return;
  if (typeof target.fromArray === "function") target.fromArray(values);
  else if (typeof target.set === "function") target.set(...values);
  else ["x", "y", "z", "w"].slice(0, values.length).forEach((key, index) => { target[key] = values[index]; });
}

function quaternionInverse(quaternion) {
  const normalized = normalizeQuaternion(quaternion);
  return [-normalized[0], -normalized[1], -normalized[2], normalized[3]];
}

function quaternionMultiply(first, second) {
  const [ax, ay, az, aw] = first;
  const [bx, by, bz, bw] = second;
  return normalizeQuaternion([
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]);
}

function normalizeQuaternion(quaternion) {
  const length = Math.hypot(...quaternion) || 1;
  return quaternion.map((value) => value / length);
}

function rotateVector(vector, quaternion) {
  const [x, y, z] = vector;
  const [qx, qy, qz, qw] = quaternion;
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ];
}

function safeDivide(value, divisor) {
  return value / (Math.abs(divisor) > 0.000001 ? divisor : 0.000001);
}

function averageScale(scale) {
  return (Math.abs(scale[0]) + Math.abs(scale[1]) + Math.abs(scale[2])) / 3;
}
