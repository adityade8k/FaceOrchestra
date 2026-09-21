import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

function label(text, color) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  context.font = '600 30px system-ui';
  canvas.width = Math.ceil(context.measureText(text).width)+32; canvas.height = 64;
  context.fillStyle = '#101916e8'; context.fillRect(0,0,canvas.width,64);
  context.font = '600 30px system-ui'; context.fillStyle = color;
  context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(text,canvas.width/2,32);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,depthWrite:false,sizeAttenuation:false}));
  sprite.renderOrder = 10;
  return sprite;
}

/** Renders the recorded scene with an independent viewing camera. Every editing
 * helper belongs to this private scene; none is attached to ReplayScene.scene. */
export class SceneInspector {
  constructor(container, {begin, change, end}) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({antialias:true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x14211d);
    container.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label','3D scene. Camera controls: W to translate, E to rotate, R to scale the view, Q to inspect. Drag elsewhere to orbit, right-drag to pan, scroll to zoom.');
    this.renderer.domElement.tabIndex = 0;
    this.camera = new THREE.PerspectiveCamera(48,1,.01,100);
    this.camera.position.set(3.8,2.9,5.4);
    this.camera.lookAt(0,1.15,1.2);
    this.helpers = new THREE.Scene();
    this.grid = new THREE.GridHelper(12,24,0x779284,0x344c40); this.helpers.add(this.grid);
    this.phone = new THREE.Group(); this.phone.name = 'Phone camera'; this.helpers.add(this.phone);
    // The editing adapter can receive scale gestures. Its visible phone and
    // frustum use only the actual camera pose/projection, never adapter scale.
    this.phoneVisual = new THREE.Group(); this.helpers.add(this.phoneVisual);
    const body = new THREE.Mesh(new THREE.BoxGeometry(.14,.25,.035),new THREE.MeshBasicMaterial({color:0xf4d689}));
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(.11,.2),new THREE.MeshBasicMaterial({color:0x25372c}));
    screen.position.z = .018;
    const lens = new THREE.Mesh(new THREE.SphereGeometry(.025,12,8),new THREE.MeshBasicMaterial({color:0x111a15}));
    lens.position.set(-.04,.08,-.025); this.phoneVisual.add(body,screen,lens);
    this.phoneLabel = label('PHONE CAMERA','#f4d689'); this.helpers.add(this.phoneLabel);
    this.frustum = new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xf4d689,transparent:true,opacity:.55}));
    this.frustum.geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(16*3),3));
    this.phoneVisual.add(this.frustum);
    this.markers = new Map();
    for (const [name,title,color] of [['headset','HEADSET','#83baff'],['left','LEFT · grip origin','#66edbe'],['right','RIGHT · grip origin','#ffa96c']]) {
      const marker = new THREE.Group();
      marker.add(new THREE.Mesh(name === 'headset' ? new THREE.BoxGeometry(.16,.09,.1) : new THREE.SphereGeometry(.035,12,8),new THREE.MeshBasicMaterial({color,wireframe:true})));
      const axes = new THREE.AxesHelper(.12); marker.add(axes);
      const caption = label(title,color); this.helpers.add(marker,caption);
      caption.center.x = name === 'left' ? 1 : name === 'right' ? 0 : .5;
      this.markers.set(name,{marker,caption}); marker.visible = caption.visible = false;
    }
    // Register TransformControls before orbit's pointer handler would begin a drag:
    // its dragging-changed event disables orbit synchronously on handle selection.
    this.transform = new TransformControls(this.camera,this.renderer.domElement);
    this.transform.setSize(.85); this.transform.setSpace('world');
    this.helpers.add(this.transform);
    this.orbit = new OrbitControls(this.camera,this.renderer.domElement);
    this.orbit.target.set(0,1.15,1.2); this.orbit.minDistance = .15; this.orbit.maxDistance = 30; this.orbit.update();
    this.orbit.addEventListener('change',() => this.render());
    this.transform.addEventListener('dragging-changed',event => { this.orbit.enabled = !this.locked && !event.value; });
    this.transform.addEventListener('mouseDown',() => begin());
    this.transform.addEventListener('objectChange',() => change(this.phone,this.transform.mode));
    this.transform.addEventListener('mouseUp',() => { this.phone.scale.setScalar(1); end(); });
    this.transform.addEventListener('change',() => this.render());
    this.setMode('translate');
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === 'inspect') this.transform.detach();
    else { this.transform.setMode(mode); this.transform.attach(this.phone); }
    this.render();
  }

  setLocked(locked) {
    this.locked = locked; this.transform.enabled = !locked; this.orbit.enabled = !locked;
    this.container.inert = locked;
  }

  update(replay, frame) {
    this.replay = replay;
    // The exact projection, including image-center offsets, comes from the
    // composite camera. Truncate only the drawn frustum's length for legibility.
    const camera = replay.camera;
    if (!this.transform.dragging) {
      this.phone.position.copy(camera.position); this.phone.quaternion.copy(camera.quaternion); this.phone.scale.setScalar(1);
    }
    this.phoneVisual.position.copy(camera.position); this.phoneVisual.quaternion.copy(camera.quaternion);
    this.phoneLabel.position.copy(this.phone.position).add(new THREE.Vector3(0,.3,0));
    const corners = [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y]) => {
      const p = new THREE.Vector3(x,y,1).applyMatrix4(camera.projectionMatrixInverse);
      return p.multiplyScalar(2.5 / -p.z);
    });
    const points = [];
    for (let i=0;i<4;i++) points.push(new THREE.Vector3(),corners[i],corners[i],corners[(i+1)%4]);
    const positions = this.frustum.geometry.getAttribute('position');
    points.forEach((p,i) => positions.setXYZ(i,p.x,p.y,p.z));
    positions.needsUpdate = true; this.frustum.geometry.computeBoundingSphere();
    for (const [name,{marker,caption}] of this.markers) {
      const pose = name === 'headset' ? frame?.xr.viewer : frame?.xr.controllers.find(c => c.handedness === name)?.grip;
      marker.visible = caption.visible = Boolean(pose);
      if (pose) {
        marker.position.fromArray(pose.p); marker.quaternion.fromArray(pose.q);
        caption.position.copy(marker.position).add(new THREE.Vector3(name === 'left' ? -.12 : name === 'right' ? .12 : 0,name === 'headset' ? .24 : -.16,0));
      }
    }
    this.render();
  }

  resize() {
    const {width,height} = this.container.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width,height,false); this.camera.aspect = width/height;
    this.camera.updateProjectionMatrix(); this.render();
  }

  render() {
    if (!this.replay || this.locked) return;
    // Keep helper captions legible when orbiting or zooming, without changing
    // the metric size of tracked origins or anything in the recorded scene.
    const height = 26*2*Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2))/Math.max(1,this.container.clientHeight);
    for (const sprite of [this.phoneLabel,...[...this.markers.values()].map(value => value.caption)]) {
      const image = sprite.material.map.image;
      sprite.scale.set(height*image.width/image.height,height,1);
    }
    this.renderer.autoClear = true;
    this.renderer.render(this.replay.scene,this.camera);
    this.renderer.autoClear = false;
    this.renderer.render(this.helpers,this.camera);
    this.renderer.autoClear = true;
  }
}
