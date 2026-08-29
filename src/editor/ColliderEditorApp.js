import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { ASSET_PATHS } from "../config/assets.js";
import { applyStandardInstrumentMaterials, loadMaterialTextureSet } from "../scene/materialUtils.js";
import { MetronomeEditorAdapter } from "./MetronomeEditorAdapter.js";
import {
  CalibrationSchemaError,
  cloneMetronomeCalibration,
  colorNumberToJson,
  colorToNumber,
  createRepositoryMetronomeCalibration,
  generateMetronomeConfigJavaScript,
  METRONOME_EDITOR_AUTOSAVE_KEY,
  parseMetronomeCalibration,
  serializeMetronomeCalibration,
  validateMetronomeCalibration,
} from "./calibration/metronomeCalibrationSchema.js";

const MODEL_TEXTURE_PATHS = ASSET_PATHS.textures.metronome;
const MODEL_LOAD_KEY = "metronome-editor-model";

export class ColliderEditorApp {
  constructor() {
    this.elements = collectElements();
    this.repositoryState = createRepositoryMetronomeCalibration();
    this.state = cloneMetronomeCalibration(this.repositoryState);
    this.undoStack = [];
    this.redoStack = [];
    this.selectedId = null;
    this.selectedObject = null;
    this.hierarchyEntries = new Map();
    this.currentTransformMode = "translate";
    this.transformSnapshot = null;
    this.isTransformDragging = false;
    this.autosaveTimer = null;
    this.currentExportMode = "json";
    this.customObjectUrl = null;
    this.lastFrameSeconds = performance.now() / 1000;
    this.glbLoader = new GLTFLoader();
    this.textureLoader = new THREE.TextureLoader();
    this.modelRoot = null;
    this.modelSourceLabel = "repository GLB";

    this.setupViewport();
    this.adapter = new MetronomeEditorAdapter({ scene: this.scene });
    this.bindUI();
  }

  async initialize() {
    this.setStatus("Loading repository metronome…", "loading");
    await this.loadModel(this.state.modelPath, { sourceLabel: "repository GLB", applyTextures: true });
    this.renderAll();
    this.offerDraftRestore();
    this.animate();
    return this;
  }

  setupViewport() {
    const { viewport } = this.elements;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x090c12);
    this.scene.add(new THREE.HemisphereLight(0xdbeafe, 0x171923, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 3.2);
    key.position.set(5, 8, 6);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x8b5cf6, 1.2);
    fill.position.set(-5, 2, -4);
    this.scene.add(fill);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.tabIndex = 0;
    viewport.appendChild(this.renderer.domElement);

    this.perspectiveCamera = new THREE.PerspectiveCamera(48, 1, 0.001, 5000);
    this.perspectiveCamera.position.set(8, 6, 10);
    this.orthographicCamera = new THREE.OrthographicCamera(-5, 5, 5, -5, -5000, 5000);
    this.orthographicCamera.position.copy(this.perspectiveCamera.position);
    this.currentCamera = this.perspectiveCamera;

    this.orbit = new OrbitControls(this.currentCamera, this.renderer.domElement);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.08;
    this.orbit.screenSpacePanning = true;

    this.transform = new TransformControls(this.currentCamera, this.renderer.domElement);
    this.transform.setMode(this.currentTransformMode);
    this.transform.setSpace("local");
    this.transform.setTranslationSnap(null);
    this.scene.add(this.transform);
    this.transform.addEventListener("dragging-changed", ({ value }) => {
      this.isTransformDragging = value;
      this.orbit.enabled = !value;
    });
    this.transform.addEventListener("mouseDown", () => {
      this.transformSnapshot = cloneMetronomeCalibration(this.state);
    });
    this.transform.addEventListener("objectChange", () => {
      if (!this.selectedId) return;
      try {
        this.adapter.syncTransformToState(this.selectedId);
        this.markDirty({ autosave: false });
        this.renderInspector();
      } catch (error) {
        this.showValidationError(error.message);
      }
    });
    this.transform.addEventListener("mouseUp", () => {
      if (this.transformSnapshot && !sameState(this.transformSnapshot, this.state)) {
        this.undoStack.push(this.transformSnapshot);
        this.redoStack.length = 0;
        this.scheduleAutosave();
      }
      this.transformSnapshot = null;
      if (this.selectedId) this.rebuildAdapter(this.selectedId);
      this.updateHistoryButtons();
      this.renderValidation();
      this.updateExportText();
    });

