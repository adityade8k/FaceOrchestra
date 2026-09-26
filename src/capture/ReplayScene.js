import {
  collectResources,
  releaseResources,
} from "../scene/resourceOwnership.js";
import * as THREE from "three";
import { createLighting } from "../scene/createLighting.js";
import { cameraQuaternion } from "./calibration.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { validateEnvelope } from "./format.js";
import { normalizeRayStyle } from "./rayStyle.js";

export const DEFAULT_REPLAY_LAYERS = Object.freeze({
  instruments: true,
  labels: true,
  wires: true,
  tutorial: false,
  rays: false,
  controllers: true,
  controllerRays: true,
  headset: false,
});

export class ReplayScene {
  constructor(renderer, { assetURL = (path) => path } = {}) {
    this.assetURL = assetURL;
    this.owned = new Set();
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.add(createLighting());
    this.camera = new THREE.PerspectiveCamera(55, 9 / 16, 0.01, 100);
    this.nodes = new Map();
    this.resources = new Map();
    this.layers = { ...DEFAULT_REPLAY_LAYERS };
    this.issues = [];
    // Preview-only tracked origins are never part of the recorded scene.
    this.guides = new THREE.Scene();
    this.proxies = new Map();
    // Controller target rays are an output layer, separate from preview helpers
    // and recorded presentation nodes. Preview and export use the same poses.
    this.controllerRayScene = new THREE.Scene();
    this.controllerRays = new Map();
    this.rayStyle = normalizeRayStyle();
    this.guides.add(new THREE.HemisphereLight(0xffffff, 0x34433b, 1.6));
    const guideLight = new THREE.DirectionalLight(0xffffff, 2);
    guideLight.position.set(2, 4, 3);
    this.guides.add(guideLight);
    for (const name of ["left", "right", "headset"]) {
      const color =
        name === "left" ? 0x44ffaa : name === "right" ? 0xffaa44 : 0x77aaff;
      const proxy = new THREE.Mesh(
        name === "headset"
          ? new THREE.BoxGeometry(0.16, 0.09, 0.1)
          : new THREE.SphereGeometry(0.045, 20, 16),
        name === "headset"
          ? new THREE.MeshBasicMaterial({ color, wireframe: true })
          : new THREE.MeshLambertMaterial({ color }),
      );
      proxy.visible = false;
      this.guides.add(proxy);
      this.proxies.set(name, proxy);
      if (name !== "headset") {
        // A direction guide from target-ray space, independent of
        // the grip sphere and optional recorded UI/ray presentation objects.
        const geometry = new THREE.CylinderGeometry(0.005, 0.005, 1.5, 8)
          .rotateX(Math.PI / 2)
          .translate(0, 0, -0.75);
        const ray = new THREE.Mesh(
          geometry,
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
          }),
        );
        ray.visible = false;
        this.controllerRayScene.add(ray);
        this.controllerRays.set(name, ray);
      }
    }
  }
  async load(events) {
    const parts = new Map(),
      descriptors = [];
    for (const packet of events) {
      validateEnvelope(packet);
      const data = packet.data;
      if (data.kind === "node") descriptors.push(data);
      if (data.kind === "resource-part") {
        let entry = parts.get(data.id);
        if (!entry) {
          entry = Array(data.parts);
          parts.set(data.id, entry);
        }
        entry[data.part] = data.text;
      }
    }
    const resources = [];
    for (const [id, chunks] of parts) {
      if (
        chunks.some((c) => typeof c !== "string") ||
        chunks.filter(Boolean).length !== chunks.length
      ) {
        this.issues.push(
          `Incomplete resource ${id}; affected nodes are hidden until recovery.`,
        );
        continue;
      }
      resources.push(JSON.parse(chunks.join("")));
    }
    const models = new Map(),
      loader = new GLTFLoader();
    for (const r of resources.filter((r) => r.kind.startsWith("asset-"))) {
      const ref = r.data;
      if (!/^\/model\/[\w/.-]+\.glb$/.test(ref.path) || ref.path.includes(".."))
        throw new Error("Invalid local asset reference.");
      if (!models.has(ref.path))
        models.set(
          ref.path,
          (await loader.loadAsync(this.assetURL(ref.path))).scene,
        );
      collectResources(models.get(ref.path), this.owned);
      let node = models.get(ref.path);
      for (const index of ref.nodePath) node = node?.children[index];
      if (!node)
        throw new Error(
          `Asset node missing in ${ref.path}. Use the capture's asset version.`,
        );
      if (r.kind === "asset-geometry") this.resources.set(r.id, node.geometry);
      else {
        const material = Array.isArray(node.material)
          ? node.material[ref.materialIndex]
          : node.material;
        const texture = material[ref.slot].clone();
        texture.offset.fromArray(ref.offset);
        texture.repeat.fromArray(ref.repeat);
        texture.rotation = ref.rotation;
        texture.flipY = ref.flipY;
        texture.colorSpace = ref.colorSpace;
        texture.wrapS = ref.wrapS;
        texture.wrapT = ref.wrapT;
        texture.needsUpdate = true;
        this.resources.set(r.id, texture);
      }
    }
    for (const r of resources.filter((r) => r.kind === "geometry"))
      this.resources.set(r.id, new THREE.BufferGeometryLoader().parse(r.data));
    for (const r of resources.filter((r) => r.kind === "texture")) {
      // Accept only local asset paths or embedded pixels. Imported takes cannot fetch remote URLs.
      for (const image of r.data.images)
        if (
          typeof image.url === "string" &&
          !image.url.startsWith("data:") &&
          !/^\/(model|vendor\/three)\//.test(image.url)
        )
          throw new Error("Take references a nonlocal texture.");
      for (const image of r.data.images)
        if (typeof image.url === "string" && image.url.startsWith("/model/"))
          image.url = this.assetURL(image.url);
      const loader = new THREE.ObjectLoader(),
        images = await loader.parseImagesAsync(r.data.images),
        textures = loader.parseTextures([r.data], images);
      this.resources.set(r.id, textures[r.data.uuid]);
    }
    for (const r of resources.filter((r) => r.kind === "material")) {
      const { type, maps, normalScale, ...params } = r.data;
      if (Object.values(maps).some((id) => id && !this.resources.has(id))) {
        this.issues.push(
          `Material ${r.id} has missing textures; affected nodes are hidden.`,
        );
        continue;
      }
      const Ctor = THREE[type];
      if (
        ![
          "MeshStandardMaterial",
          "MeshPhysicalMaterial",
          "MeshBasicMaterial",
          "MeshPhongMaterial",
          "MeshLambertMaterial",
          "LineBasicMaterial",
          "SpriteMaterial",
          "MeshNormalMaterial",
        ].includes(type)
      )
        throw new Error(`Unsupported recorded material ${type}`);
      const material = new Ctor();
      for (const [key, value] of Object.entries(params))
        if (value !== undefined && key in material) material[key] = value;
      for (const [slot, id] of Object.entries(maps))
        if (id) material[slot] = this.resources.get(id);
      if (normalScale && material.normalScale)
        material.normalScale.fromArray(normalScale);
      this.resources.set(r.id, material);
    }
    for (const d of descriptors) {
      let node;
      if (d.type === "Sprite") node = new THREE.Sprite();
      else if (d.type === "SkinnedMesh") node = new THREE.SkinnedMesh();
      else if (d.type === "Mesh") node = new THREE.Mesh();
      else if (d.type === "LineLoop") node = new THREE.LineLoop();
      else if (d.type === "LineSegments") node = new THREE.LineSegments();
      else if (d.type === "Line") node = new THREE.Line();
      else if (d.type === "Bone") node = new THREE.Bone();
      else node = new THREE.Group();
      node.name = d.name;
      node.renderOrder = d.renderOrder;
      node.castShadow = d.castShadow;
      node.receiveShadow = d.receiveShadow;
      node.visible = false;
      node.userData.capture = d;
      this.nodes.set(d.id, node);
    }
    for (const d of descriptors)
      (d.parent ? this.nodes.get(d.parent) : this.scene)?.add(
        this.nodes.get(d.id),
      );
  }
  setCamera(parameters, width, height) {
    this.camera.position.fromArray(parameters.position);
    this.camera.quaternion.copy(cameraQuaternion(parameters));
    this.camera.fov = parameters.fov;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    // Center is in canonical 1080x1920 pixels, same convention as observations.
    this.camera.projectionMatrix.elements[8] =
      (-2 * (parameters.center?.[0] || 0)) / 1080;
    this.camera.projectionMatrix.elements[9] =
      (2 * (parameters.center?.[1] || 0)) / 1920;
    this.camera.projectionMatrixInverse
      .copy(this.camera.projectionMatrix)
      .invert();
    this.camera.updateMatrixWorld();
  }
  setRayStyle(value) {
    this.rayStyle = normalizeRayStyle(value);
    for (const [hand, ray] of this.controllerRays) {
      ray.material.color.set(this.rayStyle[`${hand}Color`]);
      ray.material.opacity = this.rayStyle.opacity;
      // Scale only along the beam. The origin, orientation and thickness stay
      // fixed to the recorded target-ray pose in both preview and export.
      ray.scale.set(1, 1, this.rayStyle.length / 1.5);
    }
  }
  apply(frame) {
    for (const [id, node] of this.nodes) {
      const state = frame.nodes[id];
      if (!state) {
        node.visible = false;
        continue;
      }
      if (
        (state.geometry && !this.resources.has(state.geometry)) ||
        state.materials.some((id) => !this.resources.has(id))
      ) {
        node.visible = false;
        continue;
      }
      const x = state.x;
      node.position.fromArray(x);
      node.quaternion.fromArray(x, 3);
      node.scale.fromArray(x, 7);
      node.visible = Boolean(x[10] && this.layers[node.userData.capture.layer]);
      if (state.geometry && node.userData.geometryId !== state.geometry) {
        node.geometry = this.resources.get(state.geometry);
        node.userData.geometryId = state.geometry;
        if (node.isMesh) node.updateMorphTargets();
      }
      if (state.morphs) {
        node.morphTargetInfluences ||= [];
        for (let i = 0; i < state.morphs; i++)
          node.morphTargetInfluences[i] = x[11 + i];
        node.morphTargetDictionary = node.userData.capture.morphDictionary;
      }
      const ids = state.materials.join(",");
      if (ids !== node.userData.materialIds) {
        for (const m of node.userData.materials || []) m.dispose();
        const materials = state.materials.map((id) => {
          const m = this.resources.get(id);
          if (!m) throw new Error(`Missing material ${id}`);
          return m.clone();
        });
        node.material = materials.length === 1 ? materials[0] : materials;
        node.userData.materials = materials;
        node.userData.materialIds = ids;
      }
      for (const [i, material] of (node.userData.materials || []).entries()) {
        const at = 11 + state.morphs + i * 8;
        material.color?.setRGB(x[at], x[at + 1], x[at + 2]);
        material.emissive?.setRGB(x[at + 3], x[at + 4], x[at + 5]);
        material.opacity = x[at + 6];
        if ("emissiveIntensity" in material)
          material.emissiveIntensity = x[at + 7];
      }
      if (state.wire) {
        const signature = JSON.stringify(state.wire);
        if (signature !== node.userData.wireSignature) {
          const curve = new THREE.CurvePath();
          for (const s of state.wire.plan.segments)
            curve.add(
              new THREE.CubicBezierCurve3(
                ...[s.start, s.control1, s.control2, s.end].map(
                  (p) => new THREE.Vector3(p.x, p.y, p.z),
                ),
              ),
            );
          node.geometry?.dispose();
          node.geometry = curve.curves.length
            ? new THREE.TubeGeometry(
                curve,
                state.wire.plan.tubularSegments,
                state.wire.radius,
                state.wire.radialSegments,
                false,
              )
            : new THREE.BufferGeometry();
          node.userData.wireSignature = signature;
        }
      }
      if (state.skeleton && !node.skeleton) {
        const bones = state.skeleton.bones.map((id) => this.nodes.get(id));
        if (bones.every(Boolean))
          node.bind(
            new THREE.Skeleton(
              bones,
              state.skeleton.inverses.map((a) =>
                new THREE.Matrix4().fromArray(a),
              ),
            ),
            new THREE.Matrix4().fromArray(state.skeleton.bindMatrix),
          );
      }
      node.updateMatrix();
    }
    for (const [name, proxy] of this.proxies) {
      const pose =
        name === "headset"
          ? frame.xr.viewer
          : frame.xr.controllers.find((c) => c.handedness === name)?.grip;
      proxy.visible = Boolean(
        pose && this.layers[name === "headset" ? "headset" : "controllers"],
      );
      if (pose) {
        proxy.position.fromArray(pose.p);
        proxy.quaternion.fromArray(pose.q);
      }
    }
    for (const [name, ray] of this.controllerRays) {
      const pose = frame.xr.controllers.find((c) => c.handedness === name)?.ray;
      ray.visible = Boolean(
        pose &&
          this.layers.controllerRays &&
          this.rayStyle.opacity > 0 &&
          this.rayStyle.length > 0,
      );
      if (pose) {
        ray.position.fromArray(pose.p);
        ray.quaternion.fromArray(pose.q);
      }
    }
    this.scene.updateMatrixWorld(true);
  }
  render({ guides = true } = {}) {
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.render(this.scene, this.camera);
    const autoClear = this.renderer.autoClear;
    this.renderer.autoClear = false;
    this.renderer.render(this.controllerRayScene, this.camera);
    if (guides) this.renderer.render(this.guides, this.camera);
    this.renderer.autoClear = autoClear;
  }
  dispose() {
    for (const node of this.nodes.values()) {
      for (const m of node.userData.materials || []) m.dispose();
      if (node.userData.wireSignature) node.geometry.dispose();
    }
    for (const r of this.resources.values()) this.owned.add(r);
    releaseResources(this.owned);
    for (const proxy of [
      ...this.proxies.values(),
      ...this.controllerRays.values(),
    ]) {
      proxy.geometry.dispose();
      proxy.material.dispose();
    }
    this.nodes.clear();
    this.resources.clear();
  }
}
