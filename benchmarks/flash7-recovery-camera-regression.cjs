const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const math=require('../scripts/ui/mobile/recovery-camera.js'),recovery=require('../scripts/ui/shared/recovery-estimator.js');
const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`),screen={width:400,height:800,focalPx:400};
const north=math.basis(0,90,0),east=math.basis(270,90,0);
let point=math.project({bearingDeg:0,elevationDeg:0},north,screen);near(point.x,200);near(point.y,400);assert.equal(point.aligned,true);
point=math.project({bearingDeg:10,elevationDeg:0},north,screen);assert.ok(point.x>200);assert.equal(point.aligned,false);
point=math.project({bearingDeg:350,elevationDeg:0},north,screen);assert.ok(point.x<200);
point=math.project({bearingDeg:0,elevationDeg:10},north,screen);assert.ok(point.y<400);
point=math.project({bearingDeg:90,elevationDeg:0},north,screen);assert.equal(point.inView,false);assert.ok(point.arrowX>200);
point=math.project({bearingDeg:180,elevationDeg:0},north,screen);assert.equal(point.front,false);assert.equal(point.aligned,false);assert.ok(Number.isFinite(point.arrowX));
assert.equal(math.project({bearingDeg:90,elevationDeg:0},east,screen).aligned,true);
assert.equal(math.project({bearingDeg:90,elevationDeg:0},math.rotateBasis(north,90),screen).aligned,true);
point=math.project({bearingDeg:10,elevationDeg:0},math.basis(0,90,0,90),screen);near(point.x,200);assert.ok(point.y>400,'screen rotation preserves camera roll');
for(const pose of [north,east,math.basis(35,70,-28,90,14)]){for(const axis of Object.values(pose))near(Math.hypot(...axis),1);near(pose.right.reduce((s,v,i)=>s+v*pose.up[i],0),0);}
point=math.project({bearingDeg:0,elevationDeg:-70},north,{...screen,insets:{bottom:190}});assert.ok(point.arrowY<=610.00001,'offscreen arrow stays above the HUD footer');
assert.equal(math.basis(null,90,0),null);assert.equal(math.project({bearingDeg:0,elevationDeg:null},north,screen),null);assert.equal(math.project({bearingDeg:0,elevationDeg:0},north,{width:0,height:0}),null);
near(math.focal(400,800,720,1280),math.focal(800,400,1280,720));assert.ok(math.focal(800,800,1280,720)>math.focal(800,400,1280,720),'cover cropping changes projection focal length');
class Node extends EventTarget{
 constructor(doc){super();this.ownerDocument=doc;this.hidden=false;this.dataset={};this.style={};this.textContent='';this.children=[];this.parentNode=null;}
 append(node){if(node.parentNode)node.parentNode.children.splice(node.parentNode.children.indexOf(node),1);node.parentNode=this;this.children.push(node);}
 before(node){const p=this.parentNode;if(node.parentNode)node.parentNode.children.splice(node.parentNode.children.indexOf(node),1);p.children.splice(p.children.indexOf(this),0,node);node.parentNode=p;}
 replaceWith(node){const p=this.parentNode;if(node.parentNode)node.parentNode.children.splice(node.parentNode.children.indexOf(node),1);p.children.splice(p.children.indexOf(this),1,node);node.parentNode=p;this.parentNode=null;}
 focus(){this.ownerDocument.activeElement=this;}
 setAttribute(key,value){this[key]=value;}
}
function fixture(acquire){
 const doc=new EventTarget();doc.hidden=false;doc.body=new Node(doc);doc.body.style.overflow='auto';doc.createComment=()=>new Node(doc);doc.activeElement=new Node(doc);const previousFocus=doc.activeElement,parent=new Node(doc),view=new Node(doc);parent.append(view);view.hidden=true;view.clientWidth=400;view.clientHeight=800;
 const selectors=['video','[data-camera-target]','[data-camera-direction]','[data-camera-message]','[data-camera-range]','[data-camera-quality]','[data-camera-retry]','[data-camera-close]','[data-camera-north]'];const nodes=Object.fromEntries(selectors.map(key=>[key,new Node(doc)])),modes=['landing','rocket'].map(mode=>{const node=new Node(doc);node.dataset.cameraMode=mode;return node;});
 view.querySelector=key=>nodes[key];view.querySelectorAll=key=>key==='[data-camera-mode]'?modes:[nodes['[data-camera-close]'],...modes,nodes['[data-camera-retry]'],nodes['[data-camera-north]']];const video=nodes.video;video.videoWidth=720;video.videoHeight=1280;video.play=async()=>{};video.pause=()=>{};
 const frames=new Map(),root=new EventTarget();let id=0,calls=0,lastConstraints,closeCalls=0;
 Object.assign(root,{isSecureContext:true,document:doc,navigator:{mediaDevices:{getUserMedia:constraints=>{calls++;lastConstraints=constraints;return acquire();}}},Flash7:{recovery},requestAnimationFrame(fn){frames.set(++id,fn);return id;},cancelAnimationFrame(key){frames.delete(key);}});
 const state={observer:{lat:35.15,lon:128.1,accuracyM:5},pose:north,absolute:true,northBias:0,observerHeightM:0,stale:false,targets:{landing:{lat:35.151,lon:128.1,heightM:1.5,ageMs:0,uncertaintyM:5},rocket:{lat:35.15,lon:128.101,heightM:1.5,ageMs:0,uncertaintyM:5}}};
 const context=vm.createContext({globalThis:root,URL,URLSearchParams});vm.runInContext(fs.readFileSync('scripts/ui/mobile/recovery-camera.js','utf8'),context);const camera=root.Flash7.recoveryCamera.create(view,{getState:()=>state,onClose:()=>closeCalls++,calibrate:()=>true});
 return {camera,root,doc,view,parent,nodes,modes,frames,state,previousFocus,advance(time){const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(time));},get calls(){return calls;},get constraints(){return lastConstraints;},get closeCalls(){return closeCalls;}};
}
const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
function media(facing='environment'){const track=new EventTarget();track.stops=0;track.stop=()=>track.stops++;track.getSettings=()=>({facingMode:facing});return {track,getTracks:()=>[track],getVideoTracks:()=>[track]};}
(async()=>{
 const stream=media(),f=fixture(()=>Promise.resolve(stream));assert.equal(f.calls,0,'camera only starts on explicit open');f.camera.open();await flush();assert.equal(f.constraints.audio,false,'no microphone requested');assert.equal(f.constraints.video.facingMode.ideal,'environment');assert.equal(f.view.parentNode,f.doc.body,'camera escapes control-center clipping');assert.equal(f.doc.body.style.overflow,'hidden');f.advance(100);assert.equal(f.view.dataset.aligned,'true');assert.equal(f.nodes['[data-camera-target]'].hidden,false);
 f.modes[1].dispatchEvent(new Event('click'));f.advance(200);assert.equal(f.view.dataset.aligned,'false');assert.equal(f.nodes['[data-camera-target]'].hidden,true);assert.equal(f.nodes['[data-camera-direction]'].hidden,false);f.state.pose=east;f.advance(300);assert.equal(f.view.dataset.aligned,'true','rotating phone aligns the marker');f.state.stale=true;f.advance(400);assert.equal(f.view.dataset.aligned,'false');assert.equal(f.nodes['[data-camera-target]'].hidden,true,'stale telemetry cannot turn the aim green');
 f.camera.close();assert.equal(stream.track.stops,1);assert.equal(f.frames.size,0);assert.equal(f.video?.srcObject??f.nodes.video.srcObject,null);assert.equal(f.view.parentNode,f.parent);assert.equal(f.doc.body.style.overflow,'auto');assert.equal(f.doc.activeElement,f.previousFocus);assert.equal(f.closeCalls,1);f.camera.dispose();
 let resolve;const late=media(),pending=fixture(()=>new Promise(done=>resolve=done));pending.camera.open();pending.camera.close();resolve(late);await flush();assert.equal(late.track.stops,1,'late camera permission response cannot leak a camera stream');assert.equal(pending.frames.size,0);pending.camera.dispose();
 const denied=fixture(()=>Promise.reject(Object.assign(new Error('Denied'),{name:'NotAllowedError'})));denied.camera.open();await flush();assert.match(denied.nodes['[data-camera-message]'].textContent,/권한/);assert.equal(denied.nodes['[data-camera-retry]'].hidden,false);assert.equal(denied.frames.size,0);denied.camera.dispose();
 const front=media('user'),wrongCamera=fixture(()=>Promise.resolve(front));wrongCamera.camera.open();await flush();assert.equal(front.track.stops,1);assert.match(wrongCamera.nodes['[data-camera-message]'].textContent,/후면/);wrongCamera.camera.dispose();
 const background=media(),bg=fixture(()=>Promise.resolve(background));bg.camera.open();await flush();bg.doc.hidden=true;bg.doc.dispatchEvent(new Event('visibilitychange'));assert.equal(background.track.stops,1);assert.equal(bg.camera.isOpen(),false);bg.camera.dispose();
 const {renderSource}=require('../scripts/flash7-sources.cjs');const html=renderSource('ui/shared/mission-viewer.html');assert.ok(html.includes('data-recovery-camera-open'));assert.ok(html.includes('playsinline'));assert.ok(html.includes('data-camera-mode="landing"'));
 console.log('FLASH7 recovery camera: PASS (rear optical axis, screen rotation, projection, offscreen arrows, alignment, stale input, crop, permission cancellation, denied camera, front-camera rejection, background cleanup and focus restoration)');
})().catch(error=>{console.error(error);process.exitCode=1;});
