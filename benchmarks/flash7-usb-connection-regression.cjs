const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function sourceFunction(file,name){
 const source=fs.readFileSync(path.join(__dirname,'../scripts/',file),'utf8');
 const start=source.search(new RegExp('^    (?:async )?function '+name+'\\(', 'm'));
 assert.ok(start>=0,name+' exists');
 const tail=source.slice(start),next=tail.slice(1).search(/^    (?:async )?function /m);
 return next<0?tail:tail.slice(0,next+1);
}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
const tick=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function serialFixture(){
 const calls=[],picker=deferred(),cleanup=deferred();
 const port={open:async()=>{calls.push('open');},close:async()=>{calls.push('close');},
  writable:{getWriter:()=>({})},readable:{getReader:()=>({})}};
 const c=vm.createContext({Date,Promise,window:{isSecureContext:true},location:{origin:'http://localhost'},
  navigator:{serial:{requestPort:()=>{calls.push('picker');return picker.promise;}}},
  simEnabled:false,serialGroundRequired:false,serialConnectBusy:false,serialConnected:false,serialConnectedRole:'',
  serialPort:null,serialWriter:null,serialReader:null,serialReadAbort:null,serialSessionId:0,
  serialCurrentBaud:0,serialParseErrorCount:0,serialRxDisabledWarned:false,serialRxEnabled:true,
  serialLineBuf:'',lastSerialSampleAt:0,lastSerialActivityAt:0,serialPreferredPort:null,serialAutoReconnectAttempts:0,
  SERIAL_BAUD_RATE:115200,uiSettings:{},el:{},cancelSerialAutoReconnect(){},serialSupported:()=>true,
  addLogLine(){},t:x=>x,showToast:(message,type)=>calls.push(type+':'+message),
  setSerialConnectWizardStage(){},closeSerialHandles:()=>{calls.push('cleanup');return cleanup.promise;},
  getPreviouslyGrantedSerialPort:async()=>null,saveSettings(){},serialPromiseWithTimeout:p=>p,
  createAbortControllerSafe:()=>null,updateSerialPill(){},readSerialLoop:async()=>{},
  requestSerialSettingsAck:async()=>({ok:true,flashLinkRole:'ground'}),
  requestSerialStreamState:async()=>({ok:true,flashLinkRole:'ground'}),waitForSerialSampleAfter:async()=>true,
  markSerialControlLinkReady:()=>calls.push('ready'),syncDaqSequencePyroChannelToBoard(){},
  syncWelcomeConnectScreen:()=>calls.push('sync'),hideDisconnectOverlay(){}});
 vm.runInContext(sourceFunction('flash7-transport.js','serialConnect')+sourceFunction('flash7-shell.js','isVerifiedBoardTransportConnected'),c);
 c.serialEnabled=true;
 return{c,calls,picker,cleanup,port};
}
(async()=>{
 // requestPort must happen synchronously in the operator click, before any
 // potentially stalled reader cancellation/close or port-permission query.
 let f=serialFixture();let result=f.c.serialConnect({preferGranted:false});
 assert.deepEqual(f.calls,['picker']);f.picker.resolve(f.port);await tick();
 assert.deepEqual(f.calls,['picker','cleanup']);assert.equal(f.c.isVerifiedBoardTransportConnected(),false);
 f.cleanup.resolve();assert.equal(await result,true);assert.equal(f.c.serialPreferredPort,f.port);
 assert.equal(f.c.isVerifiedBoardTransportConnected(),true);assert.equal(f.c.serialConnectBusy,false);
 // Cancelling the picker must not disconnect a previously healthy device.
 f=serialFixture();const previous={};f.c.serialPort=previous;f.c.serialConnected=true;f.c.serialConnectedRole='ground';
 result=f.c.serialConnect({preferGranted:false});f.picker.reject(Object.assign(new Error('cancelled'),{name:'NotFoundError'}));
 assert.equal(await result,false);assert.equal(f.c.serialPort,previous);assert.equal(f.c.serialConnected,true);
 assert.ok(!f.calls.includes('cleanup'));assert.ok(!f.calls.some(x=>x.startsWith('error:')));
 // An uncompleted handshake must not enable Start; losing the device during
 // a positive ACK must not report a successful connection.
 f=serialFixture();const ack=deferred();f.c.requestSerialSettingsAck=()=>ack.promise;
 result=f.c.serialConnect({port:f.port});f.cleanup.resolve();await tick();
 assert.equal(f.c.serialConnected,true);assert.equal(f.c.isVerifiedBoardTransportConnected(),false);
 f.c.serialConnected=false;ack.resolve({ok:true,flashLinkRole:'ground'});
 assert.equal(await result,false);assert.ok(!f.calls.includes('ready'));
 // open() itself is not cancellable. A late completion after our timeout
 // must close its own device rather than leaking an open/busy port.
 f=serialFixture();const opening=deferred();f.port.open=()=>opening.promise;
 f.c.serialPromiseWithTimeout=()=>Promise.reject(new Error('SERIAL_OPEN_TIMEOUT'));
 result=f.c.serialConnect({port:f.port});f.cleanup.resolve();assert.equal(await result,false);
 opening.resolve();await tick();assert.ok(f.calls.includes('close'));
 // Reproduce an automatic Wi-Fi probe completing after the user takes over.
 // It must not switch to USB or overwrite the manual wizard's stage.
 for(const pauseAt of ['wifi','ports']){
  const gate=deferred(),calls=[];let connected=0;
  const c=vm.createContext({Date,simEnabled:false,replayUiActive:false,replaySourceActive:false,
   welcomeDashboardEntered:false,autoWifiConnectBusy:false,welcomeBoardSearchBusy:false,
   serialConnected:false,serialConnectStage:'idle',serialConnectBusy:false,wifiConnectStage:'idle',
   serialEnabled:false,welcomeDiscoveryEpoch:0,lastAutoSerialScanMs:0,wsConnected:false,wsRetryTimer:null,
   setConnectTransportMode:async mode=>calls.push(mode),isVerifiedBoardTransportConnected:()=>false,
   scheduleWsReconnect(){},syncWelcomeConnectScreen(){},
   probeWelcomeWifiBoardReachable:()=>pauseAt==='wifi'?gate.promise:Promise.resolve(false),
   getPreviouslyGrantedSerialPorts:()=>pauseAt==='ports'?gate.promise:Promise.resolve([{}]),
   serialConnect:async()=>{connected++;return false;}});
  vm.runInContext(sourceFunction('flash7-shell.js','runAutoWifiConnect'),c);
  const auto=c.runAutoWifiConnect('test');await tick();c.welcomeDiscoveryEpoch++;c.serialConnectStage='waiting';
  gate.resolve(pauseAt==='wifi'?false:[{}]);await auto;
  assert.deepEqual(calls,[]);assert.equal(connected,0);assert.equal(c.serialConnectStage,'waiting');assert.equal(c.autoWifiConnectBusy,false);
 }
 // The same invalidation must prevent a late Wi-Fi response from publishing
 // stale telemetry after the user selects USB.
 const ping=deferred();let published=0,current=true;
 const probe=vm.createContext({Date,Promise,wifiConnectLastProbeError:'',isVerifiedBoardTransportConnected:()=>false,
  getApiBaseCandidates:()=>['http://board'],createAbortControllerSafe:()=>null,shouldUseNativeBoardHttp:()=>false,
  fetch:()=>ping.promise,fetchJsonTimeout:async()=>({}),decodeFlash7ProtocolFrame:x=>x,
  isSupportedBoardTelemetry:()=>true,setApiBaseOverride(){published++;},isLocalPreviewHost:()=>true,
  window:{},wsConnected:false,wsRetryTimer:null,scheduleWsReconnect(){published++;},onIncomingSample(){published++;}});
 vm.runInContext(sourceFunction('flash7-shell.js','probeWelcomeWifiBoardReachable'),probe);
 const pending=probe.probeWelcomeWifiBoardReachable({isCurrent:()=>current});current=false;ping.resolve({ok:true});
 assert.equal(await pending,false);assert.equal(published,0);
 // Startup hides the app shell: the original wizard must move into the
 // visible welcome surface, then return to its exact position on close.
 function parent(){return{children:[],insertBefore(node,next){
  if(node.parentNode) node.parentNode.children.splice(node.parentNode.children.indexOf(node),1);
  this.children.splice(next?this.children.indexOf(next):this.children.length,0,node);node.parentNode=this;
 },appendChild(node){this.insertBefore(node,null);}};}
 const app=parent(),welcome=parent();let hidden=false;
 welcome.classList={contains:()=>hidden};
 const wizard={id:'serialConnectOverlay'},next={id:'next'};app.appendChild(wizard);app.appendChild(next);wizard.nextSibling=next;
 const surface=vm.createContext({el:{welcomeConnectScreen:welcome}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../scripts/ui/shared/welcome-screen.js'),'utf8'),surface);
 assert.equal(surface.mountWelcomeConnectionSurface(wizard),true);assert.equal(wizard.parentNode,welcome);
 surface.mountWelcomeConnectionSurface(wizard);surface.releaseWelcomeConnectionSurface(wizard);
 assert.equal(wizard.parentNode,app);assert.deepEqual(app.children,[wizard,next]);
 hidden=true;assert.equal(surface.mountWelcomeConnectionSurface(wizard),false);
 assert.equal(wizard.parentNode,app,'in-flight wizard keeps its normal app behavior');
 console.log('FLASH7 USB connection: PASS (click-time picker, cancel preservation, verified handshake, unplug, late-open cleanup, manual takeover, stale Wi-Fi response, visible startup wizard and DOM restoration)');
})().catch(error=>{console.error(error);process.exitCode=1;});
