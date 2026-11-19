// Explicit UI integration fixture, not evidence of model drawing quality.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {readFile}=await import('node:fs/promises');
const live=process.argv[2]?JSON.parse(await readFile(process.argv[2],'utf8')):null;
const plan=live?.plan??{version:1,summary:'Renderer regression fixture',operations:[
 {action:'add',layer:'text',values:{text:'Hello',textColor:'#00ff00',isBold:true,isUnderline:true,textX:100,textY:100,width:400,height:80,fontSize:48,keyframes:[{prop:'x',keys:[{t:0,value:0},{t:3,value:300}]}]}},
 {action:'add',layer:'brush',values:{x:200,y:300,width:400,height:200,color:'#0088ff',strokeWidth:8,points:[{x:0,y:0},{x:1,y:0},{x:1,y:1}],animation:'drawIn',drawDuration:3,endTime:5}},
]};
const browser=await chromium.launch({executablePath:'/bin/google-chrome',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/ai/director',route=>route.request().method()==='POST'?route.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'result',text:live?.responses?.at(-1)?.text??JSON.stringify(plan)})+'\n'}):route.continue());
 await page.goto('http://localhost:3000/editor');await page.waitForTimeout(1500);
 await page.getByText('New composition',{exact:true}).click();await page.getByText('16:9',{exact:true}).click();
 await page.getByRole('button',{name:'Create Project'}).click();await page.getByRole('button',{name:/Continue as guest/}).click();await page.getByRole('button',{name:'AI Director',exact:true}).click();
 await page.locator('#ai-model').selectOption('qwen2.5:7b');await page.locator('#ai-prompt').fill('Renderer regression fixture');await page.getByRole('button',{name:'Create',exact:true}).click();await page.getByText(`Applied ${plan.operations.length} edits.`,{exact:false}).waitFor();
 // Verify one undo restores the empty document, then redo restores the complete batch.
 await page.getByRole('button',{name:'Undo',exact:true}).click();await page.getByRole('button',{name:'Export',exact:true}).isDisabled().then(v=>{if(!v)throw Error('Undo left layers behind');});
 await page.locator('body').click({position:{x:10,y:10}});await page.keyboard.press('Control+Shift+Z');await page.waitForTimeout(500);
 const download=page.waitForEvent('download',{timeout:120000});await page.getByRole('button',{name:'Export',exact:true}).click();
 const file=await download;await file.saveAs(process.env.EXPORT_PATH||'/tmp/director-render-export.mp4');await page.screenshot({path:'/tmp/director-render-export-ui.png'});
 console.log(JSON.stringify({errors,download:await file.failure()}));if(errors.length)throw Error(errors.join(';'));
} finally{await browser.close();}
