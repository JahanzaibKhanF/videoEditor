import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function moduleUrl(file, replacements = {}) {
  let code = ts.transpileModule(await readFile(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  if (code.includes('/directorLimits')) {
    const limitsUrl = await moduleUrl('../src/utils/ai/directorLimits.ts');
    code = code.replaceAll('../../../../src/utils/ai/directorLimits', limitsUrl).replaceAll('./directorLimits', limitsUrl);
  }
  for (const [from, to] of Object.entries(replacements)) code = code.replaceAll(from, to);
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}
const editorUrl = await moduleUrl('../src/utils/ai/editorPlan.ts');
const { applyPlan, parsePlan, sceneForModel, FIELD_SCHEMAS } = await import(editorUrl);
const drawingUrl = await moduleUrl('../src/utils/ai/drawingCompiler.ts');
const { editorMessages, editorCapabilities, parseEditorResponse, extractJsonObject } = await import(await moduleUrl('../src/utils/ai/editorProtocol.ts', { './drawingCompiler': drawingUrl, './editorPlan': editorUrl }));
const canvas = { width: 1280, height: 720 };
const empty = () => ({ clips: [], texts: [], images: [], blurs: [], shapes: [], brushes: [], audio: [], effects: [], layerOrder: [], totalTime: 5 });
const plan = operations => ({ version: 1, summary: 'Edit', operations });
const clipDoc = () => ({ ...empty(), clips: [{ id: 'clip-1', src: 'blob:private', video: 'private-file', sourceFileName: 'private.mp4', duration: 10, startTime: 0, endTime: 10, startPosition: 0, endPosition: 10, x: 0, y: 0, width: 1280, height: 720, scale: 1, transition: 'crossDissolve', zIndex: 8 }], audio: [{ id: 'audio-1', clipId: 'clip-1', name: 'Audio', startTime: 0, endTime: 10, muted: false, volume: 0.8 }], totalTime: 10 });

test('animated shapes become native editable layers; source is unchanged', () => {
  const doc = empty();
  const result = applyPlan(doc, plan([{ action: 'add', layer: 'shape', values: { kind: 'ellipse', x: 80, y: 100, width: 120, height: 80, fill: '#FF9900', startTime: 0, endTime: 5, keyframes: [{ prop: 'x', keys: [{ t: 5, value: 800 }, { t: 0, value: 0 }] }] } }]), canvas);
  assert.equal(doc.shapes.length, 0);
  assert.equal(result.shapes.length, 1);
  assert.ok(result.shapes[0].id);
  assert.deepEqual(result.shapes[0].keyframes[0].keys.map(k => k.t), [0, 5]);
  assert.deepEqual(result.shapes[0].keyframes[0].keys[0].ease, [0, 0, 1, 1]);
});
test('rejects the whole batch when a later operation is invalid', () => {
  const doc = empty();
  assert.throws(() => applyPlan(doc, plan([{ action: 'add', layer: 'shape', values: { fill: '#FFFFFF' } }, { action: 'update', layer: 'shape', targetId: 'invented', values: { x: 2 } }]), canvas), /no longer exists/);
  assert.deepEqual(doc, empty());
});
test('rejects prose, unknown keys, prototype payloads, bad types and timing', () => {
  assert.throws(() => parsePlan('Here is JSON: {}'), /valid JSON/);
  assert.throws(() => parsePlan('{"version":1,"summary":"","operations":[],"__proto__":{}}'), /unsupported field/);
  for (const values of [{ src: 'https://untrusted.test/file' }, { x: '10' }, { x: 1e99 }, { fill: 'url(https://bad)' }, { endTime: 0 }, { sides: 2.5 }]) {
    assert.throws(() => applyPlan(empty(), plan([{ action: 'add', layer: 'shape', values }]), canvas));
  }
});
test('validates keyframe values, duplicate tracks and duplicate times', () => {
  for (const tracks of [
    [{ prop: 'opacity', keys: [{ t: 0, value: 2 }] }],
    [{ prop: 'scale', keys: [{ t: 0, value: -1 }] }],
    [{ prop: 'x', keys: [{ t: 0, value: 0 }, { t: 0, value: 2 }] }],
    [{ prop: 'x', keys: [{ t: 0, value: 0 }] }, { prop: 'x', keys: [{ t: 1, value: 1 }] }],
  ]) assert.throws(() => applyPlan(empty(), plan([{ action: 'add', layer: 'shape', values: { keyframes: tracks } }]), canvas));
});
test('split preserves source, track, outgoing transition and linked audio', () => {
  const doc = clipDoc();
  const result = applyPlan(doc, plan([{ action: 'split', layer: 'video', targetId: 'clip-1', at: 4 }]), canvas);
  assert.equal(result.clips.length, 2);
  assert.equal(result.clips[0].endTime, 4);
  assert.equal(result.clips[1].startTime, 4);
  assert.equal(result.clips[0].transition, 'none');
  assert.equal(result.clips[1].transition, 'crossDissolve');
  assert.equal(result.clips[1].zIndex, 8);
  assert.equal(result.clips[1].src, doc.clips[0].src);
  assert.equal(result.audio[1].clipId, result.clips[1].id);
  assert.equal(result.audio[0].endTime, 4);
  assert.equal(doc.clips.length, 1);
});
test('mute, move, trim, and delete keep paired audio consistent', () => {
  const muted = applyPlan(clipDoc(), plan([{ action: 'update', layer: 'video', targetId: 'clip-1', values: { muted: true } }]), canvas);
  assert.equal(muted.audio[0].muted, true);
  const moved = applyPlan(muted, plan([{ action: 'move', layer: 'video', targetId: 'clip-1', at: 2 }]), canvas);
  assert.equal(moved.audio[0].startTime, 2);
  assert.equal(moved.totalTime, 12);
  const trimmed = applyPlan(moved, plan([{ action: 'trim', layer: 'video', targetId: 'clip-1', sourceStart: 2, sourceEnd: 5 }]), canvas);
  assert.equal(trimmed.clips[0].endPosition, 5);
  assert.equal(trimmed.audio[0].endTime, 5);
  const removed = applyPlan(trimmed, plan([{ action: 'delete', layer: 'video', targetId: 'clip-1' }]), canvas);
  assert.equal(removed.audio.length, 0);
  assert.equal(removed.clips.length, 0);
});
test('rejects impossible source trims and cuts of speed-ramped clips', () => {
  assert.throws(() => applyPlan(clipDoc(), plan([{ action: 'trim', layer: 'video', targetId: 'clip-1', sourceStart: 0, sourceEnd: 12 }]), canvas), /source range/);
  const doc = clipDoc(); doc.clips[0].speed = 2;
  assert.throws(() => applyPlan(doc, plan([{ action: 'split', layer: 'video', targetId: 'clip-1', at: 4 }]), canvas), /normal-speed/);
});
test('model context excludes media URLs and local filenames', () => {
  const scene = JSON.stringify(sceneForModel(clipDoc()));
  assert.ok(scene.includes('clip-1'));
  assert.ok(!scene.includes('blob:private'));
  assert.ok(!scene.includes('private.mp4'));
  assert.ok(!scene.includes('private-file'));
});
test('moving and trimming clips cannot leave inverted detached audio ranges', () => {
  const doc = clipDoc();
  doc.clips[0].startPosition = 8; doc.clips[0].endPosition = 18;
  doc.audio[0].startTime = 1; doc.audio[0].endTime = 3;
  const moved = applyPlan(doc, plan([{ action: 'move', layer: 'video', targetId: 'clip-1', at: 0 }]), canvas);
  assert.equal(moved.audio.length, 0);
  const trimmed = applyPlan(doc, plan([{ action: 'trim', layer: 'video', targetId: 'clip-1', sourceStart: 2, sourceEnd: 5 }]), canvas);
  assert.equal(trimmed.audio.length, 0);
});
test('adding a motion track preserves other existing tracks and supports explicit clearing', () => {
  const doc = applyPlan(empty(), plan([{ action: 'add', layer: 'shape', values: { keyframes: [{ prop: 'x', keys: [{ t: 0, value: 0 }, { t: 5, value: 100 }] }] } }]), canvas);
  const id = doc.shapes[0].id;
  const modified = applyPlan(doc, plan([{ action: 'update', layer: 'shape', targetId: id, values: { keyframes: [{ prop: 'rotation', keys: [{ t: 0, value: 0 }, { t: 5, value: 360 }] }] } }]), canvas);
  assert.deepEqual(modified.shapes[0].keyframes.map(t => t.prop), ['x', 'rotation']);
  assert.deepEqual(modified.shapes[0].keyframes[0], doc.shapes[0].keyframes[0]);
  const cleared = applyPlan(modified, plan([{ action: 'update', layer: 'shape', targetId: id, values: { keyframes: [] } }]), canvas);
  assert.equal(cleared.shapes[0].keyframes.length, 0);
});
test('text response with redundant kind and familiar aliases becomes red bold native text', () => {
  const raw = JSON.stringify(plan([{ action: 'add', layer: 'text', values: { kind: 'text', text: 'welcome', color: 'red', bold: true, x: 200, y: 250 } }]));
  const parsed = parsePlan(raw);
  const doc = applyPlan(empty(), parsed, canvas);
  assert.equal(doc.texts[0].text, 'welcome');
  assert.equal(doc.texts[0].textColor, '#FF0000');
  assert.equal(doc.texts[0].isBold, true);
  assert.equal(doc.texts[0].textX, 200);
  assert.ok(doc.texts[0].width >= 700);
  assert.equal(doc.shapes.length, 0);
  assert.equal(parsed.operations[0].values.kind, undefined);
});
test('layer-specific schema rejects mixed properties and ambiguous repairs', () => {
  for (const op of [
    { action: 'add', layer: 'shape', values: { kind: 'text', text: 'welcome' } },
    { action: 'add', layer: 'text', values: { kind: 'rectangle', text: 'welcome' } },
    { action: 'add', layer: 'text', values: { text: 'welcome', src: 'https://example.com' } },
    { action: 'add', layer: 'text', values: { text: 'welcome', bold: true, isBold: false } },
  ]) assert.throws(() => parsePlan(JSON.stringify(plan([op]))));
});

test('shared brush path preserves legacy lines and supports smooth closed contours', async () => {
 const {brushPath}=await import(await moduleUrl('../src/utils/brushPath.ts'));
 const points=[{x:0,y:0},{x:50,y:100},{x:100,y:0}];
 assert.equal(brushPath(points),'M 0 0 L 50 100 L 100 0');
 assert.match(brushPath(points,true),/^M 0 0 Q 50 100 75 50 L 100 0$/);
 assert.match(brushPath(points,true,true),/^M 50 0 Q .* Z$/);
 assert.equal(brushPath([{x:0,y:0}]),'');
});

test('all requests use identical instructions and a complete generated capability guide and retain original instructions', () => {
 const prompts=['create a flower','create cat by brush','add purple text says hi buddy','add laghing emojee and 10 hearts','write hi 50 times'];
 const systems=prompts.map(prompt=>editorMessages({prompt,canvas,totalTime:5,scene:{},selectedIds:[]}));
 assert.ok(systems.every(m=>m[0].content===systems[0][0].content));
 systems.forEach((m,i)=>assert.ok(m[1].content.endsWith(prompts[i])));
 const ref=JSON.parse(editorCapabilities());
 for(const layer of ['text','shape','brush','blur','image','video','audio']) assert.ok(ref.layers[layer]);
 assert.ok(ref.layers.text.gradientColorStart);assert.ok(ref.layers.text.isBold);
 assert.ok(ref.layers.brush.points);assert.ok(ref.layers.video.transition);
 for(const fields of Object.values(ref.layers)) for(const type of Object.values(fields)) assert.ok(ref.definitions[type]);
 for(const [layer,fields] of Object.entries(FIELD_SCHEMAS)) {
  assert.deepEqual(Object.keys(ref.layers[layer]),Object.keys(fields));
  for(const [field,schema] of Object.entries(fields)) assert.deepEqual(ref.definitions[ref.layers[layer][field]],schema);
 }
});

test('native AI payloads retain model choices and cannot invoke old shortcuts', () => {
 const payload=plan([{action:'add',layer:'text',values:{text:'hello',textColor:'#FFFF00',isBold:true}},{action:'add',layer:'brush',values:{points:[{x:0.2,y:0.4},{x:0.8,y:0.9}],color:'#800080'}}]);
 assert.deepEqual(parseEditorResponse(JSON.stringify(payload)),payload);
 for(const kind of ['cat','badge','title','drawing'])assert.throws(()=>parseEditorResponse(JSON.stringify({kind})));
 assert.throws(()=>parseEditorResponse(JSON.stringify(plan([{action:'add',layer:'text',values:{text:'hello',color:'red'}}]))));
});
test('JSON extraction accepts surrounding prose but rejects malformed and ambiguous data', () => {
 const payload=JSON.stringify(plan([{action:'add',layer:'text',values:{text:'hello {world}'}}]));
 assert.deepEqual(parseEditorResponse('```json\n'+payload+'\n```'),JSON.parse(payload));
 assert.equal(extractJsonObject('{"version":1'),null);
 assert.throws(()=>parseEditorResponse(payload+payload));
 assert.throws(()=>parseEditorResponse('[ '+payload+' ]'));
});
test('correction messages contain the exact validation error and original request', () => {
 const m=editorMessages({prompt:'draw a flower',canvas,totalTime:5,selectedIds:[],scene:{}},{response:'bad reply',error:'response.operations[0].values.kind: unsupported value'});
 assert.equal(m[2].content,'bad reply');assert.match(m[3].content,/values.kind: unsupported value/);
 assert.ok(m[1].content.endsWith('draw a flower'));
});

test('editor instructions preserve every field without subject-specific routing', async () => {
 const {compactCapabilities}=await import(await moduleUrl('../src/utils/ai/editorProtocol.ts',{'./drawingCompiler':drawingUrl,'./editorPlan':editorUrl}));
 const guide=compactCapabilities();
 for(const [layer,fields] of Object.entries(FIELD_SCHEMAS)) {
  const line=guide.split('\n').find(line=>line.startsWith(layer+': '));assert.ok(line);
  for(const key of Object.keys(fields))assert.ok(line.includes(key+':'),`${layer}.${key}`);
 }
 const m=editorMessages({prompt:'a new idea',canvas,totalTime:5,selectedIds:[],scene:{}});
 assert.ok(m[0].content.length<5000);assert.ok(m[0].content.includes('inspect'));
});


test('model can inspect complete tool schemas without canned prompt interpretation', async () => {
 const {inspectCapabilities}=await import(await moduleUrl('../src/utils/ai/editorProtocol.ts',{'./drawingCompiler':drawingUrl,'./editorPlan':editorUrl}));
 assert.equal(inspectCapabilities(JSON.stringify(plan([]))),null);
 assert.deepEqual(JSON.parse(inspectCapabilities('{"inspect":["brush","text"]}')),{brush:FIELD_SCHEMAS.brush,text:FIELD_SCHEMAS.text});
 assert.throws(()=>inspectCapabilities('{"inspect":["flower"]}'));
 assert.throws(()=>inspectCapabilities('{"inspect":["text"],"code":"alert(1)"}'));
});

test('decoder schema exposes native fields with complete action-specific payloads', async () => {
 const {EDITOR_RESPONSE_SCHEMA}=await import(await moduleUrl('../src/utils/ai/editorProtocol.ts',{'./drawingCompiler':drawingUrl,'./editorPlan':editorUrl}));
 const branches=EDITOR_RESPONSE_SCHEMA.anyOf[0].properties.operations.items.anyOf;
 const additions=branches.filter(s=>s.properties.action.enum[0]==='add');
 assert.deepEqual(additions.map(s=>s.properties.layer.enum[0]).sort(),['blur','brush','shape','text']);
 for(const branch of branches) {
  const {action,layer,values}=branch.properties;
  if(values)assert.deepEqual(values.properties,FIELD_SCHEMAS[layer.enum[0]]);
  if(action.enum[0]==='add')assert.ok(branch.required.includes('values'));
  else assert.ok(branch.required.includes('targetId'));
  if(action.enum[0]==='delete')assert.equal(values,undefined);
 }
 const brush=additions.find(s=>s.properties.layer.enum[0]==='brush');
 assert.deepEqual(brush.properties.values.required,['points','x','y','width','height','color','strokeWidth']);
 assert.deepEqual(EDITOR_RESPONSE_SCHEMA.anyOf.find(branch=>branch.properties?.inspect).properties.inspect.items.enum,Object.keys(FIELD_SCHEMAS));
});

test('every exposed field and nested property has semantic documentation', () => {
  function check(fields) {
    for (const [name, schema] of Object.entries(fields)) {
      assert.ok(schema.title?.length > 0, name);
      assert.ok(schema.description?.length > 15, name);
      if (schema.properties) check(schema.properties);
      if (schema.items?.properties) check(schema.items.properties);
    }
  }
  Object.values(FIELD_SCHEMAS).forEach(check);
  assert.match(FIELD_SCHEMAS.text.textColor.description, /displayed letters/);
  assert.match(FIELD_SCHEMAS.text.backgroundColor.description, /not the letter/);
  assert.match(FIELD_SCHEMAS.brush.points.items.properties.x.description, /Normalized/);
  assert.match(FIELD_SCHEMAS.shape.x.description, /canvas pixels/);
  assert.match(FIELD_SCHEMAS.text.keyframes.items.properties.keys.items.properties.t.description, /Absolute timeline/);
});

test('instructions distinguish literal content, style, motion and missing text without subject routing', () => {
  const requests = ['add green bold text animate from left to right', 'draw a flying cat', 'create a flower'];
  const messages = requests.map(prompt => editorMessages({prompt,canvas,totalTime:5,selectedIds:[],scene:{}}));
  assert.ok(messages.every(m => m[0].content === messages[0][0].content));
  const instructions = messages[0][0].content;
  assert.match(instructions, /NOT display text/);
  assert.match(instructions, /ask the user what it should say/);
  assert.match(instructions, /Quoted words are literal/);
  assert.match(instructions, /actual keyframes/);
  assert.match(instructions, /TIMELINE placement/);
  assert.match(instructions, /titles, descriptions, units and limits/);
});

test('local director reports generation progress, preserves selected model and validates only the completed result', async () => {
 const browserUrl=await moduleUrl('../src/utils/ai/editorProtocol.ts',{'./drawingCompiler':drawingUrl,'./editorPlan':editorUrl});
 const {LocalDirector,draftSummary}=await import(await moduleUrl('../src/utils/ai/localDirector.ts',{'./editorProtocol':browserUrl}));
 assert.equal(draftSummary('{"summary":"Hello\\n\\u0041'), 'Hello\nA');
 const originalFetch=globalThis.fetch, progress=[];
 let checked=0;
 const output=JSON.stringify(plan([{action:'add',layer:'text',values:{text:'Hello',textColor:'#008000'}}]));
 globalThis.fetch=async (_url,options)=>{
   assert.equal(JSON.parse(options.body).model,'llama3.2:latest');
   return new Response(new ReadableStream({start(controller){
     const events=[{type:'delta',text:'{"summary":"Draft'}, {type:'result',text:output}].map(e=>JSON.stringify(e)+'\n').join('');
     const bytes=new TextEncoder().encode(events);
     controller.enqueue(bytes.slice(0,17));controller.enqueue(bytes.slice(17));controller.close();
   }}));
 };
 try {
   const result=await new LocalDirector().generate({prompt:'write Hello',model:'llama3.2:latest',canvas,totalTime:5,scene:{},selectedIds:[]},new AbortController().signal,p=>{assert.equal(checked,p.label==='Validation complete. Waiting to apply…'?1:0);progress.push(p);},p=>{applyPlan(empty(),p,canvas);checked++;});
   assert.equal(result.operations[0].values.text,'Hello'); assert.equal(checked,1);
   assert.ok(progress.some(p=>p.label.includes('characters received'))); assert.ok(progress.every(p=>!p.preview));
 } finally {globalThis.fetch=originalFetch;}
});

test('local director corrects invalid payload once and never validates partial or cancelled streams', async () => {
 const browserUrl=await moduleUrl('../src/utils/ai/editorProtocol.ts',{'./drawingCompiler':drawingUrl,'./editorPlan':editorUrl});
 const {LocalDirector}=await import(await moduleUrl('../src/utils/ai/localDirector.ts',{'./editorProtocol':browserUrl}));
 const originalFetch=globalThis.fetch;const input={prompt:'write Hello',model:'llama3.2:latest',canvas,totalTime:5,scene:{},selectedIds:[]};
 let calls=0, checked=0;
 try {
   globalThis.fetch=async (_url,options)=>{
     calls++; if(calls===2) assert.ok(JSON.parse(options.body).correction.error);
     return new Response(JSON.stringify({type:'result',text:calls===1?'{}':JSON.stringify(plan([]))})+'\n');
   };
   await new LocalDirector().generate(input,new AbortController().signal,()=>{},()=>checked++);
   assert.equal(calls,2);assert.equal(checked,1);
   globalThis.fetch=async()=>new Response(JSON.stringify({type:'delta',text:'{"summary":"Unfinished'})+'\n');
   await assert.rejects(new LocalDirector().generate(input,new AbortController().signal,()=>{},()=>checked++),/stopped before finishing/);
   assert.equal(checked,1);
   globalThis.fetch=async (_url,options)=>{if(options.signal.aborted) throw new DOMException('Stopped','AbortError');return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Stopped','AbortError'))));};
   const controller=new AbortController();const director=new LocalDirector();
   const pending=director.generate(input,controller.signal,()=>{},()=>checked++);director.dispose();
   await assert.rejects(pending,{name:'AbortError'});assert.equal(checked,1);
 }finally{globalThis.fetch=originalFetch;}
});

test('local route lists installed models and rejects missing/cloud models, other origins and production', async () => {
 const browserUrl=await moduleUrl('../src/utils/ai/editorProtocol.ts',{'./drawingCompiler':drawingUrl,'./editorPlan':editorUrl});
 const mock='data:text/javascript;base64,'+Buffer.from(`export class Ollama { async show({model}){return {capabilities:model==='embed'?['embedding']:['completion']};} async list(){return {models:[{name:'embed',size:5},{name:'local:7b',size:123},{name:'remote:cloud',size:0,remote_host:'cloud'}]};} abort(){} }`).toString('base64');
 const route=await import(await moduleUrl('../app/api/ai/director/route.ts',{'"ollama"':JSON.stringify(mock),'../../../../src/utils/ai/editorProtocol':browserUrl}));
 const previous=process.env.NODE_ENV;
 try {
   process.env.NODE_ENV='development';
   const response=await route.GET(new Request('http://localhost:3000/api/ai/director'));
   assert.deepEqual((await response.json()).models,[{name:'local:7b',size:123}]);
   const input={prompt:'write Hello',canvas,totalTime:5,scene:{},selectedIds:[]};
   for(const model of ['missing:7b','remote:cloud','embed']) {
     const denied=await route.POST(new Request('http://localhost:3000/api/ai/director',{method:'POST',body:JSON.stringify({input,model})}));
     assert.equal(denied.status,409);
   }
   assert.equal((await route.GET(new Request('http://localhost:3000/api/ai/director',{headers:{Origin:'https://other.test'}}))).status,403);
   process.env.NODE_ENV='production';
   assert.equal((await route.GET(new Request('http://localhost:3000/api/ai/director'))).status,404);
 } finally {if(previous===undefined) delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;}
});

test('assistant preview shows at most six generated words and suppresses echoed input', async () => {
 const browserUrl=await moduleUrl('../src/utils/ai/editorProtocol.ts',{'./drawingCompiler':drawingUrl,'./editorPlan':editorUrl});
 const {assistantPreview}=await import(await moduleUrl('../src/utils/ai/localDirector.ts',{'./editorProtocol':browserUrl}));
 assert.equal(assistantPreview('{"summary":"Draw a blue outline"}','Draw a blue outline'), '');
 assert.equal(assistantPreview('{"summary":"Draw a blue','Draw a blue outline'), '');
 assert.equal(assistantPreview('{"summary":"I am preparing the outline with a smooth upward movement"}','Draw a blue outline'), 'outline with a smooth upward movement');
 assert.equal(assistantPreview('{"operations":[]}', 'Draw a blue outline'), '');
});

test('malformed JSON passes through route to one correction before any document validation', async () => {
 const browserUrl=await moduleUrl('../src/utils/ai/editorProtocol.ts',{'./drawingCompiler':drawingUrl,'./editorPlan':editorUrl});
 const mock='data:text/javascript;base64,'+Buffer.from(`let calls=0;export class Ollama {
 async show(){return {capabilities:["completion"]};}
 async list(){return {models:[{name:'test:local',size:123}]};} abort(){}
 async *chat(request){
 const serialized=JSON.parse(JSON.stringify(request));
 if(!serialized.format || typeof serialized.format!=='object' || !Array.isArray(serialized.format.anyOf))throw new Error('Missing serialized schema object');
 if(!serialized.format.anyOf[0].properties.operations.items.anyOf.every(op=>op.properties.action.enum[0]==='add'))throw new Error('Schema must match the empty scene');
 calls++;if(calls===2 && !request.messages.some(m=>m.content.includes('could not be applied')))throw new Error('Missing correction');yield {message:{content:calls===1?'{"version":1,"summary":"Draft",oops}':'{"version":1,"summary":"Prepared a title.","operations":[{"action":"add","layer":"text","values":{"text":"Hello"}}]}'}};}
 }`).toString('base64');
 const route=await import(await moduleUrl('../app/api/ai/director/route.ts',{'"ollama"':JSON.stringify(mock),'../../../../src/utils/ai/editorProtocol':browserUrl}));
 const {LocalDirector}=await import(await moduleUrl('../src/utils/ai/localDirector.ts',{'./editorProtocol':browserUrl}));
 const originalFetch=globalThis.fetch, previous=process.env.NODE_ENV;let calls=0,checked=0;
 try {
 process.env.NODE_ENV='development';
 globalThis.fetch=async (_url,options)=>{calls++;return route.POST(new Request('http://localhost:3000/api/ai/director',options));};
 const result=await new LocalDirector().generate({prompt:'write Hello',model:'test:local',canvas,totalTime:5,scene:{},selectedIds:[]},new AbortController().signal,()=>{},p=>{checked++;applyPlan(empty(),p,canvas);});
 assert.equal(calls,2);assert.equal(checked,1);assert.equal(result.operations[0].values.text,'Hello');
 }finally{globalThis.fetch=originalFetch;if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;}
});

test('Ollama grammar avoids expanded repetition limits without weakening final validation', async () => {
 const {EDITOR_RESPONSE_SCHEMA,OLLAMA_RESPONSE_SCHEMA}=await import(await moduleUrl('../src/utils/ai/editorProtocol.ts',{'./drawingCompiler':drawingUrl,'./editorPlan':editorUrl}));
 function compare(native,grammar){
   if(Array.isArray(native)){assert.equal(grammar.length,native.length);native.forEach((v,i)=>compare(v,grammar[i]));return;}
   if(!native||typeof native!=='object'){assert.deepEqual(grammar,native);return;}
   for(const [key,value] of Object.entries(native)){
     if(['maxItems','maxLength','title','description'].includes(key))assert.equal(Object.hasOwn(grammar,key),false);
     else compare(value,grammar[key]);
   }
 }
 compare(EDITOR_RESPONSE_SCHEMA,OLLAMA_RESPONSE_SCHEMA);
 assert.equal(EDITOR_RESPONSE_SCHEMA.anyOf[0].properties.operations.maxItems,80);
 assert.throws(()=>parseEditorResponse(JSON.stringify(plan(Array.from({length:81},()=>({action:'add',layer:'text',values:{text:'x'}}))))),/too few or too many/);
 assert.throws(()=>parseEditorResponse(JSON.stringify(plan([{action:'add',layer:'text',values:{text:'x'.repeat(2001)}}]))),/too long/);
 assert.throws(()=>parseEditorResponse(JSON.stringify(plan([{type:'add',layer:'Line',values:{}}]))),/unsupported/);
});

test('development diagnostics include partial responses when a stream fails', async () => {
 const protocolUrl=await moduleUrl('../src/utils/ai/editorProtocol.ts',{'./drawingCompiler':drawingUrl,'./editorPlan':editorUrl});
 const {LocalDirector}=await import(await moduleUrl('../src/utils/ai/localDirector.ts',{'./editorProtocol':protocolUrl}));
 const originalFetch=globalThis.fetch, previous=process.env.NODE_ENV, originalError=console.error,originalInfo=console.info;
 const logged=[];
 try{
 process.env.NODE_ENV='development';console.error=(...args)=>logged.push(args);console.info=()=>{};
 globalThis.fetch=async()=>new Response(JSON.stringify({type:'delta',text:'{"summary":"Partial assistant answer'})+'\n'+JSON.stringify({type:'error',message:'Disconnected'})+'\n');
 await assert.rejects(new LocalDirector().generate({prompt:'draw',model:'test:local',canvas,totalTime:5,scene:{},selectedIds:[]},new AbortController().signal,()=>{}),/Disconnected/);
 assert.ok(logged.some(args=>args.includes('{"summary":"Partial assistant answer')));
 }finally{globalThis.fetch=originalFetch;console.error=originalError;console.info=originalInfo;if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;}
});

test('scene-constrained generation cannot invent existing targets and keeps motion after content', async () => {
 const {responseSchemaForScene,OLLAMA_RESPONSE_SCHEMA}=await import(await moduleUrl('../src/utils/ai/editorProtocol.ts',{'./drawingCompiler':drawingUrl,'./editorPlan':editorUrl}));
 const input={prompt:'edit',canvas,totalTime:5,scene:{},selectedIds:[]};
 const emptySchema=responseSchemaForScene(input),emptyOps=emptySchema.anyOf[0].properties.operations.items.anyOf;
 assert.ok(emptyOps.every(op=>op.properties.action.enum[0]==='add'));
 const text=emptyOps.find(op=>op.properties.layer.enum[0]==='text');
 assert.equal(Object.keys(text.properties.values.properties).at(-1),'keyframes');
 const populated=responseSchemaForScene({...input,scene:{text:[{id:'text-real'}]}}).anyOf[0].properties.operations.items.anyOf;
 const targetOps=populated.filter(op=>op.properties.targetId);
 assert.ok(targetOps.length>0);targetOps.forEach(op=>assert.deepEqual(op.properties.targetId.enum,['text-real']));
 assert.ok(OLLAMA_RESPONSE_SCHEMA.anyOf[0].properties.operations.items.anyOf.some(op=>op.properties.targetId&&!op.properties.targetId.enum));
});

test('shared compositor paints underlines for wrapped and curved text only when enabled', async () => {
 const stub='data:text/javascript;base64,'+Buffer.from('export const computeAnimState=()=>({});export const computeTransition=()=>({});export const evalKeyframes=()=>({});export const applyKfOverride=()=>({});export const brushPath=()=>{};export const revealedBrushPath=()=>{};export const buildCanvasFilterString=()=>"";export const applyChromaKey=()=>{};export const applyEdgeThin=()=>{};').toString('base64');
 const replacements={'function drawWrappedText(':'export function drawWrappedText(','function drawCurvedText(':'export function drawCurvedText(','./measureText':await moduleUrl('../src/utils/measureText.ts')};
 for(const path of ['./AnimationEngine','./keyframes','./brushPath','./colorAdjustments','./chromaKey'])replacements[path]=stub;
 const {drawWrappedText,drawCurvedText}=await import(await moduleUrl('../src/utils/compositeFrame.ts',replacements));
 const rectangles=[];const ctx={font:'bold 32px Arial',textAlign:'left',textBaseline:'top',measureText:t=>({width:t.length*16,actualBoundingBoxDescent:30}),fillText(){},strokeText(){},fillRect(...args){rectangles.push(args);},save(){},restore(){},translate(){},rotate(){}};
 drawWrappedText(ctx,'hello world',0,0,90,40,false,false);assert.equal(rectangles.length,0);
 drawWrappedText(ctx,'hello world',0,0,90,40,false,true);assert.equal(rectangles.length,2);assert.equal(rectangles[0][2],80);assert.equal(rectangles[1][1]-rectangles[0][1],40);
 rectangles.length=0;drawCurvedText(ctx,'hello',30,false,200,true);assert.equal(rectangles.length,5);assert.equal(ctx.font,'bold 32px Arial');
});

test('unselected layers retain geometry and style for relative edits without exposing asset URLs', () => {
 const m=editorMessages({prompt:'move it beside the other layer',canvas,totalTime:5,selectedIds:[],scene:{image:[{id:'image-real',imageX:120,imageY:50,width:300,height:100,rotation:25,src:'blob:private'}]}});
 const scene=JSON.parse(m[1].content.split('\nRequest:')[0].slice(7));
 assert.equal(scene.layers[0].imageX,120);assert.equal(scene.layers[0].rotation,25);
 assert.equal(scene.layers[0].width,300);assert.ok(!('src' in scene.layers[0]));
});
test('AI exposes only rendered per-layer animation tracks', () => {
 assert.deepEqual(FIELD_SCHEMAS.blur.keyframes.items.properties.prop.enum,['x','y','blur']);
 assert.ok(!FIELD_SCHEMAS.shape.keyframes.items.properties.prop.enum.includes('curve'));
 assert.ok(FIELD_SCHEMAS.text.keyframes.items.properties.prop.enum.includes('curve'));
 assert.throws(()=>applyPlan(empty(),plan([{action:'add',layer:'blur',values:{keyframes:[{prop:'rotation',keys:[{t:0,value:0},{t:2,value:90}]}]}}]),canvas),/unsupported/);
});
test('new static layers reject redundant motion without changing the source document', () => {
 const doc=empty();
 assert.throws(()=>applyPlan(doc,plan([{action:'add',layer:'text',values:{text:'Hello',keyframes:[{prop:'y',keys:[{t:0,value:300},{t:5,value:300}]}]}}]),canvas),/constant/);
 assert.deepEqual(doc,empty());
});
test('brush reveal follows pixel arc length, supports smooth closed curves, and preserves complete geometry', async () => {
 const {brushPath,revealedBrushPath}=await import(await moduleUrl('../src/utils/brushPath.ts'));
 const p=[{x:0,y:0},{x:200,y:0},{x:200,y:100}];
 assert.equal(revealedBrushPath(p,false,false,0),'');
 assert.equal(revealedBrushPath(p,false,false,0.5),'M 0 0 L 150 0');
 assert.equal(revealedBrushPath(p,false,false,1),brushPath(p));
 assert.equal(revealedBrushPath(p,true,true,1),brushPath(p,true,true));
 assert.ok(!revealedBrushPath(p,true,true,0.5).endsWith('Z'));
 const doc=applyPlan(empty(),plan([{action:'add',layer:'brush',values:{points:[{x:0,y:0},{x:1,y:1}],animation:'drawIn',drawDuration:3,endTime:5}}]),canvas);
 assert.equal(doc.brushes[0].drawDuration,3);
});
test('capability lookup is unavailable after the one permitted inspection', async () => {
 const {responseSchemaForScene}=await import(await moduleUrl('../src/utils/ai/editorProtocol.ts',{'./drawingCompiler':drawingUrl,'./editorPlan':editorUrl}));
 const schema=responseSchemaForScene({prompt:'draw',canvas,totalTime:5,scene:{},selectedIds:[]},false);
 assert.equal(schema.anyOf.length,2);assert.ok(schema.anyOf.every(branch=>!branch.properties?.inspect));assert.ok(schema.anyOf[0].properties.operations);
});

test('scene conflict check permits no-op replacements and rejects actual concurrent edits', async () => {
 const {sameEditorDocument}=await import(editorUrl);
 const doc=applyPlan(empty(),plan([{action:'add',layer:'text',values:{text:'Hello'}}]),canvas);
 assert.ok(sameEditorDocument(doc,structuredClone(doc)));
 const changed=structuredClone(doc);changed.texts[0].textColor='#ff0000';
 assert.equal(sameEditorDocument(doc,changed),false);
 const file=new Blob(['media']);assert.equal(sameEditorDocument({file},{file:new Blob(['media'])}),false);
});
test('advanced text fields are available through model-chosen inspection', async () => {
 const {responseSchemaForScene}=await import(await moduleUrl('../src/utils/ai/editorProtocol.ts',{'./drawingCompiler':drawingUrl,'./editorPlan':editorUrl}));
 const input={prompt:'edit',canvas,totalTime:5,scene:{},selectedIds:[]};
 const textFields=s=>s.anyOf[0].properties.operations.items.anyOf.find(o=>o.properties.layer.enum[0]==='text').properties.values.properties;
 assert.ok(!textFields(responseSchemaForScene(input)).shadowColor);
 assert.ok(textFields(responseSchemaForScene(input,false,['text'])).shadowColor);
});

const { compileDrawing } = await import(drawingUrl);
const partFixture = () => ({ summary:'Two parts share a moving pivot',duration:3,parts:[
 {n:'pivot',g:'group',b:[.5,.5,1,1],m:[[0,0,0,0,1],[3,.1,0,90,1.2]]},
 {n:'bar',g:'rect',parent:'pivot',b:[.2,0,.12,.06],c:'#ff0000'},
 {n:'outline',g:'path',parent:'pivot',b:[-.2,0,.1,.08],c:'transparent',closed:false,stroke:'#0088ff',p:[[0,1],[.5,0],[1,1]],smooth:true},
]});
test('compact named parts compile into validated native editable layers without mutating input',()=>{
 const source=partFixture(),snapshot=structuredClone(source);
 const p=compileDrawing(source,canvas),doc=applyPlan(empty(),p,canvas);
 assert.deepEqual(source,snapshot);assert.equal(doc.shapes.length,1);assert.equal(doc.brushes.length,1);
 assert.deepEqual(parseEditorResponse(JSON.stringify(source),canvas),p);
 assert.throws(()=>parseEditorResponse(JSON.stringify(source)),/canvas/);
 assert.equal(p.operations[0].values.x,720.64);
 const k=p.operations[0].values.keyframes;
 assert.equal(k.find(t=>t.prop==='rotation').keys.at(-1).value,90);
 assert.equal(k.find(t=>t.prop==='scale').keys.at(-1).value,1.2);
 assert.ok(Math.abs(k.find(t=>t.prop==='x').keys.at(-1).value+57.6)<1e-5);
 assert.ok(Math.abs(k.find(t=>t.prop==='y').keys.at(-1).value-138.24)<1e-5);
 assert.ok(k.every(t=>t.keys.length<=64));
});
test('compiled shared-pivot paths follow true rotation and scale between keys within a pixel',()=>{
 const p=compileDrawing(partFixture(),canvas),v=p.operations[0].values;
 const evalTrack=(prop,t,fallback)=>{const ks=v.keyframes.find(k=>k.prop===prop)?.keys;if(!ks)return fallback;const r=ks.findIndex(k=>k.t>=t);if(r<=0)return r===0?ks[0].value:ks.at(-1).value;const a=ks[r-1],b=ks[r];return a.value+(b.value-a.value)*(t-a.t)/(b.t-a.t);};
 for(let t=0;t<=3;t+=.017){
  const theta=t/3*Math.PI/2,s=1+t/3*.2;
  const actualX=v.x+v.width/2+evalTrack('x',t,0),actualY=v.y+v.height/2+evalTrack('y',t,0);
  const wantedX=352+(.5+t/3*.1+.2*s*Math.cos(theta))*576,wantedY=72+(.5+.2*s*Math.sin(theta))*576;
  assert.ok(Math.hypot(actualX-wantedX,actualY-wantedY)<.6);
  assert.ok(Math.abs(evalTrack('rotation',t,0)-t/3*90)<.001);
 }
});
test('drawing geometry rejects cycles, invalid colors, degenerate paths, off-canvas and meaningless animation',()=>{
 const rejected=[
  x=>x.parts[1].parent='missing',x=>x.parts[0].parent='bar',x=>x.parts[1].n='pivot',
  x=>x.parts[1].b=[10,0,.2,.2],x=>x.parts[1].b[2]=0,x=>x.parts[1].c='javascript:bad',
  x=>x.parts[2].p=[[0,0],[0,0]],x=>{x.parts[2].closed=true;x.parts[2].p=[[0,0],[.5,.5],[1,1]];},
  x=>x.parts[0].m=[[0,0,0,0,1],[3,0,0,0,1]],x=>x.parts[0].m=[[0,0,0,0,1],[0,0,0,90,1]],
  x=>x.parts[0].m=[[0,0,0,0,1],[3,2,0,90,1]],x=>x.parts[1].url='https://example.com',
 ];
 for(const mutate of rejected){const d=partFixture();mutate(d);assert.throws(()=>compileDrawing(d,canvas),/Drawing:/);}
 assert.throws(()=>compileDrawing({summary:'spin',parts:[{n:'dot',g:'ellipse',b:[.5,.5,.1,.1],c:'#fff',m:[[0,0,0,0,1],[3,0,0,180,1]]}]},canvas),/no visible effect/);
 assert.throws(()=>compileDrawing({summary:'many',parts:Array.from({length:25},(_,i)=>({n:String(i),g:'rect',b:[.5,.5,.1,.1],c:'#fff'}))},canvas),/1..24/);
});
test('nested parents compose their local rotation with ancestor translation and scale',()=>{
 const d={summary:'nested',parts:[{n:'root',g:'group',b:[.5,.5,1,1],a:90},{n:'child',g:'group',parent:'root',b:[.2,0,1,1],a:-90},{n:'mark',g:'rect',parent:'child',b:[.1,0,.1,.05],c:'#fff'}]};
 const v=compileDrawing(d,canvas).operations[0].values;
 assert.ok(Math.abs(v.x+v.width/2-(640+.1*576))<1e-5);
 assert.ok(Math.abs(v.y+v.height/2-(360+.2*576))<1e-5);
 assert.equal(v.rotation,0);assert.equal(v.keyframes,undefined);
});
test('full-turn parent rotation follows an arc instead of collapsing equal endpoint positions',()=>{
 const d=partFixture();d.parts[0].m=[[0,0,0,0,1],[3,0,0,360,1]];
 const v=compileDrawing(d,canvas).operations[0].values;
 const x=v.keyframes.find(k=>k.prop==='x').keys;
 assert.equal(x[0].value,x.at(-1).value);assert.ok(x.some(k=>k.value<-200));
 d.parts[0].m[1][3]=720;assert.throws(()=>compileDrawing(d,canvas),/64 native keys/);
});
test('decoder requires complete path payloads, while native text remains independently available',async()=>{
 const {responseSchemaForScene}=await import(await moduleUrl('../src/utils/ai/editorProtocol.ts',{'./drawingCompiler':drawingUrl,'./editorPlan':editorUrl}));
 const s=responseSchemaForScene({scene:{},prompt:'',canvas,totalTime:5,selectedIds:[]});
 const branches=s.anyOf.find(b=>b.properties?.parts).properties.parts.items.anyOf;
 const path=branches.find(b=>b.properties.g.enum.includes('path'));
 assert.ok(path.required.includes('p'));assert.ok(path.required.includes('closed'));
 assert.doesNotMatch('',new RegExp(path.properties.c.pattern));assert.match('#ff0088',new RegExp(path.properties.c.pattern));
 assert.equal(path.properties.p.items.items.enum[0],0);assert.equal(path.properties.p.items.items.enum.at(-1),1);assert.equal(path.properties.p.items.items.enum.length,21);
 const text=s.anyOf[0].properties.operations.items.anyOf.find(b=>b.properties.action.enum[0]==='add'&&b.properties.layer.enum[0]==='text');
 assert.deepEqual(text.properties.values.required,['text','textColor']);
});
test('decoder asks for an explicit edit/draw choice before either payload',async()=>{
 const {responseSchemaForScene}=await import(await moduleUrl('../src/utils/ai/editorProtocol.ts',{'./drawingCompiler':drawingUrl,'./editorPlan':editorUrl}));
 const s=responseSchemaForScene({scene:{},prompt:'',canvas,totalTime:5,selectedIds:[]});
 for(const branch of s.anyOf.filter(b=>!b.properties?.inspect))assert.deepEqual(Object.keys(branch.properties).slice(0,2),['mode','version']);
 assert.deepEqual(s.anyOf[0].properties.mode.enum,['edit']);assert.deepEqual(s.anyOf[1].properties.mode.enum,['draw']);
 const native=plan([{action:'add',layer:'text',values:{text:'Hello',textColor:'#00ff00'}}]);
 assert.deepEqual(parseEditorResponse(JSON.stringify({mode:'edit',...native})),native);
 assert.throws(()=>parseEditorResponse(JSON.stringify({mode:'draw',...native})),/edit mode/);
});

test('registered media actions expose chroma key with strict paint and parameter bounds', async () => {
 const {EDIT_ACTIONS,editorCapabilityRegistry}=await import(editorUrl);
 const {EDITOR_RESPONSE_SCHEMA}=await import(await moduleUrl('../src/utils/ai/editorProtocol.ts',{'./drawingCompiler':drawingUrl,'./editorPlan':editorUrl}));
 const branches=EDITOR_RESPONSE_SCHEMA.anyOf[0].properties.operations.items.anyOf;
 for(const [action,spec] of Object.entries(EDIT_ACTIONS)) for(const layer of spec.layers) assert.ok(branches.some(b=>b.properties.action.enum[0]===(action==='move'?'moveOnTimeline':action)&&b.properties.layer.enum[0]===layer));
 assert.ok(editorCapabilityRegistry().unavailable.removeBackground.includes('frame by frame'));
 const ck={enabled:true,color:'#00ff00',tolerance:.4,edgeFeather:.12,edgeThin:0};
 const doc=clipDoc();
 const result=applyPlan(doc,plan([{action:'update',layer:'video',targetId:'clip-1',values:{chromaKey:ck}}]),canvas);
 assert.deepEqual(result.clips[0].chromaKey,ck);assert.equal(result.clips[0].src,doc.clips[0].src);assert.equal(doc.clips[0].chromaKey,undefined);
 for(const patch of [{color:'transparent'},{tolerance:2},{edgeFeather:0},{edgeThin:-2},{enabled:'yes'}]) assert.throws(()=>applyPlan(doc,plan([{action:'update',layer:'video',targetId:'clip-1',values:{chromaKey:{...ck,...patch}}}]),canvas));
 assert.throws(()=>applyPlan(doc,plan([{action:'update',layer:'video',targetId:'clip-1',values:{chromaKey:{enabled:true}}}]),canvas),/missing/);
 assert.throws(()=>applyPlan(doc,plan([{action:'split',layer:'audio',targetId:'audio-1',at:2}]),canvas),/Unsupported split/);
});

test('timeline context keeps source ranges, linked audio, effects and playhead without leaking sources',()=>{
 const doc=clipDoc();doc.clips[0].startTime=2;doc.clips[0].endTime=8;doc.clips[0].startPosition=4;doc.clips[0].endPosition=10;doc.clips[0].speed=1;
 doc.effects=[{id:'fx',clipId:'clip-1',type:'shake',startTime:0,endTime:2,intensity:.5}];
 const scene=sceneForModel(doc);const messages=editorMessages({prompt:'Mute selected video',canvas,totalTime:10,playhead:5,selectedIds:['clip-1','gone'],scene});
 const sent=JSON.parse(messages[1].content.slice(7).split('\nRequest:')[0]);const v=sent.layers.find(x=>x.layer==='video'),a=sent.layers.find(x=>x.layer==='audio');
 assert.equal(v.timelineStart,4);assert.equal(v.sourceStart,2);assert.equal(v.sourceEnd,8);assert.equal(v.label,'Video 1');assert.equal(v.effects[0].type,'shake');assert.deepEqual(v.linkedAudioIds,['audio-1']);
 assert.equal(a.clipId,'clip-1');assert.equal(a.timelineEnd,10);assert.equal(a.startTime,0);assert.equal(sent.playhead,5);assert.deepEqual(sent.selectedIds,['clip-1']);
 assert.ok(!JSON.stringify(messages).includes('blob:private'));assert.ok(!JSON.stringify(messages).includes('private.mp4'));assert.ok(!JSON.stringify(messages).includes('private-file'));
 assert.ok(messages[0].content.includes('Automatic subject background removal is not connected'));
});

test('media multi-step executor prepares one immutable transaction and rejects no-ops and unsupported requests',async()=>{
 const {executeEditorPlan}=await import(editorUrl);const doc=clipDoc();const original=JSON.stringify(doc);
 const ops=[{action:'trim',layer:'video',targetId:'clip-1',sourceStart:1,sourceEnd:4},{action:'update',layer:'video',targetId:'clip-1',values:{muted:true,chromaKey:{enabled:true,color:'#00ff00',tolerance:.4,edgeFeather:.12,edgeThin:0},colorAdjustments:{brightness:1,contrast:1,saturation:.5,temperature:0}}},{action:'move',layer:'video',targetId:'clip-1',at:2}];
 const next=executeEditorPlan(doc,plan(ops),canvas);assert.equal(next.clips[0].src,doc.clips[0].src);assert.equal(next.clips[0].startTime,1);assert.equal(next.clips[0].endTime,4);assert.equal(next.clips[0].startPosition,2);assert.equal(next.clips[0].endPosition,5);assert.equal(next.audio[0].muted,true);assert.equal(JSON.stringify(doc),original);
 assert.throws(()=>executeEditorPlan(doc,{...plan([]),summary:'Subject cutout is not available through AI. Use BG Remove.'},canvas),/Subject cutout/);
 assert.throws(()=>executeEditorPlan(doc,plan([{action:'update',layer:'video',targetId:'clip-1',values:{x:0}}]),canvas),/already match/);
 assert.throws(()=>executeEditorPlan(doc,plan([...ops,{action:'update',layer:'video',targetId:'missing',values:{x:1}}]),canvas),/no longer exists/);assert.equal(JSON.stringify(doc),original);
});

test('model contract distinguishes Canvas motion from scheduling; decoder preserves native timeline semantics', async () => {
 const {responseSchemaForScene}=await import(await moduleUrl('../src/utils/ai/editorProtocol.ts',{'./drawingCompiler':drawingUrl,'./editorPlan':editorUrl}));
 const doc=clipDoc(),input={prompt:'Move the selected video from left to right over 3 seconds',canvas,totalTime:10,scene:sceneForModel(doc),selectedIds:['clip-1']};
 const actions=responseSchemaForScene(input).anyOf[0].properties.operations.items.anyOf.map(b=>b.properties.action.enum[0]);
 assert.ok(actions.includes('moveOnTimeline'));assert.ok(!actions.includes('move'));
 const instructions=editorMessages(input)[0].content;
 assert.match(instructions,/A duration is not a new start time/);assert.match(instructions,/preserve timelineStart\/startPosition\/endPosition/);
 const spatial=parseEditorResponse(JSON.stringify({mode:'edit',...plan([{action:'update',layer:'video',targetId:'clip-1',values:{keyframes:[{prop:'x',keys:[{t:0,value:-200},{t:3,value:200}]}]}}])}),canvas);
 const animated=applyPlan(doc,spatial,canvas);
 assert.equal(animated.clips[0].startPosition,0);assert.equal(animated.clips[0].endPosition,10);assert.deepEqual(animated.audio,doc.audio);
 assert.deepEqual(animated.clips[0].keyframes[0].keys.map(({t,value})=>[t,value]),[[0,-200],[3,200]]);
 const scheduled=applyPlan(doc,parseEditorResponse(JSON.stringify({mode:'edit',...plan([{action:'moveOnTimeline',layer:'video',targetId:'clip-1',at:3}])}),canvas),canvas);
 assert.equal(scheduled.clips[0].startPosition,3);assert.equal(scheduled.audio[0].startTime,3);assert.equal(scheduled.clips[0].x,doc.clips[0].x);
});

async function localDirectorModule(){
 const protocol=await moduleUrl('../src/utils/ai/editorProtocol.ts',{'./drawingCompiler':drawingUrl,'./editorPlan':editorUrl});
 return import(await moduleUrl('../src/utils/ai/localDirector.ts',{'./editorProtocol':protocol}));
}
const directorInput={prompt:'Draw a simple outline',model:'test:local',canvas,totalTime:5,scene:{},selectedIds:[]};
test('deadline and cancellation settle even stalled fetch/read and permit a subsequent request', async () => {
 const {LocalDirector}=await localDirectorModule(),originalFetch=globalThis.fetch;
 try {
  for(const stage of ['fetch','read']){
   globalThis.fetch=async()=>stage==='fetch'?new Promise(()=>{}):new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{"type":"delta","text":"{\\"summary\\":\\"Created your drawing\\""}\n'));}}));
   const director=new LocalDirector(30),statuses=[];let checked=0;
   await assert.rejects(director.generate(directorInput,new AbortController().signal,p=>statuses.push(p),()=>checked++),/3-minute limit/);
   assert.equal(checked,0);assert.ok(statuses.every(p=>!p.preview&&!p.label.includes('Created your drawing')));
   globalThis.fetch=async()=>new Response(JSON.stringify({type:'result',text:JSON.stringify(plan([]))})+'\n');
   await director.generate(directorInput,new AbortController().signal,()=>{},()=>checked++);assert.equal(checked,1);
  }
  globalThis.fetch=async()=>new Response(new ReadableStream());
  const controller=new AbortController(),director=new LocalDirector(500);
  const pending=director.generate(directorInput,controller.signal,()=>{});setTimeout(()=>controller.abort(),10);
  await assert.rejects(pending,{name:'AbortError'});
 }finally{globalThis.fetch=originalFetch;}
});
test('tool inspection consumes the second inference slot and invalid result cannot start a third call', async () => {
 const {LocalDirector}=await localDirectorModule(),originalFetch=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async()=>{calls++;return new Response([{type:'reset'},{type:'result',text:'{}'}].map(e=>JSON.stringify(e)).join('\n')+'\n');};
  await assert.rejects(new LocalDirector().generate(directorInput,new AbortController().signal,()=>{}),/correction was skipped/);assert.equal(calls,1);
 }finally{globalThis.fetch=originalFetch;}
});
test('valid generated plans report validation but never success before the panel commits', async () => {
 const {LocalDirector}=await localDirectorModule(),originalFetch=globalThis.fetch,statuses=[];
 try{
  const response=JSON.stringify({...plan([{action:'add',layer:'text',values:{text:'Hello'}}]),summary:'Successfully created your drawing'});
  globalThis.fetch=async()=>new Response([{type:'delta',text:response},{type:'result',text:response}].map(e=>JSON.stringify(e)).join('\n')+'\n');
  await new LocalDirector().generate(directorInput,new AbortController().signal,p=>statuses.push(p),p=>applyPlan(empty(),p,canvas));
  assert.ok(statuses.some(p=>p.label.includes('Validating')));assert.ok(statuses.every(p=>!p.preview&&!/success|ready/i.test(p.label)));
 }finally{globalThis.fetch=originalFetch;}
});
test('server deadline terminates a stalled Ollama stream with an explicit timeout; output exhaustion is not retried', async () => {
 const protocol=await moduleUrl('../src/utils/ai/editorProtocol.ts',{'./drawingCompiler':drawingUrl,'./editorPlan':editorUrl});
 const mock='data:text/javascript;base64,'+Buffer.from(`export class Ollama {async list(){return {models:[{name:'test:local'}]};}async show(){return {capabilities:['completion']};}abort(){}async *chat(){if(globalThis.__stallDirector)await new Promise(()=>{});yield {done:true,done_reason:'length',message:{content:'{}'}};}}`).toString('base64');
 const route=await import(await moduleUrl('../app/api/ai/director/route.ts',{'"ollama"':JSON.stringify(mock),'../../../../src/utils/ai/editorProtocol':protocol}));
 const previous=process.env.NODE_ENV;
 try{
  process.env.NODE_ENV='development';globalThis.__stallDirector=true;
  const request=()=>new Request('http://localhost:3000/api/ai/director',{method:'POST',body:JSON.stringify({input:directorInput,model:'test:local',timeoutMs:20})});
  const timed=await(await route.POST(request())).text();assert.match(timed,/3-minute limit/);assert.ok(!timed.includes('"type":"result"'));
  globalThis.__stallDirector=false;
  const limited=await(await route.POST(request())).text();assert.match(limited,/output limit/);assert.ok(!limited.includes('"type":"result"'));
 }finally{delete globalThis.__stallDirector;if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;}
});

test('terminal result settles without waiting for stream closure; final event need not have a newline', async () => {
 const {LocalDirector}=await localDirectorModule(),originalFetch=globalThis.fetch;
 try{
  for(const open of [true,false]){
   globalThis.fetch=async()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify({type:'result',text:JSON.stringify(plan([]))})+(open?'\n':'')));if(!open)c.close();}}));
   const result=await new LocalDirector(100).generate(directorInput,new AbortController().signal,()=>{});assert.deepEqual(result.operations,[]);
  }
 }finally{globalThis.fetch=originalFetch;}
});
