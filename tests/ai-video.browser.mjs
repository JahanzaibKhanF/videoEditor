// Real imported video, production UI/compositor/history/WebCodecs. Only model
// transport is stubbed; no segmentation or rendering functions are mocked.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.ARTIFACT_DIR||'/tmp/ai-video-verification';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/bin/google-chrome',headless:true,args:['--no-sandbox']});
const contexts=[],errors=[];let mode='edit',page;
try {
 page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(45000);
 await page.addInitScript(()=>{Object.defineProperty(window,'showOpenFilePicker',{value:undefined,configurable:true});});
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/ai/director',async route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{models:[{name:'qwen2.5:7b',size:0}]}});
  const {input}=route.request().postDataJSON();contexts.push(input);
  const clip=input.scene.video[0];assert.ok(clip,'Expected an imported timeline video');
  const plan=mode==='unsupported'?{mode:'edit',version:1,summary:'Automatic subject cutout is not available through AI yet. Use the manual BG Remove panel.',operations:[]}:{mode:'edit',version:1,summary:'Trimmed, keyed and muted the existing video with motion over pink.',operations:[
   {action:'add',layer:'shape',values:{kind:'rectangle',x:0,y:0,width:input.canvas.width,height:input.canvas.height,fill:'#ff80c0',zIndex:100,startTime:0,endTime:5}},
   {action:'trim',layer:'video',targetId:clip.id,sourceStart:.2,sourceEnd:1.7},
   {action:'update',layer:'video',targetId:clip.id,values:{muted:true,chromaKey:{enabled:true,color:'#00ff00',tolerance:.4,edgeFeather:.12,edgeThin:0},keyframes:[{prop:'x',keys:[{t:0,value:0},{t:1.5,value:120}]}]}},
  ]};
  await route.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'result',text:JSON.stringify(plan)})+'\n'});
 });
 await page.goto((process.env.BASE_URL||'http://localhost:3000')+'/editor');await page.waitForTimeout(1500);
 await page.getByText('New composition',{exact:true}).click();await page.getByText('16:9',{exact:true}).click();
 await page.getByRole('button',{name:'Create Project'}).click();await page.getByRole('button',{name:/Continue as guest/}).click();
 await page.getByRole('button',{name:'Media',exact:true}).click();
 const chooser=page.waitForEvent('filechooser');await page.getByText('Import your media',{exact:true}).click();await(await chooser).setFiles(process.env.VIDEO_FIXTURE||'/tmp/ai-green-screen.mp4');

 await page.getByTitle('Play (Space)',{exact:true}).click();await page.waitForTimeout(300);await page.getByTitle('Pause (Space)',{exact:true}).click();
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('canvas')).some(c=>c.width===320&&c.height===180&&c.getContext('2d').getImageData(100,100,1,1).data[1]>180));
 async function still(){if(await page.getByTitle('Pause (Space)',{exact:true}).count())await page.getByTitle('Pause (Space)',{exact:true}).click();await page.getByTitle('Go to start',{exact:true}).click();await page.waitForTimeout(400);}
 async function capture(name){
  const data=await page.evaluate(()=>{const c=Array.from(document.querySelectorAll('canvas')).find(c=>c.width===320&&c.height===180);if(!c)throw Error('Composition canvas missing');const a=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let green=0,red=0,pink=0,sx=0;
   for(let i=0;i<a.length;i+=4){if(a[i+3]<200)continue;const[r,g,b]=a.slice(i,i+3);if(g>180&&r<80&&b<80)green++;if(r>180&&g<80&&b<80){red++;sx+=(i/4)%c.width;}if(r>180&&g>80&&g<170&&b>130)pink++;}return{green,red,pink,redX:red?sx/red:null,png:c.toDataURL()};});
  await writeFile(`${out}/${name}.png`,Buffer.from(data.png.split(',')[1],'base64'));delete data.png;return data;
 }
 await still();const original=await capture('original');assert.ok(original.green>30000);assert.ok(original.red>5000);
 // Select the existing clip in the preview before entering AI Director.
 const canvas=page.locator('canvas').first(),box=await canvas.boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
 await page.getByRole('button',{name:'AI Director',exact:true}).click();await page.locator('#ai-model').selectOption('qwen2.5:7b');
 await page.locator('#ai-prompt').fill('Trim selected video to source .2–1.7 seconds, remove its green screen over pink, mute it and move it right.');await page.getByRole('button',{name:'Create',exact:true}).click();
 await page.getByText('Applied 3 edits.',{exact:false}).waitFor();await still();const edited=await capture('edited');assert.ok(edited.green<100);assert.ok(edited.pink>30000);assert.ok(edited.red>5000);
 const seek=page.getByTitle('Seek',{exact:true}),seekBox=await seek.boundingBox();await seek.click({position:{x:seekBox.width*.2,y:seekBox.height/2}});await page.waitForTimeout(400);const moved=await capture('at-one-second');assert.ok(Math.abs(moved.redX-edited.redX-80)<8,JSON.stringify({edited,moved}));
 await page.getByRole('button',{name:'Undo',exact:true}).click();await still();const undone=await capture('undone');assert.ok(undone.green>30000);assert.equal(undone.pink,0);
 await page.locator('body').click({position:{x:10,y:10}});await page.keyboard.press('Control+Shift+Z');await still();const redone=await capture('redone');assert.ok(redone.pink>30000);assert.ok(redone.green<100);
 // Read current context through the real request path and verify explicit failure.
 mode='unsupported';await page.locator('#ai-prompt').fill('Remove the subject background automatically.');await page.getByRole('button',{name:'Create',exact:true}).click();await page.getByRole('alert').filter({hasText:'Automatic subject cutout'}).waitFor();
 const after=contexts.at(-1).scene,clip=after.video[0];assert.equal(clip.id,contexts[0].scene.video[0].id);assert.equal(clip.sourceStart,.2);assert.equal(clip.sourceEnd,1.7);assert.equal(clip.timelineEnd,1.5);assert.equal(clip.chromaKey.enabled,true);assert.equal(after.audio[0].muted,true);assert.equal(after.audio[0].timelineEnd,1.5);assert.ok(contexts[0].selectedIds.includes(clip.id),'Selected video is missing from model context');
 const noChange=await capture('unsupported-unchanged');assert.deepEqual(noChange,redone);
 const download=page.waitForEvent('download',{timeout:120000});await page.getByRole('button',{name:'Export',exact:true}).click();const file=await download;await file.saveAs(`${out}/edited.mp4`);assert.equal(await file.failure(),null);
 // Inspect real decoded WebCodecs output, not only a successful download.
 const probe=path=>JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_type,codec_name,width,height,r_frame_rate,nb_frames,duration','-of','json',path],{encoding:'utf8'}));
 const source=probe(process.env.VIDEO_FIXTURE||'/tmp/ai-green-screen.mp4'),encoded=probe(`${out}/edited.mp4`);
 assert.ok(source.streams.some(s=>s.codec_type==='audio'));assert.ok(!encoded.streams.some(s=>s.codec_type==='audio'));
 assert.equal(encoded.streams[0].width,320);assert.equal(encoded.streams[0].height,180);assert.equal(encoded.streams[0].nb_frames,'150');
 const rgb=execFileSync('ffmpeg',['-v','error','-i',`${out}/edited.mp4`,'-vf','select=eq(n\\,0)+eq(n\\,30)+eq(n\\,60)','-vsync','0','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{maxBuffer:2_000_000});
 const frameBytes=320*180*3,decoded=[];assert.equal(rgb.length,frameBytes*3);
 for(let f=0;f<3;f++){let green=0,red=0,pink=0,sx=0;for(let j=0;j<frameBytes;j+=3){const i=f*frameBytes+j,[r,g,b]=rgb.subarray(i,i+3);if(g>180&&r<80&&b<80)green++;if(r>180&&g<80&&b<80){red++;sx+=(j/3)%320;}if(r>180&&g>80&&g<170&&b>130)pink++;}decoded.push({green,red,pink,redX:red?sx/red:null});}
 assert.ok(decoded[0].green<10&&decoded[0].red>6000&&decoded[0].pink>50000);assert.ok(Math.abs(decoded[1].redX-decoded[0].redX-80)<1);assert.ok(decoded[2].red===0&&decoded[2].pink>57000);
 await writeFile(`${out}/export-measurements.json`,JSON.stringify({source,export:encoded,frames:decoded,mutedExportHasNoAudioTrack:true},null,2));
 await page.screenshot({path:`${out}/editor.png`});assert.deepEqual(errors,[]);
 await writeFile(`${out}/results.json`,JSON.stringify({original,edited,moved,undone,redone,noChange,contexts,errors,modelCalls:0},null,2));console.log(JSON.stringify({original,edited,moved,undone,redone,errors,requests:contexts.length}));
} catch(e){if(page){await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});console.log('Page errors',errors);}console.error(e);throw e;}finally{await browser.close();}
