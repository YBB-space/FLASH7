/* FLASH7 DAQ simulation. Classic-script scope; no board command transport. */
const DAQ_VALVES = Object.freeze([
  {id:1,label:"WATER PRESS"}, {id:2,label:"WATER SPRAY"},
  {id:3,label:"ETH MAIN"}, {id:4,label:"ETH PRESS"},
  {id:5,label:"ETH VENT"}, {id:6,label:"WATER N₂ VENT"},
  {id:7,label:"GOX MAIN"}, {id:8,label:"WATER VENT"},
  {id:9,label:"GOX VENT"}, {id:10,label:"N₂ → GOX PURGE"}
].map(Object.freeze));
function createDaqMockState(){
  return {startedAt:0,lastUpdatedAt:0,valves:DAQ_VALVES.map(()=>0),
    valveLocked:true,armed:false,running:false,
    sequenceStartedAt:0,sequenceStep:0,lastSequenceStep:0,sequenceElapsedMs:0,
    ethanolLevel:78.4,waterLevel:64.1,waterPressure:.15,ethanolPressure:.16,
    chamberPressure:0,engineTemperature:20};
}
const daqMockState = createDaqMockState();
function daqOpening(value){
  if(typeof value === "boolean") return value ? 100 : 0;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(Math.max(0,Math.min(100,number))) : 0;
}
function getDaqMockFlows(state){
  const v = (id)=>daqOpening(state.valves[id-1])/100;
  const water = Math.max(0,Math.min(1,state.waterPressure/4.8));
  const ethanol = Math.max(0,Math.min(1,state.ethanolPressure/4.8));
  // The purge check valve blocks flow against the higher-pressure GOX source.
  const purge = v(7) === 0 ? v(10) : 0;
  return {
    n2Supply:Math.max(v(1),v(4),purge),waterPress:v(1),ethanolPress:v(4),
    waterGasVent:v(6)*water,
    waterSpray:state.waterLevel > 0 ? v(2)*water : 0,
    waterVent:state.waterLevel > 0 ? v(8)*water : 0,
    ethanolFeed:state.ethanolLevel > 0 ? v(3)*ethanol : 0,
    ethanolVent:v(5)*ethanol,
    goxSupply:v(7),goxFeed:v(7),goxVent:v(7)*v(9),
    purgeSupply:purge,purgeFeed:purge,purgeVent:purge*v(9),
    combustion:(state.ethanolLevel > 0 ? v(3)*ethanol : 0)*v(7)*(1-v(9))
  };
}
function advanceDaqMockModel(state,seconds){
  const dt = Math.max(0,Math.min(1,Number(seconds)||0));
  const v = (id)=>daqOpening(state.valves[id-1])/100;
  function pressure(current,supply,vent,demand){
    const input = supply*1.8;
    const loss = vent*2.8+demand*.08+.015;
    const rate = input+loss;
    const target = 4.8*input/rate;
    return target+(current-target)*Math.exp(-rate*dt);
  }
  state.waterPressure = pressure(state.waterPressure,v(1),v(6),v(2)+v(8));
  state.ethanolPressure = pressure(state.ethanolPressure,v(4),v(5),v(3));
  const flow = getDaqMockFlows(state);
  state.ethanolLevel = Math.max(0,state.ethanolLevel-flow.ethanolFeed*.035*dt);
  state.waterLevel = Math.max(0,state.waterLevel-(flow.waterSpray+flow.waterVent)*.025*dt);
  const chamberTarget = flow.combustion*2.43;
  state.chamberPressure += (chamberTarget-state.chamberPressure)*(1-Math.exp(-dt*5));
  const temperatureTarget = 20+460*flow.combustion;
  state.engineTemperature += (temperatureTarget-state.engineTemperature)*(1-Math.exp(-dt/(flow.combustion ? 2 : 8)));
  return flow;
}
function resetDaqMockState(){
  Object.assign(daqMockState,createDaqMockState(),{startedAt:Date.now(),lastUpdatedAt:Date.now()});
  setDaqSequenceStep(0);
  syncDaqMockControls();
  updateDaqMockUi(true);
}
    function appendDaqMockLog(message, level){
      const log = document.getElementById("daqEventLog");
      if(!log) return;
      const now = new Date();
      const time = [now.getHours(),now.getMinutes(),now.getSeconds()]
        .map((value)=>String(value).padStart(2,"0")).join(":") + "." +
        String(now.getMilliseconds()).padStart(3,"0");
      const row = document.createElement("p");
      const kind = String(level || "INFO").toUpperCase();
      if(kind === "WARN") row.classList.add("is-warn");
      if(kind === "ABORT" || kind === "FAULT") row.classList.add("is-danger");
      const timeEl = document.createElement("time");
      const messageEl = document.createElement("span");
      const levelEl = document.createElement("em");
      timeEl.textContent = time;
      messageEl.textContent = String(message || "");
      levelEl.textContent = kind;
      row.append(timeEl,messageEl,levelEl);
      log.prepend(row);
      while(log.children.length > 40) log.lastElementChild.remove();
      syncDaqControlCenterLog();
    }
    function syncDaqControlCenterLog(){
      const source = document.getElementById("daqEventLog");
      const target = document.getElementById("daqControlEventList");
      const count = document.getElementById("daqControlEventCount");
      if(!source || !target) return;
      const rows = Array.from(source.children).filter((row)=>row.tagName === "P");
      if(count) count.textContent = String(rows.length);
      target.replaceChildren();
      if(!rows.length){
        const empty = document.createElement("div");
        empty.className = "alarm-history-empty";
        empty.textContent = "이벤트 로그가 없습니다.";
        target.append(empty);
        return;
      }
      rows.forEach((row)=>{
        const timeText = row.querySelector("time")?.textContent || "--:--:--.---";
        const messageText = row.querySelector("span")?.textContent || "";
        const levelText = (row.querySelector("em")?.textContent || "INFO").toUpperCase();
        const item = document.createElement("article");
        item.className = "alarm-history-item daq-control-event-item";
        if(row.classList.contains("is-danger")) item.classList.add("tone-error");
        else if(row.classList.contains("is-warn")) item.classList.add("tone-warn");
        else if(levelText === "OK" || levelText === "SAFE") item.classList.add("tone-success");
        const meta = document.createElement("div");
        meta.className = "alarm-history-item-meta";
        const levelEl = document.createElement("strong");
        const timeEl = document.createElement("time");
        const messageEl = document.createElement("p");
        levelEl.textContent = levelText;
        timeEl.textContent = timeText;
        messageEl.textContent = messageText;
        meta.append(levelEl,timeEl);
        item.append(meta,messageEl);
        target.append(item);
      });
    }
