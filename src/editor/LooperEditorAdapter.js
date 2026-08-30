import * as THREE from "three";
import { LOOPER_CONTROL_DEFAULT_VALUES } from "../config/looper.js";
import {
  generateArcPoints,
  getArcAngleForValue,
  resolveArcMotion,
  setArcOrbitRadius,
} from "../instruments/core/arcMotionMath.js";
import {
  colliderGizmoPositionForValue,
} from "./calibration/looperArcEditorMath.js";
import { getLooperControlMorphWeights } from "../instruments/looper/view/looperControlPresentation.js";

const CIRCLE_SEGMENTS = 96;

export class LooperEditorAdapter {
  constructor({ scene } = {}) {
    this.scene = scene;
    this.root = null;
    this.state = null;
    this.bounds = new THREE.Box3();
    this.entities = new Map();
    this.pickables = [];
    this.colliderObjects = [];
    this.pathObjects = [];
    this.ownedRoots = [];
    this.nodeNames = [];
    this.nodeRest = new Map();
    this.originalMaterials = new Map();
    this.originalMorphInfluences = new Map();
    this.controlVisuals = new Map();
    this.controlPreviews = new Map();
    this.controlLoops = new Set();
    this.collidersVisible = true;
    this.pathsVisible = true;
  }

  load(root, state) {
    this.dispose();
    this.root = root;
    this.state = state;
    this.captureModelState();
    this.calculateBounds();
    this.rebuild();
    return this;
  }

  setState(state) {
    this.state = state;
    if (!this.root) return;
    this.clearEditorVisuals();
    this.resetModelState();
    this.calculateBounds();
    this.rebuild();
  }

  captureModelState() {
    this.nodeNames = [];
    this.nodeRest.clear();
    this.originalMaterials.clear();
    this.originalMorphInfluences.clear();
    this.root.traverse((object) => {
      if (object.name) this.nodeNames.push(object.name);
      this.nodeRest.set(object, {
        position: object.position.clone(),
        quaternion: object.quaternion.clone(),
        scale: object.scale.clone(),
      });
      if (!object.isMesh) return;
      if (object.morphTargetInfluences) {
        this.originalMorphInfluences.set(object, [...object.morphTargetInfluences]);
      }
      for (const material of materialList(object.material)) {
        if (!material || this.originalMaterials.has(material)) continue;
        this.originalMaterials.set(material, {
          wireframe: Boolean(material.wireframe),
          transparent: Boolean(material.transparent),
          opacity: material.opacity,
          depthWrite: material.depthWrite,
        });
      }
    });
    this.nodeNames = [...new Set(this.nodeNames)].sort((a, b) => a.localeCompare(b));
  }

  calculateBounds() {
    this.bounds.setFromObject(this.root);
  }

  rebuild() {
    if (!this.root || !this.state) return;
    this.clearEditorVisuals();
    this.entities.clear();
    this.pickables = [];
    this.colliderObjects = [];
    this.pathObjects = [];
    this.controlVisuals.clear();
    for (const control of ["volume", "gap"]) this.createControl(control);
    this.applyVisibility();
  }

