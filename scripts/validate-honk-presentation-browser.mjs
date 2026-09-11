// Run on the application page: (await import("/scripts/validate-honk-presentation-browser.mjs")).validate()
export async function validate() {
 const THREE = await import('three');
 const { createFaceOrchestraApp } = await import('/src/app/createFaceOrchestraApp.js');
 const { MORPH_TARGET_NAMES } = await import('/src/config/honk.js');
 const app = createFaceOrchestraApp({ container: document.createElement('div'), storage: { getItem(){return null},setItem(){},removeItem(){} } });
 await app.initialize();
 const r = app.runtime;
 r.createSpawnedComponent('honk');
 const h = r.activeInstrumentState;
 h.setAutomationLayer('validation', { squeeze: 1, bend: 0.5 });
 for(let frame=0;frame<90;frame++) r.applyResolvedHonkPerformanceStates(frame*1000/90);
 h.clearAutomationLayer('validation');
 r.applyResolvedHonkPerformanceStates(89*1000/90+1000/60);
 const result = {three:THREE.REVISION, squeeze:h.getMorphValue(MORPH_TARGET_NAMES.squeeze), rendered:h.honkPresentation.squeeze, authoritative:h.hornSqueezeValue, bend:h.bendValue, scale:h.root.scale.x, visualScale:h.honkVisualRoot.scale.x};
 const sphere=()=>{const s=h.getSqueezeColliderSphere();return {center:s.center.toArray(),radius:s.radius}};
 const socket=h.getTarget('honk.looper-connector');
 result.sphereVisual=sphere();
 result.sphereInteraction=h.withInteractionPose(sphere);
 result.socketVisual=socket.getWorldPosition(new THREE.Vector3()).toArray();
 result.socketInteraction=h.withInteractionPose(()=>socket.getWorldPosition(new THREE.Vector3()).toArray());
 const box=h.withInteractionPose(()=>new THREE.Box3().setFromObject(h.root));
 const meshes=h.gripTargetList;
 let compared=0, hits=0;
 for(let i=0;i<9;i++) for(let j=0;j<9;j++) {
   const x=THREE.MathUtils.lerp(box.min.x,box.max.x,(i+0.5)/9);
   const y=THREE.MathUtils.lerp(box.min.y,box.max.y,(j+0.5)/9);
   const ray=new THREE.Raycaster(new THREE.Vector3(x,y,box.max.z+1),new THREE.Vector3(0,0,-1));
   const visible=ray.intersectObjects(meshes,false).map(hit=>hit.distance);
   const canonical=h.withInteractionPose(()=>{
     const found=[]; for(const mesh of meshes) THREE.Mesh.prototype.raycast.call(mesh,ray,found);
     return found.sort((a,b)=>a.distance-b.distance).map(hit=>hit.distance);
   });
   if(JSON.stringify(visible)!==JSON.stringify(canonical)) throw Error('ray mismatch');
   compared++; hits+=visible.length;
 }
 result.rays={compared,hits};
 app.sceneRuntime.render();
 result.renderInfo={geometries:app.sceneRuntime.renderer.info.memory.geometries,calls:app.sceneRuntime.renderer.info.render.calls};
 if(Math.abs(result.squeeze-0.82)>0.0001) throw Error('release did not ease');
 if(JSON.stringify(result.sphereVisual)!==JSON.stringify(result.sphereInteraction)) throw Error('sphere changed');
 if(JSON.stringify(result.socketVisual)!==JSON.stringify(result.socketInteraction)) throw Error('socket changed');
 app.dispose();
 return result;
}
