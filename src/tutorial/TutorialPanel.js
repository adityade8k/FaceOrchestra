import * as THREE from 'three';

// Rendering and input only. Session predicates decide progress and enabled actions.
export class TutorialPanel {
  constructor({scene,camera,renderer,onAction}) {
    this.camera=camera;this.renderer=renderer;this.onAction=onAction;this.key='';this.xr=false;
    this.group=new THREE.Group();this.group.name='Composition tutorial';scene.add(this.group);
    this.canvas=document.createElement('canvas');this.canvas.width=1200;this.canvas.height=1320;
    this.texture=new THREE.CanvasTexture(this.canvas);this.texture.colorSpace=THREE.SRGBColorSpace;
    this.surface=new THREE.Mesh(new THREE.PlaneGeometry(0.80,0.88),new THREE.MeshBasicMaterial({map:this.texture,side:THREE.DoubleSide}));
    this.surface.userData.tutorialPanel=true;this.group.add(this.surface);
    this.buttons=[];
    for(let i=0;i<12;i++) {
      const button=new THREE.Mesh(new THREE.PlaneGeometry(0.232,0.057),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0,depthWrite:false}));
      button.position.set(-0.25+(i%3)*0.25,-0.18-Math.floor(i/3)*0.068,0.003);
      button.userData.tutorialPanel=true;button.visible=false;this.buttons.push(button);this.group.add(button);
    }
    this.dom=document.createElement('aside');this.dom.className='tutorial-panel';this.dom.setAttribute('aria-label','Composition tutorial');
    this.dom.innerHTML='<p class="tutorial-eyebrow"></p><h1></h1><p class="tutorial-instruction"></p><p class="tutorial-target"></p><p class="tutorial-feedback" role="status" aria-live="polite"></p><div class="tutorial-actions"></div>';
    document.body.appendChild(this.dom);
    this.click=e=>{const b=e.target.closest('button[data-action]');if(b&&!b.disabled)this.onAction(b.dataset.action);};
    this.dom.addEventListener('click',this.click);
    this.move=e=>{if(this.xr)return;const rect=renderer.domElement.getBoundingClientRect();this.ray.setFromCamera({x:(e.clientX-rect.left)/rect.width*2-1,y:1-(e.clientY-rect.top)/rect.height*2},camera);this.hover(this.hit(this.ray)?.object);};
    renderer.domElement.addEventListener('pointermove',this.move);
    this.ray=new THREE.Raycaster();this.group.visible=false;this.recenter(camera);
  }
  render(model) {
    const key=JSON.stringify(model);if(key===this.key)return;this.key=key;this.model=model;
    this.dom.hidden=!model.visible||this.xr;this.group.visible=Boolean(model.visible&&this.xr);
    this.dom.querySelector('.tutorial-eyebrow').textContent=model.progress||'HONK ORCHESTRA';
    this.dom.querySelector('h1').textContent=model.title;
    this.dom.querySelector('.tutorial-instruction').textContent=model.instruction||'';
    this.dom.querySelector('.tutorial-target').textContent=model.target||'';
    this.dom.querySelector('.tutorial-feedback').textContent=model.feedback||'';
    const actions=this.dom.querySelector('.tutorial-actions');actions.replaceChildren();
    for(const action of model.actions||[]) {
      const b=document.createElement('button');b.type='button';b.textContent=action.label;b.dataset.action=action.id;b.disabled=Boolean(action.disabled);actions.appendChild(b);
    }
    const ctx=this.canvas.getContext('2d');ctx.fillStyle='#102321';ctx.fillRect(0,0,1200,1320);
    ctx.fillStyle='#83dfbd';ctx.font='600 29px sans-serif';wrap(ctx,model.progress||'HONK ORCHESTRA',56,65,1088,38);
    ctx.fillStyle='#fff4dd';ctx.font='700 53px sans-serif';let y=wrap(ctx,model.title,56,145,1088,64)+30;
    ctx.font='34px sans-serif';ctx.fillStyle='#e4ece5';y=wrap(ctx,model.instruction||'',56,y,1088,46)+25;
    ctx.font='600 34px sans-serif';ctx.fillStyle='#ffd591';y=wrap(ctx,model.target||'',56,y,1088,46)+25;
    ctx.font='30px sans-serif';ctx.fillStyle='#8de5c7';wrap(ctx,model.feedback||'',56,Math.min(y,800),1088,40);
    this.buttons.forEach((button,i)=>{
      const action=model.actions?.[i];button.visible=Boolean(action);button.userData.action=action?.id;button.userData.disabled=Boolean(action?.disabled);
      if(!action)return;
      const x=50+(i%3)*375, yy=887+Math.floor(i/3)*102;
      ctx.fillStyle=action.disabled?'#233430':'#2e5149';ctx.fillRect(x,yy,348,85);
      ctx.fillStyle=action.disabled?'#71897f':'#fff4dd';ctx.font='600 25px sans-serif';wrap(ctx,action.label,x+16,yy+33,316,29);
    });
    this.texture.needsUpdate=true;
  }
  setXR(active,camera=this.camera) {this.xr=active;this.key='';this.recenter(camera);if(this.model)this.render(this.model);}
  recenter(camera=this.camera,lesson=false) {
    const p=new THREE.Vector3(),q=new THREE.Quaternion(),forward=new THREE.Vector3(0,0,-1),right=new THREE.Vector3(1,0,0);
    camera.getWorldPosition(p);camera.getWorldQuaternion(q);forward.applyQuaternion(q);forward.y=0;forward.normalize();right.applyQuaternion(q);right.y=0;right.normalize();
    this.group.position.copy(p).addScaledVector(forward,1.2).addScaledVector(right,lesson?-0.95:0);
    this.group.position.y=p.y-0.10;this.group.lookAt(p.x,this.group.position.y,p.z);this.group.updateMatrixWorld(true);
  }
  hit(ray) {if(!this.group.visible)return null;return ray.intersectObjects([this.surface,...this.buttons.filter(b=>b.visible)],false)[0]||null;}
  hover(object) {for(const b of this.buttons)b.material.opacity=b===object&&!b.userData.disabled?0.16:0;}
  activate(object) {if(object?.userData.action&&!object.userData.disabled)this.onAction(object.userData.action);}
  dispose() {this.dom.removeEventListener('click',this.click);this.renderer.domElement.removeEventListener('pointermove',this.move);this.dom.remove();this.group.removeFromParent();this.texture.dispose();this.group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}
}
function wrap(ctx,text,x,y,width,lineHeight) {
  let line='';for(const word of text.split(/\s+/)) {
    if(ctx.measureText(`${line} ${word}`).width>width&&line){ctx.fillText(line,x,y);y+=lineHeight;line=word;}else line=line?`${line} ${word}`:word;
  }
  if(line)ctx.fillText(line,x,y);return y+lineHeight;
}
