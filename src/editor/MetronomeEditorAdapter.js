import * as THREE from "three";
import {
  colliderScaleToRadius,
  maxBoundsDimension,
  modelPositionToNormalized,
  normalizeCalibrationAxis,
  normalizedPositionToModel,
  radiusToColliderScale,
} from "../instruments/core/calibrationMath.js";
import {
  generateArcPoints,
  getArcPointAtAngle,
  setArcOrbitRadius,
} from "../instruments/core/arcMotionMath.js";
import {
  handleCenterFromPivotPosition,
  handlePivotPositionFromCenter,
  mapHandleValueToAngles,
  projectHandleColliderOffset,
} from "./calibration/handleCalibrationMath.js";

const DEG_TO_RAD = Math.PI / 180;
const PORT_ARROW_COLOR = 0xf8fafc;

export class MetronomeEditorAdapter {
  constructor({ scene, onWarning = () => {} } = {}) {
    this.scene = scene;
    this.onWarning = onWarning;
    this.root = null;
    this.state = null;
    this.bounds = new THREE.Box3();
    this.boundsCenter = new THREE.Vector3();
    this.boundsSize = new THREE.Vector3();
    this.maxDimension = 1;
    this.entities = new Map();
    this.pickables = [];
    this.colliderObjects = [];
    this.pathObjects = [];
    this.ownedRoots = [];
    this.nodeNames = [];
    this.nodeRest = new Map();
    this.handlePreviews = new Map();
    this.handleLoops = new Set();
    this.pendulumPreview = 0;
    this.pendulumLoop = false;
    this.originalMaterials = new Map();
    this.collidersVisible = true;
    this.pathsVisible = true;
  }

  load(root, state) {
    this.dispose();
    this.root = root;
    this.state = state;
    this.root.rotation.y = (state.metronome.settings.spawnYawDegrees || 0) * DEG_TO_RAD;
    this.captureModelState();
    this.calculateBounds();
    this.rebuild();
    return this;
  }

  setState(state) {
    this.state = state;
    if (!this.root) return;
    this.root.rotation.y = (state.metronome.settings.spawnYawDegrees || 0) * DEG_TO_RAD;
    this.resetMechanismNodes();
    this.calculateBounds();
    this.rebuild();
  }

