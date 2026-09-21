import { approximateCamera, fitCamera, projectPoint } from './calibration.js';
import { validCamera } from './alignment.js';
import { timeMap } from './format.js';

// Store the user's image measurements, not projected points from our own camera.
// Grip centers are approximate physical matches, separate from verified landmarks.
export function normalizeFrameMatches(matches,bookmarks) {
  const frames=new Map();
  for(const frame of Array.isArray(matches)?matches:[]){
    if(!Number.isFinite(frame.videoTime)||!bookmarks.some(time=>Math.abs(time-frame.videoTime)<.001))continue;
    const points=new Map();
    for(const point of Array.isArray(frame.points)?frame.points:[]){
      if(!['left','right'].includes(point.hand)||!Array.isArray(point.pixel)||point.pixel.length!==2||!point.pixel.every(Number.isFinite)||point.pixel[0]<0||point.pixel[0]>1080||point.pixel[1]<0||point.pixel[1]>1920)continue;
      points.set(point.hand,{hand:point.hand,pixel:[...point.pixel]});
    }
    if(points.size)frames.set(frame.videoTime,{videoTime:frame.videoTime,sampleTime:Number.isFinite(frame.sampleTime)?frame.sampleTime:frame.videoTime,points:[...points.values()]});
  }
  return [...frames.values()].sort((a,b)=>a.videoTime-b.videoTime);
}

export function savedFrameObservations(matches,timeline,mapping,segment) {
  const observations=[];
  for(const match of matches){
    const time=timeMap(match.sampleTime??match.videoTime,mapping);
    if(time<timeline.frames[0].t||time>timeline.duration)continue;
    const frame=timeline.seek(time);
    if(frame.gap||frame.segment!==segment)continue;
    for(const point of match.points){
      const controller=frame.xr.controllers.find(c=>c.handedness===point.hand);
      if(controller?.grip?.p?.length!==3||!controller.grip.p.every(Number.isFinite))continue;
      observations.push({world:[...controller.grip.p],pixel:[...point.pixel],hand:point.hand,videoTime:match.videoTime});
    }
  }
  return observations;
}

export function cameraMatchError(points,camera) {
  if(!points.length)return null;
  let sum=0;for(const point of points){const p=projectPoint(point.world,camera);if(!p)return Infinity;sum+=(p[0]-point.pixel[0])**2+(p[1]-point.pixel[1])**2;}
  return Math.sqrt(sum/points.length);
}

export function fitSavedFrames(points,initial) {
  const base={camera:initial,applied:false,count:points.length,rms:cameraMatchError(points,initial)};
  if(points.length<2)return {...base,status:'collecting',message:'Match both visible controllers, or add another frame.'};
  let camera,status='provisional',reason='Add 4–6 poses at different heights and depths.';
  if(points.length>=8){
    try{camera=fitCamera(points,{initial}).camera;status='refined';}
    catch(error){reason=error.message;}
  }
  camera??=approximateCamera(points,initial);
  if(!validCamera(camera))return {...base,status:'collecting',message:'Roughly point the camera toward the performer, then add more matched poses.'};
  const rms=cameraMatchError(points,camera);
  // Do not replace a good manual camera with a worse or inconsistent full fit.
  if(!Number.isFinite(rms)||rms>base.rms+.01||(status==='refined'&&rms>40))return {...base,status:'rejected',message:'Matches disagree. Check timing and controller clicks; camera kept.'};
  return {camera,applied:true,count:points.length,rms,status,message:status==='refined'?'Camera refined across saved frames. Check another pose.':`Early estimate. ${reason}`};
}