    this.grid = new THREE.GridHelper(40, 80, 0x526071, 0x263142);
    this.scene.add(this.grid);
    this.worldAxes = new THREE.AxesHelper(4);
    this.scene.add(this.worldAxes);
    this.boundsHelper = null;
    this.selectionHelper = new THREE.BoxHelper(undefined, 0xffffff);
    this.selectionHelper.visible = false;
    this.selectionHelper.material.depthTest = false;
    this.scene.add(this.selectionHelper);
    this.localAxes = new THREE.AxesHelper(2);
    this.localAxes.matrixAutoUpdate = false;
    this.localAxes.visible = false;
    this.localAxes.traverse((object) => { object.raycast = () => {}; });
    this.scene.add(this.localAxes);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(viewport);
    this.resize();
  }

  bindUI() {
    document.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", () => this.handleAction(button.dataset.action));
    });
    this.elements.cameraMode.addEventListener("change", () => this.setCameraMode(this.elements.cameraMode.value));
    this.elements.cameraPreset.addEventListener("change", () => {
      if (this.elements.cameraPreset.value) this.setCameraPreset(this.elements.cameraPreset.value);
      this.elements.cameraPreset.value = "";
    });
    this.elements.modelDisplay.addEventListener("change", () => this.adapter.setDisplayMode(this.elements.modelDisplay.value));
    this.elements.toggleGrid.addEventListener("change", () => { this.grid.visible = this.elements.toggleGrid.checked; });
    this.elements.toggleWorldAxes.addEventListener("change", () => { this.worldAxes.visible = this.elements.toggleWorldAxes.checked; });
    this.elements.toggleBounds.addEventListener("change", () => { if (this.boundsHelper) this.boundsHelper.visible = this.elements.toggleBounds.checked; });
    this.elements.toggleLocalAxes.addEventListener("change", () => this.updateSelectionHelpers());
    this.elements.toggleColliders.addEventListener("change", () => this.adapter.setColliderVisibility(this.elements.toggleColliders.checked));
    this.elements.togglePaths.addEventListener("change", () => this.adapter.setPathVisibility(this.elements.togglePaths.checked));
    this.elements.entityFilter.addEventListener("input", () => this.renderEntityList());
    this.elements.customGlbInput.addEventListener("change", (event) => this.loadCustomGlb(event.target.files?.[0]));
    this.elements.jsonFileInput.addEventListener("change", (event) => this.importJsonFile(event.target.files?.[0]));
    this.renderer.domElement.addEventListener("pointerdown", (event) => this.selectFromViewport(event));
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("keydown", (event) => this.handleKeyboard(event));
    window.addEventListener("beforeunload", (event) => {
      if (!this.isDirty()) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

  async loadModel(path, { sourceLabel, applyTextures = false, customName = null } = {}) {
    this.setStatus(`Loading ${customName || path}…`, "loading");
    try {
      const gltf = await this.glbLoader.loadAsync(path);
      if (applyTextures) {
        try {
          const textures = await loadMaterialTextureSet(this.textureLoader, MODEL_TEXTURE_PATHS);
          applyStandardInstrumentMaterials(gltf.scene, textures, { bumpScale: 0.035 });
        } catch (textureError) {
          console.warn("Collider editor could not load the optional metronome texture set:", textureError);
          this.setStatus("Model loaded; one or more editor textures failed to load.", "warning");
        }
      }
      if (this.modelRoot) {
        this.adapter.dispose();
        this.modelRoot.removeFromParent();
        disposeModel(this.modelRoot);
      }
      this.modelRoot = gltf.scene;
      this.modelRoot.name = MODEL_LOAD_KEY;
      this.scene.add(this.modelRoot);
      this.modelSourceLabel = sourceLabel || customName || "model";
      this.adapter.load(this.modelRoot, this.state);
      this.rebuildBoundsHelper();
      this.populateNodeDatalist();
      this.renderAll();
      this.frameModel();
      const warnings = this.adapter.getMissingNodeWarnings();
      this.setStatus(
        warnings.length ? `Loaded with ${warnings.length} missing-node warning${warnings.length === 1 ? "" : "s"}.` : "Metronome calibration model loaded.",
        warnings.length ? "warning" : "success",
      );
      setTimeout(() => this.elements.viewportStatus.classList.add("hidden"), 2600);
    } catch (error) {
      console.error(error);
      this.setStatus(`Could not load model: ${error.message}`, "error");
      throw error;
    }
  }

  async loadCustomGlb(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".glb")) {
      this.setStatus("Choose a binary .glb file.", "error");
      return;
    }
    if (this.customObjectUrl) URL.revokeObjectURL(this.customObjectUrl);
    this.customObjectUrl = URL.createObjectURL(file);
    const previousMetadata = { modelPath: this.state.modelPath, modelFileName: this.state.modelFileName };
    this.commitMutation(() => {
      this.state.modelPath = null;
      this.state.modelFileName = file.name;
    }, { rebuild: false });
    try {
      await this.loadModel(this.customObjectUrl, { sourceLabel: `local GLB: ${file.name}`, customName: file.name });
    } catch {
      this.state.modelPath = previousMetadata.modelPath;
      this.state.modelFileName = previousMetadata.modelFileName;
    } finally {
      URL.revokeObjectURL(this.customObjectUrl);
      this.customObjectUrl = null;
      this.elements.customGlbInput.value = "";
    }
  }

  renderAll() {
    this.renderEntityList();
    this.renderInspector();
    this.renderValidation();
    this.updateExportText();
    this.updateHistoryButtons();
    this.updateDirtyIndicator();
    this.elements.viewLabel.textContent = `${this.elements.cameraMode.value === "orthographic" ? "Orthographic" : "Perspective"} · ${this.modelSourceLabel}`;
  }

  renderEntityList() {
    const filter = this.elements.entityFilter.value.trim().toLowerCase();
    const container = this.elements.entityList;
    container.replaceChildren();
    const entities = [...this.adapter.entities.values()];
    this.hierarchyEntries = new Map(this.adapter.getHierarchyEntries().map((entry) => [entry.id, entry]));
    const entries = [
      ...entities.map((entity) => ({ ...entity, group: "Calibration" })),
      ...this.hierarchyEntries.values().map((entry) => ({ ...entry, group: "GLB hierarchy" })),
    ];
    let lastGroup = null;
    for (const entry of entries) {
      const haystack = `${entry.label} ${entry.detail || ""} ${entry.group}`.toLowerCase();
      if (filter && !haystack.includes(filter)) continue;
      if (entry.group !== lastGroup) {
        const heading = document.createElement("div");
        heading.className = "pill";
        heading.style.gridColumn = "1 / -1";
        heading.textContent = entry.group;
        container.appendChild(heading);
        lastGroup = entry.group;
      }
      const button = document.createElement("button");
      button.className = `entity-button${entry.missing ? " missing" : ""}${this.selectedId === entry.id ? " selected" : ""}`;
      button.style.paddingLeft = `${7 + (entry.depth || 0) * 8}px`;
      button.innerHTML = `<strong>${escapeHtml(entry.label)}</strong><span>${escapeHtml(entry.detail || entry.type)}</span>`;
      button.addEventListener("click", () => this.selectEntry(entry));
      container.appendChild(button);
    }
  }

  selectEntry(entry) {
    this.selectedId = entry.id;
    this.selectedObject = entry.object || null;
    const entity = this.adapter.entities.get(entry.id);
    this.transform.detach();
    if (entity?.transformable && entity.object) {
      const allowed = entity.transformModes || ["translate", "rotate", "scale"];
      if (!allowed.includes(this.currentTransformMode)) this.setTransformMode(allowed[0]);
      this.transform.attach(entity.object);
    }
    this.updateSelectionHelpers();
    this.renderEntityList();
    this.renderInspector();
  }

  selectFromViewport(event) {
    if (this.isTransformDragging || event.button !== 0) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.currentCamera);
    const intersections = this.raycaster.intersectObjects(this.adapter.pickables, true);
    for (const hit of intersections) {
      let object = hit.object;
      while (object && !object.userData.editorEntityId) object = object.parent;
      if (!object) continue;
      const entity = this.adapter.entities.get(object.userData.editorEntityId);
      if (entity) this.selectEntry(entity);
      return;
    }
  }

  renderInspector() {
    const container = this.elements.inspectorContent;
    container.replaceChildren();
    const entity = this.adapter.entities.get(this.selectedId);
    const hierarchy = this.hierarchyEntries.get(this.selectedId);
    if (!entity && hierarchy) {
      this.elements.inspectorTitle.textContent = hierarchy.label;
      this.elements.selectionKind.textContent = "GLB node · read only";
      const group = createGroup("Imported node transform");
      group.append(diagnosticBlock({
        type: hierarchy.object.type,
        position: formatVector(hierarchy.object.position),
        scale: formatVector(hierarchy.object.scale),
      }));
      container.append(group);
      return;
    }
    if (!entity) {
      this.elements.inspectorTitle.textContent = "Inspector";
      this.elements.selectionKind.textContent = "Nothing selected";
      container.textContent = "Select a collider or mechanism from the list or viewport.";
      return;
    }
    this.elements.inspectorTitle.textContent = entity.label;
    this.elements.selectionKind.textContent = `${entity.type}${entity.missing ? " · warning" : ""}`;
    const renderer = this[`render${capitalize(entity.type)}Inspector`];
    if (renderer) renderer.call(this, container, entity);
  }

  renderSettingsInspector(container) {
    const settings = this.state.metronome.settings;
    const group = createGroup("Repository source");
    group.append(readonlyField("Model", this.state.modelPath || `Local file: ${this.state.modelFileName}`));
    group.append(this.numberField("Spawn yaw (degrees)", settings, "spawnYawDegrees", { step: 0.1, entityId: "settings" }));
    container.append(group);
  }

  renderBodyInspector(container) {
    const config = this.state.metronome.bodyCollider;
    const group = createGroup("Bounds-normalized body box");
    group.append(this.vectorField("Position", config.position, { step: 0.001, entityId: "body" }));
    group.append(this.vectorField("XYZ scale", config.scale, { step: 0.001, entityId: "body" }));
    group.append(diagnosticBlock(this.adapter.getDiagnostics("body")));
    container.append(group);
  }

  renderPortInspector(container, entity) {
    const config = this.state.metronome.connectionPorts[entity.index];
    const identity = createGroup("Connection-port identity");
    identity.append(this.textField("portId", config, "portId", { entityId: entity.id }));
    identity.append(this.textField("Name", config, "name", { entityId: entity.id }));
    container.append(identity);

    const transform = createGroup("Bounds-normalized sphere");
    transform.append(this.vectorField("Position", config.position, { step: 0.001, entityId: entity.id }));
    transform.append(this.numberField("Collider scale", config, "colliderScale", { step: 0.001, entityId: entity.id }));
    transform.append(this.colorField("Collider color", config, "colliderColor", { entityId: entity.id }));
    transform.append(diagnosticBlock(this.adapter.getDiagnostics(entity.id)));
    container.append(transform);

    const socket = createGroup("Socket direction");
    socket.append(this.vectorField("Direction", config.socketDirection, { step: 0.001, entityId: entity.id }));
    const presets = document.createElement("div");
    presets.className = "button-row";
    for (const [label, vector] of Object.entries({
      "+X": { x: 1, y: 0, z: 0 }, "−X": { x: -1, y: 0, z: 0 },
      "+Y": { x: 0, y: 1, z: 0 }, "−Y": { x: 0, y: -1, z: 0 },
      "+Z": { x: 0, y: 0, z: 1 }, "−Z": { x: 0, y: 0, z: -1 },
    })) {
      const button = document.createElement("button");
      button.textContent = label;
      button.addEventListener("click", () => this.commitMutation(() => Object.assign(config.socketDirection, vector), { selectId: entity.id }));
      presets.append(button);
    }
    socket.append(presets);
    container.append(socket);
  }

  renderHandleInspector(container, entity) {
    const config = this.state.metronome.handleControls[entity.index];
    if (entity.missing) container.append(messageElement(entity.detail, "warning"));
    const binding = createGroup("GLB binding");
    binding.append(this.nodeNameField("Node name", config, "nodeName", { entityId: entity.id }));
    binding.append(this.textField("Parameter", config, "parameter", { entityId: entity.id }));
    binding.append(this.checkboxField("Invert drag", config, "invertDrag", { entityId: entity.id }));
    container.append(binding);

    const movement = createGroup("Runtime movement math");
    movement.append(this.vectorField("Axis", config.axis, { step: 0.001, entityId: entity.id }));
    movement.append(this.numberField("Minimum angle", config, "minAngleDegrees", { step: 0.1, entityId: entity.id }));
    movement.append(this.numberField("Maximum angle", config, "maxAngleDegrees", { step: 0.1, entityId: entity.id }));
    movement.append(this.numberField("Reference angle", config, "referenceAngleDegrees", { step: 0.1, entityId: entity.id }));
    movement.append(this.vectorField("Collider offset", config.colliderOffset, { step: 0.001, entityId: entity.id }));
    movement.append(this.numberField("Collider radius", config, "colliderRadius", { step: 0.001, entityId: entity.id }));
    container.append(movement);

    const colors = createGroup("Debug colors");
    for (const [label, field] of [["Collider", "colliderColor"], ["Pivot", "pivotColor"], ["Plane", "planeColor"], ["Arc", "arcColor"]]) {
      colors.append(this.colorField(label, config, field, { entityId: entity.id }));
    }
    container.append(colors);

    const preview = createGroup("Movement preview");
    const settings = this.state.metronome.settings;
    const [minimum, maximum, step] = config.parameter === "bpm"
      ? [settings.minBpm, settings.maxBpm, 1]
      : [settings.minVolume, settings.maxVolume, 0.01];
    const slider = rangeField(
      `${config.parameter.toUpperCase()} value`,
      entity.previewValue ?? (config.parameter === "bpm" ? settings.defaultBpm : settings.defaultVolume),
      minimum,
      maximum,
      step,
      (value) => {
        this.adapter.setHandlePreview(entity.id, value);
        this.renderInspector();
      },
    );
    preview.append(slider);
    preview.append(loopField("Loop full range", this.adapter.handleLoops.has(entity.id), (enabled) => this.adapter.setHandleLoop(entity.id, enabled)));
    preview.append(diagnosticBlock(this.adapter.getDiagnostics(entity.id)));
    container.append(preview);
  }

  renderPendulumInspector(container, entity) {
    const config = this.state.metronome.pendulum;
    if (entity.missing) container.append(messageElement(entity.detail, "warning"));
    const group = createGroup("Pendulum mechanism");
    group.append(this.nodeNameField("Node name", config, "nodeName", { entityId: entity.id }));
    group.append(this.vectorField("Model-local axis", config.modelLocalAxis, { step: 0.001, entityId: entity.id }));
    group.append(this.numberField("Swing degrees", config, "swingDegrees", { step: 0.1, entityId: entity.id }));
    container.append(group);

    const preview = createGroup("Swing preview");
    preview.append(rangeField("Normalized amount", this.adapter.pendulumPreview, -1, 1, 0.01, (value) => {
      this.adapter.setPendulumPreview(value);
      this.renderInspector();
    }));
    preview.append(rangeField("Angle (degrees)", this.adapter.pendulumPreview * Math.abs(config.swingDegrees), -Math.abs(config.swingDegrees), Math.abs(config.swingDegrees), 0.1, (degrees) => {
      this.adapter.setPendulumPreview(config.swingDegrees ? degrees / Math.abs(config.swingDegrees) : 0);
      this.renderInspector();
    }));
    preview.append(loopField("Loop swing", this.adapter.pendulumLoop, (enabled) => this.adapter.setPendulumLoop(enabled)));
    preview.append(diagnosticBlock(this.adapter.getDiagnostics(entity.id)));
    container.append(preview);
  }

  renderEyeInspector(container, entity) {
    const config = this.state.metronome.eyeControls[entity.index];
    if (entity.missing) container.append(messageElement(
      `${entity.detail}. No fallback is bound. Choose a corrected node explicitly after re-exporting the GLB.`,
      "warning",
    ));
    const group = createGroup("Eye/button configuration");
    group.append(this.nodeNameField("Node name", config, "nodeName", { entityId: entity.id }));
    group.append(this.textField("Action", config, "action", { entityId: entity.id }));
    group.append(this.checkboxField("Latching", config, "latching", { entityId: entity.id }));
    group.append(this.vectorField("Pressed offset", config.pressedOffset, { step: 0.001, entityId: entity.id }));
    group.append(this.nullableNumberField("Release delay ms", config, "releaseDelayMs", { step: 1, entityId: entity.id }));
    group.append(this.numberField("Collider scale", config, "colliderScale", { step: 0.001, entityId: entity.id }));
    group.append(this.colorField("Collider color", config, "colliderColor", { entityId: entity.id }));
    container.append(group);

    const preview = createGroup("Press preview");
    preview.append(rangeField("Press amount", entity.previewAmount || 0, 0, 1, 0.01, (amount) => {
      this.adapter.applyEyePreview(entity.id, amount);
      this.renderInspector();
    }));
    container.append(preview);
  }

  textField(label, object, key, { entityId }) {
    const input = document.createElement("input");
    input.type = "text";
    input.value = object[key] ?? "";
    input.addEventListener("change", () => this.commitMutation(() => { object[key] = input.value; }, { selectId: entityId }));
    return fieldRow(label, input);
  }

  nodeNameField(label, object, key, options) {
    const row = this.textField(label, object, key, options);
    row.querySelector("input").setAttribute("list", "model-node-names");
    return row;
  }

  numberField(label, object, key, { step = 0.001, entityId }) {
    const input = document.createElement("input");
    input.type = "number";
    input.step = String(step);
    input.value = String(object[key]);
    input.addEventListener("change", () => {
      const value = Number(input.value);
      if (!Number.isFinite(value)) return this.showValidationError(`${label} must be finite.`);
      this.commitMutation(() => { object[key] = value; }, { selectId: entityId });
    });
    return fieldRow(label, input);
  }

  nullableNumberField(label, object, key, { step = 1, entityId }) {
    const input = document.createElement("input");
    input.type = "number";
    input.step = String(step);
    input.placeholder = "null";
    input.value = object[key] === null ? "" : String(object[key]);
    input.addEventListener("change", () => {
      const value = input.value.trim() === "" ? null : Number(input.value);
      if (value !== null && !Number.isFinite(value)) return this.showValidationError(`${label} must be finite or empty.`);
      this.commitMutation(() => { object[key] = value; }, { selectId: entityId });
    });
    return fieldRow(label, input);
  }

  vectorField(label, vector, { step = 0.001, entityId }) {
    const wrapper = document.createElement("div");
    wrapper.className = "vector-inputs";
    for (const axis of ["x", "y", "z"]) {
      const axisLabel = document.createElement("label");
      const name = document.createElement("span");
      name.textContent = axis;
      const input = document.createElement("input");
      input.type = "number";
      input.step = String(step);
      input.value = String(vector[axis]);
      input.addEventListener("change", () => {
        const value = Number(input.value);
        if (!Number.isFinite(value)) return this.showValidationError(`${label}.${axis} must be finite.`);
        this.commitMutation(() => { vector[axis] = value; }, { selectId: entityId });
      });
      axisLabel.append(name, input);
      wrapper.append(axisLabel);
    }
    return fieldRow(label, wrapper);
  }

  colorField(label, object, key, { entityId }) {
    const wrapper = document.createElement("div");
    wrapper.className = "button-row";
    const picker = document.createElement("input");
    picker.type = "color";
    picker.value = colorNumberToJson(object[key]);
    const text = document.createElement("input");
    text.type = "text";
    text.value = `0x${colorToNumber(object[key]).toString(16).padStart(6, "0")}`;
    text.style.width = "105px";
    const apply = (raw) => {
      try {
        const value = colorToNumber(raw);
        this.commitMutation(() => { object[key] = value; }, { selectId: entityId });
      } catch (error) {
        this.showValidationError(error.message);
      }
    };
    picker.addEventListener("change", () => apply(picker.value));
    text.addEventListener("change", () => apply(text.value));
    wrapper.append(picker, text);
    return fieldRow(label, wrapper);
  }

  checkboxField(label, object, key, { entityId }) {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = Boolean(object[key]);
    input.addEventListener("change", () => this.commitMutation(() => { object[key] = input.checked; }, { selectId: entityId }));
    return fieldRow(label, input, "checkbox-field");
  }

  commitMutation(mutator, { selectId = this.selectedId, rebuild = true } = {}) {
    const before = cloneMetronomeCalibration(this.state);
    mutator();
    if (sameState(before, this.state)) return;
    this.undoStack.push(before);
    this.redoStack.length = 0;
    if (rebuild) this.rebuildAdapter(selectId);
    this.markDirty();
    this.renderAll();
  }

  rebuildAdapter(selectId = this.selectedId) {
    this.transform.detach();
    this.adapter.setState(this.state);
    this.rebuildBoundsHelper();
    const entity = this.adapter.entities.get(selectId);
    if (entity) this.selectEntry(entity);
    else {
      this.selectedId = null;
      this.selectedObject = null;
      this.updateSelectionHelpers();
    }
  }

  undo() {
    const previous = this.undoStack.pop();
    if (!previous) return;
    this.redoStack.push(cloneMetronomeCalibration(this.state));
    this.state = previous;
    this.rebuildAdapter();
    this.markDirty();
    this.renderAll();
  }

  redo() {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(cloneMetronomeCalibration(this.state));
    this.state = next;
    this.rebuildAdapter();
    this.markDirty();
    this.renderAll();
  }

  resetSelected() {
    const entity = this.adapter.entities.get(this.selectedId);
    if (!entity) return;
    this.commitMutation(() => {
      const source = this.repositoryState.metronome;
      const target = this.state.metronome;
      if (entity.type === "settings") target.settings = cloneMetronomeCalibration(source.settings);
      if (entity.type === "body") target.bodyCollider = cloneMetronomeCalibration(source.bodyCollider);
      if (entity.type === "port") target.connectionPorts[entity.index] = cloneMetronomeCalibration(source.connectionPorts[entity.index]);
      if (entity.type === "handle") target.handleControls[entity.index] = cloneMetronomeCalibration(source.handleControls[entity.index]);
      if (entity.type === "eye") target.eyeControls[entity.index] = cloneMetronomeCalibration(source.eyeControls[entity.index]);
      if (entity.type === "pendulum") target.pendulum = cloneMetronomeCalibration(source.pendulum);
    }, { selectId: this.selectedId });
  }

  async resetAll() {
    const before = cloneMetronomeCalibration(this.state);
    this.undoStack.push(before);
    this.redoStack.length = 0;
    this.state = cloneMetronomeCalibration(this.repositoryState);
    localStorage.removeItem(METRONOME_EDITOR_AUTOSAVE_KEY);
    await this.loadModel(this.state.modelPath, { sourceLabel: "repository GLB", applyTextures: true });
    this.selectedId = null;
    this.updateDirtyIndicator();
    this.renderAll();
  }

  handleAction(action) {
    const actions = {
      translate: () => this.setTransformMode("translate"),
      rotate: () => this.setTransformMode("rotate"),
      scale: () => this.setTransformMode("scale"),
      undo: () => this.undo(),
      redo: () => this.redo(),
      "reset-selected": () => this.resetSelected(),
      "reset-all": () => this.resetAll(),
      "frame-selected": () => this.frameSelected(),
      "frame-all": () => this.frameModel(),
      "copy-json": () => this.copyJson(),
      "download-json": () => this.downloadJson(),
      "copy-javascript": () => this.copyJavaScript(),
      "apply-pasted-json": () => this.importJsonText(this.elements.exportText.value),
      "show-json": () => { this.currentExportMode = "json"; this.updateExportText(); },
      "show-javascript": () => { this.currentExportMode = "javascript"; this.updateExportText(); },
      "discard-draft": () => this.discardDraft(),
    };
    actions[action]?.();
  }

  handleKeyboard(event) {
    if (isTypingTarget(event.target)) return;
    if (event.metaKey || event.ctrlKey) {
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? this.redo() : this.undo();
      }
      return;
    }
    const key = event.key.toLowerCase();
    if (key === "w") this.setTransformMode("translate");
    if (key === "e") this.setTransformMode("rotate");
    if (key === "r") this.setTransformMode("scale");
    if (key === "f") this.frameSelected();
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      this.setStatus("Required runtime colliders cannot be deleted in this calibration editor.", "warning");
    }
  }

  setTransformMode(mode) {
    this.currentTransformMode = mode;
    this.transform.setMode(mode);
    document.querySelectorAll("[data-action='translate'], [data-action='rotate'], [data-action='scale']")
      .forEach((button) => button.classList.toggle("active", button.dataset.action === mode));
    const entity = this.adapter.entities.get(this.selectedId);
    if (entity?.transformable && entity.transformModes && !entity.transformModes.includes(mode)) {
      this.transform.detach();
      this.setStatus(`${entity.label} does not expose ${mode} calibration. Use its numeric inspector fields.`, "warning");
    } else if (entity?.transformable) {
      this.transform.attach(entity.object);
    }
  }

  setCameraMode(mode) {
    const previousPosition = this.currentCamera.position.clone();
    this.currentCamera = mode === "orthographic" ? this.orthographicCamera : this.perspectiveCamera;
    this.currentCamera.position.copy(previousPosition);
    this.currentCamera.lookAt(this.orbit.target);
    this.orbit.object = this.currentCamera;
    this.transform.camera = this.currentCamera;
    this.resize();
    this.renderAll();
  }

  setCameraPreset(preset) {
    const box = this.adapter.bounds;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const distance = Math.max(size.length() * 1.5, 2);
    const directions = {
      front: [0, 0, 1], rear: [0, 0, -1], left: [-1, 0, 0], right: [1, 0, 0],
      top: [0, 1, 0], bottom: [0, -1, 0],
    };
    const direction = new THREE.Vector3(...directions[preset]);
    this.currentCamera.position.copy(center).addScaledVector(direction, distance);
    this.currentCamera.up.set(0, Math.abs(direction.y) > 0.9 ? 0 : 1, Math.abs(direction.y) > 0.9 ? -1 : 0);
    this.orbit.target.copy(center);
    this.currentCamera.lookAt(center);
    this.orbit.update();
  }

  frameSelected() {
    const object = this.selectedObject || this.adapter.entities.get(this.selectedId)?.object;
    this.frameBox(object ? new THREE.Box3().setFromObject(object) : this.adapter.bounds);
  }

  frameModel() {
    this.frameBox(this.adapter.bounds);
  }

  frameBox(box) {
    if (!box || box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() * 0.5, 0.1);
    const direction = this.currentCamera.position.clone().sub(this.orbit.target).normalize();
    if (direction.lengthSq() < 1e-8) direction.set(1, 0.7, 1).normalize();
    if (this.currentCamera.isPerspectiveCamera) {
      const distance = radius / Math.tan(THREE.MathUtils.degToRad(this.currentCamera.fov * 0.5)) * 1.35;
      this.currentCamera.position.copy(center).addScaledVector(direction, distance);
      this.currentCamera.near = Math.max(distance / 1000, 0.001);
      this.currentCamera.far = Math.max(distance * 100, 100);
    } else {
      this.currentCamera.position.copy(center).addScaledVector(direction, radius * 4);
      this.currentCamera.zoom = Math.max(0.1, 4 / radius);
    }
    this.orbit.target.copy(center);
    this.currentCamera.lookAt(center);
    this.currentCamera.updateProjectionMatrix();
    this.orbit.update();
  }

  rebuildBoundsHelper() {
    this.boundsHelper?.removeFromParent();
    this.boundsHelper?.geometry?.dispose?.();
    this.boundsHelper?.material?.dispose?.();
    this.boundsHelper = new THREE.Box3Helper(this.adapter.bounds.clone(), 0x5ac8fa);
    this.boundsHelper.visible = this.elements.toggleBounds.checked;
    this.boundsHelper.raycast = () => {};
    this.scene.add(this.boundsHelper);
  }

  updateSelectionHelpers() {
    if (this.selectedObject) {
      this.selectionHelper.setFromObject(this.selectedObject);
      this.selectionHelper.visible = true;
      if (this.elements.toggleLocalAxes.checked) {
        this.selectedObject.updateWorldMatrix(true, false);
        this.localAxes.matrix.copy(this.selectedObject.matrixWorld);
        this.localAxes.visible = true;
      } else this.localAxes.visible = false;
    } else {
      this.selectionHelper.visible = false;
      this.localAxes.visible = false;
    }
  }

  renderValidation() {
    const container = this.elements.validationMessages;
    container.replaceChildren();
    try {
      const { warnings } = validateMetronomeCalibration(this.state, { nodeNames: this.adapter.nodeNames });
      for (const warning of warnings) container.append(messageElement(warning, "warning"));
      if (!warnings.length) container.append(messageElement("Configuration is exportable.", "success"));
    } catch (error) {
      for (const message of error.errors || [error.message]) container.append(messageElement(message, "error"));
    }
  }

  showValidationError(message) {
    this.setStatus(message, "error");
    this.elements.validationMessages.prepend(messageElement(message, "error"));
  }

  updateExportText() {
    try {
      this.elements.exportText.value = this.currentExportMode === "javascript"
        ? generateMetronomeConfigJavaScript(this.state, { nodeNames: this.adapter.nodeNames })
        : serializeMetronomeCalibration(this.state, { nodeNames: this.adapter.nodeNames });
    } catch (error) {
      this.elements.exportText.value = `Export blocked by validation:\n${error.message}`;
    }
  }

  async copyJson() {
    try {
      const text = serializeMetronomeCalibration(this.state, { nodeNames: this.adapter.nodeNames });
      this.currentExportMode = "json";
      this.elements.exportText.value = text;
      await copyText(text);
      this.setStatus("Calibration JSON copied.", "success");
    } catch (error) { this.showValidationError(error.message); }
  }

  async copyJavaScript() {
    try {
      const text = generateMetronomeConfigJavaScript(this.state, { nodeNames: this.adapter.nodeNames });
      this.currentExportMode = "javascript";
      this.elements.exportText.value = text;
      await copyText(text);
      this.setStatus("Paste-ready JavaScript copied.", "success");
    } catch (error) { this.showValidationError(error.message); }
  }

  downloadJson() {
    try {
      const text = serializeMetronomeCalibration(this.state, { nodeNames: this.adapter.nodeNames });
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "metronome-calibration.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) { this.showValidationError(error.message); }
  }

  async importJsonFile(file) {
    if (!file) return;
    try {
      await this.importJsonText(await file.text());
    } finally {
      this.elements.jsonFileInput.value = "";
    }
  }

  async importJsonText(text) {
    try {
      const imported = parseMetronomeCalibration(text, { nodeNames: this.adapter.nodeNames });
      const before = cloneMetronomeCalibration(this.state);
      this.state = imported;
      this.undoStack.push(before);
      this.redoStack.length = 0;
      if (this.state.modelPath && this.state.modelPath !== this.repositoryState.modelPath) {
        await this.loadModel(this.state.modelPath, { sourceLabel: "imported repository path", applyTextures: false });
      } else {
        this.rebuildAdapter();
      }
      this.markDirty();
      this.renderAll();
      this.setStatus("Calibration JSON imported without applying it to runtime configuration.", "success");
    } catch (error) {
      const message = error instanceof CalibrationSchemaError ? error.errors.join(" · ") : error.message;
      this.showValidationError(message);
    }
  }

  offerDraftRestore() {
    const draft = localStorage.getItem(METRONOME_EDITOR_AUTOSAVE_KEY);
    if (!draft) return;
    const dialog = this.elements.draftDialog;
    dialog.addEventListener("close", () => {
      if (dialog.returnValue === "restore") this.restoreDraft(draft);
      else this.discardDraft();
    }, { once: true });
    dialog.showModal();
  }

  restoreDraft(text) {
    try {
      const draft = JSON.parse(text);
      if (draft?.schemaVersion !== this.repositoryState.schemaVersion || !draft.metronome) {
        throw new TypeError("Draft schema is not recognized.");
      }
      this.state = draft;
      this.undoStack.length = 0;
      this.redoStack.length = 0;
      this.rebuildAdapter();
      this.renderAll();
      this.setStatus("Editor draft restored. Repository configuration remains unchanged.", "success");
    } catch (error) {
      this.showValidationError(`Could not restore draft: ${error.message}`);
    }
  }

  discardDraft() {
    localStorage.removeItem(METRONOME_EDITOR_AUTOSAVE_KEY);
    this.setStatus("Collider-editor draft discarded. Production scene storage was not touched.", "success");
  }

  markDirty({ autosave = true } = {}) {
    this.updateDirtyIndicator();
    if (autosave) this.scheduleAutosave();
  }

  scheduleAutosave() {
    clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => {
      localStorage.setItem(METRONOME_EDITOR_AUTOSAVE_KEY, JSON.stringify(this.state));
      this.updateDirtyIndicator("Draft autosaved");
    }, 250);
  }

  isDirty() {
    return !sameState(this.state, this.repositoryState);
  }

  updateDirtyIndicator(message = null) {
    const dirty = this.isDirty();
    this.elements.dirtyIndicator.classList.toggle("dirty", dirty);
    this.elements.dirtyIndicator.textContent = message || (dirty ? "Unsaved calibration draft" : "Repository configuration");
  }

  updateHistoryButtons() {
    document.querySelector("[data-action='undo']").disabled = this.undoStack.length === 0;
    document.querySelector("[data-action='redo']").disabled = this.redoStack.length === 0;
    document.querySelector("[data-action='reset-selected']").disabled = !this.adapter.entities.has(this.selectedId);
  }

  populateNodeDatalist() {
    this.elements.nodeDatalist.replaceChildren(...this.adapter.nodeNames.map((name) => {
      const option = document.createElement("option");
      option.value = name;
      return option;
    }));
  }

  resize() {
    const { width, height } = this.elements.viewport.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.perspectiveCamera.aspect = width / height;
    this.perspectiveCamera.updateProjectionMatrix();
    const halfHeight = 5;
    this.orthographicCamera.left = -halfHeight * width / height;
    this.orthographicCamera.right = halfHeight * width / height;
    this.orthographicCamera.top = halfHeight;
    this.orthographicCamera.bottom = -halfHeight;
    this.orthographicCamera.updateProjectionMatrix();
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const nowSeconds = performance.now() / 1000;
    this.lastFrameSeconds = nowSeconds;
    this.adapter.update(nowSeconds);
    this.orbit.update();
    this.updateSelectionHelpers();
    this.renderer.render(this.scene, this.currentCamera);
  }

  setStatus(message, level = "loading") {
    this.elements.viewportStatus.textContent = message;
    this.elements.viewportStatus.dataset.level = level;
    this.elements.viewportStatus.classList.remove("hidden");
  }
}

