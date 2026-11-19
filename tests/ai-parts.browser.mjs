// Actual production-compositor regression for compiled parent/child motion.
// Optional live result: node tests/ai-parts.browser.mjs /tmp/parts-cat.json /tmp/parts-frames
import ts from 'typescript';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve(new URL('../',import.meta.url).pathname),cache=new Map();
async function mod(path){
 if(cache.has(path))return cache.get(path);
 let code=ts.transpileModule(await readFile(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 for(const match of [...code.matchAll(/from ["']([^"']+)["']/g)]){
  const name=match[1],url=name==='uuid'?'data:text/javascript,export const v4=()=>crypto.randomUUID()':await mod(resolve(dirname(path),name+'.ts'));
  code=code.replaceAll(JSON.stringify(name),JSON.stringify(url)).replaceAll("'"+name+"'",JSON.stringify(url));
 }
 const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');cache.set(path,url);return url;
}
const urls=Object.fromEntries(await Promise.all(['ai/drawingCompiler','ai/editorPlan','compositeFrame'].map(async name=>[name,await mod(resolve(root,'src/utils',name+'.ts'))])));
const live=process.argv[2]?JSON.parse(await readFile(process.argv[2],'utf8')):null;
const out=process.argv[3]||'/tmp/parts-frames';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/bin/google-chrome',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage();await page.goto('http://localhost:3000');
 const results=await page.evaluate(async ({urls,live,liveTimes})=>{
  const {compileDrawing}=await import(urls['ai/drawingCompiler']),{applyPlan}=await import(urls['ai/editorPlan']),{compositeFrame}=await import(urls.compositeFrame);
  const canvas={width:1280,height:720},empty={clips:[],texts:[],images:[],blurs:[],shapes:[],brushes:[],audio:[],effects:[],layerOrder:[],totalTime:5};
  const drawing={mode:'draw',version:1,summary:'Pivot fixture',duration:5,parts:[
   {n:'pivot',g:'group',b:[.5,.5,1,1],m:[[0,0,0,0,1],[3,.1,0,90,1.2]]},
   {n:'bar',g:'rect',parent:'pivot',b:[.2,0,.12,.06],c:'#ff0000'},
   {n:'outline',g:'path',parent:'pivot',b:[-.2,0,.1,.08],c:'transparent',closed:false,stroke:'#0088ff',p:[[0,1],[.5,0],[1,1]],smooth:true},
  ]};
  const fixturePlan=compileDrawing(drawing,canvas),fixture=applyPlan(empty,fixturePlan,canvas);
  const results=[];
  for(const [name,doc] of [['pivot',fixture],...(live?.doc?[['live',live.doc]]:[])]){
   const duration=doc.totalTime;
   for(const t of name==='pivot'?[0,.75,1.5,2.25,3]:(liveTimes??[0,.75,1.5,2.25,3,Math.min(4.5,duration-.01)])){
    const render=off=>{const c=off?new OffscreenCanvas(1280,720):document.createElement('canvas');c.width=1280;c.height=720;
     compositeFrame({ctx:c.getContext('2d'),...canvas,t,fps:30,clips:doc.clips,texts:doc.texts,images:doc.images,blurs:doc.blurs,shapes:doc.shapes,brushes:doc.brushes,clipEffects:doc.effects,imageEls:{},layerOrder:doc.layerOrder,getVideoDrawable:()=>null});return c;};
    const c=render(false),a=c.getContext('2d').getImageData(0,0,1280,720).data,b=render(true).getContext('2d').getImageData(0,0,1280,720).data;
    let diff=0,red=0,sx=0,sy=0,sxx=0,syy=0,sxy=0,lit=0;
    for(let i=0;i<a.length;i+=4){const x=(i/4)%1280+.5,y=Math.floor(i/4/1280)+.5;
     for(let j=0;j<4;j++)if(a[i+j]!==b[i+j])diff++;
     if(a[i]+a[i+1]+a[i+2]>30)lit++;
     if(a[i]>200&&a[i+1]<30&&a[i+2]<30){red++;sx+=x;sy+=y;sxx+=x*x;syy+=y*y;sxy+=x*y;}}
    const cx=sx/red,cy=sy/red,angle=Math.atan2(2*(sxy/red-cx*cy),sxx/red-cx*cx-(syy/red-cy*cy))*90/Math.PI;
    results.push({name,t,diff,lit,red,cx,cy,angle,png:c.toDataURL()});
   }
  }return {results,fixture,fixturePlan,drawing};
 },{urls,live,liveTimes:process.env.FRAME_TIMES?.split(',').map(Number)});
 for(const f of results.results){await writeFile(`${out}/${f.name}-${f.t}.png`,Buffer.from(f.png.split(',')[1],'base64'));delete f.png;assert.equal(f.diff,0,'HTML and Offscreen canvases differ');
  if(f.name==='pivot'){
   const u=Math.min(f.t/3,1),r=u*Math.PI/2,s=1+.2*u;
   const x=352+(.5+.1*u+.2*s*Math.cos(r))*576,y=72+(.5+.2*s*Math.sin(r))*576;
   assert.ok(Math.hypot(f.cx-x,f.cy-y)<1,`pivot centroid mismatch at ${f.t}`);
   const difference=Math.abs(((f.angle-u*90+270)%180)-90);assert.ok(difference<1,`pivot rotation mismatch at ${f.t}: ${f.angle}`);
  }
 }
 await writeFile(`${out}/measurements.json`,JSON.stringify(results.results,null,2));
 await writeFile(`${out}/fixture.json`,JSON.stringify({doc:results.fixture,plan:results.fixturePlan,responses:[{type:'result',text:JSON.stringify(results.drawing)}]},null,2));
 console.log(JSON.stringify(results.results,null,2));
}finally{await browser.close();}
