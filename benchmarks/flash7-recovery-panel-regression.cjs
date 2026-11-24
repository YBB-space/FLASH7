const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const schema=require('../scripts/ui/shared/mission-snapshot.js'),recovery=require('../scripts/ui/shared/recovery-estimator.js');
let clock=Date.now(),watchCalls=0,cleared=0,positionCallback,intersection,cameraState,opened=false,disconnected=false;
const nodes=new Map(),doc=new EventTarget();doc.hidden=false;
const element={ownerDocument:doc,querySelector(selector){if(!nodes.has(selector)){const node=new EventTarget();Object.assign(node,{textContent:'',style:{},getBoundingClientRect:()=>({height:0})});nodes.set(selector,node);}return nodes.get(selector);}};
const root=new EventTarget();Object.assign(root,{isSecureContext:true,DeviceOrientationEvent:class{},Flash7:{recovery,recoveryCamera:{basis:require('../scripts/ui/mobile/recovery-camera.js').basis,create(view,options){cameraState=options.getState;return {open(){opened=true;},close(){if(opened){opened=false;options.onClose();}},isOpen:()=>opened,dispose(){this.close();}};}}},IntersectionObserver:class{constructor(callback){intersection=callback;}observe(){}disconnect(){disconnected=true;}}});
const timers=new Map();let timerId=0;
const context=vm.createContext({globalThis:root,Date:class extends Date{static now(){return clock;}},navigator:{geolocation:{watchPosition(callback){watchCalls++;positionCallback=callback;return watchCalls;},clearWatch(){cleared++;}}},setInterval(fn){timers.set(++timerId,fn);return timerId;},clearInterval(id){timers.delete(id);}});
vm.runInContext(fs.readFileSync('scripts/ui/shared/recovery-estimator.js','utf8'),context);
vm.runInContext(fs.readFileSync('scripts/ui/shared/recovery-panel.js','utf8'),context);
const panel=root.Flash7.recoveryPanel.createPanel(element),origin={lat:35.15,lon:128.1},start=clock;
assert.equal(watchCalls,0,'hidden recovery panels do not request phone sensors');
intersection([{isIntersecting:true}]);assert.equal(watchCalls,1,'entering recovery starts sensors automatically');
intersection([{isIntersecting:true}]);panel.setActive(true);assert.equal(watchCalls,1,'repeated visibility events do not duplicate sensor watches');
positionCallback({timestamp:clock,coords:{latitude:35.15,longitude:128.1,accuracy:5}});
const orientation=new Event('deviceorientationabsolute');Object.assign(orientation,{alpha:0,beta:90,gamma:0,absolute:true});root.dispatchEvent(orientation);
function packet(t){return schema.normalize({version:1,runId:'epoch-test',sentAt:clock,sampleAgeMs:0,telemetry:{stageId:1,receivedAt:start+t*100,connected:true},recovery:{phase:'DESCENT',altitudeM:1000-t*.7,verticalSpeedMps:-7,chuteCommanded:true,gps:{...recovery.moved(origin,t*.5,0),fix:true,ageMs:0,accuracyM:5}}});}
for(let tick=0;tick<100;tick++){clock=start+tick*100;panel.update(schema.normalize(packet(tick)),clock);}
panel.render();let state=panel.snapshot();assert.equal(state.status,'tracking','real epoch timestamps keep recovery live past the five-second stale deadline');assert.ok(state.landing&&state.landing.etaSec>0);assert.ok(state.target.lon>origin.lon,'successive fixes reach the estimator instead of being dropped as duplicates');assert.equal(cameraState().stale,false);
const latest=packet(99);clock+=6000;panel.update(latest,clock);assert.equal(panel.snapshot().status,'stale','repeated old packets cannot refresh stale telemetry');assert.equal(cameraState().stale,true);
panel.update(packet(160),clock);assert.equal(panel.snapshot().status,'tracking','a new sample recovers immediately');
const badGps=packet(161);clock+=100;badGps.recovery.gps.fix=false;badGps.recovery.gps.ageMs=9000;panel.update(badGps,clock);clock+=5100;const freshNoFix=packet(212);freshNoFix.recovery.gps.fix=false;panel.update(freshNoFix,clock);assert.equal(cameraState().telemetryStatus,'gps-stale');assert.equal(cameraState().stale,false,'missing GPS does not mean the telemetry transport is disconnected');panel.render();assert.equal(element.querySelector('[data-recovery="instruction"]').textContent,'기체 GPS 수신 대기');
element.querySelector('[data-recovery-camera-open]').dispatchEvent(new Event('click'));assert.equal(opened,true);intersection([{isIntersecting:false}]);assert.equal(cleared,0,'camera portal keeps active phone tracking');
panel.setActive(false);assert.equal(opened,false);assert.equal(cleared,1,'leaving recovery releases the GPS watch');
panel.setActive(true);assert.equal(watchCalls,2,'returning automatically reconnects');doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));assert.equal(cleared,2);doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));assert.equal(watchCalls,3,'foreground resumes sensor tracking without a button');
panel.dispose();assert.equal(cleared,3);assert.equal(disconnected,true);assert.equal(timers.size,0);
console.log('FLASH7 recovery panel: PASS (epoch timestamp round trip, continuous recovery, duplicate staleness, reconnect, GPS status, automatic sensors, portal, background and disposal)');
