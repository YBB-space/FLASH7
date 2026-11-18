const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {webcrypto} = require("node:crypto");
const source = fs.readFileSync(path.join(__dirname,"../scripts/ui/shared/split-link.js"),"utf8");
const channels = new Set();
const messages = [];
class Channel{
  constructor(name){ this.name = name;channels.add(this); }
  postMessage(data){
    messages.push(structuredClone(data));
    for(const peer of channels){
      if(peer !== this && peer.name === this.name) peer.onmessage?.({data:structuredClone(data)});
    }
  }
  close(){ channels.delete(this); }
}
function client(pathname="/FLASH7/flash7.html"){
  const listeners = new Map();
  const window = {
    crypto:webcrypto, BroadcastChannel:Channel, location:{origin:"https://flash.test",pathname},
    addEventListener:(name,callback)=>listeners.set(name,callback),
    removeEventListener:(name,callback)=>{ if(listeners.get(name) === callback) listeners.delete(name); }
  };
  vm.runInNewContext(source,{window,Uint8Array,Map,Set,Number,Array,Error});
  return {window,api:window.Flash7,listeners};
}
const host = client(), display = client(), other = client();
const session = host.api.createSplitSessionId();
assert.match(session,/^[a-f0-9]{32}$/);
const receivedHost = [], receivedDisplay = [];
const a = host.api.createSplitLink(session,"host",(...args)=>receivedHost.push(args));
const b = display.api.createSplitLink(session,"display",(...args)=>receivedDisplay.push(args));
const isolated = other.api.createSplitLink(other.api.createSplitSessionId(),"display",()=>assert.fail("wrong session received a message"));
b.send("ready");
assert.equal(receivedHost.length,1);
assert.equal(receivedHost[0][0],"ready");
const firstReady = messages.at(-1);
a.send("welcome",{altitude:42,gyro:[null,0,-1]});
assert.equal(receivedDisplay.length,1);
assert.equal(receivedDisplay[0][1].altitude,42);
const target = {closed:false,postMessage:()=>{}};
a.attachWindow(target);
const deliver = (data,origin="https://flash.test",sender=target)=>host.listeners.get("message")({data,origin,source:sender});
deliver(firstReady);
assert.equal(receivedHost.length,1,"the same packet sent through channel and opener must be delivered only once");
deliver({...firstReady,sequence:2},"https://other.test");
deliver({...firstReady,sequence:2},"https://flash.test",{});
deliver({...firstReady,sequence:2,session:other.api.createSplitSessionId()});
deliver({...firstReady,sequence:2,role:"host"});
assert.equal(receivedHost.length,1,"untrusted origin, source, role and session must be rejected");
deliver({...firstReady,sequence:2,type:"alive"});
assert.equal(receivedHost.length,2);
b.close();
b.send("ready");
assert.equal(receivedHost.length,2,"closed displays must not continue sending");
assert.equal(display.listeners.size,0,"close must detach message listeners");
assert.throws(()=>host.api.createSplitLink("bad","host",()=>{}));
assert.throws(()=>host.api.createSplitLink(session,"invalid",()=>{}));
a.close();isolated.close();
assert.equal(channels.size,0,"all channels must be released");
assert.equal(host.listeners.size,0);
const reloaded=[];
const keeper=host.api.createSplitLink(session,"host",(_type,_payload,sender)=>reloaded.push(sender));
for(let i=0;i<20;i++){
  const tab=display.api.createSplitLink(session,"display",()=>{});tab.send("ready");tab.close();
}
assert.equal(new Set(reloaded).size,20,"repeated reloads cannot exhaust the sender tracker");keeper.close();
const offers=[],finds=[];
const discovery=host.api.createSplitDiscovery("host",requested=>finds.push(requested));
const finder=display.api.createSplitDiscovery("display",(session,instance)=>offers.push({session,instance}));
const otherProject=client("/FLASH8/split-display.html").api.createSplitDiscovery("display",()=>assert.fail("another project was discovered"));
finder.find(session);assert.equal(finds[0],session);
const instance=host.api.createSplitSessionId();discovery.announce(session,instance);
assert.equal(offers.length,1);assert.equal(offers[0].session,session);assert.equal(offers[0].instance,instance);
discovery.announce("invalid",instance);discovery.announce(session,"invalid");assert.equal(offers.length,1);
discovery.announce({toString:1},instance);assert.equal(offers.length,1,"malformed discovery values are ignored without coercion");
finder.close();discovery.announce(session,instance);assert.equal(offers.length,1);
discovery.close();otherProject.close();assert.equal(channels.size,0,"discovery channels are released too");
console.log("FLASH7 split link: PASS (session/project isolation, origin/source checks, duplicate suppression, repeated reloads, discovery validation, cleanup)");

