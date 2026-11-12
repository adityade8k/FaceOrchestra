import { EditorProject } from "./EditorProject.js";
import { EditorPreview } from "./EditorPreview.js";
import { EditorCamera } from "./EditorCamera.js";
import { EditorExport } from "./EditorExport.js";

import * as THREE from "three";

import { DEFAULT_REPLAY_LAYERS } from "/src/capture/ReplayScene.js";
import { fitCamera, controllerLandmark, outputPixel } from "/src/capture/calibration.js";
import { fitTimeMap, timeMap } from "/src/capture/format.js";
import {
  defaultCamera,
  validCamera,
  cameraFromHandle,
  normalizeBookmarks,
} from "/src/capture/alignment.js";
import { SceneInspector } from "./SceneInspector.js";

import { normalizeFrameMatches } from "/src/capture/savedFrames.js";
import { normalizeRayStyle } from "/src/capture/rayStyle.js";

const $ = (id) => document.getElementById(id),
  number = (id) => Number($(id).value);
const video = $("video"),
  audio = $("audio"),
  canvas = $("composite"),
  ctx = canvas.getContext("2d");

const renderer = new THREE.WebGLRenderer({
  alpha: true,
  antialias: true,
  preserveDrawingBuffer: true,
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(1);
renderer.setSize(540, 960);
const editor = {
  view: { $, number, video, audio, canvas, ctx, renderer },
  ui: {
    notice,
    api,
    post,
    run,
    updateInputs,
    updateRayInputs,
    readSettings,
    downloadJSON,
  },
};
editor.preview = new EditorPreview(editor);
editor.project = new EditorProject(editor);
editor.camera = new EditorCamera(editor);
editor.exporter = new EditorExport(editor);

const inspector = new SceneInspector(editor.view.$("scene-inspector"), {
  begin: () => {
    editor.camera.beginCameraEdit();
    editor.camera.handleStartCamera = structuredClone(editor.project.current.camera);
  },
  change: (object, mode) =>
    editor.camera.applyCamera(
      cameraFromHandle(editor.project.current.camera, object, mode, {
        startCamera: editor.camera.handleStartCamera || editor.project.current.camera,
        axis: editor.view.inspector.transform.axis || "XYZ",
      }),
    ),
  end: () => {
    editor.camera.finishCameraEdit();
    editor.camera.handleStartCamera = null;
  },
});
editor.view.inspector = inspector;

function notice(message, error = false) {
  editor.view.$("notice").textContent = message;
  editor.view.$("notice").classList.toggle("error", error);
}
async function api(path, options = {}) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Local service returned ${response.status}`);
  return data;
}
function post(path, data) {
  return editor.ui.api(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}
function run(fn) {
  return async (event) => {
    try {
      await fn(event);
    } catch (error) {
      if (error.name !== "AbortError") editor.ui.notice(error.message, true);
    }
  };
}

function updateInputs() {
  for (const [id, value] of Object.entries({
    rate: editor.project.current.mapping.a,
    offset: editor.project.current.mapping.b,
    "crop-zoom": editor.project.current.crop.zoom,
    "crop-x": editor.project.current.crop.x,
    "crop-y": editor.project.current.crop.y,
    "trim-start": editor.project.current.trim.start,
    "trim-end": editor.project.current.trim.end,
    resolution: editor.project.current.output.width,
    fps: editor.project.current.output.fps,
    opacity: editor.project.current.opacity,
  }))
    editor.view.$(id).value = value;
  editor.camera.updateCameraInputs();
  editor.view.$("preview-guides").checked = editor.project.current.layers.controllers;
  editor.view.$("preview-rays").checked = editor.project.current.layers.controllerRays;
  editor.view.$("preview-headset").checked = editor.project.current.layers.headset;
  editor.ui.updateRayInputs();
  for (const box of editor.view.$("layers").querySelectorAll("input"))
    box.checked = editor.project.current.layers[box.name];
  editor.camera.updateObservations();
  editor.camera.updateBookmarks();
}
function updateRayInputs() {
  editor.project.current.rayStyle = normalizeRayStyle(editor.project.current.rayStyle);
  editor.view.$("ray-left-color").value = editor.project.current.rayStyle.leftColor;
  editor.view.$("ray-right-color").value = editor.project.current.rayStyle.rightColor;
  editor.view.$("ray-opacity").value = editor.project.current.rayStyle.opacity;
  editor.view.$("ray-length").value = editor.project.current.rayStyle.length;
  editor.view.$("ray-opacity-value").textContent =
    `${Math.round(editor.project.current.rayStyle.opacity * 100)}%`;
  editor.view.$("ray-length-value").textContent =
    `${editor.project.current.rayStyle.length.toFixed(2)} m`;
}
function readSettings() {
  editor.project.current.mapping = {
    a: editor.view.number("rate"),
    b: editor.view.number("offset"),
  };
  if (
    !(editor.project.current.mapping.a > 0.9 && editor.project.current.mapping.a < 1.1) ||
    !Number.isFinite(editor.project.current.mapping.b)
  )
    throw new Error("Enter a finite offset and a rate between 0.9 and 1.1.");
  if (!validCamera(editor.project.current.camera)) throw new Error("Invalid camera values.");
  editor.project.current.crop = {
    zoom: editor.view.number("crop-zoom"),
    x: editor.view.number("crop-x"),
    y: editor.view.number("crop-y"),
  };
  editor.project.current.trim = {
    start: editor.view.number("trim-start"),
    end: editor.view.number("trim-end"),
  };
  editor.project.current.output = {
    width: editor.view.number("resolution"),
    height: (editor.view.number("resolution") * 16) / 9,
    fps: editor.view.number("fps"),
  };
  editor.project.current.opacity = editor.view.number("opacity");
  if (
    !Object.values(editor.project.current.crop).every(Number.isFinite) ||
    editor.project.current.crop.zoom < 1 ||
    editor.project.current.crop.zoom > 4 ||
    Math.abs(editor.project.current.crop.x) > 1 ||
    Math.abs(editor.project.current.crop.y) > 1
  )
    throw new Error("Crop zoom must be 1–4, and crop offsets between −1 and 1.");
}

if (editor.view.video.requestVideoFrameCallback)
  editor.view.video.requestVideoFrameCallback(editor.preview.videoFrame);
else
  editor.view.video.addEventListener("timeupdate", () => {
    if (!editor.exporter.exporting) {
      editor.preview.videoTime = editor.view.video.currentTime;
      editor.preview.render();
    }
  });
// The playhead drives the same scene-time mapping as offline output. Source PTS
// remains independent and is used when a clicked video frame supplies a landmark.

requestAnimationFrame(editor.preview.animatePreview);
editor.view.video.onended = editor.preview.pause;

function downloadJSON(value, name) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

editor.view.$("pair").onsubmit = editor.ui.run(async (e) => {
  e.preventDefault();
  await editor.ui.post("/api/pair", { code: editor.view.$("code").value });
  await editor.project.refresh();
  editor.ui.notice("This browser is paired.");
});
editor.view.$("refresh").onclick = editor.ui.run(editor.project.refresh);
editor.view.$("takes").onchange = editor.ui.run((e) => editor.project.loadTake(e.target.value));
editor.view.$("recover").onclick = editor.ui.run(async () => {
  if (!editor.project.take) throw new Error("Select a take.");
  await editor.ui.post(`/api/takes/${editor.project.take.id}/recover`, {});
  await editor.project.loadTake(editor.project.take.id);
});
editor.view.$("import-take").onchange = editor.ui.run(async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  editor.ui.notice("Importing portable take locally…");
  const result = await editor.ui.api("/api/import", { method: "POST", body: file });
  await editor.project.refresh();
  await editor.project.loadTake(result.id);
});
editor.view.$("video-file").onchange = editor.ui.run(editor.project.loadVideo);
editor.view.$("play").onclick = editor.ui.run(editor.preview.play);

editor.view.$("previous").onclick = editor.ui.run(() =>
  editor.preview.scrub(editor.preview.currentPlayhead() - 1 / editor.project.current.output.fps),
);
editor.view.$("next").onclick = editor.ui.run(() =>
  editor.preview.scrub(editor.preview.currentPlayhead() + 1 / editor.project.current.output.fps),
);
editor.view.$("timeline").onpointerdown = editor.preview.stopPlayback;
editor.view.$("timeline").oninput =
  editor.view.$("timeline").onchange =
  editor.view.$("seek-time").onchange =
    editor.ui.run((e) => {
      const target = e.target.valueAsNumber;
      return editor.preview.scrub(target);
    });
editor.view.$("align").onclick = editor.ui.run(() => {
  editor.camera.cancelFrameMatching();
  editor.project.current.mapping = fitTimeMap(
    { video: editor.view.number("v1"), scene: editor.view.number("s1") },
    editor.view.$("v2").value !== "" && editor.view.$("s2").value !== ""
      ? { video: editor.view.number("v2"), scene: editor.view.number("s2") }
      : null,
  );
  editor.project.current.anchors = [
    { video: editor.view.number("v1"), scene: editor.view.number("s1") },
    ...(editor.view.$("v2").value !== ""
      ? [{ video: editor.view.number("v2"), scene: editor.view.number("s2") }]
      : []),
  ];
  editor.project.current.observations = [];
  editor.project.current.calibration = null;
  editor.camera.refineSavedCamera();
  editor.ui.updateInputs();
  editor.preview.render();
  editor.ui.notice(
    "Time mapping applied. Saved controller matches now use the updated scene times.",
  );
});
editor.view.$("phone-audio").onchange = (e) => {
  editor.view.video.muted = !e.target.checked;
  editor.view.audio.muted = e.target.checked;
};
for (const id of [
  "rate",
  "offset",
  "crop-zoom",
  "crop-x",
  "crop-y",
  "trim-start",
  "trim-end",
  "resolution",
  "fps",
  "opacity",
])
  editor.view.$(id).onchange = editor.ui.run(() => {
    editor.camera.cancelFrameMatching();
    editor.ui.readSettings();
    if (id.startsWith("crop")) {
      editor.project.current.calibration = null;
      editor.project.current.observations = [];
      editor.project.current.frameMatches = [];
      editor.project.current.frameFit = null;
      editor.camera.cameraHistory.clear();
      editor.camera.updateCameraInputs();
      editor.ui.notice("Crop changed. Save frames and click controllers again in the new crop.");
    }
    if (id === "rate" || id === "offset") {
      editor.project.current.calibration = null;
      editor.project.current.observations = [];
      editor.camera.refineSavedCamera();
    }
    editor.camera.updateObservations();
    editor.camera.updateBookmarks();
    editor.preview.render();
  });
const layerLabels = {
  instruments: "Instruments",
  labels: "Instrument labels",
  wires: "Wires",
  tutorial: "Tutorial",
  rays: "Recorded rays",
};
for (const [name, title] of Object.entries(layerLabels)) {
  const label = document.createElement("label"),
    box = document.createElement("input");
  box.type = "checkbox";
  box.name = name;
  box.checked = editor.project.current.layers[name];
  box.onchange = () => {
    editor.project.current.layers[name] = box.checked;
    editor.preview.render();
  };
  label.append(box, document.createTextNode(title));
  editor.view.$("layers").append(label);
}
for (const [id, layer] of [
  ["preview-guides", "controllers"],
  ["preview-rays", "controllerRays"],
  ["preview-headset", "headset"],
])
  editor.view.$(id).onchange = (e) => {
    editor.project.current.layers[layer] = e.target.checked;
    editor.preview.render();
  };
for (const [id, key] of [
  ["ray-left-color", "leftColor"],
  ["ray-right-color", "rightColor"],
  ["ray-opacity", "opacity"],
  ["ray-length", "length"],
]) {
  editor.view.$(id).oninput = editor.view.$(id).onchange = (e) => {
    editor.project.current.rayStyle = normalizeRayStyle({
      ...editor.project.current.rayStyle,
      [key]: e.target.type === "color" ? e.target.value : e.target.valueAsNumber,
    });
    editor.ui.updateRayInputs();
    editor.preview.render();
  };
}
editor.view.$("reset-rays").onclick = () => {
  editor.project.current.rayStyle = normalizeRayStyle();
  editor.ui.updateRayInputs();
  editor.preview.render();
};
const cameraModes = [
  ["inspect-scene", "inspect"],
  ["move-camera", "translate"],
  ["rotate-camera", "rotate"],
  ["scale-camera", "scale"],
];
const cameraHints = {
  inspect:
    "Drag to orbit · right-drag to pan · scroll to zoom. This view does not move the phone camera.",
  translate:
    "Drag the camera’s arrows or squares to move it. Drag elsewhere to orbit; scroll to zoom.",
  rotate: "Drag the camera’s rings to rotate it. Drag elsewhere to orbit; scroll to zoom.",
  scale:
    "Drag the camera’s boxes outward to widen the view, inward to narrow it. Scale adjusts the lens; scene size stays fixed.",
};
for (const [id, mode] of cameraModes)
  editor.view.$(id).onclick = () => {
    editor.camera.finishCameraEdit();
    editor.view.inspector.setMode(mode);
    for (const [other] of cameraModes)
      editor.view.$(other).setAttribute("aria-pressed", String(other === id));
    editor.view.$("scene-hint").textContent = cameraHints[mode];
  };
document.addEventListener("keydown", (event) => {
  if (
    editor.exporter.exporting ||
    editor.view.inspector.transform.dragging ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.repeat ||
    event.target.closest("input,select,textarea,[contenteditable]")
  )
    return;
  const id = {
    q: "inspect-scene",
    w: "move-camera",
    e: "rotate-camera",
    r: "scale-camera",
  }[event.key.toLowerCase()];
  if (id) {
    event.preventDefault();
    editor.view.$(id).click();
  }
});
for (const id of editor.camera.cameraFields) {
  const input = editor.view.$(id);
  input.onfocus = editor.camera.beginCameraEdit;
  input.oninput = () => {
    if (input.value === "" || !Number.isFinite(input.valueAsNumber)) return;
    const candidate = structuredClone(editor.project.current.camera),
      index = editor.camera.cameraFields.indexOf(id);
    if (index < 3) candidate.position[index] = input.valueAsNumber;
    else if (index < 6) candidate.rotation[index - 3] = input.valueAsNumber;
    else if (index === 6) candidate.fov = input.valueAsNumber;
    else candidate.center[index - 7] = input.valueAsNumber;
    if (!validCamera(candidate)) return;
    editor.camera.beginCameraEdit();
    editor.camera.applyCamera(candidate);
  };
  input.onchange = input.onblur = () => {
    editor.camera.finishCameraEdit();
    // An incomplete/invalid number leaves the last valid camera unchanged.
    const values = [
      ...editor.project.current.camera.position,
      ...editor.project.current.camera.rotation,
      editor.project.current.camera.fov,
      ...editor.project.current.camera.center,
    ];
    input.value = values[editor.camera.cameraFields.indexOf(id)];
  };
}
editor.view.$("lens-fov").onpointerdown = editor.camera.beginCameraEdit;
editor.view.$("lens-fov").onkeydown = (e) => {
  if (
    [
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "Home",
      "End",
      "PageUp",
      "PageDown",
    ].includes(e.key)
  )
    editor.camera.beginCameraEdit();
};
editor.view.$("lens-fov").oninput = () => {
  editor.camera.beginCameraEdit();
  editor.camera.applyCamera({
    ...editor.project.current.camera,
    fov: editor.view.number("lens-fov"),
  });
};
editor.view.$("lens-fov").onchange = editor.view.$("lens-fov").onblur =
  editor.camera.finishCameraEdit;
editor.view.$("undo-camera").onclick = () => {
  editor.camera.cancelFrameMatching();
  editor.preview.pause();
  const previous = editor.camera.cameraHistory.undo(editor.camera.cameraState());
  if (previous) {
    editor.project.current.camera = previous.camera;
    editor.project.current.calibration = previous.calibration;
    editor.project.current.frameFit = previous.frameFit;
  }
  editor.camera.updateCameraInputs();
  editor.camera.updateObservations();
  editor.camera.updateFrameFit();
  editor.preview.render();
};
editor.view.$("reset-camera").onclick = () => {
  editor.camera.finishCameraEdit();
  editor.camera.beginCameraEdit();
  editor.camera.applyCamera(defaultCamera());
  editor.camera.finishCameraEdit();
};
editor.view.$("save-frame").onclick = editor.ui.run(editor.camera.saveFrame);
editor.view.$("skip-match").onclick = () => {
  if (editor.camera.pendingFrame) {
    editor.camera.pendingFrame.index++;
    editor.camera.advanceFrameMatching();
  }
};
editor.view.$("cancel-match").onclick = editor.camera.cancelMatch;
editor.view.$("add-point").onclick = editor.ui.run(async () => {
  if (!editor.project.timeline || !editor.project.videoURL)
    throw new Error("Load a take and phone video first.");
  if (!editor.view.$("offset-verified").checked || !editor.view.$("landmark-name").value.trim())
    throw new Error("Name and verify the measured controller-local landmark offset first.");
  await editor.preview.previewSeeks.idle();
  editor.camera.cancelFrameMatching();
  editor.preview.pause();
  editor.camera.selectedPoint = true;
  editor.view.canvas.classList.add("pick-landmark");
  editor.ui.notice("Click the identified physical landmark in the portrait preview.");
});
editor.view.canvas.onclick = editor.ui.run((e) => {
  if (editor.camera.pendingFrame) {
    editor.camera.pendingFrame.points.push({
      hand: editor.camera.pendingFrame.hands[editor.camera.pendingFrame.index],
      pixel: outputPixel(e.clientX, e.clientY, editor.view.canvas.getBoundingClientRect()),
    });
    editor.camera.pendingFrame.index++;
    editor.camera.advanceFrameMatching();
    return;
  }
  if (!editor.camera.selectedPoint) return;
  editor.ui.readSettings();
  const observedTime = editor.project.videoURL
    ? editor.preview.presentedPTS
    : editor.preview.videoTime;
  const frame = editor.project.timeline.seek(timeMap(observedTime, editor.project.current.mapping));
  if (!frame || frame.segment !== editor.project.current.segment || frame.gap)
    throw new Error("This time belongs to a different or missing coordinate segment.");
  const hand = editor.view.$("hand").value,
    controller = frame.xr.controllers.find((c) => c.handedness === hand),
    offset = ["landmark-x", "landmark-y", "landmark-z"].map(editor.view.number),
    world = controllerLandmark(controller?.grip, offset),
    rect = editor.view.canvas.getBoundingClientRect();
  editor.project.current.observations.push({
    world,
    pixel: outputPixel(e.clientX, e.clientY, rect),
    videoTime: observedTime,
    sceneTime: frame.t,
    segment: frame.segment,
    hand,
    profiles: controller.profiles,
    offset,
    landmark: editor.view.$("landmark-name").value,
    heldOut: editor.view.$("held-out").checked,
  });
  editor.camera.selectedPoint = false;
  editor.view.canvas.classList.remove("pick-landmark");
  editor.project.current.calibration = null;
  editor.camera.cameraHistory.clear();
  editor.camera.updateCameraInputs();
  editor.camera.updateObservations();
  editor.preview.render();
  editor.ui.notice("Landmark added.");
});
editor.view.$("fit").onclick = editor.ui.run(async () => {
  editor.ui.readSettings();
  editor.camera.finishCameraEdit();
  editor.camera.beginCameraEdit();
  editor.ui.notice("Fitting fixed camera…");
  await new Promise((r) => setTimeout(r, 30));
  try {
    const result = fitCamera(editor.project.current.observations, {
      initial: editor.project.current.camera,
      fitFocal: editor.view.$("solve-mode").value === "focal",
    });
    editor.project.current.camera = result.camera;
    editor.project.current.calibration = result;
    editor.ui.updateInputs();
    editor.preview.render();
    editor.ui.notice(
      result.valid
        ? "Camera fit complete. Check the held-out frames."
        : "Camera fit failed the error threshold. Remove bad observations or add better-spread holds.",
      !result.valid,
    );
  } finally {
    editor.camera.finishCameraEdit();
  }
});
editor.view.$("save-project").onclick = editor.ui.run(() => {
  editor.ui.readSettings();
  editor.ui.downloadJSON(
    editor.project.current,
    `honk-project-${editor.project.take?.id || "new"}.json`,
  );
});
editor.view.$("load-project").onchange = editor.ui.run(editor.project.loadProject);
editor.view.$("cancel-export").onclick = () => {
  editor.exporter.cancelled = true;
};

editor.view.$("export").onclick = editor.ui.run(editor.exporter.exportProject);
// Used by the local synthetic browser verification, never needed for normal editing.
window.captureEditor = {
  loadTake: editor.project.loadTake,
  seek: editor.preview.seek,
  render: editor.preview.render,
  exportProject: editor.exporter.exportProject,
  inspector: editor.view.inspector,
  get project() {
    return editor.project.current;
  },
  get timeline() {
    return editor.project.timeline;
  },
  get take() {
    return editor.project.take;
  },
  get replay() {
    return editor.preview.replay;
  },
  setProject(value) {
    editor.camera.cancelFrameMatching();
    editor.project.current = { ...editor.project.current, ...value };
    editor.project.current.layers = { ...DEFAULT_REPLAY_LAYERS, ...editor.project.current.layers };
    editor.project.current.bookmarks = normalizeBookmarks(
      editor.project.current.bookmarks,
      editor.project.current.video?.duration,
    );
    editor.project.current.frameMatches = normalizeFrameMatches(
      editor.project.current.frameMatches,
      editor.project.current.bookmarks,
    );
    editor.camera.cameraHistory.clear();
    editor.ui.updateInputs();
    editor.preview.render();
  },
  refresh: editor.project.refresh,
};
editor.ui.updateInputs();
editor.preview.render();
editor.project
  .refresh()
  .catch((error) =>
    editor.ui.notice(
      `${error.message} Run npm run capture:serve and open this editor through that service.`,
      true,
    ),
  );
