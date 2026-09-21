import { Euler, MathUtils } from 'three';

export const defaultCamera = () => ({position:[0,1.4,3],rotation:[0,0,0],fov:55,center:[0,0]});

export function validCamera(camera) {
  return camera && ['position','rotation','center'].every((key) =>
    Array.isArray(camera[key]) && camera[key].length === (key === 'center' ? 2 : 3) && camera[key].every(Number.isFinite)) &&
    Number.isFinite(camera.fov) && camera.fov >= 10 && camera.fov <= 130;
}

// A gizmo is an editing adapter for the existing camera, not a second camera model.
// Moving must not canonicalize an unchanged Euler rotation or lose lens precision.
export function cameraFromHandle(camera, object, mode, {startCamera=camera,axis='XYZ'}={}) {
  const next = structuredClone(camera);
  if (mode === 'translate') next.position = object.position.toArray();
  else if (mode === 'rotate') {
    const euler = new Euler().setFromQuaternion(object.quaternion, 'YXZ');
    next.rotation = [euler.x, euler.y, euler.z].map(MathUtils.radToDeg);
  } else if (mode === 'scale') {
    // Scale the viewing frustum uniformly through FOV, preserving metric scene
    // geometry and the portrait aspect. Always use the drag's starting lens:
    // TransformControls reports an absolute scale, not an incremental delta.
    const axes = [...axis].filter(value => 'XYZ'.includes(value));
    const factors = axes.map(value => object.scale[value.toLowerCase()]);
    if (!factors.length || !factors.every(Number.isFinite)) return next;
    const factor = factors.reduce((product,value) => product*Math.max(1e-6,Math.min(1e6,value)),1)**(1/factors.length);
    next.fov = factor === 1 ? startCamera.fov : MathUtils.clamp(
      MathUtils.radToDeg(2*Math.atan(Math.tan(MathUtils.degToRad(startCamera.fov/2))*factor)),10,130);
  }
  return next;
}

export class CameraHistory {
  constructor() { this.entries = []; this.pending = null; }
  begin(state) { this.pending ??= structuredClone(state); }
  commit(state) {
    if (this.pending && JSON.stringify(this.pending.camera) !== JSON.stringify(state.camera)) {
      this.entries.push(this.pending);
      if (this.entries.length > 64) this.entries.shift();
    }
    this.pending = null;
  }
  undo(state) { this.commit(state); return this.entries.pop(); }
  clear() { this.entries = []; this.pending = null; }
  available(state) {
    return this.entries.length > 0 || Boolean(this.pending && JSON.stringify(this.pending.camera) !== JSON.stringify(state.camera));
  }
}

// These are video timestamps only. No camera state is ever attached to a frame.
export function normalizeBookmarks(bookmarks, duration = Infinity) {
  return [...new Set((Array.isArray(bookmarks) ? bookmarks : [])
    .filter(time => Number.isFinite(time) && time >= 0 && time <= duration))].sort((a,b) => a-b);
}

export function sameVideo(a, b) {
  return Boolean(a && b && a.name === b.name && a.size === b.size &&
    ['width','height','duration'].every(key => a[key] === undefined || b[key] === undefined || a[key] === b[key]));
}
