// Actual imported-video preview/history plus client cancellation/deadline UI.
// Only model transport is stubbed; no Qwen requests or renderer mocks.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.ARTIFACT_DIR||'/tmp/ai-motion-verification';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/bin/google-chrome',headless:true,args:['--no-sandbox']});
const contexts=[],errors=[];let mode='motion',page;
try{
 page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(30000);
 await page.addInitScript(()=>Object.defineProperty(window,'showOpenFilePicker',{value:undefined,configurable:true}));
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/ai/director',async route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{models:[{name:'qwen2.5:7b',size:0}]}});
  const {input}=route.request().postDataJSON();contexts.push(input);const clip=input.scene.video[0];assert.ok(clip);
  const plan={mode:'edit',version:1,summary:'Video travels across the Canvas.',operations:mode==='motion'?[{action:'update',layer:'video',targetId:clip.id,values:{keyframes:[{prop:'x',keys:[{t:0,value:-60},{t:3,value:60}]}]}}]:[]};
  await route.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'result',text:JSON.stringify(plan)})+'\n'});
 });
 await page.goto((process.env.BASE_URL||'http://localhost:3003')+'/editor');await page.waitForTimeout(1200);
 await page.getByText('New composition',{exact:true}).click();await page.getByText('16:9',{exact:true}).click();
 await page.getByRole('button',{name:'Create Project'}).click();await page.getByRole('button',{name:/Continue as guest/}).click();
 await page.getByRole('button',{name:'Media',exact:true}).click();const chooser=page.waitForEvent('filechooser');await page.getByText('Import your media',{exact:true}).click();await(await chooser).setFiles(process.env.VIDEO_FIXTURE||'/tmp/ai-motion-source.mp4');
 await page.getByTitle('Play (Space)',{exact:true}).click();await page.waitForTimeout(300);await page.getByTitle('Pause (Space)',{exact:true}).click();
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('canvas')).some(c=>c.width===320&&c.height===180&&c.getContext('2d').getImageData(100,100,1,1).data[1]>180));
 async function still(){if(await page.getByTitle('Pause (Space)',{exact:true}).count())await page.getByTitle('Pause (Space)',{exact:true}).click();await page.getByTitle('Go to start',{exact:true}).click();await page.waitForTimeout(250);}
 async function capture(name){const data=await page.evaluate(()=>{const c=Array.from(document.querySelectorAll('canvas')).find(c=>c.width===320&&c.height===180),a=c.getContext('2d').getImageData(0,0,320,180).data;let red=0,sx=0;for(let i=0;i<a.length;i+=4)if(a[i]>180&&a[i+1]<80&&a[i+2]<80&&a[i+3]>200){red++;sx+=(i/4)%320;}return {red,x:red?sx/red:null,png:c.toDataURL()};});await writeFile(`${out}/${name}.png`,Buffer.from(data.png.split(',')[1],'base64'));delete data.png;return data;}
 await still();const original=await capture('original');
 const box=await page.locator('canvas').first().boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height/2);await page.getByRole('button',{name:'AI Director',exact:true}).click();
 await page.locator('#ai-model').selectOption('qwen2.5:7b');await page.locator('#ai-prompt').fill('Move the selected video from left to right over 3 seconds.');await page.getByRole('button',{name:'Create',exact:true}).click();await page.getByText('Applied 1 edits.',{exact:false}).waitFor();await still();const start=await capture('start');
 assert.ok(Math.abs(start.x-(original.x-60))<2);
 const seek=page.getByTitle('Seek',{exact:true}),seekBox=await seek.boundingBox();
 for(const [t,name,expected] of [[1.5,'middle',original.x],[3,'end',original.x+60]]){await seek.click({position:{x:seekBox.width*t/5,y:seekBox.height/2}});await page.waitForTimeout(250);const frame=await capture(name);assert.ok(Math.abs(frame.x-expected)<3,JSON.stringify({t,frame,expected}));}
 await still();await page.getByTitle('Play (Space)',{exact:true}).click();await page.waitForTimeout(500);await page.getByTitle('Pause (Space)',{exact:true}).click();const playback=await capture('playback');assert.ok(playback.x>start.x+5);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await still();const undone=await capture('undone');assert.deepEqual(undone,original);
 await page.locator('body').click({position:{x:10,y:10}});await page.keyboard.press('Control+Shift+Z');await still();assert.deepEqual(await capture('redone'),start);
 mode='context';await page.locator('#ai-prompt').fill('Inspect current video');await page.getByRole('button',{name:'Create',exact:true}).click();await page.getByRole('alert').filter({hasText:'No edits applied'}).waitFor();
 const before=contexts[0].scene,after=contexts[1].scene;
 for(const prop of ['id','sourceStart','sourceEnd','timelineStart','timelineEnd'])assert.equal(after.video[0][prop],before.video[0][prop],prop);
 assert.deepEqual(after.audio,before.audio);assert.equal(after.video[0].keyframes[0].keys[1].t,3);
 // Deliberately stall the browser transport after a misleading model summary.
 await page.evaluate(()=>{const original=window.fetch.bind(window);window.__directorTestMode='stall';window.fetch=async(url,options)=>{if(String(url)==='/api/ai/director'&&options?.method==='POST')return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify({type:'delta',text:'{"summary":"Successfully created your cat"'})+'\n'));if(window.__directorTestMode==='invalid'){c.enqueue(new TextEncoder().encode(JSON.stringify({type:'result',text:'{}'})+'\n'));c.close();}}}));return original(url,options);};});
 const create=page.getByRole('button',{name:'Create',exact:true});
 await page.locator('#ai-prompt').fill('Create a simple cat with brush strokes');await create.click();await page.getByText(/characters received/).waitFor();assert.equal(await page.getByText('Successfully created your cat',{exact:false}).count(),0);assert.equal(await page.getByText(/^Applied \d+ edits/).count(),0);
 await page.getByRole('button',{name:/Cancel ·/}).click();await create.waitFor();await page.getByRole('alert').filter({hasText:'Generation stopped'}).waitFor();assert.deepEqual(await capture('cancelled'),start);
 // Advance browser timers, not wall-clock inference, to test the real 3m limit.
 await page.clock.install();await create.click();await page.getByText(/characters received/).waitFor();await page.clock.fastForward(180001);await page.getByRole('alert').filter({hasText:'3-minute limit'}).waitFor();await create.waitFor();assert.equal(await create.isEnabled(),true);assert.deepEqual(await capture('timed-out'),start);
 await page.evaluate(()=>window.__directorTestMode='invalid');await create.click();await page.getByRole('alert').filter({hasText:'after correcting'}).waitFor();await create.waitFor();assert.equal(await create.isEnabled(),true);
 await page.screenshot({path:`${out}/editor.png`});assert.deepEqual(errors,[]);await writeFile(`${out}/results.json`,JSON.stringify({original,start,playback,undone,before,after,cancellation:true,timeout:true,invalidRetryRecovery:true,errors,modelCalls:0},null,2));console.log('PASS Canvas motion/timing, playback, undo/redo, cancellation, timeout, invalid-result recovery.');
}finally{await browser.close();}