// Exercise host session restoration and peer handover without a browser or board.
const hostSource=fs.readFileSync(path.join(__dirname,'../scripts/ui/desktop/split-entry.js'),'utf8');
const persisted=new Map();
function hostFixture(){
 const nodes=new Map(),links=[],callbacks=[];
 const c=vm.createContext({URL,Event:class{},window:{sessionStorage:{getItem:key=>persisted.get(key),setItem:(key,value)=>persisted.set(key,value)},
  Flash7:{createSplitSessionId:host.api.createSplitSessionId,createSplitLink:(session,role,receive)=>{
   const link={id:host.api.createSplitSessionId(),session,send(){},close(){this.closed=true;}};links.push(link);callbacks.push(receive);return link;
  }},dispatchEvent(){}},document:{baseURI:'https://flash.test/FLASH7/flash7.html',getElementById:id=>{
   if(!nodes.has(id)) nodes.set(id,{textContent:'',value:''});return nodes.get(id);
  }}});
 vm.runInContext(hostSource,c);c.syncDesktopSplitEntry=()=>{};c.setDesktopSplitMode=()=>{};c.buildDesktopSplitSnapshot=()=>({gyro:[]});
 return{c,links,callbacks,state:()=>vm.runInContext('desktopSplitEntry',c)};
}
const firstHost=hostFixture();firstHost.c.startDesktopSplitLink();
const savedSession=firstHost.state().session,firstLink=firstHost.state().link;
firstHost.c.startDesktopSplitLink();assert.equal(firstHost.links.length,1,'opening setup reuses the current link');
firstHost.callbacks[0]('ready',null,'a'.repeat(32));assert.equal(firstHost.state().peer,'a'.repeat(32));
firstHost.callbacks[0]('ready',null,'b'.repeat(32));assert.equal(firstHost.state().peer,'b'.repeat(32),'display refresh takes over immediately');
firstHost.callbacks[0]('closed',null,'a'.repeat(32));assert.equal(firstHost.state().peer,'b'.repeat(32),'late close from old document cannot disconnect the new display');
firstHost.c.closeDesktopSplitLink();assert.equal(firstLink.closed,true);
firstHost.c.startDesktopSplitLink();assert.equal(firstHost.state().session,savedSession,'restarting a link preserves existing companion URLs');
const reloadedHost=hostFixture();reloadedHost.c.ensureDesktopSplitLink();
assert.equal(reloadedHost.state().session,savedSession,'host refresh restores the tab session');
const displaySource=fs.readFileSync(path.join(__dirname,'../scripts/ui/desktop/split-display.js'),'utf8');
const selection=vm.createContext({});
vm.runInContext(displaySource.slice(displaySource.indexOf('function chooseSplitDisplayOffer('),displaySource.indexOf('function createSplitMissionTimeline(')),selection);
const one={session:'one',instance:'first'},two={session:'two',instance:'second'};
assert.equal(selection.chooseSplitDisplayOffer([one],'old',null),one,'one active host can resume an unpaired display');
assert.equal(selection.chooseSplitDisplayOffer([one,two],'old',null),null,'multiple hosts never cause arbitrary pairing');
assert.equal(selection.chooseSplitDisplayOffer([one,two],'two',null),two,'an existing pairing wins');
console.log('FLASH7 reconnect: PASS (persistent session, idempotent setup, immediate peer handover, late close, single-host discovery, multi-host ambiguity)');
