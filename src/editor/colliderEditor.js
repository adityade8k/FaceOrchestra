import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeletonAware } from "three/addons/utils/SkeletonUtils.js";
import {
  HONK_CONNECTION_COLLIDER_SETTINGS,
  INTERACTION_COLLIDERS,
} from "../config/honk.js";
import {
  LOOPER_BUTTON_ACTIONS,
  LOOPER_BUTTON_COLLIDERS,
  LOOPER_BUTTON_MORPH_TARGETS,
  LOOPER_COLLIDER_GEOMETRY,
  LOOPER_CONTROL_COLLIDERS,
  LOOPER_CONTROL_MORPH_TARGETS,
  LOOPER_DEBUG_COLORS,
  LOOPER_NODE_COLLIDER_LAYOUT,
  LOOPER_TRACK_COUNT,
} from "../config/looper.js";
import {
  INSTRUMENT_TEXTURE_PATHS,
  LOOPER_MODEL_PATH,
  LOOPER_TEXTURE_PATHS,
  MODEL_PATH,
  STICK_MODEL_PATH,
  STICK_TEXTURE_PATHS,
} from "../config/assets.js";
import { STICK_SETTINGS } from "../config/stick.js";
import { applyStandardInstrumentMaterials, loadMaterialTextureSet } from "../utils/materialUtils.js";
import {
  getLooperButtonName,
  getLooperControlName,
  getLooperNodeName,
} from "../instruments/looperNames.js";

const LOCAL_HOSTS = new Set(["", "localhost", "127.0.0.1", "::1"]);
if (!LOCAL_HOSTS.has(window.location.hostname)) {
  document.body.innerHTML = "<p class=\"error\">Collider editor is local-only. Serve it from localhost.</p>";
  throw new Error("Collider editor is local-only.");
}

const ROUND_DIGITS = 4;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const DEFAULT_OPACITY = 0.34;
const SELECTED_OPACITY = 0.74;
const NODE_HELPER_COLOR = 0xffffff;

const objectDefinitions = {
  honk: {
    label: "Honk",
    modelPath: MODEL_PATH,
    texturePaths: INSTRUMENT_TEXTURE_PATHS,
  },
  looper: {
    label: "Looper",
    modelPath: LOOPER_MODEL_PATH,
    texturePaths: LOOPER_TEXTURE_PATHS,
  },
  stick: {
    label: "Stick",
    modelPath: STICK_MODEL_PATH,
    texturePaths: STICK_TEXTURE_PATHS,
  },
};

const viewport = document.querySelector("#viewport");
const statusEl = document.querySelector("#status");
const objectSelect = document.querySelector("#object-select");
const colliderSelect = document.querySelector("#collider-select");
const propertiesEl = document.querySelector("#properties");
const morphTargetsEl = document.querySelector("#morph-targets");
const configOutput = document.querySelector("#config-output");
const copySelectedButton = document.querySelector("#copy-selected");
const copyAllButton = document.querySelector("#copy-all");
const modeButtons = [...document.querySelectorAll("[data-mode]")];

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111417);

const camera = new THREE.PerspectiveCamera(55, getViewportAspect(), 0.01, 100);
camera.position.set(0.6, 0.65, 1.6);

const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.enableDamping = true;
orbitControls.target.set(0, 0.1, 0);

const transformControls = new TransformControls(camera, renderer.domElement);
transformControls.setSpace("local");
transformControls.setSize(0.82);
scene.add(transformControls);

const loader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

const grid = new THREE.GridHelper(4, 20, 0x51606a, 0x2b333a);
grid.position.y = -0.001;
scene.add(grid);

const hemi = new THREE.HemisphereLight(0xffffff, 0x28313a, 1.15);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xffffff, 2.25);
key.position.set(2.4, 3.2, 2.2);
key.castShadow = true;
scene.add(key);

const rim = new THREE.DirectionalLight(0x9ddcff, 0.9);
rim.position.set(-2, 1.8, -2);
scene.add(rim);

const state = {
  objectType: "honk",
  root: null,
  model: null,
  colliders: new Map(),
  colliderOrder: [],
  selected: null,
  config: null,
  bounds: new THREE.Box3(),
  center: new THREE.Vector3(),
  size: new THREE.Vector3(1, 1, 1),
  maxSize: 1,
  nodeObjects: [],
  arcHelpers: new Map(),
  morphTargets: new Map(),
};

window.__colliderEditorDebug = {
  getState() {
    return {
      objectType: state.objectType,
      colliderCount: state.colliders.size,
      morphTargetCount: state.morphTargets.size,
      selected: state.selected?.name || null,
      status: statusEl.textContent,
    };
  },
};

transformControls.addEventListener("dragging-changed", (event) => {
  orbitControls.enabled = !event.value;
});

transformControls.addEventListener("objectChange", () => {
  if (!state.selected) {
    return;
  }
  constrainSelectedTransform(state.selected);
  syncConfigFromObject(state.selected);
  if (state.selected.userData.editor?.kind === "looperNodeLayout") {
    rebuildLooperNodes();
  }
  updateArcHelpers();
  updatePropertyInputs();
  updateConfigOutput();
});

renderer.domElement.addEventListener("pointerdown", onPointerDown);
window.addEventListener("resize", resize);

objectSelect.addEventListener("change", () => {
  loadObject(objectSelect.value);
});

colliderSelect.addEventListener("change", () => {
  selectCollider(colliderSelect.value);
});

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const mode = button.dataset.mode;
    transformControls.setMode(mode);
    modeButtons.forEach((candidate) => candidate.classList.toggle("active", candidate === button));
  });
});

copySelectedButton.addEventListener("click", () => {
  copyText(makeSelectedSnippet());
});

copyAllButton.addEventListener("click", () => {
  copyText(makeFullSnippet());
});

loadObject(state.objectType);
animate();

