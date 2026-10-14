import * as THREE from "three";

const span = (Math.PI * 2) / 3;
const signed = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}`;
// Shared dial presentation for authored guidance and continuous live play.
export class BendGauge {
  constructor(scene, createCanvas = () => document.createElement("canvas")) {
    this.root = new THREE.Group();
    this.root.name = "Tutorial bend gauge";
    this.root.userData.headsetGuidance = true;
    scene.add(this.root);
    this.resources = [];
    const mesh = (geometry, color) => {
      const material = new THREE.MeshBasicMaterial({
        color,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        side: THREE.DoubleSide,
      });
      const node = new THREE.Mesh(geometry, material);
      node.raycast = () => {};
      node.renderOrder = 105;
      this.root.add(node);
      this.resources.push(geometry, material);
      return node;
    };
    this.track = mesh(new THREE.RingGeometry(1.46, 1.48, 96), 0x8a9f9b);
    this.ticks = [];
    const atlas = createCanvas();
    atlas.width = 704;
    atlas.height = 64;
    const ac = atlas.getContext("2d");
    ac.fillStyle = "#fff4dd";
    ac.font = "28px sans-serif";
    ac.textAlign = "center";
    for (let i = -5; i <= 5; i++)
      ac.fillText(i > 0 ? `+${i}` : String(i), (i + 5) * 64 + 32, 42);
    this.tickTexture = new THREE.CanvasTexture(atlas);
    this.tickTexture.colorSpace = THREE.SRGBColorSpace;
    this.tickLabels = [];
    for (let i = -5; i <= 5; i++) {
      const tick = mesh(
        new THREE.PlaneGeometry(i === 0 ? 0.045 : 0.025, i === 0 ? 0.18 : 0.1),
        0xcbd7d2,
      );
      tick.userData.semitones = i;
      this.ticks.push(tick);
      const geometry = new THREE.PlaneGeometry(0.38, 0.38),
        uv = geometry.attributes.uv;
      for (let j = 0; j < uv.count; j++) uv.setX(j, (uv.getX(j) + i + 5) / 11);
      const label = mesh(geometry, 0xffffff);
      label.material.map = this.tickTexture;
      label.userData.semitones = i;
      this.tickLabels.push(label);
    }
    // At the top of the gauge, the tip faces down toward the Honk. place()
    // rotates this inward-facing orientation with the marker around the ring.
    this.expected = mesh(new THREE.CircleGeometry(0.13, 3).rotateZ(-Math.PI / 2), 0xffd15a);
    // The moving target stays above the gauge ticks and sustain feedback.
    this.expected.renderOrder = 110;
    this.actual = mesh(new THREE.CircleGeometry(0.075, 16), 0x60ef9b);
    this.destination = mesh(new THREE.PlaneGeometry(0.04, 0.22), 0xffffff);
    // Pooled quarter-semitone sectors share resources. Visibility/rotation are
    // captured by the existing presentation recorder, unlike draw-range edits.
    this.arc = new THREE.Group();
    this.root.add(this.arc);
    this.arcGeometries = [4, 5].map(range => new THREE.RingGeometry(1.1, 1.15, 4, 1, 0, span / (range * 4)));
    this.arcGeometry = this.arcGeometries[0];
    this.arcMaterial = new THREE.MeshBasicMaterial({
      color: 0x60ef9b,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.resources.push(...this.arcGeometries, this.arcMaterial);
    for (let i = -20; i < 20; i++) {
      const sector = new THREE.Mesh(this.arcGeometry, this.arcMaterial);
      sector.userData.segment = i;
      sector.renderOrder = 105;
      sector.raycast = () => {};
      this.arc.add(sector);
    }
    this.canvas = createCanvas();
    this.canvas.width = 640;
    this.canvas.height = 128;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.label = mesh(new THREE.PlaneGeometry(4.8, 0.96), 0xffffff);
    this.label.material.map = this.texture;
    this.label.position.set(0, -2.05, 0.02);
    this.root.visible = false;
  }
  place(node, value, radius, orientation) {
    const angle = (Math.max(-this.range, Math.min(this.range, value)) / this.range) * span * orientation;
    node.position.set(Math.sin(angle) * radius, Math.cos(angle) * radius, 0.01);
    node.rotation.z = -angle;
  }
  update(
    state,
    point,
    radius,
    quaternion,
    orientation = 1,
    binding = null,
    now = 0,
  ) {
    this.range = state.range === 5 ? 5 : 4;
    this.root.visible = true;
    this.root.position.copy(point);
    this.root.quaternion.copy(quaternion);
    this.root.scale.setScalar(radius * 1.12);
    this.root.userData.binding = binding && {
      targetId: binding.targetId,
      role: binding.role,
      gestureId: binding.gestureId,
      controller: binding.controller.uuid,
    };
    this.state = state;
    for (const tick of this.ticks) {
      tick.visible = Math.abs(tick.userData.semitones) <= this.range;
      this.place(tick, tick.userData.semitones, 1.48, orientation);
    }
    for (const tick of this.tickLabels) {
      tick.visible = Math.abs(tick.userData.semitones) <= this.range;
      this.place(tick, tick.userData.semitones, 1.88, orientation);
      tick.rotation.z = 0;
    }
    this.expected.visible = this.destination.visible = !state.normalPlay;
    this.place(this.expected, state.required ?? 0, 1.37, orientation);
    this.expected.material.color.setHex(state.preview ? 0x60ef9b : 0xffd15a);
    this.place(this.destination, state.destinationSemitones ?? 0, 1.64, orientation);
    this.actual.visible = this.arc.visible = state.actual !== null;
    if (this.actual.visible) {
      this.place(this.actual, state.actual, 1.18, orientation);
      // Separate radial lanes preserve both silhouettes at a matching pitch.
      this.actual.position.z = 0.015;
      const color = state.onTarget
        ? 0x60ef9b
        : /Wrong|Overshoot/.test(state.status)
          ? 0xff765e
          : 0x79ceff;
      this.actual.material.color.setHex(color);
      this.arcMaterial.color.setHex(color);
      const amount = Math.max(-this.range, Math.min(this.range, state.actual)) * 4;
      for (const sector of this.arc.children) {
        const i = sector.userData.segment;
        sector.geometry = this.arcGeometries[this.range === 5 ? 1 : 0];
        sector.visible =
          amount >= 0
            ? i >= 0 && i < Math.floor(amount)
            : i < 0 && i >= Math.ceil(amount);
        sector.rotation.z =
          Math.PI / 2 - ((orientation > 0 ? i + 1 : -i) * span) / (this.range * 4);
      }
    }
    const text = state.normalPlay ? `Bend ${signed(state.actual)} semitones\nRange −${this.range} to +${this.range}` : `${state.start} → ${state.destination}\n▲ Target ${signed(state.required)} · ● ${state.demonstration ? "Demo" : "You"} ${state.actual === null ? "—" : signed(state.actual)}\n${state.status}`;
    if (
      text !== this.text &&
      (now - (this.labelAt ?? -Infinity) >= 100 ||
        this.bindingId !== binding?.gestureId ||
        this.preview !== state.preview)
    ) {
      this.text = text;
      this.labelAt = now;
      this.bindingId = binding?.gestureId;
      this.preview = state.preview;
      const ctx = this.canvas.getContext("2d");
      ctx.clearRect(0, 0, 640, 128);
      ctx.fillStyle = "#102321dd";
      ctx.fillRect(0, 0, 640, 128);
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff4dd";
      ctx.font = "26px sans-serif";
      text
        .split("\n")
        .forEach((line, i) => ctx.fillText(line, 320, 32 + i * 39));
      this.texture.needsUpdate = true;
    }
  }
  reset() {
    this.root.visible = false;
    this.root.userData.binding = null;
    this.state = null;
  }
  dispose() {
    this.root.removeFromParent();
    this.texture.dispose();
    this.tickTexture.dispose();
    this.resources.forEach((r) => r.dispose());
  }
}
