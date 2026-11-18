const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../scripts/ui/shared/araea-flight-sim.js'),'utf8'),context);
const simulate=dt=>vm.runInContext(`(()=>{
 const control=createAraeaFlightController();let h=0,v=0,peak=0,maximum=0,apogeeAt=0,previous=0;
 for(let t=0;t<80;t+=${dt}){
   const acceleration=stepAraeaFlightController(control,h,v,t,${dt},v<0);
   if(t<ARAEA_FLIGHT_SIM.burnSec && control.deployment!==0)throw Error('deployment during boost');
   if(Math.abs(control.deployment-previous)>ARAEA_FLIGHT_SIM.deploymentRate*${dt}+1e-9)throw Error('servo rate limit');
   if(Math.abs(control.servoAngleDeg-control.deployment*90)>1e-9)throw Error('common servo angle');
   previous=control.deployment;maximum=Math.max(maximum,control.deployment);
   v+=acceleration*${dt};h+=v*${dt};peak=Math.max(peak,h);
   if(v<=0&&t>6&&!apogeeAt)apogeeAt=t;
   if(apogeeAt&&t>apogeeAt+1.2)return {peak,maximum,stowed:control.deployment===0,apogeeAt};
 }
 throw Error('missing apogee');
})()`,context);
for(const dt of [.005,.02,.06]){
 const flight=simulate(dt);
 assert.ok(Math.abs(flight.peak-3048)<3,'closed-loop apogee stays near 10,000 ft at '+dt+' seconds');
 assert.ok(flight.maximum>.25&&flight.maximum<.9,'brakes modulate rather than toggling fully open');
 assert.ok(flight.stowed,'brakes retract for recovery');
}
const noBrakePeak=vm.runInContext(`(()=>{let h=0,v=0;for(let t=0;t<80;t+=.02){const u=Math.min(1,t/6),motor=t<6?86*(.88+.12*Math.sin(Math.PI*u)):0;v+=(motor-9.80665-araeaDragAcceleration(h,v,0))*.02;h+=v*.02;if(t>6&&v<=0)return h;}return h;})()`,context);
assert.ok(noBrakePeak>3400,'braking actually reduces an otherwise excessive apogee');
// Exercise the actual legacy entry functions, so an old button cannot bypass
// the selected one-stage simulation and start the two-stage mission UI.
function sourceFunction(file,name){
 const source=fs.readFileSync(path.join(__dirname,'../scripts/',file),'utf8');
 const start=source.search(new RegExp('^    (?:async )?function '+name+'\\(', 'm'));
 assert.ok(start>=0,name+' exists');
 const tail=source.slice(start),next=tail.slice(1).search(/^    (?:async )?function /m);
 return next<0?tail:tail.slice(0,next+1);
}
const routes=[
 ['flash7-shell.js','startCameraStageSeparationCountdown'],
 ['flash7-interactions.js','showConfirm'],
 ['flash7-views.js','startMissionStandbyFromUi'],
 ['flash7-views.js','showMissionForceConfirm'],
 ['flash7-views.js','confirmForcedTimedMission']
];
(async()=>{
 for(const [file,name] of routes){
  const route=vm.createContext({isAraeaFlightSimulation:()=>true,startAraeaFlightSimulation:()=>{route.started++;return true;},hideMissionForceConfirm:()=>{},started:0});
  await vm.runInContext(sourceFunction(file,name)+';'+name+'()',route);
  assert.equal(route.started,1,name+' routes directly to ARAEA without legacy preflight or timed-separation dialogs');
 }
 // Reproduce a previous dual-stage connection before either simulator source.
 for(const src of ['SIM','SIMULATION']){
  const stages=vm.createContext({simEnabled:true,stageTelemetryModeActive:true,cameraHudActiveStageId:2,cameraHudStageSwitchLatched:true,flashLinkUiStage2Mode:true,uiSettings:{flashLinkNodeId:2},records:[],renders:0,
   setAutomaticActiveStage:id=>{stages.cameraHudActiveStageId=id;},
   recordStageTelemetrySample:(id,data,options)=>{stages.records.push({id,data,options});},
   updateStageTelemetryDashboard:()=>{stages.renders++;}
  });
  stages.sample={simulation_profile:'araea_i_10000ft',simulation_airbrake:{deploymentPercent:47},stage_node_id:1};
  vm.runInContext(sourceFunction('flash7-shell.js','ingestStageTelemetryBundle')+`;ingestStageTelemetryBundle(sample,'${src}',false,true)`,stages);
  assert.equal(stages.cameraHudActiveStageId,1,'one-stage simulation clears prior stage 2 selection');
  assert.equal(stages.stageTelemetryModeActive,false,'old ground bundle cannot override the simulated HUD');
  assert.equal(stages.cameraHudStageSwitchLatched,false,'old separation latch is cleared');
  assert.equal(stages.records[0].id,1);assert.equal(stages.records[0].data.simulation_airbrake.deploymentPercent,47);
  assert.equal(stages.records[0].options.connected,true);assert.equal(stages.renders,1);
  assert.equal(stages.uiSettings.flashLinkNodeId,2,'simulation must preserve the real board node configuration');
  assert.equal(stages.flashLinkUiStage2Mode,true,'real dual-stage link configuration remains intact');
 }
 const gate=vm.createContext({simEnabled:true,replaySourceActive:false,replayUiActive:false,devParachuteDrop:false,simState:{st:0,flightStartMs:null},uiSettings:{selectedMission:'araea_i'},getDisplayOperationModeValue:()=> 'flight',normalizeSelectedMission:v=>v||'araea_i'});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../scripts/ui/shared/araea-flight-sim.js'),'utf8'),gate);
 assert.equal(vm.runInContext('isAraeaFlightSimulation()',gate),true);
 for(const flag of ['replaySourceActive','replayUiActive']){
  gate[flag]=true;assert.equal(vm.runInContext('isAraeaFlightSimulation()',gate),false,'replay keeps its own recorded stage behavior');gate[flag]=false;
 }
 gate.simState={st:2,flightStartMs:1,flightProfile:'pioneer_i'};
 assert.equal(vm.runInContext('isAraeaFlightSimulation()',gate),false,'active flight keeps its latched profile');
 const reset=vm.createContext({cameraStageSeparationCountdownTimer:12,cameraStageSeparationManualRaf:13,cameraStageSeparationManualAt:123,cameraStageSeparationCountdownUntil:124,cameraStageSeparationTriggerAt:125,cameraStageSeparationLatched:true,cameraStageSeparationProgress:.5,cameraStageSeparationFallbackAt:126,cameraStageSeparationAutoRaf:14,gyroGl:null,setCameraStageSeparating:()=>{},clearTimeout:id=>reset.cancelled.push(id),cancelAnimationFrame:id=>reset.cancelled.push(id),cancelled:[]});
 vm.runInContext(sourceFunction('flash7-shell.js','resetCameraStageSeparation')+';resetCameraStageSeparation(false)',reset);
 assert.deepEqual(reset.cancelled,[12,13,14]);
 for(const field of ['cameraStageSeparationManualAt','cameraStageSeparationCountdownUntil','cameraStageSeparationTriggerAt','cameraStageSeparationProgress'])assert.equal(reset[field],0,'old preview cannot survive reset: '+field);
 console.log('FLASH7 ARAEA flight: PASS (10,000 ft closed loop, servo limits, recovery, legacy launch routes, preview cancellation, stale stage-2 isolation, replay isolation)');
})().catch(error=>{console.error(error);process.exitCode=1;});
