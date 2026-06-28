import * as THREE from "three";
import { DEBUG_SHOW_COLLIDERS } from "../config/debug.js";
import {
  BEND_ALIGNED_COLLIDER_GROUP_NAME,
  INTERACTION_COLLIDERS,
  INTERACTION_TARGET_NAMES,
  MORPH_TARGET_NAMES,
} from "../config/honk.js";
import {
  HONK_CONNECTION_COLLIDER_OPACITY,
  HONK_CONNECTION_TARGET_NAME,
  LOOPER_BUTTON_COLLIDERS,
  LOOPER_BUTTON_ACTIONS,
  LOOPER_COLLIDER_OPACITY,
  LOOPER_CONTROL_COLLIDERS,
  LOOPER_DEBUG_COLORS,
  LOOPER_TRACK_COUNT,
} from "../config/looper.js";
import {
  getLooperButtonName,
  getLooperControlName,
  getLooperNodeName,
} from "./looperNames.js";

const tempBox = new THREE.Box3();
const tempBoxCenter = new THREE.Vector3();
const tempBoxSize = new THREE.Vector3();
const tempArcPoints = [];

export function createBodyGripTarget(root, hitTargets, { makeHitTargetMaterial, hitMarkerOpacity }) {
  const bodyBox = new THREE.Box3();
  let hasVisibleMesh = false;
  root.traverse((object) => {
    if (object.isMesh && !object.userData.isHitTarget) {
      object.updateWorldMatrix(true, false);
      bodyBox.expandByObject(object);
      hasVisibleMesh = true;
    }
  });

  if (!hasVisibleMesh || bodyBox.isEmpty()) {
    return;
  }

  bodyBox.getCenter(tempBoxCenter);
  bodyBox.getSize(tempBoxSize);
  const bodyTarget = new THREE.Mesh(
    new THREE.BoxGeometry(tempBoxSize.x * 1.12, tempBoxSize.y * 1.12, tempBoxSize.z * 1.12),
    makeHitTargetMaterial(INTERACTION_TARGET_NAMES.body),
  );
  bodyTarget.name = INTERACTION_TARGET_NAMES.body;
  bodyTarget.position.copy(tempBoxCenter);
  bodyTarget.userData.isHitTarget = true;
  bodyTarget.userData.isBodyGripTarget = true;
  bodyTarget.userData.baseHitOpacity = hitMarkerOpacity;
  bodyTarget.material.opacity = bodyTarget.userData.baseHitOpacity;
  bodyTarget.renderOrder = 5;

  root.add(bodyTarget);
  hitTargets[INTERACTION_TARGET_NAMES.body] = bodyTarget;
}

export function createMorphTargetSpheres(root, hitTargets, { hitMarkerOpacity }) {
  tempBox.setFromObject(root);
  tempBox.getCenter(tempBoxCenter);
  tempBox.getSize(tempBoxSize);

  const maxSize = Math.max(tempBoxSize.x, tempBoxSize.y, tempBoxSize.z);
  const bendAlignedGroup = new THREE.Group();
  bendAlignedGroup.name = BEND_ALIGNED_COLLIDER_GROUP_NAME;
  bendAlignedGroup.position.copy(tempBoxCenter);
  root.add(bendAlignedGroup);

  for (const target of INTERACTION_COLLIDERS) {
    const parent = isBendAlignedTarget(target) ? bendAlignedGroup : root;
    const radius = maxSize * target.size;
    const travel = tempBoxSize.y * target.movementRange;
    const neutralY = tempBoxCenter.y + target.y * tempBoxSize.y;
    const parentOffsetY = parent === bendAlignedGroup ? bendAlignedGroup.position.y : 0;
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 24, 16),
      new THREE.MeshBasicMaterial({
        color: target.color,
        transparent: true,
        opacity: hitMarkerOpacity,
        depthWrite: false,
      }),
    );

    sphere.name = target.name;
    sphere.userData.isHitTarget = true;
    sphere.userData.isProceduralMorphTarget = true;
    sphere.userData.baseHitOpacity = hitMarkerOpacity;
    sphere.userData.interactionType = target.type;
    sphere.userData.side = target.side;
    sphere.userData.morphName = target.type === "nose" ? MORPH_TARGET_NAMES.nose : null;
    sphere.userData.invertVerticalMorph = Boolean(target.invertVerticalMorph);
    sphere.material.wireframe = DEBUG_SHOW_COLLIDERS;
    sphere.renderOrder = 20;
    sphere.userData.neutralY = neutralY - parentOffsetY;
    sphere.userData.minY = neutralY - travel - parentOffsetY;
    sphere.userData.maxY = neutralY + travel - parentOffsetY;
    sphere.position.set(
      tempBoxCenter.x + target.x * tempBoxSize.x - (parent === bendAlignedGroup ? bendAlignedGroup.position.x : 0),
      neutralY - parentOffsetY,
      tempBoxCenter.z + target.z * tempBoxSize.z - (parent === bendAlignedGroup ? bendAlignedGroup.position.z : 0),
    );

    parent.add(sphere);
    hitTargets[target.name] = sphere;
  }
}