async function loadObject(objectType) {
  const definition = objectDefinitions[objectType];
  if (!definition) {
    return;
  }

  setStatus(`Loading ${definition.label}...`);
  objectSelect.value = objectType;
  clearCurrentObject();

  state.objectType = objectType;
  state.config = makeEditableConfig(objectType);

  try {
    const gltf = await loader.loadAsync(definition.modelPath);
    const model = cloneSkeletonAware(gltf.scene);
    model.name = `${definition.label}Model`;
    const root = new THREE.Group();
    root.name = `${definition.label}EditorRoot`;
    root.add(model);
    scene.add(root);

    state.root = root;
    state.model = model;

    await applyTextures(model, definition.texturePaths);
    applyObjectRootTransform(root, objectType);
    computeModelBounds();
    buildColliders(objectType);
    collectMorphTargets(model);
    populateColliderSelect();
    selectFirstCollider();
    frameCamera();
    updateConfigOutput();
    setStatus(`${definition.label} loaded. Select a collider or drag one in the viewport.`);
  } catch (error) {
    console.error(error);
    setStatus(`Could not load ${definition.label}: ${definition.modelPath}`, true);
  }
}

function clearCurrentObject() {
  transformControls.detach();
  if (state.root) {
    scene.remove(state.root);
    disposeTree(state.root);
  }
  state.root = null;
  state.model = null;
  state.colliders.clear();
  state.colliderOrder = [];
  state.selected = null;
  state.nodeObjects = [];
  state.arcHelpers.clear();
  state.morphTargets.clear();
  colliderSelect.innerHTML = "";
  propertiesEl.innerHTML = "";
  morphTargetsEl.innerHTML = "";
}

async function applyTextures(model, texturePaths) {
  try {
    const textures = await loadMaterialTextureSet(textureLoader, texturePaths);
    applyStandardInstrumentMaterials(model, textures);
  } catch (error) {
    console.warn("Could not load editor textures. Falling back to GLB materials.", error);
  }
}

function applyObjectRootTransform(root, objectType) {
  if (objectType !== "stick") {
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    root.scale.setScalar(1);
    return;
  }

  const size = STICK_SETTINGS.size || {};
  root.scale.set(
    getFiniteNumber(size.x, 1),
    getFiniteNumber(size.y, 1),
    getFiniteNumber(size.z, 1),
  );
}

function computeModelBounds() {
  state.model.updateWorldMatrix(true, true);
  state.bounds.setFromObject(state.model);
  state.bounds.getCenter(state.center);
  state.bounds.getSize(state.size);
  state.size.x = Math.max(state.size.x, 0.0001);
  state.size.y = Math.max(state.size.y, 0.0001);
  state.size.z = Math.max(state.size.z, 0.0001);
  state.maxSize = Math.max(state.size.x, state.size.y, state.size.z, 0.0001);
}

function buildColliders(objectType) {
  if (objectType === "stick") {
    buildStickCollider();
    return;
  }
  if (objectType === "honk") {
    buildHonkColliders();
    return;
  }
  buildLooperColliders();
}

function buildStickCollider() {
  const config = state.config.collider;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    makeColliderMaterial(config.color ?? 0xf7d04a, config.opacity ?? DEFAULT_OPACITY),
  );
  mesh.name = "STICK_collider";
  mesh.renderOrder = config.renderOrder ?? 32;
  mesh.userData.editor = {
    kind: "stickCollider",
    key: "collider",
    label: "Stick collider",
  };
  applyStickColliderConfig(mesh, config);
  addCollider(mesh);
}

function buildHonkColliders() {
  state.config.interactions.forEach((config, index) => {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16),
      makeColliderMaterial(config.color ?? 0xffffff, DEFAULT_OPACITY),
    );
    mesh.name = config.name;
    mesh.userData.editor = {
      kind: "honkInteraction",
      key: index,
      label: config.name,
    };
    applyHonkInteractionConfig(mesh, config);
    addCollider(mesh);
  });

  const connectionConfig = state.config.connection;
  const connection = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 16),
    makeColliderMaterial(LOOPER_DEBUG_COLORS.honkConnection, DEFAULT_OPACITY),
  );
  connection.name = "HIT_honkConnection";
  connection.userData.editor = {
    kind: "honkConnection",
    key: "connection",
    label: "Honk connection",
  };
  applyHonkConnectionConfig(connection, connectionConfig);
  addCollider(connection);
}

function buildLooperColliders() {
  const buttonGeometry = new THREE.BoxGeometry(
    state.maxSize * LOOPER_COLLIDER_GEOMETRY.buttonScale.x,
    state.maxSize * LOOPER_COLLIDER_GEOMETRY.buttonScale.y,
    state.maxSize * LOOPER_COLLIDER_GEOMETRY.buttonScale.z,
  );
  for (const action of LOOPER_BUTTON_ACTIONS) {
    const config = state.config.buttons[action];
    const mesh = new THREE.Mesh(
      buttonGeometry.clone(),
      makeColliderMaterial(LOOPER_DEBUG_COLORS.button[action], DEFAULT_OPACITY),
    );
    mesh.name = getLooperButtonName(action);
    mesh.userData.editor = {
      kind: "looperButton",
      key: action,
      label: `Button ${action}`,
    };
    applyLooperTransformConfig(mesh, config);
    addCollider(mesh);
  }

  const controlColors = {
    volume: LOOPER_DEBUG_COLORS.controlVolume,
    gap: LOOPER_DEBUG_COLORS.controlGap,
    speed: LOOPER_DEBUG_COLORS.controlSpeed,
  };
  const controlGeometry = new THREE.SphereGeometry(
    state.maxSize * LOOPER_COLLIDER_GEOMETRY.controlSphereScale,
    LOOPER_COLLIDER_GEOMETRY.controlSphereSegments,
    LOOPER_COLLIDER_GEOMETRY.controlSphereRings,
  );
  Object.entries(state.config.controls).forEach(([control, config]) => {
    const mesh = new THREE.Mesh(
      controlGeometry.clone(),
      makeColliderMaterial(controlColors[control] ?? LOOPER_DEBUG_COLORS.controlVolume, DEFAULT_OPACITY),
    );
    mesh.name = getLooperControlName(control);
    mesh.userData.editor = {
      kind: "looperControl",
      key: control,
      label: `Control ${control}`,
    };
    applyLooperTransformConfig(mesh, config);
    addCollider(mesh);
  });

  const layoutHelper = new THREE.Mesh(
    new THREE.BoxGeometry(state.maxSize * 0.045, state.maxSize * 0.045, state.maxSize * 0.045),
    makeColliderMaterial(NODE_HELPER_COLOR, 0.48),
  );
  layoutHelper.name = "LOOPER_node_layout_center";
  layoutHelper.userData.editor = {
    kind: "looperNodeLayout",
    key: "nodeLayout",
    label: "Node layout center",
  };
  applyLooperNodeLayoutConfig(layoutHelper);
  addCollider(layoutHelper);
  rebuildLooperNodes();
  updateArcHelpers();
}