function collectElements() {
  return {
    viewport: document.querySelector("#viewport"),
    viewportStatus: document.querySelector("#viewport-status"),
    viewLabel: document.querySelector("#view-cube-label"),
    dirtyIndicator: document.querySelector("#dirty-indicator"),
    entityList: document.querySelector("#entity-list"),
    entityFilter: document.querySelector("#entity-filter"),
    inspectorTitle: document.querySelector("#inspector-title"),
    selectionKind: document.querySelector("#selection-kind"),
    inspectorContent: document.querySelector("#inspector-content"),
    validationMessages: document.querySelector("#validation-messages"),
    exportText: document.querySelector("#export-text"),
    cameraMode: document.querySelector("#camera-mode"),
    cameraPreset: document.querySelector("#camera-preset"),
    modelDisplay: document.querySelector("#model-display"),
    toggleGrid: document.querySelector("#toggle-grid"),
    toggleWorldAxes: document.querySelector("#toggle-world-axes"),
    toggleBounds: document.querySelector("#toggle-bounds"),
    toggleLocalAxes: document.querySelector("#toggle-local-axes"),
    toggleColliders: document.querySelector("#toggle-colliders"),
    togglePaths: document.querySelector("#toggle-paths"),
    customGlbInput: document.querySelector("#custom-glb-input"),
    jsonFileInput: document.querySelector("#json-file-input"),
    draftDialog: document.querySelector("#draft-dialog"),
    nodeDatalist: document.querySelector("#model-node-names"),
  };
}

