import * as THREE from "three";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeletonAware } from "three/addons/utils/SkeletonUtils.js";
import { ASSET_PATHS } from "../config/assets.js";
import { loadMaterialTextureSet } from "./materialUtils.js";

export class AssetRepository {
  constructor({ gltfLoader = new GLTFLoader(), textureLoader = new THREE.TextureLoader(), fontLoader = new FontLoader() } = {}) {
    this.gltfLoader = gltfLoader;
    this.textureLoader = textureLoader;
    this.fontLoader = fontLoader;
    this.models = new Map();
    this.textureSets = new Map();
    this.fonts = new Map();
  }

  async loadModel(key, path = ASSET_PATHS.models[key]) {
    if (!path) throw new Error(`No model asset configured for ${key}`);
    if (!this.models.has(key)) {
      this.models.set(key, this.gltfLoader.loadAsync(path).then((gltf) => gltf.scene));
    }
    return this.models.get(key);
  }

  async loadTextureSet(key, paths = ASSET_PATHS.textures[key]) {
    if (!paths) return {};
    if (!this.textureSets.has(key)) {
      this.textureSets.set(key, loadMaterialTextureSet(this.textureLoader, paths));
    }
    return this.textureSets.get(key);
  }

  async loadFont(key, path = ASSET_PATHS.fonts[key]) {
    if (!path) return null;
    if (!this.fonts.has(key)) {
      this.fonts.set(key, this.fontLoader.loadAsync(path).catch(() => null));
    }
    return this.fonts.get(key);
  }

  cloneModel(model) {
    return cloneSkeletonAware(model);
  }

  clear() {
    this.models.clear();
    this.textureSets.clear();
    this.fonts.clear();
  }
}
