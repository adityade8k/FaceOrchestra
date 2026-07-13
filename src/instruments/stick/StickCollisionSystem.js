import { STICK_SETTINGS } from "../../config/stick.js";
import { INSTRUMENT_KINDS } from "../core/capabilities.js";
import { getStickPercussionType } from "./percussionProfiles.js";

export class StickCollisionSystem {
  constructor({
    getSticks,
    getTargets,
    collisionTester,
    percussionResolver = getStickPercussionType,
    positionReader = readStickWorldPosition,
  } = {}) {
    if (typeof getSticks !== "function" || typeof getTargets !== "function" || typeof collisionTester !== "function") {
      throw new TypeError("StickCollisionSystem requires stick, target, and collision providers.");
    }
    this.getSticks = getSticks;
    this.getTargets = getTargets;
    this.collisionTester = collisionTester;
    this.percussionResolver = percussionResolver;
    this.positionReader = positionReader;
    this.motionByStickId = new Map();
    this.listeners = new Set();
  }

  update(timestamp = performanceNow(), context = {}) {
    const targets = [...this.getTargets()].filter(isStrikeTarget);
    const activeStickIds = new Set();
    for (const stick of this.getSticks()) {
      if (!stick?.id) continue;
      activeStickIds.add(stick.id);
      if (!stick.equipped || !stick.colliderActive || !stick.collider) {
        stick.clearContacts(timestamp);
        this.motionByStickId.delete(stick.id);
        continue;
      }

      const velocity = this.updateStickVelocity(stick, timestamp);
      const touchingTargetIds = new Set();
      for (const target of targets) {
        const result = normalizeCollisionResult(this.collisionTester({ stick, target, timestamp, ...context }));
        if (!result.touching) {
          continue;
        }
        touchingTargetIds.add(target.id);
        const event = stick.beginContact(target, {
          percussionType: result.percussionType || this.percussionResolver(target),
          velocity: Number.isFinite(result.velocity) ? result.velocity : velocity,
          timestamp,
        });
        if (event) {
          this.emit(event, { stick, target });
        }
      }

      for (const targetId of [...stick.contactTargetIds]) {
        if (!touchingTargetIds.has(targetId)) {
          stick.endContact(targetId, timestamp);
        }
      }
    }

    for (const stickId of this.motionByStickId.keys()) {
      if (!activeStickIds.has(stickId)) {
        this.motionByStickId.delete(stickId);
      }
    }
  }

  updateStickVelocity(stick, timestamp) {
    const position = this.positionReader(stick);
    if (!position) {
      return 0;
    }
    const previous = this.motionByStickId.get(stick.id);
    this.motionByStickId.set(stick.id, { position: [...position], timestamp });
    const elapsedSeconds = previous ? Math.max((timestamp - previous.timestamp) / 1000, 0.0001) : 0;
    return previous && elapsedSeconds > 0
      ? Math.hypot(...position.map((value, index) => value - previous.position[index])) / elapsedSeconds
      : 0;
  }

  clearStick(stick, timestamp = performanceNow()) {
    stick?.clearContacts?.(timestamp);
    if (stick?.id) this.motionByStickId.delete(stick.id);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event, context) {
    for (const listener of this.listeners) {
      listener(event, context);
    }
  }
}

export class ThreeStickCollisionAdapter {
  constructor({ THREE, maxUserDistance = STICK_SETTINGS.collision?.maxUserDistance ?? 2.25 } = {}) {
    if (!THREE) throw new TypeError("ThreeStickCollisionAdapter requires the Three.js namespace.");
    this.THREE = THREE;
    this.maxUserDistance = maxUserDistance;
    this.stickBounds = new THREE.Box3();
    this.stickLocalBounds = new THREE.Box3();
    this.stickInverseMatrix = new THREE.Matrix4();
    this.targetBounds = new THREE.Box3();
    this.targetToColliderMatrix = new THREE.Matrix4();
    this.triangle = new THREE.Triangle();
  }

