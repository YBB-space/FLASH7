const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../scripts/ui/desktop/split-display.js'),'utf8');
let now = 0, nextFrame = 0, reducedMotion = false;
const frames = new Map();
function node(){
  const attributes = new Map();
  const classes = new Set();
  return {textContent:'',attributes,disabled:false,dataset:{},
    classList:{toggle(name,enabled){if(enabled) classes.add(name);else classes.delete(name);}},
    setAttribute(name,value){attributes.set(name,value);},removeAttribute(name){attributes.delete(name);},
    closest(){return this;}};
}
const value = node(),angle = node(),servoCore = node(),status = node(),mode = node(),meter = node();
const buttons = [0,100].map(target=>Object.assign(node(),{dataset:{airbrakeTarget:String(target)}}));
const panels = ["north","east","south","west"].map(side=>Object.assign(node(),{dataset:{airbrakePanel:side}}));
const events = new Map(), properties = new Map();
const root = Object.assign(node(),{
  style:{setProperty(name,value){properties.set(name,value);}},
  querySelector(selector){return {'[data-airbrake-value]':value,'[data-airbrake-servo-angle]':angle,'[data-airbrake-servo-core]':servoCore,'[data-airbrake-status]':status,'[data-airbrake-mode]':mode,'.split-airbrake-meter':meter}[selector];},
  querySelectorAll(selector){return selector==="[data-airbrake-target]" ? buttons : panels;},contains(button){return buttons.includes(button);},
  addEventListener(type,fn){events.set(type,fn);},removeEventListener(type,fn){if(events.get(type)===fn) events.delete(type);}
});
const context = vm.createContext({performance:{now:()=>now},window:{matchMedia:()=>({matches:reducedMotion})},
  requestAnimationFrame(fn){const id=++nextFrame;frames.set(id,fn);return id;},cancelAnimationFrame(id){frames.delete(id);}});
vm.runInContext(source.slice(0,source.indexOf('(function(){')),context);
const preview = context.createSplitAirbrakePreview(root);
const click = target=>events.get('click')?.({target:buttons[target===100?1:0]});
function advance(time){now=time;const pending=Array.from(frames.values());frames.clear();pending.forEach(fn=>fn(time));}
assert.equal(value.textContent,'--');assert.equal(angle.textContent,'--','absent servo feedback stays unknown');assert.equal(mode.textContent,'WAITING');
assert.equal(meter.attributes.has('aria-valuenow'),false,'missing feedback must not report 0%');
click(100);assert.equal(frames.size,0,'live/waiting mode rejects mock actions');
function shape(panel){
  const parsed = /^M(\S+) (\S+)V(\S+)A(\S+) (\S+) 0 0 1 (\S+) (\S+)V(\S+)Z$/.exec(panel.attributes.get('d'));
  assert.ok(parsed,'panel outline uses a circular outer cap');return parsed.slice(1).map(Number);
}
const anchors=()=>panels.map(panel=>{const p=shape(panel);return [p[0],p[1],p[5],p[7]];});
const stowedShape=shape(panels[0]);
assert.equal(stowedShape[3],37);assert.equal(stowedShape[4],37);
assert.ok(Math.abs(Math.hypot(stowedShape[0]-80,stowedShape[2]-64)-37)<1e-8,'left arc endpoint lies on hull circle');
assert.ok(Math.abs(Math.hypot(stowedShape[5]-80,stowedShape[6]-64)-37)<1e-8,'right arc endpoint lies on hull circle');
preview.setSimulation(true,1);const stowedAnchors=anchors();assert.equal(value.textContent,'0');assert.equal(angle.textContent,'0.0');assert.ok(buttons.every(button=>!button.disabled));
click(100);advance(400);assert.ok(Number(value.textContent)>0&&Number(value.textContent)<100,'deployment animates');assert.ok(Number(angle.textContent)>0&&Number(angle.textContent)<90,'single servo angle follows simulated deployment');
const midway=value.textContent;preview.setSimulation(true,1);assert.equal(value.textContent,midway,'telemetry updates do not reset the animation');
click(0);advance(1400);assert.equal(value.textContent,'0','reverse from partial deployment returns smoothly');assert.equal(frames.size,0);
click(100);advance(2400);assert.equal(value.textContent,'100');assert.equal(status.textContent,'전개 완료');assert.equal(angle.textContent,'90.0');assert.equal(servoCore.attributes.get('transform'),'rotate(90 80 64)');assert.deepEqual(anchors(),stowedAnchors,'panel inner edges stay attached throughout extension');assert.ok(shape(panels[0])[2]<stowedShape[2],'curved outer edge extends beyond hull');assert.equal(shape(panels[0])[3],37,'outer edge retains hull curvature while deploying');
click(0);preview.setSimulation(false,1);assert.equal(frames.size,0,'switching out of simulation cancels motion');
assert.equal(value.textContent,'--');assert.equal(angle.textContent,'--');assert.ok(buttons.every(button=>button.disabled));assert.equal(meter.attributes.has('aria-valuenow'),false);
preview.setSimulation(true,1);click(100);advance(3500);preview.setSimulation(true,2);assert.equal(value.textContent,'0','stage changes cannot inherit mock deployment');
preview.setSimulation(true,1,{profile:'araea_i',automatic:true,deploymentPercent:42.5,servoAngleDeg:38.25,predictedApogeeM:3048,phase:'COASTING'});
assert.equal(value.textContent,'43');assert.equal(angle.textContent,'38.3');assert.equal(mode.textContent,'AUTO');assert.ok(buttons.every(b=>b.disabled));const autoShape=panels[0].attributes.get('d');click(100);advance(3900);assert.equal(panels[0].attributes.get('d'),autoShape,'automatic flight ignores local mock controls');
preview.setSimulation(false,1);assert.equal(value.textContent,'--');preview.setSimulation(true,1);
reducedMotion=true;click(100);assert.equal(value.textContent,'100');assert.equal(frames.size,0,'reduced motion updates without an animation');
reducedMotion=false;click(0);assert.equal(frames.size,1);preview.dispose();assert.equal(frames.size,0);assert.equal(events.size,0,'dispose removes the local control listener');
preview.setSimulation(true,1);assert.equal(frames.size,0);
console.log('FLASH7 airbrake preview: PASS (unknown feedback, simulation gate, reversal, update continuity, mode/stage reset, anchored curved panels, common servo angle, reduced motion, disposal)');
