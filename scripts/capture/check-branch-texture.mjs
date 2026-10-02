import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "./server.mjs";
import { launchChrome } from "./chrome.mjs";

const root = await mkdtemp(join(tmpdir(), "honk-branch-"));
let service, browser;
try {
  service = await startServer({
    host: "127.0.0.1",
    port: 0,
    plain: true,
    dataRoot: root,
  });
  browser = await launchChrome();
  await browser.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
    window.textureViolations=[];
    document.addEventListener('securitypolicyviolation', e => {
      window.textureViolations.push({directive:e.effectiveDirective,uri:e.blockedURI});
    });
  `,
  });
  await browser.navigate(`http://127.0.0.1:${service.port}/`);
  const result = await browser.evaluate(`(async()=>{
    const {app}=await import('/src/main.js');
    while(!app.initialized)await new Promise(r=>setTimeout(r,50));
    const THREE=await import('three'),runtime=app.runtime;
    const check=(condition,message)=>{if(!condition)throw new Error(message)};
    const materials=[];
    runtime.stickTemplate.traverse(o=>{if(o.isMesh)materials.push(o.material)});
    check(materials.length>0,'Branch mesh loaded');
    for(const m of materials){
      check(m.map?.image?.width===2048 && m.map.image.height===2048,'Embedded bark color decoded');
      check(m.map.colorSpace===THREE.SRGBColorSpace && !m.map.flipY,'Authored color space and UV orientation');
      check(m.normalMap?.image?.width>0 && m.roughnessMap?.image?.width>0 && m.metalnessMap?.image?.width>0,'Surface maps loaded');
      check(m.map.userData.captureAsset?.slot==='map','Replay references embedded color asset');
    }
    // Exercise the same clone used by equipped XR sticks, then leave a lesson.
    const first=runtime.createStickObject();
    const t=runtime.tutorial;await t.action('tutorials');await t.action('composition:kuch-to-hua-hai');
    await t.action('composition-quick-practice');await t.enterPlay();
    const second=runtime.createStickObject();
    for(const object of [first,second])object.root.traverse(o=>{
      if(o.isMesh && o.name!=='STICK_collider')check(materials.includes(o.material) && o.material.map.image.width===2048,'Held clone retains shared bark after scene restoration');
    });
    const scene=new THREE.Scene();scene.background=new THREE.Color('#28393d');
    const model=second.root;model.visible=true;if(second.collider)second.collider.visible=false;scene.add(model);
    const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3());
    model.position.sub(box.getCenter(new THREE.Vector3()));
    scene.add(new THREE.HemisphereLight(0xffffff,0x444444,2));
    const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(2,3,4);scene.add(light);
    const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(900,900);
    const camera=new THREE.PerspectiveCamera(40,1,.01,100);
    camera.position.set(size.length()*.4,size.length()*.15,size.length()*1.5);camera.lookAt(0,0,0);
    renderer.render(scene,camera);
    const image=renderer.domElement.toDataURL('image/png').split(',')[1];
    const canvas=document.createElement('canvas');canvas.width=canvas.height=900;
    const ctx=canvas.getContext('2d');ctx.drawImage(renderer.domElement,0,0);
    const pixels=ctx.getImageData(0,0,900,900).data;let barkPixels=0;
    for(let i=0;i<pixels.length;i+=4)if(pixels[i]>pixels[i+1]*1.08 && pixels[i+1]>pixels[i+2]*1.08)barkPixels++;
    check(barkPixels>10000,'Actual rendered branch contains brown bark, not a white fallback');
    renderer.dispose();
    await new Promise(r=>setTimeout(r,100));
    check(window.textureViolations.length===0,'No blocked embedded images');
    return {image,barkPixels,materials:materials.length,embeddedImage:[materials[0].map.image.width,materials[0].map.image.height],violations:window.textureViolations};
  })()`);
  assert.deepEqual(browser.errors, []);
  await mkdir("test-results/branch-texture", { recursive: true });
  await writeFile(
    "test-results/branch-texture/branch.png",
    Buffer.from(result.image, "base64"),
  );
  delete result.image;
  await writeFile(
    "docs/audits/branch-texture.json",
    JSON.stringify({ passed: true, ...result }, null, 2) + "\n",
  );
  console.log(
    "Passed branch embedded texture, surface maps, held clones, lesson exit, capture reference, and rendered bark checks.",
  );
} finally {
  await browser?.close();
  await service?.close();
  await rm(root, { recursive: true, force: true });
}