export function createHonkConnectionTarget(root, hitTargets, { makeHitTargetMaterial }) {
  if (hitTargets[HONK_CONNECTION_TARGET_NAME]) {
    return;
  }

  tempBox.setFromObject(root);
  tempBox.getCenter(tempBoxCenter);
  tempBox.getSize(tempBoxSize);

  const maxSize = Math.max(tempBoxSize.x, tempBoxSize.y, tempBoxSize.z, 0.1);
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(maxSize * 0.055, 24, 16),
    makeHitTargetMaterial(
      HONK_CONNECTION_TARGET_NAME,
      LOOPER_DEBUG_COLORS.honkConnection,
      HONK_CONNECTION_COLLIDER_OPACITY,
    ),
  );

  sphere.name = HONK_CONNECTION_TARGET_NAME;
  sphere.userData.isHitTarget = true;
  sphere.userData.isHonkConnectionTarget = true;
  sphere.userData.baseHitOpacity = HONK_CONNECTION_COLLIDER_OPACITY;
  sphere.userData.hitColor = LOOPER_DEBUG_COLORS.honkConnection;
  sphere.renderOrder = 22;
  sphere.position.set(
    tempBoxCenter.x,
    tempBoxCenter.y + tempBoxSize.y * 0.04,
    tempBoxCenter.z - tempBoxSize.z * 0.32,
  );

  root.add(sphere);
  hitTargets[HONK_CONNECTION_TARGET_NAME] = sphere;
}