function addCollider(mesh) {
  mesh.material.depthWrite = false;
  mesh.material.transparent = true;
  mesh.renderOrder = 50;
  state.root.add(mesh);
  state.colliders.set(mesh.name, mesh);
  state.colliderOrder.push(mesh.name);
}

function rebuildLooperNodes() {
  for (const node of state.nodeObjects) {
    node.removeFromParent();
    disposeTree(node);
  }
  state.nodeObjects = [];

  const layout = state.config.nodeLayout;
  const columnCount = Math.max(Math.round(getFiniteNumber(layout.columns, LOOPER_NODE_COLLIDER_LAYOUT.columns)), 1);
  const columnSpacing = getFiniteNumber(layout.columnSpacing, LOOPER_NODE_COLLIDER_LAYOUT.columnSpacing);
  const rowSpacing = getFiniteNumber(layout.rowSpacing, LOOPER_NODE_COLLIDER_LAYOUT.rowSpacing);
  const centerColumn = getFiniteNumber(layout.centerColumn, LOOPER_NODE_COLLIDER_LAYOUT.centerColumn);
  const nodeRadius = state.maxSize * getFiniteNumber(layout.sphereScale, LOOPER_NODE_COLLIDER_LAYOUT.sphereScale);
  const forwardOffset = state.maxSize *
    getFiniteNumber(layout.forwardOffsetScale, LOOPER_NODE_COLLIDER_LAYOUT.forwardOffsetScale);

  const geometry = new THREE.SphereGeometry(
    nodeRadius,
    getFiniteNumber(layout.sphereSegments, LOOPER_NODE_COLLIDER_LAYOUT.sphereSegments),
    getFiniteNumber(layout.sphereRings, LOOPER_NODE_COLLIDER_LAYOUT.sphereRings),
  );

  for (let index = 0; index < LOOPER_TRACK_COUNT; index += 1) {
    const column = index % columnCount;
    const row = Math.floor(index / columnCount);
    const columnOffset = (column - centerColumn) * columnSpacing;
    const mesh = new THREE.Mesh(
      geometry.clone(),
      makeColliderMaterial(LOOPER_DEBUG_COLORS.nodeOpen, 0.28),
    );
    mesh.name = getLooperNodeName(index);
    mesh.raycast = () => {};
    mesh.position.set(
      state.center.x + state.size.x * (layout.center.x + columnOffset),
      state.center.y + state.size.y * (layout.center.y - row * rowSpacing),
      state.center.z + state.size.z * layout.center.z + forwardOffset,
    );
    mesh.renderOrder = 45;
    state.root.add(mesh);
    state.nodeObjects.push(mesh);
  }
}

function updateArcHelpers() {
  for (const helper of state.arcHelpers.values()) {
    helper.removeFromParent();
    disposeTree(helper);
  }
  state.arcHelpers.clear();

  if (state.objectType !== "looper") {
    return;
  }

  for (const [control, config] of Object.entries(state.config.controls)) {
    if (config.movementMode !== "arc" || !config.arc) {
      continue;
    }
    const mesh = state.colliders.get(getLooperControlName(control));
    if (!mesh) {
      continue;
    }
    const helper = createLooperArcHelper(mesh, config, getControlColor(control));
    state.root.add(helper);
    state.arcHelpers.set(control, helper);
  }
}

function createLooperArcHelper(mesh, config, color) {
  const points = [];
  const arc = config.arc || {};
  const side = getFiniteNumber(arc.side, 1) < 0 ? -1 : 1;
  const radius = Math.max(state.size.x * getFiniteNumber(arc.radius, 0.18), 0.0001);
  const minAngle = getFiniteNumber(arc.minDegrees, -48) * DEG_TO_RAD;
  const maxAngle = getFiniteNumber(arc.maxDegrees, 48) * DEG_TO_RAD;
  const midpointAngle = THREE.MathUtils.lerp(minAngle, maxAngle, 0.5);
  const midpointX = -side * Math.cos(midpointAngle) * radius;
  const midpointY = Math.sin(midpointAngle) * radius;
  const rotationZ = mesh.rotation.z;
  const rotationCos = Math.cos(rotationZ);
  const rotationSin = Math.sin(rotationZ);

  for (let index = 0; index <= 48; index += 1) {
    const t = index / 48;
    const angle = THREE.MathUtils.lerp(minAngle, maxAngle, t);
    const localX = -side * Math.cos(angle) * radius - midpointX;
    const localY = Math.sin(angle) * radius - midpointY;
    points.push(
      new THREE.Vector3(
        mesh.position.x + localX * rotationCos - localY * rotationSin,
        mesh.position.y + localX * rotationSin + localY * rotationCos,
        mesh.position.z,
      ),
    );
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    depthTest: false,
  });
  const line = new THREE.Line(geometry, material);
  line.name = `DEBUG_control_arc_${mesh.name}`;
  line.raycast = () => {};
  line.renderOrder = 48;
  return line;
}

function populateColliderSelect() {
  colliderSelect.innerHTML = "";
  state.colliderOrder.forEach((name) => {
    const mesh = state.colliders.get(name);
    const option = document.createElement("option");
    option.value = name;
    option.textContent = mesh.userData.editor?.label || name;
    colliderSelect.appendChild(option);
  });
}

function selectFirstCollider() {
  const first = state.colliderOrder[0];
  if (first) {
    selectCollider(first);
  }
}

function selectCollider(name) {
  const mesh = state.colliders.get(name);
  if (!mesh) {
    return;
  }

  if (state.selected?.material) {
    state.selected.material.opacity = state.selected.userData.editorBaseOpacity ?? DEFAULT_OPACITY;
  }

  state.selected = mesh;
  mesh.userData.editorBaseOpacity = mesh.material.opacity;
  mesh.material.opacity = SELECTED_OPACITY;
  colliderSelect.value = mesh.name;
  transformControls.attach(mesh);
  buildPropertyPanel(mesh);
  updateConfigOutput();
}

