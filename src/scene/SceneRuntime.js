import * as THREE from "three";
import { createFallbackEnvironment } from "./createFallbackEnvironment.js";
import { createLighting } from "./createLighting.js";
import { createRenderer } from "./createRenderer.js";
import { createScene } from "./createScene.js";

export class SceneRuntime {
  constructor({ container, scene = createScene(), camera = null, renderer = null } = {}) {
    this.scene = scene;
    this.camera = camera || new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 30);
    this.camera.position.set(0, 1.55, 2.2);
    this.renderer = renderer || createRenderer({ container });
    this.fallbackEnvironment = createFallbackEnvironment();
    this.lighting = createLighting();
    this.scene.add(this.fallbackEnvironment, this.lighting);
    this.handleResize = this.handleResize.bind(this);
  }

  start() {
    window.addEventListener("resize", this.handleResize);
  }

  setXRBlendMode(blendMode = null) {
    const passthrough = blendMode === "alpha-blend" || blendMode === "additive";
    this.scene.background = passthrough ? null : new THREE.Color(0x202124);
    this.fallbackEnvironment.visible = !passthrough;
  }

  resetAfterXR() {
    this.scene.background = new THREE.Color(0x202124);
    this.fallbackEnvironment.visible = true;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  handleResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  dispose() {
    window.removeEventListener("resize", this.handleResize);
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
  }
}