  createControl(control) {
    const config = this.state.looper.controlColliders[control];
    const arc = resolveArcMotion(config.arc, { label: `${control} arc` });
    const value = this.controlPreviews.get(control) ?? LOOPER_CONTROL_DEFAULT_VALUES[control] ?? 0;
    if (!this.controlPreviews.has(control)) this.controlPreviews.set(control, value);
    const frame = new THREE.Group();
    frame.name = `EDITOR_looper_${control}_arc_center`;
    frame.position.set(arc.center.x, arc.center.y, arc.center.z);
    this.root.add(frame);
    this.ownedRoots.push(frame);

    const pivotRadius = Math.max(arc.orbitRadius * 0.06, config.colliderRadius * 0.3);
    const pivot = new THREE.Mesh(
      new THREE.SphereGeometry(pivotRadius, 14, 10),
      new THREE.MeshBasicMaterial({ color: config.pivotColor, depthTest: false }),
    );
    pivot.name = `EDITOR_looper_${control}_pivot`;
    frame.add(pivot);

    const collider = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16),
      colliderMaterial(config.colliderColor, 0.66),
    );
    collider.name = `EDITOR_looper_${control}_collider_offset`;
    collider.scale.setScalar(config.colliderRadius);
    frame.add(collider);

    const circle = makeLineLoop([], config.planeColor, 0.72);
    const arcLine = makeLine([], config.arcColor, 1);
    frame.add(circle, arcLine);
    const plane = new THREE.Mesh(
      new THREE.CircleGeometry(1, 64),
      new THREE.MeshBasicMaterial({
        color: config.planeColor,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    plane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), toVector(arc.axis));
    plane.scale.setScalar(arc.orbitRadius * 1.12);
    frame.add(plane);
    const axisArrow = new THREE.ArrowHelper(
      toVector(arc.axis),
      new THREE.Vector3(),
      arc.orbitRadius * 1.35,
      config.pivotColor,
      arc.orbitRadius * 0.18,
      arc.orbitRadius * 0.1,
    );
    frame.add(axisArrow);
    const id = `looperArc:${control}`;
    frame.userData.editorEntityId = id;
    this.entities.set(id, {
      id,
      type: "looperArc",
      control,
      label: `${capitalize(control)} arc assembly`,
      detail: "Pivot, plane, path, and collider",
      object: frame,
      transformable: true,
      transformModes: ["translate"],
      previewValue: value,
    });
    this.pickables.push(frame);
    this.colliderObjects.push(collider);
    this.pathObjects.push(pivot, circle, arcLine, plane, axisArrow);
    this.controlVisuals.set(control, { frame, pivot, collider, circle, arcLine, plane, axisArrow });
    this.refreshControl(control);
  }

  refreshControl(control) {
    const visual = this.controlVisuals.get(control);
    if (!visual) return;
    const config = this.state.looper.controlColliders[control];
    const arc = resolveArcMotion(config.arc, { label: `${control} arc` });
    const value = this.controlPreviews.get(control) ?? LOOPER_CONTROL_DEFAULT_VALUES[control] ?? 0;
    visual.frame.position.set(arc.center.x, arc.center.y, arc.center.z);
    const colliderPosition = colliderGizmoPositionForValue(arc, value);
    visual.collider.position.set(colliderPosition.x, colliderPosition.y, colliderPosition.z);
    visual.collider.scale.setScalar(config.colliderRadius);
    const localize = (points) => points.map((point) => new THREE.Vector3(
      point.x - arc.center.x,
      point.y - arc.center.y,
      point.z - arc.center.z,
    ));
    visual.circle.geometry.setFromPoints(localize(generateArcPoints(arc, {
      startAngleDegrees: -180 - arc.referenceAngleDegrees,
      endAngleDegrees: 180 - arc.referenceAngleDegrees,
      segments: CIRCLE_SEGMENTS,
    })));
    visual.arcLine.geometry.setFromPoints(localize(generateArcPoints(arc, { segments: 64 })));
    visual.plane.scale.setScalar(arc.orbitRadius * 1.12);
    this.applyControlMorph(control, value);
    const entity = this.entities.get(`looperArc:${control}`);
    if (entity) {
      entity.previewValue = value;
      entity.orbitRadius = arc.orbitRadius;
      entity.currentAngleDegrees = getArcAngleForValue(arc, value);
    }
  }

  syncTransformToState(entityId) {
    const entity = this.entities.get(entityId);
    if (!entity) return;
    const config = this.state.looper.controlColliders[entity.control];
    if (entity.type === "looperArc") {
      Object.assign(config.arc.center, vectorObject(entity.object.position));
    }
  }

  getOrbitRadius(entityId) {
    const entity = this.entities.get(entityId);
    if (!entity?.control) return null;
    return resolveArcMotion(this.state.looper.controlColliders[entity.control].arc).orbitRadius;
  }

  setOrbitRadius(entityId, orbitRadius) {
    const entity = this.entities.get(entityId);
    if (!entity?.control) return;
    const config = this.state.looper.controlColliders[entity.control];
    config.arc = setArcOrbitRadius(config.arc, orbitRadius);
  }

  setControlPreview(controlOrEntityId, value) {
    const control = controlOrEntityId.includes?.(":")
      ? this.entities.get(controlOrEntityId)?.control
      : controlOrEntityId;
    if (!control) return;
    this.controlPreviews.set(control, Math.min(Math.max(value, -1), 1));
    this.refreshControl(control);
  }

  setControlLoop(controlOrEntityId, enabled) {
    const control = controlOrEntityId.includes?.(":")
      ? this.entities.get(controlOrEntityId)?.control
      : controlOrEntityId;
    if (!control) return;
    if (enabled) this.controlLoops.add(control);
    else this.controlLoops.delete(control);
  }

  applyControlMorph(control, value) {
    const config = this.state.looper.controlColliders[control];
    const weights = getLooperControlMorphWeights(value);
    for (const mesh of this.originalMorphInfluences.keys()) {
      for (const [direction, morphName] of Object.entries(config.morphTargets)) {
        const index = mesh.morphTargetDictionary?.[morphName];
        if (index !== undefined && mesh.morphTargetInfluences) {
          mesh.morphTargetInfluences[index] = weights[direction];
        }
      }
    }
  }

  update(timeSeconds) {
    for (const control of this.controlLoops) {
      this.setControlPreview(control, Math.sin(timeSeconds * 1.35));
    }
  }

  getDiagnostics(entityId) {
    const entity = this.entities.get(entityId);
    if (!entity) return {};
    return {
      orbitRadius: entity.orbitRadius,
      currentAngleDegrees: entity.currentAngleDegrees,
      previewValue: entity.previewValue,
      center: vectorObject(this.state.looper.controlColliders[entity.control].arc.center),
    };
  }

  getMissingNodeWarnings() { return []; }

  getHierarchyEntries() {
    const entries = [];
    this.root.traverse((object) => {
      if (!this.nodeRest.has(object) || !object.name) return;
      let depth = 0;
      let parent = object.parent;
      while (parent && parent !== this.root) { depth += 1; parent = parent.parent; }
      entries.push({ id: `node:${object.uuid}`, label: object.name, detail: object.type, object, depth, type: "node", transformable: false });
    });
    return entries;
  }

  setDisplayMode(mode) {
    for (const [material, original] of this.originalMaterials) {
      material.wireframe = mode === "wireframe" ? true : original.wireframe;
      material.transparent = mode === "translucent" ? true : original.transparent;
      material.opacity = mode === "translucent" ? 0.28 : original.opacity;
      material.depthWrite = mode === "translucent" ? false : original.depthWrite;
      material.needsUpdate = true;
    }
  }

  setColliderVisibility(visible) { this.collidersVisible = visible; this.applyVisibility(); }
  setPathVisibility(visible) { this.pathsVisible = visible; this.applyVisibility(); }

  applyVisibility() {
    for (const object of this.colliderObjects) object.visible = this.collidersVisible;
    for (const object of this.pathObjects) object.visible = this.pathsVisible;
  }

  resetModelState() {
    for (const [object, rest] of this.nodeRest) {
      if (object === this.root) continue;
      object.position.copy(rest.position);
      object.quaternion.copy(rest.quaternion);
      object.scale.copy(rest.scale);
    }
    for (const [mesh, influences] of this.originalMorphInfluences) {
      if (mesh.morphTargetInfluences) mesh.morphTargetInfluences.splice(0, influences.length, ...influences);
    }
    this.root?.updateMatrixWorld?.(true);
  }

  clearEditorVisuals() {
    for (const object of this.ownedRoots) {
      object.removeFromParent();
      disposeObject(object);
    }
    this.ownedRoots = [];
  }

  dispose() {
    this.clearEditorVisuals();
    this.resetModelState();
    this.entities.clear();
    this.pickables = [];
    this.colliderObjects = [];
    this.pathObjects = [];
    this.controlVisuals.clear();
    this.nodeNames = [];
    this.nodeRest.clear();
    this.originalMaterials.clear();
    this.originalMorphInfluences.clear();
    this.root = null;
  }
}

function colliderMaterial(color, opacity) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, wireframe: true, depthTest: false, depthWrite: false });
}

function makeLine(points, color, opacity) {
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false }),
  );
  return line;
}

function makeLineLoop(points, color, opacity) {
  const line = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false }),
  );
  return line;
}

function toVector(value) { return new THREE.Vector3(value.x, value.y, value.z); }
function vectorObject(value) { return { x: value.x, y: value.y, z: value.z }; }
function materialList(material) { return Array.isArray(material) ? material : [material]; }
function capitalize(value) { return value.charAt(0).toUpperCase() + value.slice(1); }

function disposeObject(root) {
  root.traverse((object) => {
    object.geometry?.dispose?.();
    for (const material of materialList(object.material)) material?.dispose?.();
  });
}
