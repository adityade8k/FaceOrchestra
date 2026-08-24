import { ARButton } from "three/addons/webxr/ARButton.js";
import { VRButton } from "three/addons/webxr/VRButton.js";
import { createFaceOrchestraApp } from "./app/createFaceOrchestraApp.js";
import { ASSET_PATHS } from "./config/assets.js";
import { XR_OPTIONAL_FEATURES } from "./config/xr.js";

const container = document.querySelector("#app");
const status = document.querySelector("#status span");
const app = createFaceOrchestraApp({ container });
const { renderer } = app.sceneRuntime;

renderer.xr.addEventListener("sessionstart", () => {
  app.onXRSessionStart();
  setStatus("XR active. Hold A, roll a category, pull toward you, roll an item, and release to preview.");
});

renderer.xr.addEventListener("sessionend", () => {
  app.onXRSessionEnd();
  setStatus("XR session ended. Enter AR/VR to continue.");
});

setupXRButton(renderer).catch((error) => {
  console.warn("Could not configure WebXR entry:", error);
  setStatus("WebXR setup failed. Desktop preview is still available.");
});

app.initialize()
  .then(() => {
    app.start();
    setStatus("Enter AR/VR, hold A and roll a category, pull toward you and roll an item, then release to preview.");
  })
  .catch((error) => {
    console.error(error);
    setStatus(`Could not load ${ASSET_PATHS.models.honk}. Check the model path and console.`);
  });

async function setupXRButton(webglRenderer) {
  if (!navigator.xr) {
    document.body.appendChild(VRButton.createButton(webglRenderer));
    setStatus("WebXR was not detected. Desktop preview is still available.");
    return;
  }

  let supportsAR = false;
  try {
    supportsAR = await navigator.xr.isSessionSupported("immersive-ar");
  } catch (error) {
    console.warn("Could not query immersive-ar support:", error);
  }

  if (supportsAR) {
    document.body.appendChild(ARButton.createButton(webglRenderer, {
      optionalFeatures: XR_OPTIONAL_FEATURES,
      domOverlay: { root: document.body },
    }));
    setStatus("Quest passthrough ready. Enter AR to begin.");
    return;
  }

  document.body.appendChild(VRButton.createButton(webglRenderer));
  setStatus("Passthrough AR is unavailable here. Enter VR or use desktop preview.");
}

function setStatus(message) {
  if (status) status.textContent = message;
}
