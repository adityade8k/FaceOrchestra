import { Vector3, Quaternion, Euler, Matrix4 } from 'three';
const DEG=Math.PI/180;
export function cameraQuaternion(camera) {return new Quaternion().setFromEuler(new Euler(camera.rotation[0]*DEG,camera.rotation[1]*DEG,camera.rotation[2]*DEG,'YXZ'));}
export function focalPixels(camera,height) {return height/(2*Math.tan(camera.fov*DEG/2));}
export function projectPoint(point,camera,width=1080,height=1920) {
  const p=new Vector3(...point).sub(new Vector3(...camera.position)).applyQuaternion(cameraQuaternion(camera).invert());
  if(p.z>=-0.001)return null;
  const focal=focalPixels(camera,height);
  return [width/2+(camera.center?.[0]||0)+focal*p.x/-p.z,height/2+(camera.center?.[1]||0)-focal*p.y/-p.z];
}
export function controllerLandmark(pose,offset) {
  if(!pose||!Array.isArray(offset)||offset.length!==3||!offset.every(Number.isFinite))throw new Error('A valid tracked grip and measured controller-local offset are required.');
  return new Vector3(...offset).applyQuaternion(new Quaternion(...pose.q)).add(new Vector3(...pose.p)).toArray();
}
export function cropRect(videoWidth,videoHeight,width=1080,height=1920,crop={zoom:1,x:0,y:0}) {
  if(!(videoWidth>0&&videoHeight>0&&crop.zoom>=1))throw new Error('Video dimensions or crop are invalid.');
  const factor=Math.max(width/videoWidth,height/videoHeight)*crop.zoom;
  const sw=width/factor,sh=height/factor;
  return {sx:Math.max(0,Math.min(videoWidth-sw,(videoWidth-sw)/2+crop.x*(videoWidth-sw)/2)),sy:Math.max(0,Math.min(videoHeight-sh,(videoHeight-sh)/2+crop.y*(videoHeight-sh)/2)),sw,sh};
}
export function outputPixel(clientX,clientY,rect,width=1080,height=1920) {
  const factor=Math.min(rect.width/width,rect.height/height);
  const pixel=[(clientX-rect.left-(rect.width-width*factor)/2)/factor,(clientY-rect.top-(rect.height-height*factor)/2)/factor];
  if(!pixel.every(Number.isFinite)||pixel[0]<0||pixel[0]>width||pixel[1]<0||pixel[1]>height)throw new Error('Click inside the video image, not its letterbox margin.');
  return pixel;
}
function solve(matrix,vector) {
  const a=matrix.map((row,i)=>[...row,vector[i]]),n=vector.length;let min=Infinity,max=0;
  for(let c=0;c<n;c++) {
    let pivot=c;for(let r=c+1;r<n;r++)if(Math.abs(a[r][c])>Math.abs(a[pivot][c]))pivot=r;
    [a[c],a[pivot]]=[a[pivot],a[c]];const v=a[c][c];if(Math.abs(v)<1e-14)return null;
    min=Math.min(min,Math.abs(v));max=Math.max(max,Math.abs(v));
    for(let k=c;k<=n;k++)a[c][k]/=v;
    for(let r=0;r<n;r++)if(r!==c){const factor=a[r][c];for(let k=c;k<=n;k++)a[r][k]-=factor*a[c][k];}
  }
  return {x:a.map(row=>row[n]),condition:max/min};
}
function pack(camera,fitFocal) {return [...camera.position,...camera.rotation.map(v=>v*DEG),...(fitFocal?[Math.log(Math.tan(camera.fov*DEG/2))]:[])];}
function unpack(p,base,fitFocal) {return {...base,position:p.slice(0,3),rotation:p.slice(3,6).map(v=>v/DEG),fov:fitFocal?2*Math.atan(Math.exp(p[6]))/DEG:base.fov};}
function residual(p,base,points,width,height,fitFocal) {
  const camera=unpack(p,base,fitFocal),r=[];
  for(const o of points){const projected=projectPoint(o.world,camera,width,height);if(!projected)return null;r.push(projected[0]-o.pixel[0],projected[1]-o.pixel[1]);}return r;
}
const cost=r=>r?r.reduce((s,v)=>s+(Math.abs(v)<8?v*v:16*Math.abs(v)-64),0):Infinity;
function optimize(camera,points,width,height,fitFocal) {
  let p=pack(camera,fitFocal),r=residual(p,camera,points,width,height,fitFocal),score=cost(r),lambda=.01,condition=Infinity;
  if(!r)return null;
  for(let iteration=0;iteration<100;iteration++) {
    const n=p.length,jac=Array.from({length:r.length},()=>Array(n));
    for(let j=0;j<n;j++){const candidate=p.slice(),step=1e-5;candidate[j]+=step;const next=residual(candidate,camera,points,width,height,fitFocal);if(!next)return null;for(let i=0;i<r.length;i++)jac[i][j]=(next[i]-r[i])/step;}
    const normal=Array.from({length:n},()=>Array(n).fill(0)),gradient=Array(n).fill(0);
    for(let i=0;i<r.length;i++){const weight=Math.min(1,8/Math.max(Math.abs(r[i]),1e-9));for(let a=0;a<n;a++){gradient[a]-=jac[i][a]*r[i]*weight;for(let b=0;b<n;b++)normal[a][b]+=jac[i][a]*jac[i][b]*weight;}}
    for(let j=0;j<n;j++)normal[j][j]+=lambda*Math.max(1,normal[j][j]);
    const solved=solve(normal,gradient);if(!solved)break;condition=solved.condition;
    const candidate=p.map((v,i)=>v+solved.x[i]);
    if(fitFocal)candidate[6]=Math.max(Math.log(Math.tan(10*DEG/2)),Math.min(Math.log(Math.tan(130*DEG/2)),candidate[6]));
    const next=residual(candidate,camera,points,width,height,fitFocal),nextCost=cost(next);
    if(nextCost<score){const improvement=score-nextCost;p=candidate;r=next;score=nextCost;lambda=Math.max(1e-9,lambda/3);if(improvement<1e-9)break;}
    else lambda=Math.min(1e12,lambda*10);
  }
  return {camera:unpack(p,camera,fitFocal),cost:score,condition};
}
function checkSpread(points) {
  const center=[0,0,0];for(const o of points)for(let i=0;i<3;i++)center[i]+=o.world[i]/points.length;
  const c=Array.from({length:3},()=>[0,0,0]);for(const o of points)for(let i=0;i<3;i++)for(let j=0;j<3;j++)c[i][j]+=(o.world[i]-center[i])*(o.world[j]-center[j])/points.length;
  const det=c[0][0]*(c[1][1]*c[2][2]-c[1][2]**2)-c[0][1]*(c[0][1]*c[2][2]-c[1][2]*c[0][2])+c[0][2]*(c[0][1]*c[1][2]-c[1][1]*c[0][2]);
  const spread=c[0][0]+c[1][1]+c[2][2];
  if(spread<.005||det/Math.max(spread**3,1e-12)<1e-5)throw new Error('Degenerate landmarks: add holds at different heights AND depths, spread across the image.');
  return {center,spread:Math.sqrt(spread)};
}
export function fitCamera(observations,{initial={position:[0,1.4,3],rotation:[0,0,0],fov:55,center:[0,0]},width=1080,height=1920,fitFocal=true}={}) {
  if(observations.some(o=>!o.world?.every(Number.isFinite)||o.world.length!==3||!o.pixel?.every(Number.isFinite)||o.pixel.length!==2))throw new Error('Invalid landmark coordinates.');
  const points=observations.filter(o=>!o.heldOut);
  if(points.length<8)throw new Error('Use at least 8 fitting observations, plus separate held-out points.');
  const {center,spread}=checkSpread(points),seeds=[initial];
  for(const fov of fitFocal?[35,60,90]:[initial.fov])for(let i=0;i<8;i++) {
    const angle=i*Math.PI/4,distance=Math.max(1,spread*3/Math.tan(fov*DEG/2));
    const position=[center[0]+Math.sin(angle)*distance,center[1]+.2*distance,center[2]+Math.cos(angle)*distance];
    const matrix=new Matrix4().lookAt(new Vector3(...position),new Vector3(...center),new Vector3(0,1,0));
    const euler=new Euler().setFromRotationMatrix(matrix,'YXZ');seeds.push({...initial,position,rotation:[euler.x/DEG,euler.y/DEG,euler.z/DEG],fov});
  }
  const candidates=seeds.map(seed=>optimize(seed,points,width,height,fitFocal)).filter(Boolean).sort((a,b)=>a.cost-b.cost);
  if(!candidates.length)throw new Error('Could not initialize a camera in front of the observations.');
  const result=candidates[0],errors=observations.map(o=>{const p=projectPoint(o.world,result.camera,width,height);return p?Math.hypot(p[0]-o.pixel[0],p[1]-o.pixel[1]):Infinity;});
  const rms=values=>values.length?Math.sqrt(values.reduce((s,v)=>s+v*v,0)/values.length):null;
  const fitRms=rms(errors.filter((_,i)=>!observations[i].heldOut)),heldOutRms=rms(errors.filter((_,i)=>observations[i].heldOut));
  return {...result,errors,fitRms,heldOutRms,valid:Number.isFinite(fitRms)&&fitRms<15&&(heldOutRms===null||heldOutRms<20),validated:observations.filter(o=>o.heldOut).length>=2&&heldOutRms<20};
}