  captureModelState() {
    this.nodeNames = [];
    this.nodeRest.clear();
    this.originalMaterials.clear();
    this.root.traverse((object) => {
      if (object.name) this.nodeNames.push(object.name);
      this.nodeRest.set(object, {
        position: object.position.clone(),
        quaternion: object.quaternion.clone(),
        scale: object.scale.clone(),
      });
      if (!object.isMesh) return;
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
    this.bounds.getCenter(this.boundsCenter);
    this.bounds.getSize(this.boundsSize);
    this.maxDimension = maxBoundsDimension(this.boundsSize);
  }

  rebuild() {
    if (!this.root || !this.state) return;
    this.clearEditorVisuals();
    this.resetMechanismNodes();
    this.entities.clear();
    this.pickables = [];
    this.colliderObjects = [];
    this.pathObjects = [];

    this.createSettingsEntity();
    this.state.metronome.connectionPorts.forEach((config, index) => this.createConnectionPort(config, index));
    this.state.metronome.handleControls.forEach((config, index) => this.createHandle(config, index));
    this.createPendulum(this.state.metronome.pendulum);
    this.state.metronome.eyeControls.forEach((config, index) => this.createEye(config, index));
    this.applyVisibility();
  }

  createSettingsEntity() {
    this.entities.set("settings", {
      id: "settings",
      type: "settings",
      label: "Metronome settings",
      detail: "Spawn and model source",
      object: this.root,
      transformable: false,
    });
  }

  createConnectionPort(config, index) {
    const position = normalizedPositionToModel(config.position, this.boundsCenter, this.boundsSize);
    const radius = colliderScaleToRadius(config.colliderScale, this.maxDimension);
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16),
      colliderMaterial(config.colliderColor, 0.68),
    );
    sphere.name = config.name;
    sphere.position.set(position.x, position.y, position.z);
    sphere.scale.setScalar(radius);
    this.root.add(sphere);
    this.registerOwned(sphere);

    const center = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(this.maxDimension * 0.004, 0.002), 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }),
    );
    center.position.copy(sphere.position);
    center.raycast = () => {};
    this.root.add(center);
    this.registerOwned(center, { path: true });

    const direction = toVector(normalizeCalibrationAxis(config.socketDirection, `${config.portId} socketDirection`));
    const arrow = new THREE.ArrowHelper(
      direction,
      sphere.position.clone(),
      Math.max(this.maxDimension * 0.12, radius * 2.5),
      PORT_ARROW_COLOR,
      Math.max(this.maxDimension * 0.025, radius * 0.6),
      Math.max(this.maxDimension * 0.014, radius * 0.35),
    );
    arrow.traverse((object) => { object.raycast = () => {}; });
    this.root.add(arrow);
    this.registerOwned(arrow, { path: true });

    this.registerColliderEntity({
      id: `port:${config.portId}`,
      type: "port",
      index,
      label: config.portId,
      detail: config.name,
      object: sphere,
      arrow,
      center,
      transformModes: ["translate", "scale"],
    });
  }

  createHandle(config, index) {
    const id = `handle:${index}`;
    const node = this.root.getObjectByName(config.nodeName);
    if (!node) {
      this.entities.set(id, {
        id,
        type: "handle",
        index,
        label: `${config.parameter} handle`,
        detail: `Missing ${config.nodeName}`,
        missing: true,
        transformable: false,
      });
      return;
    }
    const rest = this.nodeRest.get(node);
    try {
      const calibration = projectHandleColliderOffset(config.colliderOffset, config.axis, config.parameter);
      const axis = toVector(calibration.axis);
      const projected = toVector(calibration.projectedOffset);
      const orbitRadius = calibration.orbitRadius;
      const neutral = toVector(calibration.neutralDirection);
      const pivotPosition = handlePivotPositionFromCenter(
        config.center ?? { x: 0, y: 0, z: 0 },
        rest.position,
        rest.quaternion,
        rest.scale,
      );

      const collider = new THREE.Mesh(
        new THREE.SphereGeometry(1, 24, 16),
        colliderMaterial(config.colliderColor, 0.64),
      );
      collider.name = `EDITOR_handle_${config.parameter}`;
      collider.position.copy(projected);
      collider.scale.setScalar(config.colliderRadius);

      const frame = new THREE.Group();
      frame.name = `EDITOR_${config.parameter}_motion_path`;
      frame.position.copy(toVector(pivotPosition));
      frame.quaternion.copy(rest.quaternion);
      frame.scale.copy(rest.scale);
      node.parent.add(frame);
      frame.add(collider);
      const pathFrame = new THREE.Group();
      pathFrame.name = `EDITOR_${config.parameter}_path_visuals`;
      frame.add(pathFrame);
      this.buildHandleDebug(pathFrame, config, axis, neutral, orbitRadius);
      this.registerOwned(frame);
      this.pathObjects.push(pathFrame);

      const entity = {
        id,
        type: "handle",
        index,
        label: `${config.parameter.toUpperCase()} arc assembly`,
        detail: `${config.nodeName} · pivot, plane, path, and collider`,
        object: frame,
        node,
        frame,
        collider,
        pathFrame,
        rest,
        axis,
        neutral,
        orbitRadius,
        transformable: true,
        transformModes: ["translate"],
      };
      frame.userData.editorEntityId = id;
      collider.userData.editorEntityId = id;
      this.entities.set(id, entity);
      this.pickables.push(frame, collider);
      this.colliderObjects.push(collider);
      this.applyHandlePreview(entity);
    } catch (error) {
      this.entities.set(id, {
        id,
        type: "handle",
        index,
        label: `${config.parameter} handle`,
        detail: error.message,
        missing: true,
        transformable: false,
      });
    }
  }

  buildHandleDebug(frame, config, axis, neutral, radius) {
    const arcConfig = {
      center: { x: 0, y: 0, z: 0 },
      axis: vectorObject(axis),
      colliderOffset: vectorObject(neutral.clone().multiplyScalar(radius)),
      minAngleDegrees: config.minAngleDegrees,
      maxAngleDegrees: config.maxAngleDegrees,
      referenceAngleDegrees: config.referenceAngleDegrees || 0,
    };
    const pivotRadius = Math.max(radius * 0.045, 0.04);
    const pivot = new THREE.Mesh(
      new THREE.SphereGeometry(pivotRadius, 14, 10),
      new THREE.MeshBasicMaterial({ color: config.pivotColor, depthTest: false }),
    );
    frame.add(pivot);

    const axisArrow = new THREE.ArrowHelper(axis, new THREE.Vector3(), radius * 1.3, config.pivotColor, radius * 0.18, radius * 0.1);
    frame.add(axisArrow);

    frame.add(makeLineLoop(toThreePoints(generateArcPoints(arcConfig, {
      startAngleDegrees: -180 - arcConfig.referenceAngleDegrees,
      endAngleDegrees: 180 - arcConfig.referenceAngleDegrees,
      segments: 96,
    })), config.planeColor, 0.72));
    frame.add(makeLine(toThreePoints(generateArcPoints(arcConfig, { segments: 64 })), config.arcColor, 1));
    for (const degrees of [config.minAngleDegrees, config.maxAngleDegrees]) {
      const endpoint = toVector(getArcPointAtAngle(arcConfig, degrees));
      frame.add(makeLine([new THREE.Vector3(), endpoint], config.arcColor, 0.9));
    }

    const plane = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 1.12, 64),
      new THREE.MeshBasicMaterial({
        color: config.planeColor,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    plane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
    frame.add(plane);
  }

  createPendulum(config) {
    const id = "pendulum";
    const node = this.root.getObjectByName(config.nodeName);
    if (!node) {
      this.entities.set(id, {
        id,
        type: "pendulum",
        label: "Pendulum",
        detail: `Missing ${config.nodeName}`,
        missing: true,
        transformable: false,
      });
      return;
    }
    try {
      const axis = toVector(normalizeCalibrationAxis(config.modelLocalAxis, "pendulum axis"));
      const rest = this.nodeRest.get(node);
      const parent = node.parent;
      const arrow = new THREE.ArrowHelper(axis, rest.position.clone(), this.maxDimension * 0.15, 0xf6d878);
      arrow.traverse((object) => { object.raycast = () => {}; });
      parent.add(arrow);
      this.registerOwned(arrow, { path: true });
      const entity = {
        id,
        type: "pendulum",
        label: "Pendulum",
        detail: config.nodeName,
        object: node,
        node,
        rest,
        axis,
        transformable: false,
      };
      this.entities.set(id, entity);
      this.applyPendulumPreview(entity);
    } catch (error) {
      this.entities.set(id, {
        id,
        type: "pendulum",
        label: "Pendulum",
        detail: error.message,
        missing: true,
        transformable: false,
      });
    }
  }

  createEye(config, index) {
    const id = `eye:${index}`;
    const node = this.root.getObjectByName(config.nodeName);
    if (!node) {
      this.entities.set(id, {
        id,
        type: "eye",
        index,
        label: `${config.action} eye`,
        detail: `Missing ${config.nodeName}`,
        missing: true,
        transformable: false,
      });
      return;
    }
    const rest = this.nodeRest.get(node);
    let collider = null;
    if (node.geometry?.clone) {
      collider = new THREE.Mesh(node.geometry.clone(), colliderMaterial(config.colliderColor, 0.48));
      collider.name = `EDITOR_eye_${config.action}`;
      collider.scale.setScalar(config.colliderScale);
      node.add(collider);
      this.registerOwned(collider);
      this.colliderObjects.push(collider);
      this.pickables.push(collider);
      collider.userData.editorEntityId = id;
    }
    this.entities.set(id, {
      id,
      type: "eye",
      index,
      label: `${config.action} eye`,
      detail: config.nodeName,
      object: collider || node,
      node,
      rest,
      transformable: Boolean(collider),
      transformModes: ["scale"],
    });
    this.applyEyePreview(this.entities.get(id), 0);
  }

  registerColliderEntity(entity) {
    entity.transformable = entity.transformable !== false;
    entity.object.userData.editorEntityId = entity.id;
    this.entities.set(entity.id, entity);
    this.pickables.push(entity.object);
    this.colliderObjects.push(entity.object);
  }

  registerOwned(object, { path = false } = {}) {
    this.ownedRoots.push(object);
    if (path) this.pathObjects.push(object);
  }

  syncTransformToState(entityId) {
    const entity = this.entities.get(entityId);
    if (!entity?.object) return;
    if (entity.type === "port") {
      const config = this.state.metronome.connectionPorts[entity.index];
      Object.assign(config.position, modelPositionToNormalized(entity.object.position, this.boundsCenter, this.boundsSize));
      const radius = averageScale(entity.object.scale);
      config.colliderScale = radiusToColliderScale(radius, this.maxDimension);
      entity.center.position.copy(entity.object.position);
      entity.arrow.position.copy(entity.object.position);
    } else if (entity.type === "handle") {
      const config = this.state.metronome.handleControls[entity.index];
      config.center ||= { x: 0, y: 0, z: 0 };
      Object.assign(config.center, handleCenterFromPivotPosition(
        entity.object.position,
        entity.rest.position,
        entity.rest.quaternion,
        entity.rest.scale,
      ));
      this.applyHandlePreview(entity);
    } else if (entity.type === "eye") {
      const config = this.state.metronome.eyeControls[entity.index];
      config.colliderScale = averageScale(entity.object.scale);
    }
  }

  getOrbitRadius(entityId) {
    const entity = this.entities.get(entityId);
    if (entity?.type !== "handle") return null;
    return projectHandleColliderOffset(
      this.state.metronome.handleControls[entity.index].colliderOffset,
      this.state.metronome.handleControls[entity.index].axis,
      this.state.metronome.handleControls[entity.index].parameter,
    ).orbitRadius;
  }

  setOrbitRadius(entityId, orbitRadius) {
    const entity = this.entities.get(entityId);
    if (entity?.type !== "handle") return;
    const config = this.state.metronome.handleControls[entity.index];
    const resized = setArcOrbitRadius({
      center: config.center ?? { x: 0, y: 0, z: 0 },
      axis: config.axis,
      colliderOffset: config.colliderOffset,
      minAngleDegrees: config.minAngleDegrees,
      maxAngleDegrees: config.maxAngleDegrees,
      referenceAngleDegrees: config.referenceAngleDegrees,
    }, orbitRadius);
    Object.assign(config.colliderOffset, resized.colliderOffset);
  }

  applyHandlePreview(entityOrId) {
    const entity = typeof entityOrId === "string" ? this.entities.get(entityOrId) : entityOrId;
    if (!entity?.node) return null;
    const config = this.state.metronome.handleControls[entity.index];
    const range = config.parameter === "bpm"
      ? [this.state.metronome.settings.minBpm, this.state.metronome.settings.maxBpm]
      : [this.state.metronome.settings.minVolume, this.state.metronome.settings.maxVolume];
    const defaultValue = config.parameter === "bpm"
      ? this.state.metronome.settings.defaultBpm
      : this.state.metronome.settings.defaultVolume;
    const value = this.handlePreviews.has(entity.id) ? this.handlePreviews.get(entity.id) : defaultValue;
    const { movementAngleRadians: movementAngle, appliedAngleRadians: appliedAngle } = mapHandleValueToAngles({
      value,
      valueMin: range[0],
      valueMax: range[1],
      minAngleDegrees: config.minAngleDegrees,
      maxAngleDegrees: config.maxAngleDegrees,
      referenceAngleDegrees: config.referenceAngleDegrees,
    });
    const delta = new THREE.Quaternion().setFromAxisAngle(entity.axis, appliedAngle);
    entity.node.position.copy(entity.rest.position);
    entity.node.quaternion.copy(entity.rest.quaternion).multiply(delta);
    entity.node.scale.copy(entity.rest.scale);
    const colliderPoint = getArcPointAtAngle({
      center: { x: 0, y: 0, z: 0 },
      axis: config.axis,
      colliderOffset: config.colliderOffset,
      minAngleDegrees: config.minAngleDegrees,
      maxAngleDegrees: config.maxAngleDegrees,
      referenceAngleDegrees: config.referenceAngleDegrees,
    }, movementAngle / DEG_TO_RAD);
    entity.collider.position.copy(toVector(colliderPoint));
    entity.node.updateMatrixWorld(true);
    entity.previewValue = value;
    entity.movementAngleDegrees = movementAngle / DEG_TO_RAD;
    entity.appliedAngleDegrees = appliedAngle / DEG_TO_RAD;
    return entity;
  }

  setHandlePreview(entityId, value) {
    this.handlePreviews.set(entityId, value);
    return this.applyHandlePreview(entityId);
  }

  setHandleLoop(entityId, enabled) {
    if (enabled) this.handleLoops.add(entityId);
    else this.handleLoops.delete(entityId);
  }

  applyPendulumPreview(entity = this.entities.get("pendulum")) {
    if (!entity?.node) return;
    const config = this.state.metronome.pendulum;
    const angle = this.pendulumPreview * Math.abs(config.swingDegrees) * DEG_TO_RAD;
    const delta = new THREE.Quaternion().setFromAxisAngle(entity.axis, angle);
    entity.node.position.copy(entity.rest.position);
    entity.node.quaternion.copy(entity.rest.quaternion).premultiply(delta);
    entity.node.scale.copy(entity.rest.scale);
    entity.node.updateMatrixWorld(true);
    entity.previewAngleDegrees = angle / DEG_TO_RAD;
  }

  setPendulumPreview(normalized) {
    this.pendulumPreview = normalized;
    this.applyPendulumPreview();
  }

  setPendulumLoop(enabled) {
    this.pendulumLoop = enabled;
  }

  applyEyePreview(entityOrId, amount) {
    const entity = typeof entityOrId === "string" ? this.entities.get(entityOrId) : entityOrId;
    if (!entity?.node) return;
    const config = this.state.metronome.eyeControls[entity.index];
    entity.node.position.set(
      entity.rest.position.x + config.pressedOffset.x * amount,
      entity.rest.position.y + config.pressedOffset.y * amount,
      entity.rest.position.z + config.pressedOffset.z * amount,
    );
    entity.node.quaternion.copy(entity.rest.quaternion);
    entity.node.scale.copy(entity.rest.scale);
    entity.node.updateMatrixWorld(true);
    entity.previewAmount = amount;
  }

  update(timeSeconds) {
    for (const entityId of this.handleLoops) {
      const entity = this.entities.get(entityId);
      if (!entity) continue;
      const config = this.state.metronome.handleControls[entity.index];
      const [minimum, maximum] = config.parameter === "bpm"
        ? [this.state.metronome.settings.minBpm, this.state.metronome.settings.maxBpm]
        : [this.state.metronome.settings.minVolume, this.state.metronome.settings.maxVolume];
      const amount = (Math.sin(timeSeconds * 1.35) + 1) * 0.5;
      this.setHandlePreview(entityId, minimum + (maximum - minimum) * amount);
    }
    if (this.pendulumLoop) this.setPendulumPreview(Math.sin(timeSeconds * 2));
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

  setColliderVisibility(visible) {
    this.collidersVisible = visible;
    this.applyVisibility();
  }

  setPathVisibility(visible) {
    this.pathsVisible = visible;
    this.applyVisibility();
  }

  applyVisibility() {
    for (const object of this.colliderObjects) object.visible = this.collidersVisible;
    for (const object of this.pathObjects) object.visible = this.pathsVisible;
  }

  getDiagnostics(entityId) {
    const entity = this.entities.get(entityId);
    if (!entity) return {};
    if (entity.type === "port") {
      return {
        actualPosition: vectorObject(entity.object.position),
        radius: averageScale(entity.object.scale),
        maxModelDimension: this.maxDimension,
      };
    }
    if (entity.type === "handle") {
      return {
        orbitRadius: entity.orbitRadius,
        center: vectorObject(this.state.metronome.handleControls[entity.index].center),
        actualPivotPosition: vectorObject(entity.object.position),
        movementAngleDegrees: entity.movementAngleDegrees,
        appliedAngleDegrees: entity.appliedAngleDegrees,
      };
    }
    if (entity.type === "pendulum") return { angleDegrees: entity.previewAngleDegrees || 0 };
    return {};
  }

  getMissingNodeWarnings() {
    return [...this.entities.values()]
      .filter((entity) => entity.missing)
      .map((entity) => `${entity.label}: ${entity.detail}`);
  }

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

  resetMechanismNodes() {
    for (const [object, rest] of this.nodeRest) {
      if (object === this.root) continue;
      object.position.copy(rest.position);
      object.quaternion.copy(rest.quaternion);
      object.scale.copy(rest.scale);
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
    this.resetMechanismNodes();
    this.entities.clear();
    this.pickables = [];
    this.colliderObjects = [];
    this.pathObjects = [];
    this.nodeNames = [];
    this.nodeRest.clear();
    this.originalMaterials.clear();
    this.root = null;
  }
}

function colliderMaterial(color, opacity) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    wireframe: true,
    depthTest: false,
    depthWrite: false,
  });
}

function makeLine(points, color, opacity) {
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false }),
  );
  line.raycast = () => {};
  return line;
}

function makeLineLoop(points, color, opacity) {
  const line = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false }),
  );
  line.raycast = () => {};
  return line;
}

function toVector(value) {
  return new THREE.Vector3(value.x, value.y, value.z);
}

function vectorObject(value) {
  return { x: value.x, y: value.y, z: value.z };
}

function toThreePoints(points) {
  return points.map(toVector);
}

function averageScale(scale) {
  return (Math.abs(scale.x) + Math.abs(scale.y) + Math.abs(scale.z)) / 3;
}

function materialList(material) {
  return Array.isArray(material) ? material : [material];
}

function disposeObject(root) {
  root.traverse((object) => {
    object.geometry?.dispose?.();
    for (const material of materialList(object.material)) material?.dispose?.();
  });
}
