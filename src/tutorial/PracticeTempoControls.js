import * as THREE from "three";
import {
  BPM,
  practiceBpm,
  PRACTICE_MIN_BPM,
  PRACTICE_DEFAULT_BPM,
  PRACTICE_TEMPOS,
} from "./kuch/timing.js";

const W = 1072,
  H = 206,
  LEFT = 80,
  RIGHT = 992;
export const tempoFromSliderX = (x) =>
  practiceBpm(
    PRACTICE_MIN_BPM + Math.max(0, Math.min(1, x)) * (BPM - PRACTICE_MIN_BPM),
  );
const sliderXFromTempo = (bpm) =>
  (bpm - PRACTICE_MIN_BPM) / (BPM - PRACTICE_MIN_BPM);
export class PracticeTempoControls {
  constructor(panel) {
    this.panel = panel;
    this.group = new THREE.Group();
    this.group.position.set(0, (0.5 - 1222 / 1560) * 1.42, 0.008);
    panel.group.add(this.group);
    this.canvas = document.createElement("canvas");
    this.canvas.width = W;
    this.canvas.height = H;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    const sx = 1.05 / 1152,
      sy = 1.42 / 1560;
    this.scaleX = sx;
    const add = (x, y, w, h, data = {}, map = null) => {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(w * sx, h * sy),
        new THREE.MeshBasicMaterial({
          map,
          transparent: true,
          opacity: map ? 1 : 0,
          depthWrite: false,
        }),
      );
      mesh.position.set(
        (x + w / 2 - W / 2) * sx,
        (H / 2 - y - h / 2) * sy,
        map ? 0 : 0.002,
      );
      Object.assign(mesh.userData, { tutorialPanel: true }, data);
      this.group.add(mesh);
      return mesh;
    };
    add(0, 0, W, H, {}, this.texture);
    this.slider = add(35, 55, 1002, 70, { practiceSlider: true });
    this.toggle = add(735, 0, 330, 50, { action: "progressive-practice" });
    this.targets = [
      this.slider,
      this.toggle,
      ...PRACTICE_TEMPOS.map((b) =>
        add(LEFT + sliderXFromTempo(b) * (RIGHT - LEFT) - 55, 132, 110, 62, {
          action: `practice-bpm:${b}`,
        }),
      ),
    ];
    this.dom = document.createElement("fieldset");
    this.dom.className = "practice-tempo";
    const label = document.createElement("label");
    label.textContent = "Practice BPM ";
    this.value = document.createElement("output");
    label.append(this.value);
    this.input = document.createElement("input");
    Object.assign(this.input, {
      type: "range",
      min: String(PRACTICE_MIN_BPM),
      max: String(BPM),
      step: "1",
      value: String(PRACTICE_DEFAULT_BPM),
    });
    this.input.setAttribute("aria-label", "Practice BPM");
    this.input.style.width = "100%";
    this.input.addEventListener("input", () => {
      this.preview = Number(this.input.value);
      this.draw();
    });
    this.input.addEventListener("change", () => this.commit());
    const presets = document.createElement("div");
    PRACTICE_TEMPOS.forEach((b) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = b === 92 ? "92 · Song tempo" : String(b);
      button.dataset.action = `practice-bpm:${b}`;
      presets.append(button);
    });
    const progressive = document.createElement("label");
    this.checkbox = document.createElement("input");
    this.checkbox.type = "checkbox";
    this.checkbox.addEventListener("change", () =>
      panel.onAction("progressive-practice"),
    );
    progressive.append(this.checkbox, " Progressive practice");
    this.dom.append(label, this.input, presets, progressive);
    panel.dom.insertBefore(this.dom, panel.nodes.actions);
    this.point = new THREE.Vector3();
    this.normal = new THREE.Vector3();
    this.rotation = new THREE.Quaternion();
    this.plane = new THREE.Plane();
    this.ray = new THREE.Ray();
    this.setModel(null);
  }
  setModel(model) {
    this.model = model;
    this.group.visible = Boolean(model);
    this.dom.hidden = !model;
    this.dom.disabled = Boolean(model?.disabled);
    for (const target of this.targets)
      target.userData.disabled = Boolean(model?.disabled);
    if (model) {
      this.checkbox.checked = model.progressive;
      this.draw();
    } else this.cancel();
  }
  draw() {
    if (!this.model) return;
    const bpm = this.preview ?? this.model.bpm;
    const key = `${bpm}:${this.model.progressive}:${this.model.disabled}`;
    if (key === this.key) return;
    this.key = key;
    this.input.value = String(bpm);
    this.value.textContent = `${bpm} · Song tempo: 92`;
    const ctx = this.canvas.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#102321";
    ctx.fillRect(0, 0, W, H);
    ctx.font = "600 32px sans-serif";
    ctx.fillStyle = "#fff4dd";
    ctx.fillText(`Practice BPM: ${bpm}`, 0, 34);
    ctx.font = "28px sans-serif";
    ctx.fillText(
      `${this.model.progressive ? "☑" : "☐"} Progressive practice`,
      735,
      34,
    );
    ctx.fillStyle = "#849b95";
    ctx.fillRect(LEFT, 86, RIGHT - LEFT, 7);
    ctx.fillStyle = "#83dfbd";
    ctx.beginPath();
    ctx.arc(
      LEFT + sliderXFromTempo(bpm) * (RIGHT - LEFT),
      90,
      18,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.textAlign = "center";
    PRACTICE_TEMPOS.forEach((b) => {
      const x = LEFT + sliderXFromTempo(b) * (RIGHT - LEFT);
      ctx.fillRect(x - 1, 108, 2, 13);
      ctx.fillText(String(b), x, 158);
    });
    ctx.font = "23px sans-serif";
    ctx.fillText("Song tempo", RIGHT - 20, 188);
    ctx.textAlign = "left";
    this.texture.needsUpdate = true;
  }
  fromPoint(point) {
    this.group.updateWorldMatrix(true, false);
    this.point.copy(point);
    this.group.worldToLocal(this.point);
    this.preview = tempoFromSliderX(
      (this.point.x / this.scaleX + W / 2 - LEFT) / (RIGHT - LEFT),
    );
    this.draw();
  }
  begin(hit) {
    if (!this.model || this.model.disabled) return false;
    this.dragging = true;
    this.fromPoint(hit.point);
    return true;
  }
  update(controller) {
    this.group.updateWorldMatrix(true, false);
    this.group.getWorldPosition(this.point);
    this.group.getWorldQuaternion(this.rotation);
    this.normal.set(0, 0, 1).applyQuaternion(this.rotation);
    this.plane.setFromNormalAndCoplanarPoint(this.normal, this.point);
    controller.getWorldPosition(this.ray.origin);
    controller.getWorldQuaternion(this.rotation);
    this.ray.direction.set(0, 0, -1).applyQuaternion(this.rotation);
    if (this.ray.intersectPlane(this.plane, this.point))
      this.fromPoint(this.point);
  }
  commit() {
    const value = this.preview;
    this.dragging = false;
    this.preview = null;
    this.draw();
    if (value !== null && value !== undefined)
      this.panel.onAction(`practice-bpm:${value}`);
  }
  cancel() {
    this.dragging = false;
    this.preview = null;
    this.draw();
  }
  dispose() {
    this.dom.remove();
    this.texture.dispose();
    this.group.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
    this.group.removeFromParent();
  }
}
