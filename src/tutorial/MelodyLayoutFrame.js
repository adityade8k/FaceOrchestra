import * as THREE from "three";
import { tuningForMidi } from "../compositions/jog/definition.js";

// A placement tool for melody instruments. Roots stay in the instrument scene
// so colliders, note labels and the normal performance path keep their owners.
export class MelodyLayoutFrame {
  constructor(ensemble, { createCanvas = () => document.createElement("canvas"), controls = true } = {}) {
    Object.assign(this, { ensemble, r: ensemble.r, a: ensemble.a, host: ensemble.host });
    this.enabled = true; this.scale = 1; this.blocked = new Set(); this.targets = [];
    const melodyRoles = new Set(ensemble.definition.score.events.map(e => e.role));
    // Keep the entire live palette in the frame, including bend-only pitches.
    const fullPalette = ensemble.definition.playback === "honk-live-two-hand-v1";
    this.recipes = ensemble.definition.arrangement.recipes.filter(p => p.kind === "honk" && (fullPalette || p.part === "melody" || melodyRoles.has(p.role)));
    const members = this.recipes.map(p => this.a.get(p.role));
    this.roles = new Set(this.recipes.map(p => p.role));
    this.root = new THREE.Group(); this.root.name = "Melody placement frame";
    this.root.quaternion.copy(this.a.layoutRotation);
    const inverse = new THREE.Matrix4().makeRotationFromQuaternion(this.a.layoutRotation).invert();
    const bounds = new THREE.Box3();
    for (const h of members) bounds.union(this.a.labelPresentation.instrumentBounds(h).clone().applyMatrix4(inverse));
    bounds.expandByScalar(.09);
    this.size = bounds.getSize(new THREE.Vector3());
    this.home = bounds.getCenter(new THREE.Vector3()).applyQuaternion(this.a.layoutRotation);
    this.homeRotation = this.root.quaternion.clone();
    this.root.position.copy(this.home);
    this.poses = this.recipes.map((recipe, i) => ({ recipe, h: members[i], offset: new THREE.Vector3(), quaternion: new THREE.Quaternion() }));
    this.captureMemberPoses();
    for (const pose of this.poses) pose.home = { offset: pose.offset.clone(), quaternion: pose.quaternion.clone(), scale: pose.scale };
    this.ray = new THREE.Raycaster(); this.quaternion = new THREE.Quaternion();
    this.point = new THREE.Vector3(); this.direction = new THREE.Vector3();
    this.r.scene.add(this.root);
    this.build(createCanvas);
    if (controls) this.buildControls();
    this.canvas = this.r.renderer.domElement;
    this.pointerDown = e => this.beginPointer(e);
    this.pointerMove = e => this.movePointer(e);
    this.pointerUp = e => { if (this.drag?.pointerId === e.pointerId) this.cancelDrag(); };
    this.blur = () => this.cancelDrag();
    this.canvas.addEventListener("pointerdown", this.pointerDown, true);
    this.canvas.addEventListener("pointermove", this.pointerMove, true);
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) this.canvas.addEventListener(type, this.pointerUp);
    globalThis.window?.addEventListener("blur", this.blur);
    this.update();
  }
  build(createCanvas) {
    const half = this.size.clone().multiplyScalar(.5);
    const add = (size, position, kind, color) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial({ color }));
      mesh.position.copy(position); mesh.userData.layoutHandle = kind;
      mesh.name = `Melody frame ${kind}`; this.root.add(mesh); this.targets.push(mesh);
      return mesh;
    };
    for (const axis of [0, 1, 2]) for (const x of [-1, 1]) for (const y of [-1, 1]) {
      const other = [0, 1, 2].filter(i => i !== axis), position = new THREE.Vector3();
      position.setComponent(other[0], half.getComponent(other[0]) * x);
      position.setComponent(other[1], half.getComponent(other[1]) * y);
      const size = [.009, .009, .009]; size[axis] = this.size.getComponent(axis);
      const rail = add(size, position, "move", 0x65c5eb);
      // A forgiving ray target around the visible rail, without filling a face.
      const hitSize = size.map((v, i) => i === axis ? v : .035);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(...hitSize), new THREE.MeshBasicMaterial({ visible: false }));
      hit.userData.layoutHandle = "move"; rail.add(hit); this.targets.push(hit);
    }
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1])
      add([.05, .05, .05], new THREE.Vector3(x * half.x, y * half.y, z * half.z), "scale", 0xffb45c);
    // Put the buttons in front of the forgiving rail hit volumes so Reset
    // cannot be intercepted as a grab on the rail behind its label.
    this.moveHandle = add([.36, .065, .035], new THREE.Vector3(0, half.y, half.z + .025), "move", 0x183e50);
    this.resetHandle = add([.18, .065, .035], new THREE.Vector3(half.x - .13, half.y, half.z + .025), "reset", 0x30574b);
    for (const [mesh, text] of [[this.moveHandle, "MOVE MELODY"], [this.resetHandle, "RESET"]]) {
      const canvas = createCanvas(); canvas.width = 512; canvas.height = 96;
      const ctx = canvas.getContext("2d"); ctx.clearRect(0, 0, 512, 96);
      ctx.fillStyle = "#ffffff"; ctx.font = "bold 46px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(text, 256, 48);
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      const label = new THREE.Mesh(new THREE.PlaneGeometry(mesh === this.moveHandle ? .32 : .15, .055),
        new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
      label.position.z = .019; label.raycast = () => {}; mesh.add(label);
    }
  }
  buildControls() {
    this.controls = document.createElement("fieldset"); this.controls.className = "rishte-layout-controls";
    this.controls.innerHTML = `<legend>Place the melody</legend><p>Grab the blue frame to move and rotate. Drag an orange corner to resize. Reset restores the original layout and deleted Honks.</p>
      <label>Size <output>100%</output><input aria-label="Melody layout size" type="range" min="${Math.ceil(this.minScale * 100)}" max="${Math.floor(this.maxScale * 100)}" value="100" step="1"></label>
      <div><button type="button" data-layout="near">Closer</button><button type="button" data-layout="far">Farther</button><button type="button" data-layout="reset">Reset layout</button></div>`;
    this.slider = this.controls.querySelector("input"); this.output = this.controls.querySelector("output");
    this.slider.addEventListener("input", () => this.apply(this.root.position, Number(this.slider.value) / 100));
    this.controls.addEventListener("click", e => {
      const action = e.target.closest("button")?.dataset.layout;
      if (action === "reset") this.reset();
      if (action === "near" || action === "far") {
        this.r.getUserCamera().getWorldQuaternion(this.quaternion);
        const delta = new THREE.Vector3(0, 0, action === "near" ? .1 : -.1).applyQuaternion(this.quaternion);
        this.apply(this.root.position.clone().add(delta), this.scale);
      }
    });
    this.host.panel.nodes.instruction.insertAdjacentElement("afterend", this.controls);
  }
  get members() { return this.poses.map(p => this.a.get(p.recipe.role)).filter(h => h && !h.disposed); }
  visualScaleFor(role) { return this.roles.has(role) ? this.scale : 1; }
  captureMemberPoses() {
    this.root.updateMatrixWorld(true);
    const inverseRotation = this.root.quaternion.clone().invert();
    for (const pose of this.poses) {
      pose.h = this.a.get(pose.recipe.role);
      if (!pose.h || pose.h.disposed) continue;
      pose.h.root.getWorldPosition(pose.offset);
      this.root.worldToLocal(pose.offset);
      pose.h.root.getWorldQuaternion(pose.quaternion).premultiply(inverseRotation);
      // Use the instrument's real size, excluding its transient sounding pulse.
      pose.scale = pose.h.baseScale / this.scale;
    }
    this.updateScaleLimits();
  }
  updateScaleLimits() {
    const live = this.poses.filter(p => p.h && !p.h.disposed);
    this.minScale = Math.max(.6, ...live.map(({ h, scale }) => this.r.getTransformProfile(h).minScale / scale));
    this.maxScale = Math.min(2, ...live.map(({ h, scale }) => this.r.getTransformProfile(h).maxScale / scale));
    if (this.slider) { this.slider.min = String(Math.ceil(this.minScale * 100)); this.slider.max = String(Math.floor(this.maxScale * 100)); }
  }
  apply(position, scale, quaternion = this.root.quaternion, { capture = true } = {}) {
    if (!this.enabled || !Number.isFinite(scale) || !position.toArray().every(Number.isFinite) ||
        !quaternion.toArray().every(Number.isFinite) || quaternion.lengthSq() < 1e-12) return false;
    // Read edits made with ordinary instrument grabs before moving the frame.
    if (capture) this.captureMemberPoses();
    this.scale = THREE.MathUtils.clamp(scale, this.minScale, this.maxScale);
    this.root.position.copy(position); this.root.quaternion.copy(quaternion).normalize();
    this.root.scale.setScalar(this.scale); this.root.updateMatrixWorld(true);
    const groups = new Set();
    for (const { h, offset, quaternion: rotation, scale: base } of this.poses) {
      if (!h || h.disposed) continue;
      h.root.position.copy(offset).applyMatrix4(this.root.matrixWorld);
      h.root.quaternion.copy(this.root.quaternion).multiply(rotation);
      this.r.setInstrumentBaseScale(h, base * this.scale); h.root.updateMatrixWorld(true);
      const group = this.r.honkLockService?.getGroupForMember(h.id);
      if (group) groups.add(group);
    }
    for (const group of groups) group.captureRelativeTransforms();
    this.a.snapshotAt = -Infinity;
    this.ensemble.hands?.update();
    if (this.slider) { this.slider.value = String(Math.round(this.scale * 100)); this.output.textContent = `${Math.round(this.scale * 100)}%`; }
    return true;
  }
  reset() {
    if (!this.enabled) return false;
    this.cancelDrag();
    for (const pose of this.poses) {
      const { recipe } = pose;
      let h = this.a.get(recipe.role);
      if (!h || h.disposed) {
        if (!this.r.createSpawnedComponent("honk", { name: recipe.role, baseScale: pose.home.scale, tuning: tuningForMidi(recipe.midi) })) {
          if (this.host.dataTutorial) this.host.dataTutorial.feedback = `Could not restore ${recipe.role}. Free some space and press Reset again.`;
          this.host.lastDraw = -Infinity;
          return false;
        }
        h = this.r.activeInstrumentState;
        this.a.roles.set(recipe.role, [h.id]);
        this.a.labelPresentation.styleNote(h);
      }
      pose.h = h; pose.offset.copy(pose.home.offset); pose.quaternion.copy(pose.home.quaternion); pose.scale = pose.home.scale;
      h.root.visible = true;
    }
    // A second hand must not keep dragging a member back after Reset.
    const members = new Set(this.members);
    for (const [controller, state] of this.r.controllerStates)
      if (members.has(state.gripSourceInstrumentState) || members.has(state.gripInstrumentState)) this.r.handleGripEndIntent(controller);
    this.updateScaleLimits();
    return this.apply(this.home, 1, this.homeRotation, { capture: false });
  }
  setEnabled(enabled) { this.enabled = enabled; if (!enabled) this.cancelDrag(); this.update(); }
  hit(ray) {
    if (!this.enabled || !this.root.visible) return null;
    this.root.updateMatrixWorld(true);
    return ray.intersectObjects(this.targets, false)[0] || null;
  }
  controllerRay(controller) {
    controller.getWorldPosition(this.point); controller.getWorldQuaternion(this.quaternion);
    this.ray.set(this.point, this.direction.set(0, 0, -1).applyQuaternion(this.quaternion));
    return this.ray;
  }
  captureIntent(intent, state) {
    const controller = intent.controller;
    if (controller?.userData.virtualTutorial) return false;
    if (this.blocked.has(controller)) {
      if (this.drag?.controller === controller) {
        if (!state[this.drag.button]) this.cancelDrag();
        else if (intent.type === "instrument.scale.horizontal.step" && intent.direction) {
          this.apply(this.root.position, this.scale + intent.direction * .1);
          if (this.drag.kind === "scale") {
            this.drag.scale = this.scale;
            this.controllerRay(controller).ray.at(this.drag.distance, this.drag.point);
          }
        }
      }
      if (!state.grip && !state.trigger && !state.primary && !state.secondary) this.blocked.delete(controller);
      return true;
    }
    if (!this.enabled || this.host.navigationScreen) return false;
    const hit = this.hit(this.controllerRay(controller));
    if (!hit) return false;
    const panel = this.host.panelHit(controller), instrument = this.r.raycastSystem.getCurrentHit(controller);
    if ((panel && panel.distance < hit.distance) || (instrument && instrument.distance < hit.distance)) return false;
    if (!intent.type.endsWith(".begin")) return false;
    if (!["interaction.grip.begin", "interaction.trigger.begin"].includes(intent.type)) return false;
    this.blocked.add(controller);
    this.r.clearControllerTriggerInteraction(state); this.r.handleGripEndIntent(controller); this.r.closeRadialMenu(controller);
    if (this.drag) return true; // One owner for a whole-layout transform.
    if (hit.object.userData.layoutHandle === "reset") { this.reset(); return true; }
    this.begin(hit, { controller, button: intent.type.includes(".grip.") ? "grip" : "trigger" });
    controller.addEventListener("disconnected", this.blur);
    return true;
  }
  begin(hit, owner) {
    this.drag = { ...owner, kind: hit.object.userData.layoutHandle, distance: hit.distance,
      point: hit.point.clone(), center: this.root.position.clone(), scale: this.scale };
    if (owner.controller && this.drag.kind === "move") {
      owner.controller.updateMatrixWorld(true); this.root.updateMatrixWorld(true);
      // Match GripTransformSystem: retain the complete controller-to-object pose.
      this.drag.gripOffset = owner.controller.matrixWorld.clone().invert().multiply(this.root.matrixWorld);
      this.drag.matrix = new THREE.Matrix4(); this.drag.position = new THREE.Vector3();
      this.drag.quaternion = new THREE.Quaternion(); this.drag.worldScale = new THREE.Vector3();
    }
  }
  move(point) {
    const d = this.drag;
    if (!d) return;
    if (d.kind === "scale") this.apply(d.center, d.scale * point.distanceTo(d.center) / Math.max(d.point.distanceTo(d.center), .01));
    else this.apply(point.clone().sub(d.point).add(d.center), this.scale);
  }
  pointerRay(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.ray.setFromCamera({ x: (event.clientX - rect.left) / rect.width * 2 - 1,
      y: 1 - (event.clientY - rect.top) / rect.height * 2 }, this.r.getUserCamera());
    return this.ray;
  }
  beginPointer(event) {
    if (event.button !== 0 || this.drag || this.r.renderer.xr.isPresenting) return;
    const hit = this.hit(this.pointerRay(event)); if (!hit) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (hit.object.userData.layoutHandle === "reset") { this.reset(); return; }
    this.r.getUserCamera().getWorldDirection(this.direction);
    this.begin(hit, { pointerId: event.pointerId, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(this.direction, hit.point) });
    this.canvas.setPointerCapture(event.pointerId);
  }
  movePointer(event) {
    if (this.drag?.pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const point = this.pointerRay(event).ray.intersectPlane(this.drag.plane, this.point);
    if (point) this.move(point);
  }
  cancelDrag() {
    const drag = this.drag; this.drag = null;
    drag?.controller?.removeEventListener("disconnected", this.blur);
    if (drag?.pointerId !== undefined && this.canvas.hasPointerCapture(drag.pointerId)) this.canvas.releasePointerCapture(drag.pointerId);
  }
  update() {
    this.root.visible = this.enabled && !this.host.navigationScreen;
    const hidden = !this.root.visible || Boolean(this.host.panel.xr);
    if (this.controls && this.controls.hidden !== hidden) this.controls.hidden = hidden;
    if (!this.root.visible) this.cancelDrag();
    if (this.drag?.controller) {
      const { controller, button, distance } = this.drag;
      if (!this.r.controllerStates.get(controller)?.[button]) this.cancelDrag();
      else if (this.drag.gripOffset) {
        const d = this.drag; controller.updateMatrixWorld(true);
        d.matrix.multiplyMatrices(controller.matrixWorld, d.gripOffset).decompose(d.position, d.quaternion, d.worldScale);
        this.apply(d.position, this.scale, d.quaternion);
      } else this.move(this.controllerRay(controller).ray.at(distance, this.point));
    }
    if (this.enabled) this.ensemble.hands?.update();
  }
  dispose() {
    this.cancelDrag();
    for (const controller of this.blocked) {
      const state = this.r.controllerStates.get(controller);
      if (state?.trigger) state.suppressTriggerUntilRelease = true;
    }
    this.blocked.clear(); this.controls?.remove(); this.root.removeFromParent();
    this.root.traverse(node => { node.geometry?.dispose(); node.material?.map?.dispose(); node.material?.dispose(); });
    this.canvas.removeEventListener("pointerdown", this.pointerDown, true);
    this.canvas.removeEventListener("pointermove", this.pointerMove, true);
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) this.canvas.removeEventListener(type, this.pointerUp);
    globalThis.window?.removeEventListener("blur", this.blur);
  }
}