function setDaqValveLock(locked){
  const next = !!locked;
  if(daqMockState.valveLocked === next) return;
  daqMockState.valveLocked = next;
  syncDaqMockControls();
  appendDaqMockLog(next ? "Manual valve control interlock engaged" : "Manual valve control interlock released",next ? "SAFE" : "WARN");
}
function requestDaqMockValve(index,opening,silent){
  if(!simEnabled || getDisplayOperationModeValue() !== "daq") return false;
  if(daqMockState.valveLocked || daqMockState.running){
    showToast(daqMockState.running ? "자동 시퀀스 실행 중에는 수동 제어할 수 없습니다." : "LOCK을 해제해야 밸브를 제어할 수 있습니다.","error",{key:"daq-valve-locked"});
    return false;
  }
  return setDaqMockValve(index,opening,!!silent);
}
function setDaqMockValve(index,opening,silent){
  const id = Number(index);
  if(!Number.isInteger(id) || id<1 || id>DAQ_VALVES.length) return false;
  const next = daqOpening(opening);
  if(daqMockState.valves[id-1] === next) return true;
  daqMockState.valves[id-1] = next;
  syncDaqMockControls();
  if(!silent) appendDaqMockLog("V"+id+" · "+DAQ_VALVES[id-1].label+" · opening command "+next+"%",next ? "OK" : "SAFE");
  return true;
}
function syncDaqMockFlow(flow){
  const values = flow || getDaqMockFlows(daqMockState);
  document.querySelectorAll("[data-daq-flow]").forEach((line)=>{
    const rate = values[line.dataset.daqFlow] || 0;
    line.classList.toggle("is-flowing",rate>.001);
    line.style.setProperty("--daq-flow-duration",(1.8-1.25*Math.min(1,rate)).toFixed(2)+"s");
  });
  document.querySelectorAll("[data-daq-outlet]").forEach((node)=>{
    node.classList.toggle("is-flowing",(values[node.dataset.daqOutlet]||0)>.001);
  });
}
function syncDaqMockControls(){
  const disabled = daqMockState.valveLocked || daqMockState.running;
  daqMockState.valves.forEach((opening,index)=>{
    const id = index+1,open = opening>0;
    document.querySelectorAll('[data-daq-valve="'+id+'"]').forEach((button)=>{
      button.classList.toggle("is-open",open);
      button.setAttribute("aria-pressed",String(open));
      button.disabled = disabled;
      const status = button.querySelector("em");
      if(status) status.textContent = (open ? (opening===100 ? "OPEN" : "PARTIAL") : "CLOSED")+" · "+opening+"%";
    });
    document.querySelectorAll('[data-daq-opening="'+id+'"]').forEach((input)=>{
      input.disabled = disabled;
      input.value = String(opening);
      input.setAttribute("aria-valuetext",opening+"% 개도 명령 · 시뮬레이션");
    });
    document.querySelectorAll('[data-daq-opening-value="'+id+'"], [data-daq-svg-opening="'+id+'"]').forEach((node)=>{
      node.textContent = opening+"%";
    });
    document.querySelectorAll('[data-daq-svg-valve="'+id+'"]').forEach((node)=>{
      node.classList.toggle("is-open",open);
      node.setAttribute("aria-pressed",String(open));
      node.setAttribute("aria-disabled",String(disabled));
    });
  });
  syncDaqMockFlow();
  const pidPanel = document.querySelector(".daq-pid-panel");
  const lockBtn = document.getElementById("daqValveLockBtn");
  const interlock = document.getElementById("daqValvePanelInterlock");
  const purgeBtn = document.getElementById("daqPurgeBtn");
  if(pidPanel){
    pidPanel.classList.toggle("is-valve-locked",disabled);
  }
  if(lockBtn){
    lockBtn.classList.toggle("is-locked",daqMockState.valveLocked);
    lockBtn.classList.toggle("is-unlocked",!daqMockState.valveLocked);
    lockBtn.setAttribute("aria-pressed",String(daqMockState.valveLocked));
    lockBtn.title = daqMockState.valveLocked ? "밸브 제어 잠금 해제" : "밸브 제어 잠금";
    const label = lockBtn.querySelector("span");
    if(label) label.textContent = daqMockState.valveLocked ? "LOCKED" : "UNLOCKED";
  }
  if(interlock){
    interlock.textContent = daqMockState.running ? "AUTO SEQUENCE" : (disabled ? "INTERLOCKED" : "SIM CONTROL READY");
    interlock.classList.toggle("is-ready",!disabled);
  }
  if(purgeBtn){purgeBtn.disabled=disabled;purgeBtn.setAttribute("aria-pressed",String(daqMockState.valves[9]>0));}
  const armBtn = document.getElementById("daqArmBtn");
  const runBtn = document.getElementById("daqRunBtn");

  if(armBtn){armBtn.disabled=daqMockState.running;armBtn.classList.toggle("is-armed",daqMockState.armed);armBtn.textContent=daqMockState.armed ? "ARMED" : "ARM TEST";}
  if(runBtn) runBtn.disabled=!daqMockState.armed || daqMockState.running;
  const readiness=daqMockState.running ? "RUNNING" : (daqMockState.armed ? "ARMED" : (daqMockState.sequenceStep===4 ? "COMPLETE" : "READY"));
  setDaqMockText("daqRunReadiness",readiness);
  syncDaqSequenceReadout();
}
function syncDaqSequenceReadout(){
  const step=daqMockState.sequenceStep;
  const labels=["STANDBY","PRESS","PURGE","IGNITION","SHUTDOWN"];
  setDaqMockText("daqSequenceState",labels[step]);
  setDaqMockText("daqSequenceProgress",String(step+1).padStart(2,"0")+" / 05");
  document.querySelectorAll(".daq-sequence-track > span").forEach((node,index)=>{
    node.classList.toggle("is-active",index===step);
    node.classList.toggle("is-complete",index<step);
    node.setAttribute("aria-current",index===step ? "step" : "false");
  });
}
function setDaqSequenceStep(step){
  const next = Math.max(0,Math.min(4,Number(step)||0));
  daqMockState.sequenceStep = next;
  syncDaqSequenceReadout();
  if(next===daqMockState.lastSequenceStep) return;
  daqMockState.lastSequenceStep = next;
  const labels=["SAFE","PRESSURIZATION","N₂ → GOX PURGE","IGNITION / FEED","SHUTDOWN"];
  appendDaqMockLog("Sequence step "+String(next+1).padStart(2,"0")+" · "+labels[next],next===4 ? "SAFE" : "OK");
}
function stopDaqMockSequence(){
  daqMockState.running=false;
  daqMockState.armed=false;
  daqMockState.sequenceStartedAt=0;
  daqMockState.sequenceElapsedMs=0;
  daqMockState.valves.fill(0);
  setDaqSequenceStep(0);
  setDaqMockText("daqElapsedTime","T+ 00:00.0");
  syncDaqMockControls();
}
function startDaqMockSequence(){
  if(!simEnabled || getDisplayOperationModeValue()!=="daq" || !daqMockState.armed || daqMockState.running) return;
  daqMockState.valves.fill(0);
  daqMockState.running=true;
  daqMockState.sequenceElapsedMs=0;
  daqMockState.sequenceStartedAt=Date.now();
  daqMockState.lastSequenceStep=-1;
  setDaqSequenceStep(0);
  appendDaqMockLog("Automatic test sequence started · simulation only","INFO");
  syncDaqMockControls();
}
function abortDaqMockSequence(){
  stopDaqMockSequence();
  appendDaqMockLog("Sequence aborted · all valve commands closed","ABORT");
}
function updateDaqMockSequence(now){
  if(!daqMockState.running) return;
  const elapsed=Math.max(0,now-daqMockState.sequenceStartedAt);
  daqMockState.sequenceElapsedMs=Math.min(8500,elapsed);
  const step=elapsed<1600 ? 1 : (elapsed<3200 ? 2 : (elapsed<8500 ? 3 : 4));
  if(step===daqMockState.sequenceStep) return;
  // Apply complete phase targets, even when a background tab skips a phase.
  const open=step===1 ? [1,4] : (step===2 ? [1,4,10] : (step===3 ? [1,2,3,4,7] : []));
  daqMockState.valves=DAQ_VALVES.map(({id})=>open.includes(id) ? 100 : 0);
  setDaqSequenceStep(step);
  if(step===4){daqMockState.running=false;daqMockState.armed=false;appendDaqMockLog("Sequence complete · system returned to SAFE","SAFE");}
  syncDaqMockControls();
}
function setDaqMockText(id,value){const node=document.getElementById(id);if(node) node.textContent=value;}
function setDaqOverviewGauge(id,value,maximum){
  const fill=document.getElementById(id);
  if(!fill) return;
  const number=Math.max(0,Number(value)||0),max=Math.max(.001,Number(maximum)||1);
  fill.style.width=Math.max(0,Math.min(100,number/max*100)).toFixed(1)+"%";
  const meter=fill.closest("[role='meter']");
  if(meter) meter.setAttribute("aria-valuenow",number.toFixed(2));
}
function syncSimulationModeLabels(mode){
  const daq=normalizeOperationModeValue(mode)==="daq";
  setDaqMockText("simulationModeBarTitle",daq ? "DAQ CONSOLE" : "FLIGHT CONSOLE");
  setDaqMockText("dashboardDrawerModeLabel",daq ? "TEST OPERATIONS" : "FLIGHT CONSOLE");
  setDaqMockText("dashboardDrawerTitle",daq ? "DAQ CONSOLE" : "DASHBOARD");
}
function updateDaqMockUi(force){
  if(!simEnabled || getDisplayOperationModeValue()!=="daq") return;
  const now=Date.now();
  if(!daqMockState.startedAt) daqMockState.startedAt=now;
  const seconds=daqMockState.lastUpdatedAt ? (now-daqMockState.lastUpdatedAt)/1000 : 0;
  daqMockState.lastUpdatedAt=now;
  updateDaqMockSequence(now);
  const flow=advanceDaqMockModel(daqMockState,seconds);
  const phase=(now-daqMockState.startedAt)/1000;
  const wave=(amount,speed,offset)=>Math.sin(phase*speed+(offset||0))*amount;
  const pt1=daqMockState.ethanolPressure*daqMockState.valves[2]/100;
  const pt3=Math.max(0,daqMockState.chamberPressure+wave(flow.combustion*.03,3.2,.7));
  const thrust=Math.max(0,flow.combustion*486+wave(flow.combustion*9,4.1,1.4));
  const goxPressure=6.42+wave(.035,1.35,1.1),n2Pressure=4.81+wave(.03,1.1,.8);
  const secondsElapsed=daqMockState.sequenceElapsedMs/1000;
  setDaqMockText("daqElapsedTime","T+ "+String(Math.floor(secondsElapsed/60)).padStart(2,"0")+":"+String(Math.floor(secondsElapsed%60)).padStart(2,"0")+"."+String(Math.floor(secondsElapsed%1*10)));
  setDaqMockText("daqBoardState",daqMockState.running ? "TEST RUN" : (daqMockState.armed ? "ARMED" : (daqMockState.lastSequenceStep===4 ? "SAFE" : "PRE FLIGHT")));
  setDaqMockText("daqBoardLinkRate",String(Math.round(68+wave(2,.55,.4))));
  setDaqMockText("daqBoardTemp","--");setDaqMockText("daqBoardStorage","0.0%");
  setDaqMockText("daqBoardArm",daqMockState.armed || daqMockState.running ? "ON" : "OFF");
  setDaqMockText("daqGoxPressure",goxPressure.toFixed(2));setDaqMockText("daqN2Pressure",n2Pressure.toFixed(2));
  setDaqMockText("daqEthanolLevel",daqMockState.ethanolLevel.toFixed(1));setDaqMockText("daqWaterLevel",daqMockState.waterLevel.toFixed(1));
  setDaqMockText("daqSvgEthanolLevel",daqMockState.ethanolLevel.toFixed(0)+"%");setDaqMockText("daqSvgWaterLevel",daqMockState.waterLevel.toFixed(0)+"%");
  setDaqMockText("daqThrustValue",thrust.toFixed(1));
  [["daqGoxGauge",goxPressure,7],["daqN2Gauge",n2Pressure,6],["daqEthanolGauge",daqMockState.ethanolLevel,100],["daqWaterGauge",daqMockState.waterLevel,100],["daqThrustGauge",thrust,500],
    ["daqPt1Bar",pt1,7],["daqPt3Bar",pt3,4],["daqEngineTempBar",daqMockState.engineTemperature,600]].forEach(v=>setDaqOverviewGauge(...v));
  [["daqPt1","daqSvgPt1",pt1],["daqPt3","daqSvgPt3",pt3],["daqEngineTemp","daqSvgEngineTemp",daqMockState.engineTemperature]].forEach(([panel,svg,value])=>{
    const digits=panel==="daqEngineTemp" ? 1 : 2;setDaqMockText(panel,value.toFixed(digits));setDaqMockText(svg,value.toFixed(digits));
  });
  syncDaqMockFlow(flow);
  if(force) syncDaqMockControls();
}
