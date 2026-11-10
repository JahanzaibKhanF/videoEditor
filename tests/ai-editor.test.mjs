import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function moduleUrl(file, replacements = {}) {
  let code = ts.transpileModule(await readFile(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const [from, to] of Object.entries(replacements)) code = code.replaceAll(from, to);
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}
const editorUrl = await moduleUrl('../src/utils/ai/editorPlan.ts');
const { applyPlan, parsePlan, sceneForModel } = await import(editorUrl);
const { browserMessages, parseBrowserPlan, catPlan, badgePlan, extractJsonObject, literalTitlePlan } = await import(await moduleUrl('../src/utils/ai/browserPlan.ts', { './editorPlan': editorUrl }));
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
test('browser instructions stay compact and preserve scene identity without media URLs', () => {
  const messages = browserMessages({prompt: 'Draw an orange ellipse', scene: sceneForModel(clipDoc()), canvas, totalTime: 5, selectedIds: ['clip-1']});
  assert.match(messages[0].content, /pixel offsets/);
  assert.match(messages[1].content, /clip-1/);
  assert.match(messages[1].content, /Draw an orange ellipse/);
  assert.ok(!messages[1].content.includes('blob:private'));
  assert.ok(messages[0].content.length < 4000);
});
test('compact cat instruction creates editable coordinated motion at multiple aspect ratios', () => {
  for (const size of [canvas, {width:720,height:1280}, {width:500,height:500}]) {
    const plan = parseBrowserPlan('{"kind":"cat","color":"#FFAA00","duration":5,"running":true}', size);
    const doc = applyPlan(empty(), plan, size);
    assert.equal(doc.shapes.length, 16);
    assert.equal(doc.brushes.length, 1);
    const parts = [...doc.shapes, ...doc.brushes];
    assert.equal(new Set(parts.map(p => p.id)).size, 17);
    const legs = parts.filter(p => p.keyframes.some(t => t.prop === 'rotation'));
    assert.equal(legs.length, 4);
    assert.equal(legs[0].keyframes.at(-1).keys[0].value, -legs[1].keyframes.at(-1).keys[0].value);
    for (const part of parts) {
      const motion = part.keyframes.find(t => t.prop === 'x');
      assert.ok(motion.keys.at(-1).value > 0);
      assert.ok(part.x >= 0 && part.y >= 0);
      assert.ok(part.x + part.width + motion.keys.at(-1).value <= size.width);
      assert.ok(part.y + part.height <= size.height);
      assert.equal(part.startTime,0); assert.equal(part.endTime,5);
    }
  }
});
test('cat recipe validates options and supports still drawings', () => {
  assert.throws(() => catPlan(canvas, -1));
  assert.throws(() => catPlan(canvas, 5, 'url(evil)'));
  assert.throws(() => parseBrowserPlan('{"kind":"cat","running":"false"}', canvas));
  assert.throws(() => parseBrowserPlan('{"kind":"cat","script":"evil"}', canvas));
  assert.ok(catPlan(canvas,5,'#FFFFFF',false).operations.every(op => op.values.keyframes.length === 0));
});
test('browser text becomes red bold native text and invalid edits stay rejected', () => {
  const plan = parseBrowserPlan('```json\n{"kind":"edit","operations":[{"action":"add","layer":"text","values":{"text":"welcome","textColor":"#FF0000","isBold":true}}]}\n```',canvas);
  const doc = applyPlan(empty(),plan,canvas);
  assert.equal(doc.texts[0].text,'welcome');
  assert.equal(doc.texts[0].isBold,true);
  assert.equal(doc.texts[0].textColor,'#FF0000');
  assert.throws(() => parseBrowserPlan('{"kind":"unsupported"}',canvas));
  assert.throws(() => parseBrowserPlan('{"kind":"edit","operations":[{"action":"add","layer":"text","values":{"text":"Hi","src":"https://evil"}}]}',canvas));
  assert.throws(() => parseBrowserPlan('not json',canvas));
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

test('browser worker cancellation terminates inference and permits a clean retry', async t => {
  const browserPlanUrl = await moduleUrl('../src/utils/ai/browserPlan.ts', { './editorPlan': editorUrl });
  const directorUrl = await moduleUrl('../src/utils/ai/browserDirector.ts', {
    './browserPlan': browserPlanUrl,
    'new URL("../../workers/directorWorker.ts", import.meta.url)': 'new URL("https://example.test/worker.js")',
  });
  const { BrowserDirector } = await import(directorUrl);
  const previousWorker = globalThis.Worker;
  const workers = [];
  globalThis.Worker = class {
    constructor() { workers.push(this); }
    postMessage(message) { this.sent = message; }
    terminate() { this.terminated = true; }
    reply(message) { this.onmessage?.({data:{id:this.sent.id,...message}}); }
  };
  const director = new BrowserDirector();
  t.after(() => {director.dispose(); globalThis.Worker = previousWorker;});
  const input = {prompt:'create a running cat',canvas,totalTime:5,scene:{},selectedIds:[]};
  const controller = new AbortController();
  const pending = director.generate(input,controller.signal,()=>{});
  controller.abort();
  await assert.rejects(pending, {name:'AbortError'});
  assert.equal(workers[0].terminated,true);
  assert.equal(workers[0].onmessage,null);
  const retry = director.generate(input,new AbortController().signal,()=>{});
  assert.equal(workers.length,2);
  workers[1].reply({type:'result',text:'{"kind":"cat"}'});
  assert.equal((await retry).operations.length,17);
  director.dispose();
  assert.equal(workers[1].terminated,true);
});
test('focused creation prompts are short and retain requested words', () => {
  for (const prompt of ['create a cat and make it run','add red bold welcome text']) {
    const messages = browserMessages({prompt,canvas,totalTime:5,scene:{},selectedIds:[]});
    assert.ok(messages[0].content.length < 1600);
    assert.equal(messages.at(-1).content,prompt);
  }
});

test('new AI layers follow the native frontmost z-order convention', () => {
  const doc = applyPlan(empty(),catPlan(canvas),canvas);
  const body = doc.shapes[2], eye = doc.shapes[11];
  assert.ok(eye.zIndex < body.zIndex);
  const title = parseBrowserPlan('{"kind":"title","text":"welcome","color":"#FF0000","bold":true}',canvas);
  const withTitle = applyPlan(doc,title,canvas);
  assert.ok(withTitle.texts[0].zIndex < Math.min(...doc.brushes.map(s=>s.zIndex)));
  assert.equal(withTitle.texts[0].isBold,true);
});
test('cat duration follows the request instead of an invented model default', () => {
  const raw = '{"kind":"cat","duration":20}';
  assert.equal(parseBrowserPlan(raw,canvas,'create a cat and make it run').operations[0].values.endTime,5);
  assert.equal(parseBrowserPlan(raw,canvas,'create a running cat for 8 seconds').operations[0].values.endTime,8);
});

test('model prose and code fences after valid JSON do not reject an edit', () => {
  const payload = JSON.stringify({kind:'title',text:'hello {world} "friend"',color:'#FFFFFF',bold:false});
  for (const raw of [payload+' Done!', '```json\n'+payload+'\n```\nHere is your title.', 'Here is the JSON:\n'+payload]) {
    assert.equal(extractJsonObject(raw),payload);
    const doc = applyPlan(empty(),parseBrowserPlan(raw,canvas),canvas);
    assert.equal(doc.texts[0].text,'hello {world} "friend"');
  }
});
test('response extraction still rejects truncated, malformed and ambiguous edits', () => {
  assert.equal(extractJsonObject('{"kind":"title","text":"hello'),null);
  assert.throws(()=>extractJsonObject('{"kind":"title",}'));
  assert.throws(()=>extractJsonObject('{"kind":"title"}{"kind":"cat"}'));
  assert.throws(()=>extractJsonObject('[{"kind":"title"}]'));
  assert.throws(()=>parseBrowserPlan('{"kind":"title","text":"hello","src":"evil"} Done!',canvas));
});
test('write hello is an instant literal title; styled or compound requests still use AI', () => {
  for(const prompt of ['write hello','type hello','please write hello','write "hello"']) {
    const plan=literalTitlePlan(prompt);
    assert.equal(applyPlan(empty(),plan,canvas).texts[0].text,'hello');
  }
  for(const prompt of ['write hello in red','write hello and add a cat','write hello with a fade','write hello at the top','delete hello']) assert.equal(literalTitlePlan(prompt),null);
  const messages=browserMessages({prompt:'write hello',canvas,totalTime:5,scene:{},selectedIds:[]});
  assert.match(messages[0].content,/Extract a title/);
});

test('heart and label route together instead of becoming a title-only request', () => {
 const prompt='create a heart and add word Khan in it red heart with white khan text';
 const messages=browserMessages({prompt,canvas,totalTime:5,selectedIds:[],scene:{}});
 assert.match(messages[0].content,/kind.*badge/);
 assert.equal(messages.at(-1).content,prompt);
});
test('heart compiles to one editable filled brush with a centered contrasting label above them', () => {
 for (const size of [canvas,{width:720,height:1280},{width:500,height:500}]) {
  const doc=applyPlan(empty(),badgePlan(size,'heart','Khan','#FF0000','#FFFFFF'),size);
  assert.equal(doc.shapes.length,0); assert.equal(doc.brushes.length,1); assert.equal(doc.texts.length,1);
  assert.equal(doc.brushes[0].smooth,true); assert.equal(doc.brushes[0].closed,true);
  assert.equal(doc.brushes[0].fill,'#FF0000');
  assert.ok(doc.brushes[0].points.every(p=>p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1));
  const t=doc.texts[0];
  assert.equal(t.text,'Khan'); assert.equal(t.textColor,'#FFFFFF');
  assert.ok(t.zIndex<Math.min(...doc.brushes.map(s=>s.zIndex)));
  assert.ok(Math.abs(t.textX+t.width/2-size.width/2)<0.001);
  assert.ok(t.textY>0&&t.textY+t.height<size.height);
 }
});
test('shape-label recipes support alternate colors and reject unsupported properties', () => {
 const raw=JSON.stringify({kind:'badge',shape:'ellipse',text:'Go',fill:'#0000FF',textColor:'#FFFF00'});
 const doc=applyPlan(empty(),parseBrowserPlan(raw,canvas),canvas);
 assert.equal(doc.shapes.length,1); assert.equal(doc.shapes[0].fill,'#0000FF');
 assert.equal(doc.texts[0].textColor,'#FFFF00');
 assert.throws(()=>badgePlan(canvas,'dog','Hi'));
 assert.throws(()=>badgePlan(canvas,'heart','a'.repeat(41)));
 assert.throws(()=>badgePlan(canvas,'heart','Hi','red'));
 assert.throws(()=>parseBrowserPlan('{"kind":"badge","shape":"heart","src":"evil"}',canvas));
});

test('explicit drawing constraints override incorrect model shape and color guesses', () => {
 const wrong=JSON.stringify({kind:'badge',shape:'ellipse',text:'khan',fill:'#00FF00',textColor:'#FFFF00'});
 const prompt='create a heart and add word Khan in it red heart with white khan text';
 const doc=applyPlan(empty(),parseBrowserPlan(wrong,canvas,prompt),canvas);
 assert.equal(doc.brushes.length,1);
 assert.equal(doc.brushes[0].fill,'#FF0000');
 assert.equal(doc.texts[0].text,'Khan'); assert.equal(doc.texts[0].textColor,'#FFFFFF');
 const blue=applyPlan(empty(),parseBrowserPlan(wrong,canvas,'create a blue circle with yellow Khan text'),canvas);
 assert.equal(blue.shapes.length,1); assert.equal(blue.shapes[0].fill,'#0000FF');
 assert.equal(blue.shapes[0].width,blue.shapes[0].height);
 assert.equal(blue.texts[0].textColor,'#FFFF00');
});

test('pen instructions become native editable strokes with persisted curve and fill styles', () => {
 const raw=JSON.stringify({kind:'drawing',strokes:[{points:[[0.1,0.9],[0.5,0.1],[0.9,0.9]],color:'#0000FF',strokeWidth:8,smooth:true,closed:true,fill:'#FFFF00'}]});
 const plan=parseBrowserPlan(raw,canvas);
 const doc=applyPlan(empty(),plan,canvas);
 const b=JSON.parse(JSON.stringify(doc)).brushes[0];
 assert.equal(b.smooth,true); assert.equal(b.closed,true); assert.equal(b.fill,'#FFFF00');
 assert.deepEqual(b.points,[{x:.1,y:.9},{x:.5,y:.1},{x:.9,y:.9}]);
 assert.equal(b.color,'#0000FF'); assert.ok(b.width>0&&b.height>0);
 const edited=applyPlan(doc,{version:1,summary:'Edit brush',operations:[{action:'update',layer:'brush',targetId:b.id,values:{smooth:false,color:'#FF0000'}}]},canvas);
 assert.equal(edited.brushes[0].smooth,false); assert.equal(edited.brushes[0].color,'#FF0000');
 assert.deepEqual(edited.brushes[0].points,b.points);
});
test('pen validation rejects bad coordinates, unknown fields and impossible closed paths', () => {
 for(const stroke of [
  {points:[[0,0],[2,1]]}, {points:[[0,0],[1,'bad']]},
  {points:[[0,0],[1,1]],closed:true},
  {points:[[0,0],[1,1]],fill:'#FFFFFF'},
  {points:[[0,0],[1,1]],src:'evil'},
 ]) assert.throws(()=>applyPlan(empty(),parseBrowserPlan(JSON.stringify({kind:'drawing',strokes:[stroke]}),canvas),canvas));
});
test('shared brush path preserves legacy lines and supports smooth closed contours', async () => {
 const {brushPath}=await import(await moduleUrl('../src/utils/brushPath.ts'));
 const points=[{x:0,y:0},{x:50,y:100},{x:100,y:0}];
 assert.equal(brushPath(points),'M 0 0 L 50 100 L 100 0');
 assert.match(brushPath(points,true),/^M 0 0 Q 50 100 75 50 L 100 0$/);
 assert.match(brushPath(points,true,true),/^M 50 0 Q .* Z$/);
 assert.equal(brushPath([{x:0,y:0}]),'');
});
test('AI guides expose brush paths and shape outlines without losing selected layer IDs', () => {
 const focused=browserMessages({prompt:'Use the pen to draw a blue zigzag',canvas,totalTime:5,scene:{},selectedIds:[]});
 assert.match(focused[0].content,/kind.*drawing/);
 const doc=applyPlan(empty(),{version:1,summary:'stroke',operations:[{action:'add',layer:'brush',values:{points:[{x:0,y:0},{x:1,y:1}]}}]},canvas);
 const general=browserMessages({prompt:'Change the selected brush to red',canvas,totalTime:5,scene:sceneForModel(doc),selectedIds:[doc.brushes[0].id]});
 assert.match(general[0].content,/Brush values/); assert.match(general[0].content,/strokeWidth/);
 assert.ok(general[1].content.includes(doc.brushes[0].id));
});
test('compact single-stroke replies work and cannot hide extra operations', () => {
 const raw='{"kind":"drawing","points":[[0,0.7],[0.5,0.3],[1,0.7]],"color":"#0000FF"}';
 const doc=applyPlan(empty(),parseBrowserPlan(raw,canvas),canvas);
 assert.equal(doc.brushes.length,1); assert.equal(doc.brushes[0].color,'#0000FF');
 assert.equal(doc.brushes[0].points.length,3);
 const mixed=JSON.parse(raw); mixed.strokes=[];
 assert.throws(()=>parseBrowserPlan(JSON.stringify(mixed),canvas));
});

test('explicit single pen color is retained when a tiny model omits or contradicts it', () => {
 for(const color of [undefined,'#FF0000']) {
  const raw=JSON.stringify({kind:'drawing',points:[[0,0],[.5,1],[1,0]],color});
  const doc=applyPlan(empty(),parseBrowserPlan(raw,canvas,'Use the pen to draw a blue zigzag'),canvas);
  assert.equal(doc.brushes[0].color,'#0000FF');
 }
});

 test('drawings without presets use pen instructions without requiring the word brush', () => {
  for (const prompt of ['Draw a blue cloud', 'Create a green leaf', 'Make a red teardrop']) {
   const messages=browserMessages({prompt,canvas,totalTime:5,selectedIds:[],scene:{}});
   assert.match(messages[0].content,/kind:"drawing"/);
   assert.equal(messages.at(-1).content,prompt);
  }
  const selected=browserMessages({prompt:'Make the selected leaf red',canvas,totalTime:5,selectedIds:['brush-1'],scene:{}});
  assert.match(selected[0].content,/targetId/);
  const labeled=browserMessages({prompt:'Draw a cloud with text Hello inside',canvas,totalTime:5,selectedIds:[],scene:{}});
  assert.match(labeled[0].content,/Combine brush paths and text/);
 });

 test('repetition quantities produce exactly fifty separate fitted phrases, including screenshot typo', () => {
  for (const size of [canvas, {width:720,height:1280}]) {
   for (const prompt of ['write hi how are you word 50 tiems', 'write hi how are you 50 times', 'repeat "hi how are you" 50 times']) {
    const doc=applyPlan(empty(),literalTitlePlan(prompt,size),size);
    assert.equal(doc.texts.length,50);
    assert.ok(doc.texts.every(t=>t.text==='hi how are you'));
    assert.equal(new Set(doc.texts.map(t=>`${t.textX},${t.textY}`)).size,50);
    assert.ok(doc.texts.every(t=>t.fontSize>=8&&t.textX>=0&&t.textY>=0&&t.textX+t.width<=size.width&&t.textY+t.height<=size.height));
   }
  }
  assert.equal(literalTitlePlan('write "50 times"').operations[0].values.text,'50 times');
  assert.throws(()=>literalTitlePlan('write hello 81 times'),/1 and 80/);
  assert.throws(()=>literalTitlePlan('write hello 0 times'),/1 and 80/);
  assert.equal(literalTitlePlan('write hello in red 50 times'),null);
 });

test('layout, motion and edit intent retain the full editor instructions', () => {
 for (const prompt of ['draw a cloud and move it left', 'create a circle at the top', 'make it blue', 'write Hello twice', 'add text Hello at the bottom', 'create a cat on the left']) {
  const messages=browserMessages({prompt,canvas,totalTime:5,scene:{},selectedIds:[]});
  assert.match(messages[0].content,/For other edits/);
  assert.match(messages.at(-1).content,/Scene:/);
 }
 for (const prompt of ['write it again', 'write hello twice', 'write this']) assert.equal(literalTitlePlan(prompt),null);
});
test('every focused route receives meaning and negation rules', () => {
 for (const prompt of ['create a cat', 'create a red heart', 'draw a leaf', 'add bold hello text', 'rotate the selected text']) {
  const messages=browserMessages({prompt,canvas,totalTime:5,scene:{},selectedIds:[]});
  assert.match(messages[0].content,/Separate visible words from instructions/);
  assert.match(messages[0].content,/Respect "not" and "without"/);
  assert.match(messages[0].content,/do not silently drop requirements/);
 }
});
