// Explicit browser frame verification, using the production compositor.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/ai-render.browser.mjs [live-result.json] [output-dir]
import ts from 'typescript';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=resolve(new URL('../',import.meta.url).pathname), cache=new Map();
async function mod(path) {
 if(cache.has(path))return cache.get(path);
 let code=ts.transpileModule(await readFile(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 for(const match of [...code.matchAll(/from ["']([^"']+)["']/g)]) {
  const name=match[1];
  const url=name==='uuid'?'data:text/javascript,export const v4=()=>crypto.randomUUID()':await mod(resolve(dirname(path),name+'.ts'));
  code=code.replaceAll(JSON.stringify(name),JSON.stringify(url));
 }
 const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');cache.set(path,url);return url;
}
const editor=await mod(resolve(root,'src/utils/ai/editorPlan.ts'));
const compositor=await mod(resolve(root,'src/utils/compositeFrame.ts'));
const out=process.argv[3]||'/tmp/director-frames';await mkdir(out,{recursive:true});
const live=process.argv[2]?JSON.parse(await readFile(process.argv[2],'utf8')):null;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/bin/google-chrome',headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage();await page.goto('http://localhost:3000');
 const result=await page.evaluate(async ({editor,compositor,live})=>{
  const {applyPlan}=await import(editor),{compositeFrame}=await import(compositor);
  const canvas={width:1280,height:720}, empty={clips:[],texts:[],images:[],blurs:[],shapes:[],brushes:[],audio:[],effects:[],layerOrder:[],totalTime:5};
  const operation=(layer,values)=>({action:'add',layer,values});
  const plan=operations=>({version:1,summary:'Renderer fixture',operations});
  const fixture=applyPlan(empty,plan([
   operation('text',{text:'Hello',textColor:'#00ff00',isBold:true,isUnderline:true,textX:100,textY:100,width:400,height:80,fontSize:48,keyframes:[{prop:'x',keys:[{t:0,value:0},{t:3,value:300}]}]}),
   operation('brush',{x:200,y:300,width:400,height:200,color:'#0088ff',strokeWidth:8,points:[{x:0,y:0},{x:1,y:0},{x:1,y:1}],animation:'drawIn',drawDuration:3,endTime:5}),
  ]),canvas);
  function render(doc,t,offscreen=false){
   const c=offscreen?new OffscreenCanvas(1280,720):document.createElement('canvas');c.width=1280;c.height=720;
   compositeFrame({ctx:c.getContext('2d'),...canvas,t,fps:30,clips:doc.clips,texts:doc.texts,images:doc.images,blurs:doc.blurs,shapes:doc.shapes,brushes:doc.brushes,clipEffects:doc.effects,imageEls:{},layerOrder:doc.layerOrder,getVideoDrawable:()=>null});return c;
  }
  const frames=[];
  for(const [name,doc] of [['fixture',fixture],...(live?.doc?[['live',live.doc]]:[])])for(const t of [0,0.75,1.5,3,4.5]){
   const c=render(doc,t),off=render(doc,t,true),data=c.getContext('2d').getImageData(0,0,1280,720).data,other=off.getContext('2d').getImageData(0,0,1280,720).data;
   let green=0,blue=0,gx=0,lit=0,diff=0;
   for(let i=0;i<data.length;i+=4){if(data[i]>10||data[i+1]>10||data[i+2]>10)lit++;if(data[i+1]>100&&data[i+1]>data[i]*1.5&&data[i+1]>data[i+2]*1.5){green++;gx+=(i/4)%1280;}if(data[i+2]>100&&data[i+2]>data[i]*1.5&&data[i+2]>data[i+1]*1.2)blue++;for(let j=0;j<4;j++)if(data[i+j]!==other[i+j])diff++;}
   frames.push({name,t,green,greenCenter:green?gx/green:0,blue,lit,previewExportPixelDifference:diff,png:c.toDataURL()});
  }
  return frames;
 },{editor,compositor,live});
 for(const frame of result){await writeFile(`${out}/${frame.name}-${frame.t}.png`,Buffer.from(frame.png.split(',')[1],'base64'));delete frame.png;assert.equal(frame.previewExportPixelDifference,0);}
 const f=result.filter(x=>x.name==='fixture');assert.ok(f[0].green>200);assert.ok(Math.abs(f[3].greenCenter-f[0].greenCenter-300)<2);assert.equal(f[0].blue,0);assert.ok(f[2].blue>f[1].blue);assert.ok(f[3].blue>f[2].blue);assert.equal(f[3].blue,f[4].blue);
 if(live?.doc)assert.ok(result.some(x=>x.name==='live'&&x.lit>100));
 await writeFile(`${out}/measurements.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
