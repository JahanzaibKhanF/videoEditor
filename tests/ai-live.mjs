// Explicit opt-in integration probe; requires next dev and local Ollama.
// node tests/ai-live.mjs 'prompt' /tmp/result.json
import ts from 'typescript';
import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
async function mod(path,replacements={}) {
 let code=ts.transpileModule(await readFile(new URL(path,root),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 for(const [a,b] of Object.entries(replacements))code=code.replaceAll(a,b);
 return 'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
}
const e=await mod('src/utils/ai/editorPlan.ts');
const p=await mod('src/utils/ai/editorProtocol.ts',{'./editorPlan':e,'./drawingCompiler':await mod('src/utils/ai/drawingCompiler.ts')});
const {applyPlan,sceneForModel}=await import(e);
const {LocalDirector}=await import(await mod('src/utils/ai/localDirector.ts',{'./editorProtocol':p,'./directorLimits':await mod('src/utils/ai/directorLimits.ts')}));
const input={prompt:process.argv[2],model:process.env.AI_MODEL||'qwen2.5:7b',canvas:{width:1280,height:720},totalTime:5,selectedIds:[],scene:{}};
const before=process.env.AI_DOCUMENT ? JSON.parse(await readFile(process.env.AI_DOCUMENT,'utf8')) : {clips:[],texts:[],images:[],blurs:[],shapes:[],brushes:[],audio:[],effects:[],layerOrder:[],totalTime:5};
if(process.env.AI_DOCUMENT){input.scene=sceneForModel(before);input.totalTime=before.totalTime;input.selectedIds=process.env.AI_SELECTED_IDS?.split(',')??[];}
const nativeFetch=globalThis.fetch, metrics=[],responses=[]; let requests=0;
globalThis.fetch=async (url,init)=>{
 if(process.env.AI_SINGLE_CALL==='1' && requests>=1)throw new Error('Benchmark single-call limit: correction skipped'); requests++; const r=await nativeFetch(new URL(url,process.env.BASE_URL||'http://localhost:3000'),init);
 // Collect telemetry from a clone while the real client processes its stream.
 r.clone().text().then(body=>{for(const line of body.trim().split('\n')){try{const event=JSON.parse(line);if(event.type==='metrics')metrics.push(event);if(event.type==='result')responses.push(event);}catch{}}}).catch(()=>{});
 return r;
};
let last=''; const start=performance.now();
try {
 const plan=await new LocalDirector(Number(process.env.AI_TIMEOUT_MS)||180000).generate(input,new AbortController().signal,progress=>{if(progress.label!==last){last=progress.label;console.log(last);}},plan=>applyPlan(before,plan,input.canvas));
 const appStart=performance.now();const doc=applyPlan(before,plan,input.canvas); const applyMs=performance.now()-appStart;
 const result={input,plan,doc,metrics,responses,requests,elapsedMs:performance.now()-start,applyMs};
 await writeFile(process.argv[3],JSON.stringify(result,null,2));
 console.log(JSON.stringify({elapsedMs:result.elapsedMs,applyMs,requests,metrics,operations:plan.operations.length}));
} catch(error){console.error(error.message);await writeFile(process.argv[3],JSON.stringify({input,error:error.message,metrics,responses,requests,elapsedMs:performance.now()-start},null,2));process.exitCode=1;}
