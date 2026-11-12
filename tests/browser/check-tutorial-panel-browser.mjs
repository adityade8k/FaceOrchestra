import { withBrowser } from "../../scripts/browser-session.mjs";
await withBrowser(async (browser) => {
  const report = await browser.evaluate(`(async()=>{
    const {app}=await import('/src/main.js');
    const THREE=await import('three');
    const t=app.runtime.tutorial, renderer=app.runtime.renderer;
    renderer.setAnimationLoop(null);
    t.panel.setXR(true);
    const scene=new THREE.Scene();
    const camera=new THREE.OrthographicCamera(-1,1,1,-1,0.1,10);
    camera.position.z=1;
    const geometry=new THREE.PlaneGeometry(2,2);
    const material=new THREE.MeshBasicMaterial();
    scene.add(new THREE.Mesh(geometry,material));
    const reports=[];
    try {
      for (const action of [null,'tutorials','basics','menu-home','resume-mode','menu-home','resume-mode']) {
        if(action)await t.action(action);
        t.panels.render(performance.now());
        const p=t.panel, width=384, height=Math.round(width*p.canvas.height/p.canvas.width);
        const target=new THREE.WebGLRenderTarget(width,height);
        const reference=new THREE.CanvasTexture(p.canvas);
        reference.colorSpace=THREE.SRGBColorSpace;
        try {
          renderer.setRenderTarget(target);
          material.map=p.surface.material.map;
          material.needsUpdate=true;
          renderer.render(scene,camera);
          const actual=new Uint8Array(width*height*4);
          renderer.readRenderTargetPixels(target,0,0,width,height,actual);
          material.map=reference;
          renderer.render(scene,camera);
          const expected=new Uint8Array(actual.length);
          renderer.readRenderTargetPixels(target,0,0,width,height,expected);
          let mismatched=0;
          for(let i=0;i<actual.length;i+=4)if(actual[i]!==expected[i]||actual[i+1]!==expected[i+1]||actual[i+2]!==expected[i+2])mismatched++;
          reports.push({action:action||'launch',compact:p.compact,mismatchedPixels:mismatched,pixels:width*height});
        } finally {
          renderer.setRenderTarget(null);
          reference.dispose();
          target.dispose();
        }
      }
    } finally {
      geometry.dispose();
      material.dispose();
    }
    return reports;
  })()`);
  console.log(JSON.stringify(report, null, 2));
  if (report.some((r) => r.mismatchedPixels))
    throw new Error("Rendered menu differs from its canvas after resizing");
});