function createGroup(title) {
  const group = document.createElement("section");
  group.className = "field-group";
  const heading = document.createElement("h3");
  heading.textContent = title;
  group.append(heading);
  return group;
}

function fieldRow(label, control, extraClass = "") {
  const row = document.createElement("label");
  row.className = `field ${extraClass}`;
  const name = document.createElement("span");
  name.textContent = label;
  row.append(name, control);
  return row;
}

function readonlyField(label, value) {
  const output = document.createElement("div");
  output.className = "diagnostic";
  output.textContent = value;
  return fieldRow(label, output);
}

function rangeField(label, value, min, max, step, onInput) {
  const wrapper = document.createElement("div");
  wrapper.style.display = "grid";
  wrapper.style.gridTemplateColumns = "1fr 64px";
  wrapper.style.gap = "5px";
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = String(min);
  slider.max = String(max);
  slider.step = String(step);
  slider.value = String(value);
  const output = document.createElement("output");
  output.textContent = formatNumber(value);
  slider.addEventListener("input", () => {
    const next = Number(slider.value);
    output.textContent = formatNumber(next);
    onInput(next);
  });
  wrapper.append(slider, output);
  return fieldRow(label, wrapper);
}

function loopField(label, checked, onChange) {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  return fieldRow(label, input, "checkbox-field");
}

function diagnosticBlock(values) {
  const block = document.createElement("div");
  block.className = "diagnostic";
  for (const [key, value] of Object.entries(values || {})) {
    const row = document.createElement("div");
    row.textContent = `${key}: ${typeof value === "object" ? formatVector(value) : formatNumber(value)}`;
    block.append(row);
  }
  return block;
}

function messageElement(message, level) {
  const element = document.createElement("div");
  element.className = `message ${level}`;
  element.textContent = message;
  return element;
}

function sameState(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function formatNumber(value) {
  return Number.isFinite(value) ? String(Math.round(value * 1e6) / 1e6) : String(value);
}

function formatVector(value) {
  return `[${formatNumber(value.x)}, ${formatNumber(value.y)}, ${formatNumber(value.z)}]`;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

function isTypingTarget(target) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const textarea = document.createElement("textarea");
  textarea.value = text;
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function disposeModel(root) {
  root.traverse((object) => {
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material?.dispose?.();
  });
}
