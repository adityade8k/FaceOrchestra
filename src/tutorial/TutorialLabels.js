import * as THREE from 'three';
import { NOTE_LABEL_SETTINGS } from '../config/ui.js';
import { COMPOSITION as C, TUTORIAL_LOOPERS } from './composition.js';

export const TUTORIAL_LABEL_SETTINGS=Object.freeze({margin:.035,height:.06,noteScale:.4});
const names=new Map([['metronome','Metronome'],...TUTORIAL_LOOPERS.map(l=>[l.role,l.label]),...C.backing.map(g=>[g.role,`${g.label} · ${g.notes}`])]);
const NO_MORPHS=Object.freeze([]);

export class TutorialLabels {
  constructor(adapter){
    this.a=adapter;this.entries=new Map();this.geometryBounds=new WeakMap();this.collections=0;this.boundsUpdates=0;
    this.combined=new THREE.Box3();this.box=new THREE.Box3();this.point=new THREE.Vector3();this.scale=new THREE.Vector3();
  }
  styleNote(h){
    if(h?.kind!=='honk'||!h.noteLabelGroup)return;
    const base=NOTE_LABEL_SETTINGS.scale,factor=TUTORIAL_LABEL_SETTINGS.noteScale;
    h.noteLabelGroup.visible=true;h.noteLabelGroup.scale.set(base.x*factor,base.y*factor,base.z*factor);
  }
  add(role){
    if(!names.has(role)||this.a.labels.has(role))return;
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=96;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#102d24';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#8be0a5';ctx.font='600 42px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(names.get(role),384,48);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,depthWrite:false}));
    sprite.name=`Tutorial ${role}`;sprite.userData.tutorialBillboard=true;sprite.raycast=()=>{};
    sprite.scale.set(role.startsWith('group-')?.55:.4,TUTORIAL_LABEL_SETTINGS.height,1);sprite.renderOrder=100;
    this.a.r.scene.add(sprite);this.a.labels.set(role,sprite);
  }
  collect(h){
    const meshes=[];
    h.root.traverse(object=>{
      if(!object.isMesh||object.userData.isNoteLabel)return;
      for(let node=object;node&&node!==h.root;node=node.parent){
        if(node.userData.tutorialBillboard||node.userData.isNoteLabel||node.userData.isMetronomeDebug||node.name.startsWith('DEBUG_')||
          node.userData.isHitTarget&&!node.userData.usesVisibleMeshForGrip)return;
      }
      const materials=Array.isArray(object.material)?object.material:[object.material];
      if(materials.every(material=>!material||material.visible===false||material.opacity===0||material.wireframe))return;
      meshes.push({object,matrix:new THREE.Matrix4(),bounds:new THREE.Box3(),geometry:null,morphs:[],visible:null});
    });
    const entry={root:h.root,meshes,bounds:new THREE.Box3(),text:null,textMatrix:new THREE.Matrix4(),textScale:new THREE.Vector3(),textVisible:null};
    this.entries.set(h.id,entry);this.collections++;return entry;
  }
  geometryBox(geometry){
    const position=geometry.attributes.position,morphs=geometry.morphAttributes.position||NO_MORPHS;
    let cached=this.geometryBounds.get(geometry);
    if(cached?.position===position&&cached.version===position.version&&cached.morphs===morphs)return cached;
    const base=new THREE.Box3().setFromBufferAttribute(position);
    cached={position,version:position.version,morphs,base,offsets:morphs.map(attribute=>{
      const box=new THREE.Box3().setFromBufferAttribute(attribute);
      if(!geometry.morphTargetsRelative){box.min.sub(base.max);box.max.sub(base.min);}
      return box;
    })};this.geometryBounds.set(geometry,cached);return cached;
  }
  instrumentBounds(h){
    let entry=this.entries.get(h.id);
    if(!entry||entry.root!==h.root||entry.meshes.some(mesh=>!mesh.object.parent))entry=this.collect(h);
    let changed=false;
    for(const mesh of entry.meshes){
      const object=mesh.object;object.updateWorldMatrix(true,false);
      let visible=true;for(let node=object;node;node=node.parent)if(!node.visible){visible=false;break;}
      const influences=object.morphTargetInfluences||NO_MORPHS,geometry=object.geometry;
      if(mesh.geometry===geometry&&mesh.version===geometry.attributes.position.version&&mesh.visible===visible&&mesh.matrix.equals(object.matrixWorld)&&influences.length===mesh.morphs.length&&influences.every((v,i)=>v===mesh.morphs[i]))continue;
      mesh.geometry=geometry;mesh.version=geometry.attributes.position.version;mesh.visible=visible;mesh.matrix.copy(object.matrixWorld);
      for(let i=0;i<influences.length;i++)mesh.morphs[i]=influences[i];mesh.morphs.length=influences.length;
      mesh.bounds.makeEmpty();
      if(visible){
        const cached=this.geometryBox(geometry);mesh.bounds.copy(cached.base);
        for(let i=0;i<cached.offsets.length;i++){
          const weight=influences[i]||0,offset=cached.offsets[i];if(!weight)continue;
          mesh.bounds.min.addScaledVector(weight>0?offset.min:offset.max,weight);mesh.bounds.max.addScaledVector(weight>0?offset.max:offset.min,weight);
        }
        mesh.bounds.applyMatrix4(object.matrixWorld);
      }
      changed=true;
    }
    // Text is separate from the body cache: fonts/retuning may replace its mesh.
    const text=h.noteLabelMesh||h.metronomeLabelMesh||h.tempoLabel?.sprite;
    if(text){
      text.updateWorldMatrix(true,false);text.getWorldScale(this.scale);
      let visible=true;for(let node=text;node;node=node.parent)if(!node.visible){visible=false;break;}
      if(entry.text!==text||!entry.textMatrix.equals(text.matrixWorld)||entry.textVisible!==visible){changed=true;entry.text=text;entry.textMatrix.copy(text.matrixWorld);entry.textVisible=visible;}
    }else if(entry.text){entry.text=null;changed=true;}
    if(changed){
      entry.bounds.makeEmpty();for(const mesh of entry.meshes)entry.bounds.union(mesh.bounds);
      if(text&&entry.textVisible){
        if(text.isSprite){
          text.getWorldPosition(this.point);text.getWorldScale(this.scale);
          this.box.setFromCenterAndSize(this.point,this.scale.set(Math.abs(this.scale.x),Math.abs(this.scale.y),.001));
        }else{if(!text.geometry.boundingBox)text.geometry.computeBoundingBox();this.box.copy(text.geometry.boundingBox).applyMatrix4(text.matrixWorld);}
        entry.bounds.union(this.box);
      }
      this.boundsUpdates++;
    }
    return entry.bounds;
  }
  update(){
    for(const [role,label] of this.a.labels){
      this.combined.makeEmpty();let count=0;
      for(const id of this.a.ids(role)){
        const h=this.a.r.instrumentRegistry.get(id);if(!h||h.pendingPlacement||!h.root.visible)continue;
        this.combined.union(this.instrumentBounds(h));count++;
      }
      if(!count){this.remove(role);continue;}
      if(this.combined.isEmpty()){label.visible=false;continue;}
      label.visible=true;this.combined.getCenter(this.point);
      label.getWorldScale(this.scale);
      this.point.y=this.combined.max.y+TUTORIAL_LABEL_SETTINGS.margin+Math.abs(this.scale.y)/2;
      // Bounds are in world coordinates; labels may live under a transformed scene.
      label.position.copy(label.parent.worldToLocal(this.point));
    }
    for(const id of this.entries.keys())if(!this.a.r.instrumentRegistry.get(id))this.entries.delete(id);
  }
  remove(role){const label=this.a.labels.get(role);if(!label)return;label.removeFromParent();label.material.map.dispose();label.material.dispose();this.a.labels.delete(role);}
  clear(){for(const role of this.a.labels.keys())this.remove(role);this.entries.clear();this.geometryBounds=new WeakMap();}
}