function buildPropertyPanel(mesh) {
  const editor = mesh.userData.editor;
  const config = getConfigForEditor(editor);
  const grid = document.createElement("div");
  grid.className = "field-grid";
  propertiesEl.replaceChildren(grid);

  addReadOnlyField(grid, "Name", editor.label || mesh.name);
  addReadOnlyField(grid, "Kind", editor.kind);

  if (editor.kind === "stickCollider") {
    addCheckboxField(grid, "Enabled", config.enabled, (value) => {
      config.enabled = value;
      mesh.visible = value;
      updateConfigOutput();
    });
    addVectorField(grid, "Position", config.position, ["x", "y", "z"], 0.001, () => {
      applyStickColliderConfig(mesh, config);
      updateConfigOutput();
    });
    addVectorField(grid, "Rotation", config.rotationDegrees, ["x", "y", "z"], 0.1, () => {
      applyStickColliderConfig(mesh, config);
      updateConfigOutput();
    });
    addVectorField(grid, "Scale", config.scale, ["x", "y", "z"], 0.001, () => {
      applyStickColliderConfig(mesh, config);
      updateConfigOutput();
    });
    return;
  }

  if (editor.kind === "honkInteraction") {
    addReadOnlyField(grid, "Type", config.type || "");
    addVectorField(grid, "Position", config, ["x", "y", "z"], 0.001, () => {
      applyHonkInteractionConfig(mesh, config);
      updateConfigOutput();
    });
    addNumberField(grid, "Size", config.size, 0.001, (value) => {
      config.size = Math.max(value, 0.0001);
      applyHonkInteractionConfig(mesh, config);
      updateConfigOutput();
    });
    addNumberField(grid, "Move range", config.movementRange ?? 0, 0.001, (value) => {
      config.movementRange = Math.max(value, 0);
      updateConfigOutput();
    });
    return;
  }

  if (editor.kind === "honkConnection") {
    addVectorField(grid, "Position", config.position, ["x", "y", "z"], 0.001, () => {
      applyHonkConnectionConfig(mesh, config);
      updateConfigOutput();
    });
    addNumberField(grid, "Scale", config.scale, 0.001, (value) => {
      config.scale = Math.max(value, 0.0001);
      applyHonkConnectionConfig(mesh, config);
      updateConfigOutput();
    });
    return;
  }

  if (editor.kind === "looperButton") {
    addVectorField(grid, "Position", config, ["x", "y", "z"], 0.001, () => {
      applyLooperTransformConfig(mesh, config);
      updateConfigOutput();
    });
    addVectorField(grid, "Rotation", config.rotationDegrees, ["x", "y", "z"], 0.1, () => {
      applyLooperTransformConfig(mesh, config);
      updateConfigOutput();
    });
    addVectorField(grid, "Scale", config.scale, ["x", "y", "z"], 0.001, () => {
      applyLooperTransformConfig(mesh, config);
      updateConfigOutput();
    });
    addReadOnlyField(grid, "Morph", config.morphTarget || "");
    return;
  }

  if (editor.kind === "looperControl") {
    addVectorField(grid, "Position", config, ["x", "y", "z"], 0.001, () => {
      applyLooperTransformConfig(mesh, config);
      updateArcHelpers();
      updateConfigOutput();
    });
    addVectorField(grid, "Rotation", config.rotationDegrees, ["x", "y", "z"], 0.1, () => {
      applyLooperTransformConfig(mesh, config);
      updateArcHelpers();
      updateConfigOutput();
    });
    addVectorField(grid, "Scale", config.scale, ["x", "y", "z"], 0.001, () => {
      applyLooperTransformConfig(mesh, config);
      updateConfigOutput();
    });
    addNumberField(grid, "Move range", config.movementRange ?? 0.24, 0.001, (value) => {
      config.movementRange = Math.max(value, 0.0001);
      updateConfigOutput();
    });
    addNumberField(grid, "Drag sens.", config.dragSensitivity ?? 1, 0.01, (value) => {
      config.dragSensitivity = Math.max(value, 0);
      updateConfigOutput();
    });
    addCheckboxField(grid, "Arc enabled", config.movementMode === "arc", (value) => {
      setControlArcEnabled(config, value);
      updateArcHelpers();
      buildPropertyPanel(mesh);
      updateConfigOutput();
    });
    if (config.movementMode === "arc") {
      addNumberField(grid, "Arc rotation", config.rotationDegrees?.z ?? 0, 0.1, (value) => {
        config.rotationDegrees.z = value;
        applyLooperTransformConfig(mesh, config);
        updateArcHelpers();
        updatePropertyInputs();
        updateConfigOutput();
      });
      addNumberField(grid, "Arc side", config.arc?.side ?? 1, 1, (value) => {
        config.arc.side = value < 0 ? -1 : 1;
        updateArcHelpers();
        updateConfigOutput();
      });
      addNumberField(grid, "Arc radius", config.arc?.radius ?? 0.18, 0.001, (value) => {
        config.arc.radius = Math.max(value, 0.0001);
        updateArcHelpers();
        updateConfigOutput();
      });
      addNumberField(grid, "Arc start", config.arc?.minDegrees ?? -48, 0.1, (value) => {
        config.arc.minDegrees = value;
        updateArcHelpers();
        updateConfigOutput();
      });
      addNumberField(grid, "Arc end", config.arc?.maxDegrees ?? 48, 0.1, (value) => {
        config.arc.maxDegrees = value;
        updateArcHelpers();
        updateConfigOutput();
      });
    }
    addReadOnlyField(grid, "Morphs", Object.values(config.morphTargets || {}).join(", "));
    return;
  }

  if (editor.kind === "looperNodeLayout") {
    addVectorField(grid, "Center", config.center, ["x", "y", "z"], 0.001, () => {
      applyLooperNodeLayoutConfig(mesh);
      rebuildLooperNodes();
      updateConfigOutput();
    });
    addNumberField(grid, "Columns", config.columns, 1, (value) => {
      config.columns = Math.max(Math.round(value), 1);
      rebuildLooperNodes();
      updatePropertyInputs();
      updateConfigOutput();
    });
    addNumberField(grid, "Column gap", config.columnSpacing, 0.001, (value) => {
      config.columnSpacing = value;
      rebuildLooperNodes();
      updateConfigOutput();
    });
    addNumberField(grid, "Row gap", config.rowSpacing, 0.001, (value) => {
      config.rowSpacing = value;
      rebuildLooperNodes();
      updateConfigOutput();
    });
    addNumberField(grid, "Node scale", config.sphereScale, 0.001, (value) => {
      config.sphereScale = Math.max(value, 0.0001);
      rebuildLooperNodes();
      updateConfigOutput();
    });
    addNumberField(grid, "Forward", config.forwardOffsetScale, 0.001, (value) => {
      config.forwardOffsetScale = value;
      rebuildLooperNodes();
      updateConfigOutput();
    });
  }
}

