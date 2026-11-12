const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const helper = html.slice(html.indexOf('function fengUpdateRelayProgress('), html.indexOf('var Yi={'));
const update = vm.runInNewContext(helper + ';fengUpdateRelayProgress');
const tuning = {cutSeconds:2.4, interactGrace:.65, interactDecay:.35};
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-9, `${a} != ${b}`);

test('holding for the original 2.4 seconds completes a relay', () => {
  const relay = {t:0};
  near((update(relay,true,1.2,tuning),relay.t), .5);
  assert.equal(update(relay,true,1.2,tuning),'complete');
  near(relay.t,1);
});
test('a brief interruption keeps progress; resuming clears the grace timer', () => {
  const relay = {t:.5};
  assert.equal(update(relay,false,.6,tuning),'grace');
  near(relay.t,.5);
  update(relay,true,.24,tuning);
  near(relay.t,.6);
  assert.equal(relay.interruptedFor,0);
  update(relay,false,.6,tuning);
  near(relay.t,.6);
});
test('a frame crossing the grace boundary only decays the excess time', () => {
  const relay = {t:.8};
  update(relay,false,.6,tuning);
  assert.equal(update(relay,false,.1,tuning),'decay');
  near(relay.t,.8-.05*.35);
});
test('decay is independent of frame slicing and never goes below zero', () => {
  const a = {t:.9}, b = {t:.9};
  update(a,false,1.65,tuning);
  for(let i=0;i<165;i++)update(b,false,.01,tuning);
  near(a.t,.55); near(a.t,b.t);
  assert.equal(update(a,false,10,tuning),'idle'); near(a.t,0);
});
test('completed relays stay completed and negative time adds no work', () => {
  const relay = {t:1,cut:true};
  assert.equal(update(relay,false,20,tuning),'complete'); near(relay.t,1);
  const fresh={t:0}; update(fresh,true,-1,tuning); near(fresh.t,0);
});
test('game integration emits real progress, displays grace and cuts exactly once', () => {
  const events=[], prompts=[], states=[];
  const relay={t:0,cut:false,cutting:false,id:'A',short:'A',o:{}};
  const context={Yi:tuning,c:{relays:[relay]},n:{alive:true},s:{extraction:null},
    r:{held:true,down(){return this.held;}},
    i:{events:{emit:(name,data)=>events.push({name,data})}},
    o:{setPrompt:(...args)=>prompts.push(args)},
    O:(_,state)=>states.push(state),Fo:x=>Math.min(1,Math.max(0,x)),
    $:()=>relay,me:r=>{r.cut=true;context.cuts++;},cuts:0};
  const start=html.indexOf('function ue(P) {');
  const end=html.indexOf('function me(P){P.cut=!0',start);
  const tick=vm.runInNewContext(helper+html.slice(start,end)+';ue',context);
  tick(1.2); near(relay.t,.5); assert.equal(prompts.at(-1)[2],'active');
  context.r.held=false; tick(.6); near(relay.t,.5);
  assert.equal(prompts.at(-1)[2],'grace');
  tick(.15); near(relay.t,.465); assert.equal(prompts.at(-1)[2],'decay');
  near(events.at(-1).data.t,relay.t);
  context.r.held=true; tick(2.4); tick(.1);
  assert.equal(context.cuts,1); assert.equal(prompts.at(-1)[0],null);
  assert.ok(states.includes('cutting')&&states.includes('live'));
});