export function createLooperColliders(root, hitTargets, { makeHitTargetMaterial }) {
  tempBox.setFromObject(root);
  tempBox.getCenter(tempBoxCenter);
  tempBox.getSize(tempBoxSize);

  const maxSize = Math.max(tempBoxSize.x, tempBoxSize.y, tempBoxSize.z, 0.1);
  const buttonGeometry = new THREE.BoxGeometry(maxSize * 0.09, maxSize * 0.045, maxSize * 0.026);
  buttonGeometry.userData.disposeOnInstrumentDelete = true;
  const nodeGeometry = new THREE.SphereGeometry(maxSize * 0.046, 24, 16);
  nodeGeometry.userData.disposeOnInstrumentDelete = true;
  const controlGeometry = new THREE.SphereGeometry(maxSize * 0.044, 24, 16);
  controlGeometry.userData.disposeOnInstrumentDelete = true;

  const addCollider = (mesh, name, color, userData = {}) => {
    mesh.name = name;
    mesh.userData.isHitTarget = true;
    mesh.userData.isLooperCollider = true;
    mesh.userData.baseHitOpacity = LOOPER_COLLIDER_OPACITY;
    mesh.userData.hitColor = color;
    mesh.userData.currentHitColor = color;
    Object.assign(mesh.userData, userData);
    mesh.renderOrder = 24;
    root.add(mesh);
    hitTargets[name] = mesh;
  };

  for (const action of LOOPER_BUTTON_ACTIONS) {
    const buttonConfig = LOOPER_BUTTON_COLLIDERS[action];
    const button = new THREE.Mesh(
      buttonGeometry.clone(),
      makeHitTargetMaterial(getLooperButtonName(action), LOOPER_DEBUG_COLORS.button[action], LOOPER_COLLIDER_OPACITY),
    );
    button.geometry.userData.disposeOnInstrumentDelete = true;
    applyConfiguredColliderTransform(button, buttonConfig, { x: 0, y: 0.34, z: 0.56 });
    addCollider(button, getLooperButtonName(action), LOOPER_DEBUG_COLORS.button[action], {
      isLooperButton: true,
      looperButtonAction: action,
      looperMorphName: buttonConfig.morphTarget,
    });
    createColliderTransformDebug(button, getLooperButtonName(action), maxSize * 0.07);
  }

  const nodeColumns = [-0.22, 0.22];
  for (let index = 0; index < LOOPER_TRACK_COUNT; index += 1) {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const node = new THREE.Mesh(
      nodeGeometry.clone(),
      makeHitTargetMaterial(getLooperNodeName(index), LOOPER_DEBUG_COLORS.nodeOpen, LOOPER_COLLIDER_OPACITY),
    );
    node.geometry.userData.disposeOnInstrumentDelete = true;
    node.position.set(
      tempBoxCenter.x + tempBoxSize.x * nodeColumns[column],
      tempBoxCenter.y + tempBoxSize.y * (0.12 - row * 0.15),
        tempBoxCenter.z + tempBoxSize.z * 0.56 + maxSize * 0.018,
    );
    addCollider(node, getLooperNodeName(index), LOOPER_DEBUG_COLORS.nodeOpen, {
      isLooperNode: true,
      looperTrackIndex: index,
    });
  }

  const controlColors = {
    volume: LOOPER_DEBUG_COLORS.controlVolume,
    speed: LOOPER_DEBUG_COLORS.controlSpeed,
  };
  for (const [control, controlConfig] of Object.entries(LOOPER_CONTROL_COLLIDERS)) {
    const color = controlColors[control] || LOOPER_DEBUG_COLORS.controlVolume;
    const controlSphere = new THREE.Mesh(
      controlGeometry.clone(),
      makeHitTargetMaterial(getLooperControlName(control), color, LOOPER_COLLIDER_OPACITY),
    );
    controlSphere.geometry.userData.disposeOnInstrumentDelete = true;
    const controlPosition = applyConfiguredColliderTransform(controlSphere, controlConfig, {
      x: 0,
      y: -0.08,
      z: 0.56,
    });
    configureControlMotion(controlSphere, controlConfig, {
      neutralX: controlPosition.x,
      neutralY: controlPosition.y,
      neutralZ: controlPosition.z,
      size: tempBoxSize,
    });
    addCollider(controlSphere, getLooperControlName(control), color, {
      isLooperControl: true,
      looperControl: control,
      looperMorphTargets: controlConfig.morphTargets,
      neutralY: controlPosition.y,
      minY: controlPosition.y - tempBoxSize.y * (controlConfig.movementRange ?? 0.24),
      maxY: controlPosition.y + tempBoxSize.y * (controlConfig.movementRange ?? 0.24),
    });
    createControlArcDebug(root, getLooperControlName(control), color, controlSphere.userData);
    createColliderTransformDebug(controlSphere, getLooperControlName(control), maxSize * 0.065);
  }
}

function isBendAlignedTarget(target) {
  return target.type === "ear" || target.type === "nose";
}

function applyConfiguredColliderTransform(mesh, config = {}, defaults = {}) {
  const x = getNumber(config.x, defaults.x ?? 0);
  const y = getNumber(config.y, defaults.y ?? 0);
  const z = getNumber(config.z, defaults.z ?? 0.56);
  mesh.position.set(
    tempBoxCenter.x + tempBoxSize.x * x,
    tempBoxCenter.y + tempBoxSize.y * y,
    tempBoxCenter.z + tempBoxSize.z * z,
  );

  const rotationDegrees = config.rotationDegrees || {};
  mesh.rotation.set(
    THREE.MathUtils.degToRad(getNumber(rotationDegrees.x, 0)),
    THREE.MathUtils.degToRad(getNumber(rotationDegrees.y, 0)),
    THREE.MathUtils.degToRad(getNumber(rotationDegrees.z, 0)),
  );

  return mesh.position;
}

function getNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function configureControlMotion(mesh, controlConfig, { neutralX, neutralY, neutralZ, size }) {
  mesh.userData.movementMode = controlConfig?.movementMode || "vertical";
  mesh.userData.neutralX = neutralX;
  mesh.userData.neutralY = neutralY;
  mesh.userData.neutralZ = neutralZ;
  mesh.userData.dragRange = Math.max(size.y * (controlConfig?.movementRange ?? 0.24), 0.0001);
  mesh.userData.dragSensitivity = Math.max(getNumber(controlConfig?.dragSensitivity, 1), 0);

  if (mesh.userData.movementMode !== "arc" || !controlConfig?.arc) {
    return;
  }

  const radius = Math.max(size.x * (controlConfig.arc.radius ?? 0.18), 0.0001);
  const side = controlConfig.arc.side < 0 ? -1 : 1;
  mesh.userData.arcRadius = radius;
  mesh.userData.arcSide = side;
  mesh.userData.arcRotationZ = mesh.rotation.z;
  mesh.userData.arcMinAngle = THREE.MathUtils.degToRad(controlConfig.arc.minDegrees ?? -48);
  mesh.userData.arcMaxAngle = THREE.MathUtils.degToRad(controlConfig.arc.maxDegrees ?? 48);
}

function createColliderTransformDebug(mesh, name, length) {
  if (!DEBUG_SHOW_COLLIDERS) {
    return;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        0, 0, 0, length, 0, 0,
        0, 0, 0, 0, length, 0,
        0, 0, 0, 0, 0, length,
      ],
      3,
    ),
  );
  geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(
      [
        1, 0.1, 0.1, 1, 0.1, 0.1,
        0.2, 1, 0.2, 0.2, 1, 0.2,
        0.2, 0.45, 1, 0.2, 0.45, 1,
      ],
      3,
    ),
  );
  geometry.userData.disposeOnInstrumentDelete = true;

  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    depthTest: false,
  });
  material.userData.disposeOnInstrumentDelete = true;

  const axes = new THREE.LineSegments(geometry, material);
  axes.name = `DEBUG_transform_axes_${name}`;
  axes.renderOrder = 28;
  axes.raycast = () => {};
  mesh.add(axes);
}

function createControlArcDebug(root, name, color, userData) {
  if (!DEBUG_SHOW_COLLIDERS || userData.movementMode !== "arc") {
    return;
  }

  tempArcPoints.length = 0;
  const steps = 32;
  const midpointAngle = THREE.MathUtils.lerp(userData.arcMinAngle, userData.arcMaxAngle, 0.5);
  const midpointX = -userData.arcSide * Math.cos(midpointAngle) * userData.arcRadius;
  const midpointY = Math.sin(midpointAngle) * userData.arcRadius;
  const rotationZ = userData.arcRotationZ || 0;
  const rotationCos = Math.cos(rotationZ);
  const rotationSin = Math.sin(rotationZ);
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const angle = THREE.MathUtils.lerp(userData.arcMinAngle, userData.arcMaxAngle, t);
    const localX = -userData.arcSide * Math.cos(angle) * userData.arcRadius - midpointX;
    const localY = Math.sin(angle) * userData.arcRadius - midpointY;
    tempArcPoints.push(
      new THREE.Vector3(
        userData.neutralX + localX * rotationCos - localY * rotationSin,
        userData.neutralY + localX * rotationSin + localY * rotationCos,
        userData.neutralZ,
      ),
    );
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(tempArcPoints);
  geometry.userData.disposeOnInstrumentDelete = true;
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    depthTest: false,
  });
  material.userData.disposeOnInstrumentDelete = true;
  const arcLine = new THREE.Line(geometry, material);
  arcLine.name = `DEBUG_control_arc_${name}`;
  arcLine.renderOrder = 26;
  arcLine.raycast = () => {};
  root.add(arcLine);
}