function addReadOnlyField(parent, label, value) {
  const row = makeFieldRow(label);
  const display = document.createElement("div");
  display.className = "read-only-value";
  display.textContent = value;
  row.appendChild(display);
  parent.appendChild(row);
}

function addCheckboxField(parent, label, value, onChange) {
  const row = makeFieldRow(label);
  const wrap = document.createElement("div");
  wrap.className = "checkbox-row";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = Boolean(value);
  input.addEventListener("change", () => onChange(input.checked));
  wrap.appendChild(input);
  row.appendChild(wrap);
  parent.appendChild(row);
}

function addNumberField(parent, label, value, step, onInput) {
  const row = makeFieldRow(label);
  const input = document.createElement("input");
  input.type = "number";
  input.step = String(step);
  input.value = formatNumber(value);
  input.dataset.editorInput = label;
  input.addEventListener("input", () => {
    const parsed = Number.parseFloat(input.value);
    if (Number.isFinite(parsed)) {
      onInput(parsed);
    }
  });
  row.appendChild(input);
  parent.appendChild(row);
}

function addVectorField(parent, label, object, axes, step, onInput) {
  const row = makeFieldRow(label);
  const vectorRow = document.createElement("div");
  vectorRow.className = "vector-row";
  axes.forEach((axis) => {
    const input = document.createElement("input");
    input.type = "number";
    input.step = String(step);
    input.value = formatNumber(object?.[axis] ?? 0);
    input.dataset.vectorLabel = label;
    input.dataset.vectorAxis = axis;
    input.title = `${label} ${axis}`;
    input.addEventListener("input", () => {
      const parsed = Number.parseFloat(input.value);
      if (!Number.isFinite(parsed)) {
        return;
      }
      object[axis] = parsed;
      onInput();
    });
    vectorRow.appendChild(input);
  });
  row.appendChild(vectorRow);
  parent.appendChild(row);
}

function makeFieldRow(labelText) {
  const row = document.createElement("div");
  row.className = "field-row";
  const label = document.createElement("label");
  label.textContent = labelText;
  row.appendChild(label);
  return row;
}

function updatePropertyInputs() {
  if (!state.selected) {
    return;
  }

  const editor = state.selected.userData.editor;
  const config = getConfigForEditor(editor);
  const vectorInputs = propertiesEl.querySelectorAll("[data-vector-label]");
  vectorInputs.forEach((input) => {
    const label = input.dataset.vectorLabel;
    const axis = input.dataset.vectorAxis;
    const source = getVectorSourceForLabel(editor.kind, config, label);
    if (source && document.activeElement !== input) {
      input.value = formatNumber(source[axis] ?? 0);
    }
  });

  const numberInputs = propertiesEl.querySelectorAll("[data-editor-input]");
  numberInputs.forEach((input) => {
    const value = getNumberSourceForLabel(editor.kind, config, input.dataset.editorInput);
    if (Number.isFinite(value) && document.activeElement !== input) {
      input.value = formatNumber(value);
    }
  });
}

function getVectorSourceForLabel(kind, config, label) {
  if (label === "Position" && (kind === "honkInteraction" || kind === "looperButton" || kind === "looperControl")) {
    return config;
  }
  if (label === "Position") {
    return config.position;
  }
  if (label === "Rotation") {
    return config.rotationDegrees;
  }
  if (label === "Scale") {
    return config.scale;
  }
  if (label === "Center") {
    return config.center;
  }
  return null;
}

function getNumberSourceForLabel(kind, config, label) {
  if (kind === "honkInteraction" && label === "Size") {
    return config.size;
  }
  if (kind === "honkConnection" && label === "Scale") {
    return config.scale;
  }
  if (kind === "looperControl" && label === "Arc rotation") {
    return config.rotationDegrees?.z;
  }
  if (kind === "looperControl" && label === "Arc side") {
    return config.arc?.side;
  }
  if (kind === "looperControl" && label === "Arc radius") {
    return config.arc?.radius;
  }
  if (kind === "looperControl" && label === "Arc start") {
    return config.arc?.minDegrees;
  }
  if (kind === "looperControl" && label === "Arc end") {
    return config.arc?.maxDegrees;
  }
  if (kind === "looperControl" && label === "Move range") {
    return config.movementRange;
  }
  if (kind === "looperControl" && label === "Drag sens.") {
    return config.dragSensitivity;
  }
  if (kind === "looperNodeLayout" && label === "Columns") {
    return config.columns;
  }
  if (kind === "looperNodeLayout" && label === "Column gap") {
    return config.columnSpacing;
  }
  if (kind === "looperNodeLayout" && label === "Row gap") {
    return config.rowSpacing;
  }
  if (kind === "looperNodeLayout" && label === "Node scale") {
    return config.sphereScale;
  }
  if (kind === "looperNodeLayout" && label === "Forward") {
    return config.forwardOffsetScale;
  }
  return NaN;
}

