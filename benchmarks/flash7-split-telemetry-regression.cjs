const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const read = file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
const now = 100000;
const context = vm.createContext({
  Date:{now:()=>now}, stageTelemetryModeActive:true, rxHzWindow:99,uiSettings:{selectedMission:"araea_i",countdownSec:10},
  stageTelemetryStore:{1:{valid:true,updatedAt:now-100,data:{stage_rssi_dbm:-74,stage_rssi_age_ms:50,stage_loss_permille:2,stage_rx_hz:100}},2:{valid:false,updatedAt:0,data:null}},
  flashLinkUiTargetNodeId:1,flashLinkUiHasStatus:false,flashLinkUiRxHz:NaN,flashLinkUiLossPermille:NaN,
  flashLinkUiRssiDbm:NaN,flashLinkUiRssiValid:false,flashLinkStage1Route:"direct",flashLinkStage2Route:"direct",
  dashboardStageLinkChartSamples:{1:[{time:now-31000,rssi:-90,loss:1,hz:80},{time:now-100,rssi:-74,loss:.2,hz:100}],2:[]},
  getActiveGyroTelemetryData:sample=>sample,
  el:{},stageTelemetryPerfText:()=>"20%"
});
vm.runInContext(read("scripts/ui/shared/link-quality.js"),context);
const views = read("scripts/flash7-views.js");
vm.runInContext(views.slice(views.indexOf("function getDashboardStageLinkSnapshot("),views.indexOf("function syncDashboardStageLinkMetrics(")),context);
vm.runInContext(read("scripts/ui/desktop/split-entry.js"),context);
const buildLink = vm.runInContext("buildDesktopSplitLinkQuality",context);
const buildQuick = vm.runInContext("buildDesktopSplitQuickData",context);
let packet = buildLink(true);
assert.equal(packet.stages[0].loss,.2,"permille must convert to percent exactly once");
assert.equal(packet.stages[0].rssi,-74);
assert.equal(packet.stages[0].hz,100);
assert.equal(packet.stages[0].samples.length,1,"joining display receives only the recent 30 seconds");
assert.deepEqual(Array.from(packet.stages,stage=>stage.stageId),[1],"companion only sends the displayed stage 1 link");
packet.stages[0].samples[0].rssi = -1;
assert.equal(context.dashboardStageLinkChartSamples[1][1].rssi,-74,"display packets must not mutate host history");
assert.equal(buildLink(false).stages[0].samples,undefined,"live updates must not resend full history");
context.stageTelemetryStore[1].data.stage_rssi_age_ms = 6001;
assert.equal(buildLink(false).stages[0].rssi,null,"expired RSSI must remain unknown, never 0 dBm");
context.stageTelemetryStore[1].data.stage_rssi_age_ms = 0;
context.dashboardStageLinkChartSamples[1][1].time = now-6001;
packet = buildLink(false);
assert.equal(packet.stages[0].available,false);
assert.equal(packet.stages[0].hz,null,"stale link telemetry must not look live");
context.dashboardStageLinkChartSamples[1][1].time = now-100;
// Stage 2 no longer has a companion card, but its shared GCS relay semantics remain intact.
context.flashLinkStage2Route = "relay";
context.stageTelemetryStore[2] = {valid:true,updatedAt:now-100,data:{stage_rx_hz:35,stage_loss_permille:12}};
const relay = vm.runInContext("getDashboardStageLinkSnapshot(2)",context);
assert.equal(relay.rssiDbm,-74,"stage 2 relay uses the existing first-hop RSSI");
assert.equal(relay.rxHz,35,"relay RSSI must not replace the stage 2 RX rate");
let quick = buildQuick({sample:{sp:1,s:0,al:1,r:5,sr:1,ignition_delay_ms:1250,ignition_delay_valid:1,gr:3,gp:4,gyw:5,gx:999,chip_temp_c:31.9,bp:70}}, {connected:true});
assert.equal(quick.arm,"ON","physical ARM must win over software state");
assert.equal(quick.armLocked,true);
assert.equal(quick.pyro,"CH1, CH3");
assert.equal(quick.storage,"READY");
assert.equal(quick.delaySeconds,1.25);
assert.deepEqual(Array.from(quick.attitude),[3,4,5],"gyro attitude degrees must not use angular rates");
assert.equal(quick.power,"70%");
quick = buildQuick({sample:{ignition_delay_ms:0,ignition_delay_valid:0},derived:{rollDeg:55}}, {connected:false});
assert.equal(quick.delaySeconds,null);
assert.equal(quick.arm,"--");assert.equal(quick.pyro,"--");assert.equal(quick.storage,"--");
assert.deepEqual(Array.from(quick.attitude),[null,null,null],"missing selected-stage attitude must not use ground-board attitude");
assert.equal(vm.runInContext('formatFlashLinkChartValue(null,{unit:"dBm",digits:0})',context),"-- dBm");
const simulatedSample={simulation_profile:"araea_i_10000ft",flight_phase:"COASTING",st:0};
Object.assign(context,{window:{Flash7:{telemetryStore:{getSnapshot:()=>({sample:simulatedSample,derived:{},receivedAt:now})}}},simEnabled:true,replaySourceActive:false,replayUiActive:false,connOk:false,serialConnected:false,wsConnected:false,cameraHudActiveStageId:1,buildCameraHudStageValues:values=>values,readCameraGyroRates:()=>[0,0,0]});
context.el.statusPill={textContent:"SEQUENCE"};
assert.equal(vm.runInContext('buildDesktopSplitSnapshot().state',context),"COASTING","companion shows simulated phase instead of legacy sequence state");
simulatedSample.st=1;
assert.equal(vm.runInContext('buildDesktopSplitSnapshot().state',context),"COUNTDOWN");
context.replaySourceActive=true;
assert.equal(vm.runInContext('buildDesktopSplitSnapshot().state',context),"SEQUENCE","replay retains its recorded status");
console.log("FLASH7 split telemetry: PASS (quick-data fields, units, stage isolation, RSSI age, displayed link only, 30-second history, bounded updates)");
const timeline=context.buildDesktopMissionTimeline;
const available={available:true};
assert.equal(timeline({st:0},available).active,"standby");
assert.equal(timeline({st:1,td:5000},available).active,"count");
assert.equal(timeline({st:1,td:5000},available).progress,1.5/8,"countdown interpolates toward ignition");
assert.equal(timeline({st:2},available).active,"ignition");
for(const [code,active] of [[1,"powered"],[2,"coasting"],[3,"descent"],[4,"landed"]]){
  assert.equal(timeline({st:0,flight_phase_code:code},available).active,active);
}
assert.equal(timeline({deployment_state:2},available).active,"separation");
assert.equal(timeline({deployment_state:2,deployment_flags:8},available).active,"standby","failed servo cannot advance the timeline");
assert.equal(timeline({deployment_flags:32},available).active,"ejection");
assert.equal(timeline({deployment_flags:96},available).active,"standby");
assert.equal(timeline({flight_phase_code:4,deployment_flags:32},available).active,"landed","landing wins over old deployment bits");
const sample={st:0,flight_phase_code:2},single=timeline(sample,{available:true,singleStage:true});
assert.equal(single.steps.length,8);assert.ok(!single.steps.includes("separation"));
assert.equal(single.active,"coasting");assert.equal(single.progress,4/7);
assert.equal(timeline({deployment_state:2},{available:true,singleStage:true}).active,"ejection","single-stage deployment never becomes separation");
assert.equal(timeline(sample,{available:false}).active,null,"unavailable telemetry has no fabricated active phase");
assert.deepEqual(sample,{st:0,flight_phase_code:2},"timeline derivation cannot mutate the received sample");
context.cameraHudActiveStageId=2;
context.stageTelemetryStore[2].valid=false;
assert.equal(context.buildDesktopSplitSnapshot().timeline.active,null,"missing selected stage cannot borrow the other stage's sequence");
console.log("FLASH7 companion sequence: PASS (all flight phases, countdown interpolation, deployment failures, single-stage mission, missing-stage isolation)");
