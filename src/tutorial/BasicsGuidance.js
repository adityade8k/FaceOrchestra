import * as THREE from 'three';
import { INTERACTION_TARGET_NAMES, MAX_PITCH_BEND_SEMITONES } from '../config/honk.js';
import { getLooperButtonName, getLooperControlName } from '../instruments/looper/looperNames.js';
import { BASICS_EARS } from './basicsSteps.js';
import { BendGauge } from './BendGauge.js';

export class BasicsGuidance {
  constructor(tutorial) {
    this.t = tutorial; this.r = tutorial.r;
    this.scratch = new THREE.Vector3(); this.eye = new THREE.Vector3();
    this.desired = new THREE.Vector3(); this.rotation = new THREE.Quaternion();
    this.look = new THREE.Object3D(); this.bounds = new THREE.Box3();
    this.bodyBounds = new THREE.Box3(); this.notePosition = new THREE.Vector3();
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.065, 0.07, 48),
      new THREE.MeshBasicMaterial({ color: 0x83dfbd, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    this.ring.raycast = () => {}; this.ring.renderOrder = 30; this.ring.visible = false;
    this.ring.name = 'Basics target cue';
    this.arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 0.12, 0xffd591, 0.035, 0.022);
    this.arrow.line.geometry = this.arrow.line.geometry.clone();
    this.arrow.cone.geometry = this.arrow.cone.geometry.clone();
    this.arrow.traverse(o => { o.raycast = () => {}; }); this.arrow.visible = false;
    this.badgeCanvas = document.createElement('canvas');
    this.badgeCanvas.width = 384; this.badgeCanvas.height = 80;
    this.badgeTexture = new THREE.CanvasTexture(this.badgeCanvas);
    this.badgeTexture.colorSpace = THREE.SRGBColorSpace;
    this.badge = new THREE.Mesh(new THREE.PlaneGeometry(.25, .052),
      new THREE.MeshBasicMaterial({ map: this.badgeTexture, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.badge.raycast = () => {}; this.badge.visible = false;
    this.badge.name = 'Basics controller cue';
    this.r.scene.add(this.ring, this.arrow, this.badge);
    this.bend = new BendGauge(this.r.scene);
    this.recenter();
  }
  target() {
    const t = this.t, h = t.horn, l = t.looper, m = t.fixtures.get('metronome');
    let target = t.step.target;
    if (t.step.id === 'pitch' && t.objectives?.has('bend')) target = 'ear';
    if (target === 'ear') {
      const cue = BASICS_EARS[t.objectives?.size || 0] || BASICS_EARS[0];
      return h?.hitTargets[INTERACTION_TARGET_NAMES[cue.side + 'Ear']];
    }
    if (target === 'squeeze') return h?.hitTargets[INTERACTION_TARGET_NAMES.horn];
    if (target === 'body' || target === 'group') return h?.root;
    if (target === 'mouth' || target === 'nose') return h?.hitTargets[INTERACTION_TARGET_NAMES[target]];
    if (target === 'metronome-play') return [...(m?.targetsByRole?.values() || [])].find(o => o.userData.metronomeButtonAction === 'play') || m?.root;
    if (target === 'bpm') return m?.handleRig?.controls.get('bpm')?.collider || m?.handleRig?.controls.get('bpm')?.node || m?.root;
    if (['recordLength', 'gap'].includes(target)) return l?.hitTargets[getLooperControlName(target)];
    if (target === 'record') return t.objectives?.has('armed') ? h?.squeezeCollider : l?.hitTargets[getLooperButtonName('record')];
    if (target === 'play') {
      const owner = t.step.id === 'switch' && t.objectives?.has('first') ? t.fixtures.get('alternativeLooper') : l;
      return owner?.hitTargets[getLooperButtonName(t.step.id === 'playback' && t.objectives?.has('heard') ? 'stop' : 'play')];
    }
    if (target === 'honk-wire') return l?.tracks.find(track => !track.connectedHonkId)?.nodeTarget;
    if (target === 'clock-wire') {
      const first = t.fixtures.get('chordLooper');
      const connection = first && this.r.metronomeConnectionManager.getConnectionForTarget('looper', first.id);
      const portId = t.step.id === 'shared-clock' ? connection?.portId : m?.connectionPorts.keys().next().value;
      return m?.getConnectionPortTarget(portId) || m?.root;
    }
    return null;
  }
  recenter({ pin = false } = {}) {
    const camera = this.r.getUserCamera();
    camera.getWorldPosition(this.eye); camera.getWorldQuaternion(this.rotation);
    this.desired.set(0, 0.15, -1.45).applyQuaternion(this.rotation).add(this.eye);
    this.t.host.panel.group.position.copy(this.desired);
    this.pinned = pin; this.anchorAt = -Infinity;
  }
  update(now) {
    const t = this.t, panel = t.host.panel, camera = this.r.getUserCamera();
    const visible = !t.host.navigationScreen && t.host.menu.visible;
    const target = this.target();
    camera.getWorldPosition(this.eye); camera.getWorldQuaternion(this.rotation);
    const alpha = 1 - Math.exp(-Math.min(50, Math.max(0, now - (this.lastAt ?? now - 16))) / 160);
    this.lastAt = now;
    const moving = [...this.r.controllerStates.values()].some(s => s.gripHeld && t.fixtures.owned.has(s.gripSourceInstrumentState?.id));
    if (!moving && !this.pinned && target && now - this.anchorAt > 100) {
      this.anchorAt = now; this.bounds.makeEmpty();
      const owner = t.step.target === 'record' ? t.looper : this.r.instrumentRegistry.getFromObject3D(target);
      const owners = t.step.target === 'group' ? t.fixtures.honks : [owner].filter(Boolean);
      for (const h of owners) {
        if (h.kind === 'honk' && h.noteLabelGroup && h.honkVisualRoot) {
          // The free-play label has a large fixed offset. Keep this existing
          // pitch label compact and adjacent to the real hat in onboarding.
          t.a.labelPresentation.styleNote(h);
          this.bodyBounds.setFromObject(h.honkVisualRoot);
          this.bodyBounds.getCenter(this.notePosition);
          this.notePosition.y = this.bodyBounds.max.y + .025;
          h.noteLabelGroup.position.copy(h.root.worldToLocal(this.notePosition));
          h.noteLabelGroup.updateWorldMatrix(true, true);
        }
        this.bounds.expandByObject(h.root);
      }
      if (!this.bounds.isEmpty()) {
        this.bounds.getCenter(this.desired);
        // Panel bottom stays at least 10 cm above the face/controls.
        this.desired.y = this.bounds.max.y + 0.10 + 0.33 * panel.group.scale.y;
        // Avoid chasing far-away objects; Reset lesson brings the fixture back.
        if (this.desired.distanceTo(this.eye) > 3) this.desired.copy(panel.group.position);
      }
    }
    if (!t.host.menu.drag && visible) {
      panel.group.position.lerp(this.desired, alpha);
      this.look.position.copy(panel.group.position); this.look.lookAt(this.eye);
      panel.group.quaternion.slerp(this.look.quaternion, alpha);
      panel.group.updateMatrixWorld(true);
    }
    this.ring.visible = Boolean(visible && target);
    this.badge.visible = this.ring.visible;
    this.arrow.visible = false;
    if (this.ring.visible) {
      target.getWorldPosition(this.scratch);
      this.ring.position.copy(this.scratch); this.ring.quaternion.copy(this.rotation);
      const label = ({
        move: 'GRIP  ↔', rotate: 'GRIP  ↻', small: 'GRIP + ←', big: 'GRIP + →',
        duplicate: 'GRIP + A', freeze: t.objectives.has('freeze') ? 'GRIP  ↔' : 'B',
        unfreeze: 'B', clear: 'X', strike: 'GRIP',
      })[t.step.id] || 'TRIGGER';
      if (label !== this.badgeLabel) {
        this.badgeLabel = label;
        const ctx = this.badgeCanvas.getContext('2d');
        ctx.clearRect(0, 0, 384, 80); ctx.fillStyle = '#102321dd';
        ctx.beginPath(); ctx.roundRect(2, 2, 380, 76, 30); ctx.fill();
        ctx.strokeStyle = '#83dfbd'; ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = '#fff4dd'; ctx.font = '600 38px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(label, 192, 54); this.badgeTexture.needsUpdate = true;
      }
      this.badge.position.copy(this.scratch).add(new THREE.Vector3(.27, -.09, 0).applyQuaternion(this.rotation));
      this.badge.quaternion.copy(this.rotation);
      const radius = t.step.target === 'squeeze' ? t.horn?.getSqueezeColliderSphere()?.radius : null;
      this.ring.scale.setScalar(radius ? radius * 1.18 / 0.07 : 1);
      this.ring.material.opacity = t.successAt !== null ? 1 : 0.6 + Math.sin(now / 380) * 0.12;
      const cue = t.step.id === 'ears' ? BASICS_EARS[t.objectives.size] :
        t.step.id === 'volume' ? { direction: t.objectives.has('up') ? -1 : 1 } : null;
      if (cue) {
        this.arrow.visible = visible;
        this.arrow.position.copy(this.scratch).add(new THREE.Vector3(0.11, 0, 0).applyQuaternion(this.rotation));
        this.arrow.setDirection(new THREE.Vector3(0, cue.direction, 0));
      } else if (['move', 'rotate', 'small', 'big'].includes(t.step.id)) {
        this.arrow.visible = true;
        const angle = t.step.id === 'rotate' ? now / 700 : 0;
        this.arrow.position.copy(this.scratch).add(new THREE.Vector3(.15, .04, 0).applyQuaternion(this.rotation));
        this.arrow.setDirection(new THREE.Vector3(Math.cos(angle) * (t.step.id === 'small' ? -1 : 1), Math.sin(angle), 0).applyQuaternion(this.rotation));
      }
    }
    if (visible && ['bend', 'pitch'].includes(t.step.id) && t.horn) {
      const sphere = t.horn.getSqueezeColliderSphere();
      const bend = t.horn.getProcessedLivePerformanceState().bend * MAX_PITCH_BEND_SEMITONES;
      if (sphere) this.bend.update({
        required: bend < -0.1 ? -1 : 1, actual: bend, destinationSemitones: bend < -0.1 ? -1 : 1, start: 'Squeeze',
        destination: 'Roll wrist', status: 'Either direction · at least one semitone',
        onTarget: Math.abs(bend) >= 0.88,
      }, sphere.center, Math.max(0.055, sphere.radius * 0.6), this.rotation, 1, null, now);
    } else this.bend.reset();
    panel.animate(now);
    if (panel.xr && visible) {
      const hit = this.r.controllers.filter(c => !c.userData.virtualTutorial).map(c => t.host.panelHit(c)).find(h => h?.object.userData.action);
      panel.hover(hit?.object);
    }
  }
  reset() { this.ring.visible = false; this.arrow.visible = false; this.badge.visible = false; this.bend.reset(); this.pinned = false; this.anchorAt = -Infinity; }
  dispose() {
    this.bend.dispose(); this.ring.removeFromParent(); this.arrow.removeFromParent();
    this.ring.geometry.dispose(); this.ring.material.dispose();
    this.badge.removeFromParent(); this.badge.geometry.dispose(); this.badge.material.dispose(); this.badgeTexture.dispose();
    this.arrow.line.geometry.dispose(); this.arrow.line.material.dispose();
    this.arrow.cone.geometry.dispose(); this.arrow.cone.material.dispose();
  }
}