function collectMorphTargets(model) {
  morphTargetsEl.innerHTML = "";
  state.morphTargets.clear();

  model.traverse((object) => {
    if (!object.isMesh || !object.morphTargetDictionary || !object.morphTargetInfluences) {
      return;
    }
    Object.entries(object.morphTargetDictionary).forEach(([name, index]) => {
      if (!state.morphTargets.has(name)) {
        state.morphTargets.set(name, []);
      }
      state.morphTargets.get(name).push({ mesh: object, index });
    });
  });

  if (state.morphTargets.size === 0) {
    const empty = document.createElement("p");
    empty.className = "morph-empty";
    empty.textContent = "No morph targets found on this model.";
    morphTargetsEl.appendChild(empty);
    return;
  }

  [...state.morphTargets.keys()].sort().forEach((name) => {
    const row = document.createElement("div");
    row.className = "morph-row";

    const label = document.createElement("label");
    label.textContent = name;

    const range = document.createElement("input");
    range.type = "range";
    range.min = "0";
    range.max = "1";
    range.step = "0.01";
    range.value = "0";
    range.title = name;

    const number = document.createElement("input");
    number.type = "number";
    number.min = "0";
    number.max = "1";
    number.step = "0.01";
    number.value = "0";

    const setMorph = (rawValue) => {
      const value = THREE.MathUtils.clamp(Number.parseFloat(rawValue) || 0, 0, 1);
      range.value = formatNumber(value, 2);
      number.value = formatNumber(value, 2);
      for (const target of state.morphTargets.get(name)) {
        target.mesh.morphTargetInfluences[target.index] = value;
      }
    };

    range.addEventListener("input", () => setMorph(range.value));
    number.addEventListener("input", () => setMorph(number.value));

    row.append(label, number);
    const sliderRow = document.createElement("div");
    sliderRow.className = "field-row";
    const spacer = document.createElement("span");
    const sliderWrap = document.createElement("div");
    sliderWrap.appendChild(range);
    sliderRow.append(spacer, sliderWrap);
    morphTargetsEl.append(row, sliderRow);
  });
}

function onPointerDown(event) {
  if (transformControls.dragging) {
    return;
  }

  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const intersections = raycaster.intersectObjects([...state.colliders.values()], false);
  if (intersections.length > 0) {
    selectCollider(intersections[0].object.name);
  }
}

function syncConfigFromObject(mesh) {
  const editor = mesh.userData.editor;
  const config = getConfigForEditor(editor);
  if (!config) {
    return;
  }

  if (editor.kind === "stickCollider") {
    config.position = vectorFromThree(mesh.position);
    config.rotationDegrees = rotationDegreesFromMesh(mesh);
    config.scale = vectorFromThree(mesh.scale);
    return;
  }

  if (editor.kind === "honkInteraction") {
    config.x = normalizedX(mesh.position.x);
    config.y = normalizedY(mesh.position.y);
    config.z = normalizedZ(mesh.position.z);
    const radius = averageAxis(mesh.scale);
    config.size = Math.max(radius / state.maxSize, 0.0001);
    mesh.scale.setScalar(config.size * state.maxSize);
    return;
  }

  if (editor.kind === "honkConnection") {
    config.position = {
      x: normalizedX(mesh.position.x),
      y: normalizedY(mesh.position.y),
      z: normalizedZ(mesh.position.z),
    };
    const radius = averageAxis(mesh.scale);
    config.scale = Math.max(radius / state.maxSize, 0.0001);
    mesh.scale.setScalar(config.scale * state.maxSize);
    return;
  }

  if (editor.kind === "looperButton" || editor.kind === "looperControl") {
    config.x = normalizedX(mesh.position.x);
    config.y = normalizedY(mesh.position.y);
    config.z = normalizedZ(mesh.position.z);
    config.rotationDegrees = rotationDegreesFromMesh(mesh);
    config.scale = vectorFromThree(mesh.scale);
    return;
  }

  if (editor.kind === "looperNodeLayout") {
    config.center = {
      x: normalizedX(mesh.position.x),
      y: normalizedY(mesh.position.y),
      z: normalizedZ(mesh.position.z),
    };
  }
}

function constrainSelectedTransform(mesh) {
  const kind = mesh.userData.editor?.kind;
  if (kind === "honkInteraction" || kind === "honkConnection") {
    mesh.scale.setScalar(Math.max(averageAxis(mesh.scale), 0.0001));
  }
  if (kind === "looperNodeLayout") {
    mesh.rotation.set(0, 0, 0);
    mesh.scale.setScalar(1);
  }
}

function applyStickColliderConfig(mesh, config) {
  mesh.visible = config.enabled !== false;
  mesh.position.set(
    getFiniteNumber(config.position?.x, 0),
    getFiniteNumber(config.position?.y, 0),
    getFiniteNumber(config.position?.z, 0),
  );
  mesh.rotation.set(
    getFiniteNumber(config.rotationDegrees?.x, 0) * DEG_TO_RAD,
    getFiniteNumber(config.rotationDegrees?.y, 0) * DEG_TO_RAD,
    getFiniteNumber(config.rotationDegrees?.z, 0) * DEG_TO_RAD,
  );
  mesh.scale.set(
    getFiniteNumber(config.scale?.x, 1),
    getFiniteNumber(config.scale?.y, 1),
    getFiniteNumber(config.scale?.z, 1),
  );
}

function applyHonkInteractionConfig(mesh, config) {
  mesh.position.set(
    state.center.x + state.size.x * getFiniteNumber(config.x, 0),
    state.center.y + state.size.y * getFiniteNumber(config.y, 0),
    state.center.z + state.size.z * getFiniteNumber(config.z, 0),
  );
  mesh.scale.setScalar(state.maxSize * Math.max(getFiniteNumber(config.size, 0.04), 0.0001));
}

function applyHonkConnectionConfig(mesh, config) {
  mesh.position.set(
    state.center.x + state.size.x * getFiniteNumber(config.position?.x, 0),
    state.center.y + state.size.y * getFiniteNumber(config.position?.y, 0),
    state.center.z + state.size.z * getFiniteNumber(config.position?.z, 0),
  );
  mesh.scale.setScalar(state.maxSize * Math.max(getFiniteNumber(config.scale, 0.04), 0.0001));
}

function applyLooperTransformConfig(mesh, config) {
  mesh.position.set(
    state.center.x + state.size.x * getFiniteNumber(config.x, 0),
    state.center.y + state.size.y * getFiniteNumber(config.y, 0),
    state.center.z + state.size.z * getFiniteNumber(config.z, 0),
  );
  mesh.rotation.set(
    getFiniteNumber(config.rotationDegrees?.x, 0) * DEG_TO_RAD,
    getFiniteNumber(config.rotationDegrees?.y, 0) * DEG_TO_RAD,
    getFiniteNumber(config.rotationDegrees?.z, 0) * DEG_TO_RAD,
  );
  mesh.scale.set(
    getFiniteNumber(config.scale?.x, 1),
    getFiniteNumber(config.scale?.y, 1),
    getFiniteNumber(config.scale?.z, 1),
  );
}

