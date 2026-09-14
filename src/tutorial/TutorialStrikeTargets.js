import * as THREE from 'three';
import { isStickPercussionMesh } from '../instruments/stick/StickCollisionSystem.js';

// Cache a barycentric point on a real body triangle. The triangle is evaluated
// again for morphs and world transforms; raycasts/bounds are only needed on misses.
export class TutorialStrikeTargets {
  constructor(adapter) {
    this.adapter=adapter;this.entries=new Map();this.box=new THREE.Box3();this.center=new THREE.Vector3();
    this.size=new THREE.Vector3();this.viewer=new THREE.Vector3();this.direction=new THREE.Vector3();
    this.a=new THREE.Vector3();this.b=new THREE.Vector3();this.c=new THREE.Vector3();this.point=new THREE.Vector3();
    this.local=new THREE.Vector3();this.misses=0;
  }
  get(role) {
    const h=this.adapter.get(role);if(!h?.root?.visible||h.disposed){this.entries.delete(role);return null;}
    let entry=this.entries.get(role);
    if(!entry||entry.root!==h.root||!entry.mesh.parent||!entry.mesh.visible||entry.geometry!==entry.mesh.geometry||entry.version!==entry.geometry.attributes.position.version) {
      h.root.updateWorldMatrix(true,true);const meshes=[];
      h.root.traverse(object=>{if(isStickPercussionMesh(object))meshes.push(object);});
      this.box.setFromObject(h.root);this.box.getCenter(this.center);this.box.getSize(this.size);
      this.adapter.r.getUserCamera().getWorldPosition(this.viewer);
      this.direction.copy(this.center).sub(this.viewer).normalize();
      const ray=this.adapter.ray;ray.set(this.point.copy(this.center).addScaledVector(this.direction,-this.size.length()-.6),this.direction);
      let hit=ray.intersectObjects(meshes,false)[0];
      for(let i=0;i<5&&!hit;i++){ray.ray.origin.y=this.box.min.y+this.size.y*(i+.5)/5;hit=ray.intersectObjects(meshes,false)[0];}
      if(!hit?.face)throw new Error(`No clear stick surface on ${role}. Move it into view, then retry.`);
      const mesh=hit.object,face=hit.face;
      mesh.getVertexPosition(face.a,this.a);mesh.getVertexPosition(face.b,this.b);mesh.getVertexPosition(face.c,this.c);
      this.local.copy(hit.point);mesh.worldToLocal(this.local);
      const barycentric=new THREE.Vector3();THREE.Triangle.getBarycoord(this.local,this.a,this.b,this.c,barycentric);
      entry={root:h.root,mesh,geometry:mesh.geometry,version:mesh.geometry.attributes.position.version,face:{a:face.a,b:face.b,c:face.c},barycentric};
      this.entries.set(role,entry);this.misses++;
    }
    const {mesh,face,barycentric}=entry;mesh.updateWorldMatrix(true,false);
    mesh.getVertexPosition(face.a,this.a);mesh.getVertexPosition(face.b,this.b);mesh.getVertexPosition(face.c,this.c);
    return this.point.copy(this.a).multiplyScalar(barycentric.x).addScaledVector(this.b,barycentric.y).addScaledVector(this.c,barycentric.z).applyMatrix4(mesh.matrixWorld);
  }
  clear(){this.entries.clear();}
}
