import * as THREE from 'three';
const WIDTH=1.05,HEIGHT=1.42,CW=1152,CH=1560;
const buttonRects=[0,1,2,3,4,5].map(i=>({x:i%2?592:40,y:i<4?132+Math.floor(i/2)*92:1440,w:520,h:76}));
const regions={title:{x:40,y:354,w:1072,h:112,font:48},instruction:{x:40,y:490,w:1072,h:226,font:38},feedback:{x:40,y:854,w:1072,h:546,font:36}};
export class TutorialPanel {
  constructor({scene,camera,renderer,onAction}){
    Object.assign(this,{camera,renderer,onAction,key:'',xr:false,buttonNodes:new Map(),layout:[]});
    this.group=new THREE.Group();this.group.name='Composition tutorial';scene.add(this.group);
    this.canvas=document.createElement('canvas');this.canvas.width=CW;this.canvas.height=CH;
    this.texture=new THREE.CanvasTexture(this.canvas);this.texture.colorSpace=THREE.SRGBColorSpace;
    this.surface=new THREE.Mesh(new THREE.PlaneGeometry(WIDTH,HEIGHT),new THREE.MeshBasicMaterial({map:this.texture,side:THREE.DoubleSide}));
    this.surface.userData.tutorialPanel=true;this.group.add(this.surface);
    this.buttons=buttonRects.map(rect=>{
      const b=new THREE.Mesh(new THREE.PlaneGeometry(rect.w/CW*WIDTH,rect.h/CH*HEIGHT),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0,depthWrite:false}));
      b.position.set(((rect.x+rect.w/2)/CW-.5)*WIDTH,(.5-(rect.y+rect.h/2)/CH)*HEIGHT,.003);
      b.userData.tutorialPanel=true;b.visible=false;this.group.add(b);return b;
    });
    this.statusCanvas=document.createElement('canvas');this.statusCanvas.width=1072;this.statusCanvas.height=108;
    this.statusTexture=new THREE.CanvasTexture(this.statusCanvas);this.statusTexture.colorSpace=THREE.SRGBColorSpace;
    this.statusPlane=new THREE.Mesh(new THREE.PlaneGeometry(1072/CW*WIDTH,108/CH*HEIGHT),new THREE.MeshBasicMaterial({map:this.statusTexture,transparent:true,depthWrite:false}));
    this.statusPlane.position.set(0,(.5-780/CH)*HEIGHT,.002);this.statusPlane.raycast=()=>{};this.group.add(this.statusPlane);
    const corners=[[-WIDTH/2,-HEIGHT/2],[WIDTH/2,-HEIGHT/2],[WIDTH/2,HEIGHT/2],[-WIDTH/2,HEIGHT/2]].map(([x,y])=>new THREE.Vector3(x,y,.005));
    this.effect=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(corners),new THREE.LineBasicMaterial({color:0x83dfbd,transparent:true,opacity:0}));
    this.effect.raycast=()=>{};this.group.add(this.effect);
    this.dom=document.createElement('aside');this.dom.className='tutorial-panel';this.dom.setAttribute('aria-label','Composition tutorial');
    this.dom.innerHTML='<p class="tutorial-eyebrow"></p><nav class="tutorial-navigation" aria-label="Lesson controls"></nav><div class="tutorial-copy"><h1></h1><p class="tutorial-instruction"></p><p class="tutorial-target"></p><p class="tutorial-feedback" role="status" aria-live="polite"></p></div><div class="tutorial-actions" aria-label="Session controls"></div>';
    this.nodes={};for(const key of ['eyebrow','instruction','target','feedback','navigation','actions'])this.nodes[key]=this.dom.querySelector('.tutorial-'+key);
    this.nodes.title=this.dom.querySelector('h1');document.body.appendChild(this.dom);
    this.click=e=>{const b=e.target.closest('button[data-action]');if(b&&!b.disabled)this.onAction(b.dataset.action);};this.dom.addEventListener('click',this.click);
    this.ray=new THREE.Raycaster();this.move=e=>{if(this.xr)return;const rect=renderer.domElement.getBoundingClientRect();this.ray.setFromCamera({x:(e.clientX-rect.left)/rect.width*2-1,y:1-(e.clientY-rect.top)/rect.height*2},camera);this.hover(this.hit(this.ray)?.object);};
    renderer.domElement.addEventListener('pointermove',this.move);this.group.visible=false;this.recenter(camera);
  }
  setText(node,value=''){if(node.textContent!==value)node.textContent=value;}
  render(model){
    const key=JSON.stringify(model);if(key===this.key)return;this.key=key;this.model=model;
    this.dom.hidden=!model.visible||this.xr;this.group.visible=Boolean(model.visible&&this.xr);
    for(const [name,value] of Object.entries({eyebrow:model.progress||'HONK ORCHESTRA',title:model.title,instruction:model.instruction,feedback:model.feedback}))this.setText(this.nodes[name],value);
    this.nodes.navigation.hidden=!model.navigation?.length;this.dom.dataset.result=model.result||'';
    const actions=[...(model.navigation||[]),...(model.actions||[])],ids=new Set(actions.map(a=>a.id));
    for(const [id,node] of this.buttonNodes)if(!ids.has(id)){node.remove();this.buttonNodes.delete(id);}
    for(const [container,items] of [[this.nodes.navigation,model.navigation||[]],[this.nodes.actions,model.actions||[]]])items.forEach((a,i)=>{
      let node=this.buttonNodes.get(a.id);if(!node){node=document.createElement('button');node.type='button';node.dataset.action=a.id;this.buttonNodes.set(a.id,node);}
      if(container.children[i]!==node)container.insertBefore(node,container.children[i]||null);
      this.setText(node,a.label);
      if(node.disabled!==Boolean(a.disabled))node.disabled=Boolean(a.disabled);
      if(node.title!==(a.reason||''))node.title=a.reason||'';
      for(const name of ['primary','active'])if(node.dataset[name]!==String(Boolean(a[name])))node.dataset[name]=String(Boolean(a[name]));
      if(node.getAttribute('aria-pressed')!==String(Boolean(a.active)))node.setAttribute('aria-pressed',String(Boolean(a.active)));
    });
    const ctx=this.canvas.getContext('2d');ctx.fillStyle='#102321';ctx.fillRect(0,0,CW,CH);
    ctx.fillStyle='#83dfbd';ctx.font='600 32px sans-serif';ctx.fillText(model.progress||'HONK ORCHESTRA',40,66);
    this.layout=[];
    for(const [name,region] of Object.entries(regions)){
      const text=model[name]||'',color=name==='title'?'#fff4dd':name==='instruction'?'#e4ece5':model.result==='passed'?'#a7f1c5':'#ffd591';
      const drawn=drawText(ctx,text,region,{color,weight:name==='title'?700:400});
      this.layout.push({name,...drawn,limit:region.y+region.h});
    }
    this.buttons.forEach((b,i)=>{
      // Launch screens use the footer and second navigation row; lessons always
      // use the same four navigation and two session control positions.
      const a=model.navigation?actions[i]:model.actions?.[i-2];b.visible=Boolean(a);b.userData.action=a?.id;b.userData.disabled=Boolean(a?.disabled);if(!a)return;
      const rect=buttonRects[i];ctx.fillStyle=a.disabled?'#233430':a.active?'#52774a':a.primary?'#496943':'#2e5149';ctx.fillRect(rect.x,rect.y,rect.w,rect.h);
      drawText(ctx,a.label,{x:rect.x+14,y:rect.y+4,w:rect.w-28,h:rect.h-8,font:38},{color:a.disabled?'#9bada5':'#fff4dd',weight:600});
    });
    this.hitTargets=[this.surface,...this.buttons.filter(b=>b.visible)];this.texture.needsUpdate=true;
  }
  setTransport(text=''){
    if(this.transportText===text)return;this.transportText=text;this.setText(this.nodes.target,text);
    const ctx=this.statusCanvas.getContext('2d');ctx.clearRect(0,0,1072,108);
    const color=text.includes('Ending soon')?'#ff996c':'#ffd591';
    this.nodes.target.style.color=color;
    drawText(ctx,text,{x:0,y:0,w:1072,h:108,font:38},{color});this.statusTexture.needsUpdate=true;
  }
  completeEffect(now,ok){this.effectAt=now;this.effect.material.color.setHex(ok?0x83dfbd:0xffcf83);this.dom.classList.remove('tutorial-complete');void this.dom.offsetWidth;this.dom.classList.add('tutorial-complete');}
  animate(now){const phase=(now-(this.effectAt??-Infinity))/850;this.effect.material.opacity=phase<1?Math.sin(Math.max(phase,0)*Math.PI)*.95:0;}
  setXR(active,camera=this.camera){this.xr=active;this.key='';this.recenter(camera);if(this.model)this.render(this.model);}
  recenter(camera=this.camera,lesson=false){
    const p=new THREE.Vector3(),q=new THREE.Quaternion(),forward=new THREE.Vector3(0,0,-1),right=new THREE.Vector3(1,0,0);
    camera.getWorldPosition(p);camera.getWorldQuaternion(q);forward.applyQuaternion(q);forward.y=0;forward.normalize();right.applyQuaternion(q);right.y=0;right.normalize();
    this.group.position.copy(p).addScaledVector(forward,1.35).addScaledVector(right,lesson?-.98:0);this.group.position.y=p.y-.1;this.group.lookAt(p.x,this.group.position.y,p.z);this.group.updateMatrixWorld(true);
  }
  hit(ray){if(!this.group.visible)return null;return ray.intersectObjects(this.hitTargets||[this.surface],false)[0]||null;}
  hover(object){for(const b of this.buttons)b.material.opacity=b===object&&!b.userData.disabled ? .16 : 0;}
  activate(object){if(object?.userData.action&&!object.userData.disabled)this.onAction(object.userData.action);}
  dispose(){this.dom.removeEventListener('click',this.click);this.renderer.domElement.removeEventListener('pointermove',this.move);this.dom.remove();this.group.removeFromParent();this.texture.dispose();this.statusTexture.dispose();this.group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}
}
function textLines(ctx,text,width){
  const lines=[];
  for(const paragraph of String(text).split('\n')){
    let line='';for(const word of paragraph.split(/\s+/)){
      if(line&&ctx.measureText(line+' '+word).width>width){lines.push(line);line=word;}else line=line?line+' '+word:word;
    }lines.push(line);
  }
  return lines;
}
function drawText(ctx,text,region,{color='#fff4dd',weight=400}={}){
  let font=region.font,lines,lineHeight;
  do{ctx.font=weight+' '+font+'px sans-serif';lineHeight=font*1.2;lines=textLines(ctx,text,region.w);if(lines.length*lineHeight<=region.h)break;font--;}while(font>12);
  ctx.fillStyle=color;ctx.textBaseline='alphabetic';
  lines.forEach((line,i)=>ctx.fillText(line,region.x,region.y+font+i*lineHeight));
  return {font,lines:lines.length,bottom:region.y+lines.length*lineHeight};
}