function applyLooperNodeLayoutConfig(mesh) {
  const config = state.config.nodeLayout;
  mesh.position.set(
    state.center.x + state.size.x * getFiniteNumber(config.center?.x, 0),
    state.center.y + state.size.y * getFiniteNumber(config.center?.y, 0),
    state.center.z + state.size.z * getFiniteNumber(config.center?.z, 0),
  );
  mesh.rotation.set(0, 0, 0);
  mesh.scale.setScalar(1);
}

function setControlArcEnabled(config, enabled) {
  if (!enabled) {
    delete config.movementMode;
    delete config.arc;
    return;
  }

  config.movementMode = "arc";
  config.arc = config.arc || {
    side: 1,
    radius: 0.18,
    minDegrees: -48,
    maxDegrees: 48,
  };
}

function getConfigForEditor(editor) {
  if (!editor || !state.config) {
    return null;
  }
  if (editor.kind === "stickCollider") {
    return state.config.collider;
  }
  if (editor.kind === "honkInteraction") {
    return state.config.interactions[editor.key];
  }
  if (editor.kind === "honkConnection") {
    return state.config.connection;
  }
  if (editor.kind === "looperButton") {
    return state.config.buttons[editor.key];
  }
  if (editor.kind === "looperControl") {
    return state.config.controls[editor.key];
  }
  if (editor.kind === "looperNodeLayout") {
    return state.config.nodeLayout;
  }
  return null;
}

function makeEditableConfig(objectType) {
  if (objectType === "stick") {
    return {
      collider: clonePlain(STICK_SETTINGS.collider),
    };
  }
  if (objectType === "honk") {
    return {
      interactions: clonePlain(INTERACTION_COLLIDERS),
      connection: clonePlain(HONK_CONNECTION_COLLIDER_SETTINGS),
    };
  }
  return {
    buttons: clonePlain(LOOPER_BUTTON_COLLIDERS),
    controls: clonePlain(LOOPER_CONTROL_COLLIDERS),
    nodeLayout: clonePlain(LOOPER_NODE_COLLIDER_LAYOUT),
  };
}

function updateConfigOutput() {
  configOutput.value = makeFullSnippet();
}

function makeFullSnippet() {
  if (!state.config) {
    return "";
  }
  if (state.objectType === "stick") {
    return `collider: ${formatStickCollider(state.config.collider, 0)},`;
  }
  if (state.objectType === "honk") {
    return [
      `export const INTERACTION_COLLIDERS = ${formatHonkInteractions(state.config.interactions)};`,
      "",
      `export const HONK_CONNECTION_COLLIDER_SETTINGS = ${formatHonkConnection(state.config.connection, 0)};`,
    ].join("\n");
  }
  return [
    `export const LOOPER_BUTTON_COLLIDERS = ${formatLooperButtons(state.config.buttons)};`,
    "",
    `export const LOOPER_NODE_COLLIDER_LAYOUT = ${formatLooperNodeLayout(state.config.nodeLayout, 0)};`,
    "",
    `export const LOOPER_CONTROL_COLLIDERS = ${formatLooperControls(state.config.controls)};`,
  ].join("\n");
}

function makeSelectedSnippet() {
  if (!state.selected) {
    return makeFullSnippet();
  }

  const editor = state.selected.userData.editor;
  const config = getConfigForEditor(editor);
  if (editor.kind === "stickCollider") {
    return `collider: ${formatStickCollider(config, 0)},`;
  }
  if (editor.kind === "honkInteraction") {
    return formatHonkInteraction(config, 0);
  }
  if (editor.kind === "honkConnection") {
    return `export const HONK_CONNECTION_COLLIDER_SETTINGS = ${formatHonkConnection(config, 0)};`;
  }
  if (editor.kind === "looperButton") {
    return `${editor.key}: ${formatLooperButton(editor.key, config, 0)},`;
  }
  if (editor.kind === "looperControl") {
    return `${editor.key}: ${formatLooperControl(editor.key, config, 0)},`;
  }
  if (editor.kind === "looperNodeLayout") {
    return `export const LOOPER_NODE_COLLIDER_LAYOUT = ${formatLooperNodeLayout(config, 0)};`;
  }
  return makeFullSnippet();
}

function formatStickCollider(config, level) {
  return objectBlock(level, [
    `enabled: ${Boolean(config.enabled)},`,
    `position: ${formatVec(config.position)},`,
    `rotationDegrees: ${formatVec(config.rotationDegrees)},`,
    `scale: ${formatVec(config.scale)},`,
    `color: ${formatHex(config.color ?? 0xf7d04a)},`,
    `opacity: ${num(config.opacity ?? 0.28)},`,
    `renderOrder: ${num(config.renderOrder ?? 32)},`,
  ]);
}

function formatHonkInteractions(configs) {
  const items = configs.map((config) => indent(formatHonkInteraction(config, 1), 1));
  return `[\n${items.join(",\n")},\n]`;
}

function formatHonkInteraction(config, level) {
  const lines = [
    `name: "${config.name}",`,
    `type: "${config.type}",`,
  ];
  if (config.side) {
    lines.push(`side: "${config.side}",`);
  }
  if (typeof config.invertVerticalMorph === "boolean") {
    lines.push(`invertVerticalMorph: ${config.invertVerticalMorph},`);
  }
  lines.push(
    `size: ${num(config.size)},`,
    `x: ${num(config.x)},`,
    `y: ${num(config.y)},`,
    `z: ${num(config.z)},`,
    `movementRange: ${num(config.movementRange ?? 0)},`,
    `color: ${formatHex(config.color ?? 0xffffff)},`,
  );
  return objectBlock(level, lines);
}

function formatHonkConnection(config, level) {
  return objectBlock(level, [
    `position: ${formatVec(config.position)},`,
    `scale: ${num(config.scale)},`,
    `minModelSize: ${num(config.minModelSize)},`,
    `sphereSegments: ${num(config.sphereSegments)},`,
    `sphereRings: ${num(config.sphereRings)},`,
    `renderOrder: ${num(config.renderOrder)},`,
  ]);
}

function formatLooperButtons(buttons) {
  const lines = LOOPER_BUTTON_ACTIONS.map((action) => {
    return `${action}: ${formatLooperButton(action, buttons[action], 1)},`;
  });
  return objectBlock(0, lines);
}

