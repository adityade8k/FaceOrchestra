import { AudioSystem } from "../audio/AudioSystem.js";
import { SceneRuntime } from "../scene/SceneRuntime.js";
import { FaceOrchestraApp } from "./FaceOrchestraApp.js";
import { RuntimeHost } from "./runtime/RuntimeHost.js";

export function createFaceOrchestraApp({ container, sceneRuntime = null, audioSystem = null, storage } = {}) {
  const scene = sceneRuntime || new SceneRuntime({ container });
  const audio = audioSystem || new AudioSystem();
  const runtime = new RuntimeHost({
    scene: scene.scene,
    camera: scene.camera,
    renderer: scene.renderer,
    audioSystem: audio,
    storage,
  });
  return new FaceOrchestraApp({ sceneRuntime: scene, runtime });
}
