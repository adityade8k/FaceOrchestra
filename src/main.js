import * as THREE from "three";
import { ARButton } from "three/addons/webxr/ARButton.js";
import { VRButton } from "three/addons/webxr/VRButton.js";
import { MODEL_PATH, XR_OPTIONAL_FEATURES } from "./config.js";
import { InstrumentController } from "./instrument/InstrumentController.js";
import { VowelSynth } from "./audio/VowelSynth.js";

const app = document.querySelector("#app");
const status = document.querySelector("#status span");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202124);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 30);
camera.position.set(0, 1.55, 2.2);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;
app.appendChild(renderer.domElement);

const synth = new VowelSynth();
const instrumentController = new InstrumentController({
  scene,
  camera,
  renderer,
  synth,
});

setupNeutralFallbackWorld();
setupLights();
setupXRButton();

instrumentController
  .init()
  .then(() => {
    status.textContent = "Enter AR/VR, then press A on the right controller to spawn.";
  })
  .catch((error) => {
    console.error(error);
    status.textContent = `Could not load ${MODEL_PATH}. Check the model path and console.`;
  });

renderer.xr.addEventListener("sessionstart", () => {
  const session = renderer.xr.getSession();
  const blendMode = session?.environmentBlendMode;
  const isPassthroughLike = blendMode === "alpha-blend" || blendMode === "additive";

  scene.background = isPassthroughLike ? null : new THREE.Color(0x202124);
  setFallbackWorldVisible(!isPassthroughLike);
  instrumentController.onXRSessionStart();
  status.textContent = "XR session active. Press A on the right controller to spawn or reposition.";
});

renderer.xr.addEventListener("sessionend", () => {
  scene.background = new THREE.Color(0x202124);
  setFallbackWorldVisible(true);
  status.textContent = "XR session ended. Enter AR/VR to continue.";
});

renderer.setAnimationLoop(() => {
  instrumentController.update();
  renderer.render(scene, camera);
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

async function setupXRButton() {
  if (!navigator.xr) {
    document.body.appendChild(VRButton.createButton(renderer));
    status.textContent = "WebXR was not detected. Desktop preview is still available.";
    return;
  }

  let supportsAR = false;
  try {
    supportsAR = await navigator.xr.isSessionSupported("immersive-ar");
  } catch (error) {
    console.warn("Could not query immersive-ar support:", error);
  }

  if (supportsAR) {
    document.body.appendChild(
      ARButton.createButton(renderer, {
        optionalFeatures: XR_OPTIONAL_FEATURES,
        domOverlay: { root: document.body },
      }),
    );
    status.textContent = "Quest passthrough ready. Enter AR to begin.";
    return;
  }

  document.body.appendChild(VRButton.createButton(renderer));
  status.textContent = "Passthrough AR is unavailable here. Enter VR or use desktop preview.";
}

function setupLights() {
  const hemi = new THREE.HemisphereLight(0xffffff, 0x2d3436, 1.15);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.name = "KeyLight";
  key.position.set(2.5, 4.2, 2.8);
  key.castShadow = true;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x8fc7ff, 0.75);
  fill.name = "CoolFillLight";
  fill.position.set(-2.2, 2.2, 1.6);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffd49a, 1.4);
  rim.name = "WarmRimLight";
  rim.position.set(-1.4, 2.8, -3.2);
  scene.add(rim);
}

function setupNeutralFallbackWorld() {
  const grid = new THREE.GridHelper(8, 16, 0x5b6470, 0x353b42);
  grid.name = "FallbackWorld";
  grid.position.y = 0;
  scene.add(grid);

  const ringGeometry = new THREE.TorusGeometry(1.3, 0.006, 8, 96);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xf0d78a,
    transparent: true,
    opacity: 0.34,
  });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.name = "FallbackWorld";
  ring.position.set(0, 1.45, -1.4);
  ring.rotation.x = Math.PI / 2;
  scene.add(ring);
}

function setFallbackWorldVisible(visible) {
  scene.traverse((object) => {
    if (object.name === "FallbackWorld") {
      object.visible = visible;
    }
  });
}