function formatLooperButton(action, config, level) {
  return objectBlock(level, [
    `x: ${num(config.x)},`,
    `y: ${num(config.y)},`,
    `z: ${num(config.z)},`,
    `rotationDegrees: ${formatVec(config.rotationDegrees)},`,
    `scale: ${formatVec(config.scale)},`,
    `morphTarget: LOOPER_BUTTON_MORPH_TARGETS.${action},`,
  ]);
}

function formatLooperNodeLayout(config, level) {
  return objectBlock(level, [
    `center: ${formatVec(config.center)},`,
    `columns: ${num(config.columns)},`,
    `minColumns: ${num(config.minColumns)},`,
    `centerColumn: ${num(config.centerColumn)},`,
    `columnSpacing: ${num(config.columnSpacing)},`,
    `rowSpacing: ${num(config.rowSpacing)},`,
    `sphereScale: ${num(config.sphereScale)},`,
    `sphereSegments: ${num(config.sphereSegments)},`,
    `sphereRings: ${num(config.sphereRings)},`,
    `forwardOffsetScale: ${num(config.forwardOffsetScale)},`,
  ]);
}

function formatLooperControls(controls) {
  const lines = Object.keys(controls).map((control) => {
    return `${control}: ${formatLooperControl(control, controls[control], 1)},`;
  });
  return objectBlock(0, lines);
}

function formatLooperControl(control, config, level) {
  const lines = [
    `x: ${num(config.x)},`,
    `y: ${num(config.y)},`,
    `z: ${num(config.z)},`,
    `rotationDegrees: ${formatVec(config.rotationDegrees)},`,
    `scale: ${formatVec(config.scale)},`,
  ];
  if (config.movementMode === "arc" && config.arc) {
    lines.push(
      `movementMode: "arc",`,
      `movementRange: ${num(config.movementRange ?? 0.24)},`,
      `dragSensitivity: ${num(config.dragSensitivity ?? 1)},`,
      `arc: ${objectBlock(level + 1, [
        `side: ${num(config.arc.side ?? 1)},`,
        `radius: ${num(config.arc.radius ?? 0.18)},`,
        `minDegrees: ${num(config.arc.minDegrees ?? -48)},`,
        `maxDegrees: ${num(config.arc.maxDegrees ?? 48)},`,
      ])},`,
    );
  } else {
    lines.push(
      `movementRange: ${num(config.movementRange ?? 0.24)},`,
      `dragSensitivity: ${num(config.dragSensitivity ?? 1)},`,
    );
  }
  lines.push(`morphTargets: LOOPER_CONTROL_MORPH_TARGETS.${control},`);
  return objectBlock(level, lines);
}

function objectBlock(level, lines) {
  const pad = "  ".repeat(level);
  const childPad = "  ".repeat(level + 1);
  return `{\n${lines.map((line) => `${childPad}${line}`).join("\n")}\n${pad}}`;
}

function formatVec(value = {}) {
  return `{ x: ${num(value.x ?? 0)}, y: ${num(value.y ?? 0)}, z: ${num(value.z ?? 0)} }`;
}

function indent(text, level) {
  const pad = "  ".repeat(level);
  return text.split("\n").map((line) => `${pad}${line}`).join("\n");
}

function num(value) {
  return formatNumber(value);
}

function formatNumber(value, digits = ROUND_DIGITS) {
  const normalized = Math.abs(value) < 1 / 10 ** (digits + 1) ? 0 : value;
  return Number.parseFloat(Number(normalized).toFixed(digits)).toString();
}

function formatHex(value) {
  const hex = Math.max(0, value >>> 0).toString(16).padStart(6, "0");
  return `0x${hex}`;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus("Copied config to clipboard.");
  } catch (error) {
    configOutput.value = text;
    configOutput.focus();
    configOutput.select();
    document.execCommand("copy");
    setStatus("Copied config to clipboard.");
  }
}

function frameCamera() {
  const box = new THREE.Box3().setFromObject(state.root);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);
  const radius = Math.max(size.x, size.y, size.z, 0.35) * 0.85;
  const distance = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov * 0.5));
  camera.position.set(center.x + distance * 0.45, center.y + distance * 0.35, center.z + distance * 0.85);
  camera.near = Math.max(distance / 100, 0.001);
  camera.far = Math.max(distance * 8, 10);
  camera.updateProjectionMatrix();
  orbitControls.target.copy(center);
  orbitControls.update();
  grid.position.y = box.min.y;
}

function animate() {
  orbitControls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function resize() {
  camera.aspect = getViewportAspect();
  camera.updateProjectionMatrix();
  renderer.setSize(viewport.clientWidth, viewport.clientHeight);
}

function getViewportAspect() {
  return Math.max(viewport.clientWidth, 1) / Math.max(viewport.clientHeight, 1);
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
  statusEl.classList.toggle("toast", !isError && message.startsWith("Copied"));
}

function makeColliderMaterial(color, opacity) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: true,
    wireframe: true,
  });
}

function getControlColor(control) {
  return {
    volume: LOOPER_DEBUG_COLORS.controlVolume,
    gap: LOOPER_DEBUG_COLORS.controlGap,
    speed: LOOPER_DEBUG_COLORS.controlSpeed,
  }[control] ?? LOOPER_DEBUG_COLORS.controlVolume;
}

function normalizedX(value) {
  return (value - state.center.x) / state.size.x;
}

function normalizedY(value) {
  return (value - state.center.y) / state.size.y;
}

function normalizedZ(value) {
  return (value - state.center.z) / state.size.z;
}

function vectorFromThree(value) {
  return {
    x: round(value.x),
    y: round(value.y),
    z: round(value.z),
  };
}

function rotationDegreesFromMesh(mesh) {
  return {
    x: round(mesh.rotation.x * RAD_TO_DEG),
    y: round(mesh.rotation.y * RAD_TO_DEG),
    z: round(mesh.rotation.z * RAD_TO_DEG),
  };
}

function round(value) {
  return Number(formatNumber(value));
}

function averageAxis(vector) {
  return (Math.abs(vector.x) + Math.abs(vector.y) + Math.abs(vector.z)) / 3;
}

function getFiniteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function disposeTree(root) {
  root.traverse((object) => {
    object.geometry?.dispose?.();
    if (Array.isArray(object.material)) {
      object.material.forEach((material) => material?.dispose?.());
    } else {
      object.material?.dispose?.();
    }
  });
}
