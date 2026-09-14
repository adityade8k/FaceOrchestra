import * as THREE from 'three';
const WIDTH=.84,HEIGHT=1.2,CW=1024,CH=1440;
export class TutorialPanel {
  constructor({scene,camera,renderer,onAction}) {
    Object.assign(this,{camera,renderer,onAction,key:'',xr:false,buttonNodes:new Map()});
    this.group=new THREE.Group();this.group.name='Composition tutorial';scene.add(this.group);
    this.canvas=document.createElement('canvas');this.canvas.width=CW;this.canvas.height=CH;
    this.texture=new THREE.CanvasTexture(this.canvas);this.texture.colorSpace=THREE.SRGBColorSpace;
    this.surface=new THREE.Mesh(new THREE.PlaneGeometry(WIDTH,HEIGHT),new THREE.MeshBasicMaterial({map:this.texture,side:THREE.DoubleSide}));
    this.surface.userData.tutorialPanel=true;this.group.add(this.surface);
    this.buttons=Array.from({length:14},(_,i)=>{
      const b=new THREE.Mesh(new THREE.PlaneGeometry(.375,.062),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0,depthWrite:false}));
      b.position.set(i%2 ? .2 : -.2,i<4 ? .44-Math.floor(i/2)*.075 : -.25-Math.floor((i-4)/2)*.075,.003);
      b.userData.tutorialPanel=true;b.visible=false;this.group.add(b);return b;
    });
    this.statusCanvas=document.createElement('canvas');this.statusCanvas.width=768;this.statusCanvas.height=80;
    this.statusTexture=new THREE.CanvasTexture(this.statusCanvas);this.statusTexture.colorSpace=THREE.SRGBColorSpace;
    this.statusPlane=new THREE.Mesh(new THREE.PlaneGeometry(.76,.079),new THREE.MeshBasicMaterial({map:this.statusTexture,transparent:true,depthWrite:false}));
    this.statusPlane.position.set(0,-.16,.002);this.statusPlane.raycast=()=>{};this.group.add(this.statusPlane);
    const corners=[[-.425,-.605],[.425,-.605],[.425,.605],[-.425,.605]].map(([x,y])=>new THREE.Vector3(x,y,.005));
    this.effect=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(corners),new THREE.LineBasicMaterial({color:0x83dfbd,transparent:true,opacity:0}));
    this.effect.raycast=()=>{};this.group.add(this.effect);
    this.dom=document.createElement('aside');this.dom.className='tutorial-panel';this.dom.setAttribute('aria-label','Composition tutorial');
    this.dom.innerHTML='<p class="tutorial-eyebrow"></p><nav class="tutorial-navigation" aria-label="Lesson steps"></nav><h1></h1><p class="tutorial-instruction"></p><p class="tutorial-target"></p><p class="tutorial-feedback" role="status" aria-live="polite"></p><div class="tutorial-actions" aria-label="Step actions"></div>';
    this.nodes={};for(const key of ['eyebrow','instruction','target','feedback','navigation','actions'])this.nodes[key]=this.dom.querySelector(`.tutorial-${key}`);
    this.nodes.title=this.dom.querySelector('h1');document.body.appendChild(this.dom);
    this.click=e=>{const b=e.target.closest('button[data-action]');if(b&&!b.disabled)this.onAction(b.dataset.action);};this.dom.addEventListener('click',this.click);
    this.ray=new THREE.Raycaster();this.move=e=>{if(this.xr)return;const rect=renderer.domElement.getBoundingClientRect();this.ray.setFromCamera({x:(e.clientX-rect.left)/rect.width*2-1,y:1-(e.clientY-rect.top)/rect.height*2},camera);this.hover(this.hit(this.ray)?.object);};
    renderer.domElement.addEventListener('pointermove',this.move);this.group.visible=false;this.recenter(camera);
  }
  setText(node,value=''){if(node.textContent!==value)node.textContent=value;}
  render(model) {
    const key=JSON.stringify(model);if(key===this.key)return;this.key=key;this.model=model;
    this.dom.hidden=!model.visible||this.xr;this.group.visible=Boolean(model.visible&&this.xr);
    for(const [name,value] of Object.entries({eyebrow:model.progress||'HONK ORCHESTRA',title:model.title,instruction:model.instruction,feedback:model.feedback}))this.setText(this.nodes[name],value);
    this.nodes.navigation.hidden=!model.navigation?.length;this.dom.dataset.result=model.result||'';
    const ids=new Set([...(model.navigation||[]),...(model.actions||[])].map(a=>a.id));
    for(const [id,node] of this.buttonNodes)if(!ids.has(id)){node.remove();this.buttonNodes.delete(id);}
    for(const [container,actions] of [[this.nodes.navigation,model.navigation||[]],[this.nodes.actions,model.actions||[]]])actions.forEach((a,i)=>{
      let node=this.buttonNodes.get(a.id);if(!node){node=document.createElement('button');node.type='button';node.dataset.action=a.id;this.buttonNodes.set(a.id,node);}
      if(container.children[i]!==node)container.insertBefore(node,container.children[i]||null);
      this.setText(node,a.label);if(node.disabled!==Boolean(a.disabled))node.disabled=Boolean(a.disabled);
      if(node.title!==(a.reason||''))node.title=a.reason||'';
      const primary=String(Boolean(a.primary));if(node.dataset.primary!==primary)node.dataset.primary=primary;
    });
    const ctx=this.canvas.getContext('2d');ctx.fillStyle='#102321';ctx.fillRect(0,0,CW,CH);
    ctx.fillStyle='#83dfbd';ctx.font='600 25px sans-serif';wrap(ctx,model.progress||'HONK ORCHESTRA',38,48,948,32,1);
    ctx.fillStyle='#fff4dd';ctx.font='700 42px sans-serif';wrap(ctx,model.title,38,440,948,49,2);
    ctx.font='28px sans-serif';ctx.fillStyle='#e4ece5';wrap(ctx,model.instruction||'',38,565,948,36,3);
    ctx.font='24px sans-serif';ctx.fillStyle=model.result==='passed'?'#a7f1c5':'#ffd591';wrap(ctx,model.feedback||'',38,705,948,28,6);
    this.buttons.forEach((b,i)=>{
      const a=i<4?model.navigation?.[i]:model.actions?.[i-4];b.visible=Boolean(a);b.userData.action=a?.id;b.userData.disabled=Boolean(a?.disabled);if(!a)return;
      const x=(b.position.x-.375/2+WIDTH/2)/WIDTH*CW,y=(HEIGHT/2-b.position.y-.062/2)/HEIGHT*CH,w=.375/WIDTH*CW,h=.062/HEIGHT*CH;
      ctx.fillStyle=a.disabled?'#233430':a.primary?'#57784a':'#2e5149';ctx.fillRect(x,y,w,h);
      ctx.fillStyle=a.disabled?'#9bada5':'#fff4dd';ctx.font='600 25px sans-serif';wrap(ctx,a.label,x+12,y+33,w-24,28,1);
    });this.hitTargets=[this.surface,...this.buttons.filter(b=>b.visible)];this.texture.needsUpdate=true;
  }
  setTransport(text='') {
    if(this.transportText===text)return;this.transportText=text;this.setText(this.nodes.target,text);
    const ctx=this.statusCanvas.getContext('2d');ctx.clearRect(0,0,768,80);ctx.fillStyle='#ffd591';ctx.font='600 28px sans-serif';wrap(ctx,text,4,29,760,32,2);this.statusTexture.needsUpdate=true;
  }
  completeEffect(now,ok){this.effectAt=now;this.effect.material.color.setHex(ok?0x83dfbd:0xffcf83);this.dom.classList.remove('tutorial-complete');void this.dom.offsetWidth;this.dom.classList.add('tutorial-complete');}
  animate(now){const phase=(now-(this.effectAt??-Infinity))/850;this.effect.material.opacity=phase<1?Math.sin(Math.max(phase,0)*Math.PI)*.95:0;}
  setXR(active,camera=this.camera){this.xr=active;this.key='';this.recenter(camera);if(this.model)this.render(this.model);}
  recenter(camera=this.camera,lesson=false){
    const p=new THREE.Vector3(),q=new THREE.Quaternion(),forward=new THREE.Vector3(0,0,-1),right=new THREE.Vector3(1,0,0);
    camera.getWorldPosition(p);camera.getWorldQuaternion(q);forward.applyQuaternion(q);forward.y=0;forward.normalize();right.applyQuaternion(q);right.y=0;right.normalize();
    this.group.position.copy(p).addScaledVector(forward,1.2).addScaledVector(right,lesson?-.95:0);this.group.position.y=p.y-.1;this.group.lookAt(p.x,this.group.position.y,p.z);this.group.updateMatrixWorld(true);
  }
  hit(ray){if(!this.group.visible)return null;return ray.intersectObjects(this.hitTargets||[this.surface],false)[0]||null;}
  hover(object){for(const b of this.buttons)b.material.opacity=b===object&&!b.userData.disabled ? .16 : 0;}
  activate(object){if(object?.userData.action&&!object.userData.disabled)this.onAction(object.userData.action);}
  dispose(){this.dom.removeEventListener('click',this.click);this.renderer.domElement.removeEventListener('pointermove',this.move);this.dom.remove();this.group.removeFromParent();this.texture.dispose();this.statusTexture.dispose();this.group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}
}
function wrap(ctx,text,x,y,width,lineHeight,maxLines=Infinity){
  let lines=0;
  for(const paragraph of String(text).split('\n')){
    let line='';for(const word of paragraph.split(/\s+/)){
      if(ctx.measureText(`${line} ${word}`).width>width&&line){ctx.fillText(line,x,y);y+=lineHeight;line=word;if(++lines>=maxLines)return y;}else line=line?`${line} ${word}`:word;
    }
    if(line)ctx.fillText(line,x,y);y+=lineHeight;if(++lines>=maxLines)return y;
  }return y;
}