  intersects({ stick, target, userPosition = null }) {
    const collider = stick?.collider;
    const root = target?.root;
    if (!collider?.isMesh || !collider.geometry || !root) return false;

    collider.updateWorldMatrix?.(true, false);
    this.stickBounds.setFromObject(collider);
    root.updateMatrixWorld?.(true);
    this.targetBounds.setFromObject(root);
    if (
      this.stickBounds.isEmpty() ||
      this.targetBounds.isEmpty() ||
      !this.stickBounds.intersectsBox(this.targetBounds) ||
      !this.isNearUser(this.targetBounds, userPosition)
    ) {
      return false;
    }

    if (!collider.geometry.boundingBox) collider.geometry.computeBoundingBox();
    this.stickLocalBounds.copy(collider.geometry.boundingBox);
    this.stickInverseMatrix.copy(collider.matrixWorld).invert();
    let touched = false;
    root.traverse((object) => {
      if (touched || !isPercussionMesh(object)) return;
      this.targetBounds.setFromObject(object);
      if (
        this.targetBounds.isEmpty() ||
        !this.stickBounds.intersectsBox(this.targetBounds) ||
        !this.isNearUser(this.targetBounds, userPosition)
      ) return;
      touched = this.intersectsMeshTriangles(object);
    });
    return touched;
  }

  isNearUser(bounds, userPosition) {
    return !userPosition || !(this.maxUserDistance > 0) || bounds.distanceToPoint(userPosition) <= this.maxUserDistance;
  }

  intersectsMeshTriangles(mesh) {
    const position = mesh.geometry?.attributes?.position;
    if (!position || position.count < 3 || this.stickLocalBounds.isEmpty()) return false;
    this.targetToColliderMatrix.multiplyMatrices(this.stickInverseMatrix, mesh.matrixWorld);
    const index = mesh.geometry.index;
    const triangleCount = Math.floor((index?.count ?? position.count) / 3);
    for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
      this.setTriangleVertex(mesh, index ? index.getX(triangleIndex * 3) : triangleIndex * 3, this.triangle.a);
      this.setTriangleVertex(mesh, index ? index.getX(triangleIndex * 3 + 1) : triangleIndex * 3 + 1, this.triangle.b);
      this.setTriangleVertex(mesh, index ? index.getX(triangleIndex * 3 + 2) : triangleIndex * 3 + 2, this.triangle.c);
      if (this.stickLocalBounds.intersectsTriangle(this.triangle)) return true;
    }
    return false;
  }

  setTriangleVertex(mesh, vertexIndex, target) {
    if (typeof mesh.getVertexPosition === "function") mesh.getVertexPosition(vertexIndex, target);
    else target.fromBufferAttribute(mesh.geometry.attributes.position, vertexIndex);
    target.applyMatrix4(this.targetToColliderMatrix);
  }
}

function normalizeCollisionResult(result) {
  return typeof result === "boolean" ? { touching: result } : { touching: Boolean(result?.touching), ...result };
}

function readStickWorldPosition(stick) {
  const root = stick?.root;
  if (!root) return null;
  root.updateWorldMatrix?.(true, false);
  if (root.position?.clone && root.getWorldPosition) return root.getWorldPosition(root.position.clone()).toArray();
  if (typeof root.position?.toArray === "function") return root.position.toArray();
  return [root.position?.x, root.position?.y, root.position?.z].every(Number.isFinite)
    ? [root.position.x, root.position.y, root.position.z]
    : null;
}

function isStrikeTarget(target) {
  return Boolean(
    target?.id && !target.disposed && target.visible !== false &&
    (target.kind === INSTRUMENT_KINDS.honk || target.kind === INSTRUMENT_KINDS.looper),
  );
}

function isPercussionMesh(object) {
  if (!object?.isMesh || object.visible === false) return false;
  if (
    object.userData?.interactionTarget || object.userData?.isHitTarget || object.userData?.isNoteLabel ||
    object.userData?.isStickStrikeCollider || object.name?.startsWith("HIT_") || object.name?.startsWith("DEBUG_")
  ) return false;
  let parent = object.parent;
  while (parent) {
    if (parent.userData?.interactionTarget || parent.userData?.isHitTarget || parent.userData?.isNoteLabel) return false;
    parent = parent.parent;
  }
  return true;
}

function performanceNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}
