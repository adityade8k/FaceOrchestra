import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from './capture/server.mjs';
import { launchChrome } from './capture/chrome.mjs';

// Every runner using this helper owns an isolated Chrome profile and temporary
// recording store. No user browser storage or repository captures are touched.
export async function withBrowser(check) {
  const dataRoot = await mkdtemp(join(tmpdir(), 'honk-validation-'));
  let service, browser;
  try {
    service = await startServer({host:'127.0.0.1',port:0,plain:true,pairCode:'123456',dataRoot});
    if(process.platform==='darwin')process.env.CAPTURE_SOFTWARE_GL ??= '0';
    browser = await launchChrome();
    await browser.send('Emulation.setFocusEmulationEnabled',{enabled:true});
    await browser.navigate(`http://127.0.0.1:${service.port}/`);
    await browser.evaluate(`(async()=>{
      const {app}=await import('/src/main.js');
      for(let i=0;i<300&&!app.runtime.tutorial.ready;i++)await new Promise(r=>setTimeout(r,100));
      if(!app.runtime.tutorial.ready)throw new Error('Application did not initialize');
    })()`);
    const result = await check(browser, service);
    if(browser.errors.length)throw new Error(browser.errors.join('\n'));
    return result;
  } finally { await browser?.close(); await service?.close(); await rm(dataRoot,{recursive:true,force:true}); }
}
