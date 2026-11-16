import { RENDER_QUALITY } from "../config/rendering.js";
import * as THREE from "three";

export function createRenderer({
  container,
  width = window.innerWidth,
  height = window.innerHeight,
} = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDER_QUALITY.desktop.pixelRatioCap));
  renderer.setSize(width, height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = RENDER_QUALITY.desktop.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.xr.enabled = true;
  renderer.xr.setFramebufferScaleFactor(RENDER_QUALITY.xr.framebufferScale);
  container?.appendChild(renderer.domElement);
  return renderer;
}
