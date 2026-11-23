/* Standalone companion: only receives display snapshots, never connects to a board. */
const SPLIT_DISPLAY_HISTORY_LIMIT = 600;
function chooseSplitDisplayOffer(offers,session,peer){
  const matching=offers.filter(offer=>offer.session===session);
  return matching.find(offer=>offer.instance===peer) ||
    (matching.length===1 ? matching[0] : (!matching.length && offers.length===1 ? offers[0] : null));
}
function createSplitMissionTimeline(root){
  const items=Array.from(root.querySelectorAll("[data-sequence-step]"));
  const current=root.querySelector("#splitSequenceCurrent"),counter=root.querySelector("#splitSequenceStep");
  return function(payload){
    const keys=Array.isArray(payload?.steps) ? payload.steps : items.map(item=>item.dataset.sequenceStep);
    const visible=items.filter(item=>keys.includes(item.dataset.sequenceStep));
    const active=visible.findIndex(item=>item.dataset.sequenceStep===payload?.active);
    root.classList.toggle("is-waiting",active<0);
    root.style.setProperty("--sequence-steps",String(Math.max(1,visible.length)));
    const progress=Number(payload?.progress);
    root.style.setProperty("--sequence-progress",String(active<0 ? 0 : Math.max(0,Math.min(1,Number.isFinite(progress) ? progress : active/Math.max(1,visible.length-1)))));
    current.textContent=active<0 ? "수신 대기" : visible[active].textContent.trim();
    counter.textContent=(active<0 ? "--" : String(active+1).padStart(2,"0"))+" / "+String(visible.length).padStart(2,"0");
    items.forEach(item=>{
      const index=visible.indexOf(item);
      item.hidden=index<0;
      item.classList.toggle("is-active",active>=0 && index===active);
      item.classList.toggle("is-passed",active>=0 && index>=0 && index<active);
      if(active>=0 && index===active) item.setAttribute("aria-current","step");
      else item.removeAttribute("aria-current");
    });
  };
}
/* Local visual mock plus owner simulation feedback; never sends actuator commands. */
function createSplitAirbrakePreview(root){
  const valueNode = root.querySelector("[data-airbrake-value]");
  const servoAngleNode = root.querySelector("[data-airbrake-servo-angle]");
  const servoCore = root.querySelector("[data-airbrake-servo-core]");
  const mockServoTravelDeg = 90; // Visual simulation only; not hardware calibration.
  const statusNode = root.querySelector("[data-airbrake-status]");
  const modeNode = root.querySelector("[data-airbrake-mode]");
  const meter = root.querySelector(".split-airbrake-meter");
  const automaticNode = root.querySelector("[data-airbrake-auto]");
  const predictionNode = root.querySelector("[data-airbrake-prediction]");
  const buttons = Array.from(root.querySelectorAll("[data-airbrake-target]"));
  const panels = Array.from(root.querySelectorAll("[data-airbrake-panel]"));
  const stowedPanelTipY = 64 - Math.sqrt(37 * 37 - 11 * 11);
  let enabled = false, stage = null, value = 0, target = 0, frame = 0, disposed = false, feedbackState = null;
  function render(){
    const rounded = Math.round(value);
    const percent = value !== target && rounded === target ? (target === 100 ? 99 : 1) : rounded;
    root.classList.toggle("is-unknown", !enabled);
    root.classList.toggle("is-auto", !!feedbackState);
    if(automaticNode) automaticNode.hidden = !feedbackState;
    if(predictionNode) predictionNode.textContent = feedbackState && Number.isFinite(feedbackState.predictedApogeeM)
      ? Math.round(feedbackState.predictedApogeeM / .3048).toLocaleString("en-US") + " ft" : "--";
    root.style.setProperty("--airbrake-open", enabled ? String(value / 100) : "0");
    // A radius-37 cap follows the hull exactly when stowed; its inner edge stays anchored.
    const extension = enabled ? value * .2 : 0;
    const tipY = stowedPanelTipY - extension;
    const outline = `M69 33V${tipY}A37 37 0 0 1 91 ${tipY}V33Z`;
    panels.forEach(panel=>panel.setAttribute("d", outline));
    valueNode.textContent = enabled ? String(percent) : "--";
    servoAngleNode.textContent = enabled ? (feedbackState ? feedbackState.servoAngleDeg : percent * mockServoTravelDeg / 100).toFixed(1) : "--";
    servoCore.setAttribute("transform", `rotate(${enabled ? value * mockServoTravelDeg / 100 : 0} 80 64)`);
    modeNode.textContent = feedbackState ? "AUTO" : enabled ? "SIMULATION" : "WAITING";
    const text = feedbackState ? ({PRE_FLIGHT:"발사 대기 · 수납",POWERED_FLIGHT:"상승 · 에어브레이크 수납",COASTING:"목표 고도 제어 중",DESCENT:"하강 · 에어브레이크 수납",LANDED:"착륙 · 수납"}[feedbackState.phase] || "목표 고도 제어 중") : !enabled ? "전개 데이터 대기" : value === target
      ? (value === 0 ? "수납" : "전개 완료") : (target > value ? "전개 중" : "수납 중");
    if(statusNode.textContent !== text) statusNode.textContent = text;
    if(enabled) meter.setAttribute("aria-valuenow", String(percent));
    else meter.removeAttribute("aria-valuenow");
    meter.setAttribute("aria-valuetext", enabled ? "시뮬레이션 " + percent + "%" : text);
    buttons.forEach(button=>{
      const selected = enabled && Number(button.dataset.airbrakeTarget) === target;
      button.disabled = !enabled || !!feedbackState;
      button.setAttribute("aria-pressed", String(selected));
    });
  }
  function cancel(){
    if(frame) cancelAnimationFrame(frame);
    frame = 0;
  }
  function move(next){
    if(!enabled || disposed || feedbackState) return;
    cancel();target = next;
    const from = value, start = performance.now();
    const duration = 900 * Math.abs(target - from) / 100;
    if(!duration || window.matchMedia("(prefers-reduced-motion: reduce)").matches){
      value = target;render();return;
    }
    function tick(now){
      frame = 0;
      if(!enabled || disposed) return;
      const progress = Math.min(1, Math.max(0, (now - start) / duration));
      value = progress === 1 ? target : from + (target - from) * (1 - Math.pow(1 - progress, 3));
      render();
      if(progress < 1) frame = requestAnimationFrame(tick);
    }
    render();frame = requestAnimationFrame(tick);
  }
  function clicked(event){
    const button = event.target.closest("[data-airbrake-target]");
    if(!button || !root.contains(button)) return;
    const next = Number(button.dataset.airbrakeTarget);
    if(next === 0 || next === 100) move(next);
  }
  root.addEventListener("click", clicked);
  render();
  return {
    setSimulation(simulation, stageId, feedback){
      if(disposed) return;
      const next = simulation === true;
      const automatic = next && Number(stageId)===1 && feedback && feedback.profile === "araea_i" &&
        feedback.automatic === true && Number.isFinite(feedback.deploymentPercent) && Number.isFinite(feedback.servoAngleDeg);
      if(automatic){
        cancel();enabled=next;stage=stageId;feedbackState=feedback;
        value=target=Math.max(0,Math.min(100,feedback.deploymentPercent));render();return;
      }
      if(enabled===next && stage===stageId && !feedbackState) return;
      cancel();enabled=next;stage=stageId;feedbackState=null;value=0;target=0;render();
    },
    dispose(){
      cancel();disposed = true;root.removeEventListener("click", clicked);
    }
  };
}

(function(){
  "use strict";
  const wait = document.getElementById("splitDisplayWait");
  const write = (id, text)=>{ document.getElementById(id).textContent = text; };
  const updateTimeline=createSplitMissionTimeline(document.getElementById("splitDisplaySequence"));
  let session = new URLSearchParams(window.location.hash.slice(1)).get("session") || "";
  if(!/^[a-f0-9]{32}$/.test(session)) session="";
  const history = {altitude:[],speed:[],gforce:[],x:[],y:[],z:[]};
  const linkQuality = {metric:"rssi",samples:[],current:{}};
  const airbrakePreview = createSplitAirbrakePreview(document.getElementById("splitAirbrake"));
  let link, discovery, heartbeat, lastSeen = 0, lastSample = 0, activeStage = 0, peer = null, expectedHost=null, live = false, disposed = false;
  let disconnectedAt=Date.now();
  const offers=new Map();
  const format = (value, digits)=>typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "--";
  function draw(){
    drawCameraTelemetryChart(document.getElementById("splitDisplayAltitudeChart"), [
      {source:history.altitude,color:CAMERA_CHART_COLORS.altitude,scaleGroup:"altitude",unit:"m",minSpan:2},
      {source:history.speed,color:CAMERA_CHART_COLORS.speed,scaleGroup:"speed",unit:"m/s",minSpan:1,zeroFloor:true}
    ]);
    drawCameraTelemetryChart(document.getElementById("splitDisplayDynamicsChart"), [
      {source:history.gforce,color:CAMERA_CHART_COLORS.gforce,scaleGroup:"gforce",unit:"g",minSpan:.5,zeroFloor:true,focusRange:true},
      ...["x","y","z"].map(axis=>({source:history[axis],color:CAMERA_CHART_COLORS["gyro"+axis.toUpperCase()],scaleGroup:"gyro",unit:"°/s",minSpan:10,symmetric:true,focusRange:true}))
    ], {detail:cameraTelemetryChartView.range === "detail"});
    const colors = {rssi:"#8faa9a",loss:"#b68f8b",hz:"#92aec1"};
    const now = Date.now();
    linkQuality.samples = linkQuality.samples.filter(sample=>sample.time >= now-30000).slice(-162);
    const definition = Object.assign({},getFlashLinkChartDefinition(linkQuality.metric,linkQuality.samples),{color:colors[linkQuality.metric]});
    const value = document.getElementById("splitLink1Value");
    drawFlashLinkQualityChartTarget(document.getElementById("splitLink1Chart"),value,linkQuality.samples,definition,now,{fontSize:10,compact:true});
    value.textContent = formatFlashLinkChartValue(linkQuality.current[linkQuality.metric],definition);
  }
  const releaseChartControls = bindCameraChartControls(draw);
  const qualityRoot = document.querySelector(".split-monitor-systems");
  function chooseLinkMetric(event){
    const button = event.target.closest("[data-split-link-metric]");
    if(!button || !qualityRoot.contains(button)) return;
    const panel = button.closest("[data-split-quality-stage]");
    linkQuality.metric = button.dataset.splitLinkMetric;
    panel.querySelectorAll("[data-split-link-metric]").forEach(item=>{
      const active = item === button;
      item.classList.toggle("is-active",active);item.setAttribute("aria-pressed",String(active));
    });
    draw();
  }
  qualityRoot.addEventListener("click",chooseLinkMetric);
  function applyLinkQuality(payload){
    if(!payload || !Array.isArray(payload.stages)) return;
    const finite = value=>typeof value === "number" && Number.isFinite(value) ? value : null;
    const normalize = sample=>({time:finite(sample.time),rssi:finite(sample.rssi),loss:finite(sample.loss),hz:finite(sample.hz)});
    const stage = payload.stages.find(stage=>stage.stageId === 1);
    if(!stage) return;
    const quality = linkQuality;
    if(Array.isArray(stage.samples)) quality.samples = stage.samples.slice(-162).map(normalize).filter(sample=>sample.time > 0);
    const sample = normalize(stage);
    const fresh = stage.available && sample.time > 0 && Date.now()-sample.time <= 6000;
    quality.current = fresh ? sample : {};
    if(fresh){
      const last = quality.samples[quality.samples.length-1];
      if(last && last.time === sample.time) Object.assign(last,sample);
      else if(!last || sample.time > last.time) quality.samples.push(sample);
    }
    write("splitLink1Rssi",format(quality.current.rssi,0));
    write("splitLink1Loss",format(quality.current.loss,1));
    write("splitLink1Rate",format(quality.current.hz,0));
  }

  function apply(snapshot){
    if(!snapshot || !Array.isArray(snapshot.gyro)) return;
    write("splitDisplayConnection", snapshot.connected ? "연결됨 · " + (snapshot.source || "LIVE") : "텔레메트리 연결 대기");
    write("splitDisplayMission", snapshot.mission || "FLASH7 MISSION");
    document.getElementById("splitDisplayMission").title = snapshot.mission || "FLASH7 MISSION";
    write("splitDisplayStage", "STAGE " + snapshot.stageId + " · DISPLAY 02");
    write("splitDisplayState", snapshot.state || "--");
    write("splitDisplayCountdown", snapshot.countdown || "T- 00:00");
    updateTimeline(snapshot.timeline);
    write("splitDisplayAltitude", format(snapshot.altitude,1));
    write("splitDisplaySpeed", format(snapshot.speed,1));
    write("splitDisplayGforce", format(snapshot.gforce,2));
    const quick = snapshot.quick || {};
    write("splitQuickConnectionText",quick.connection || "DISCONNECTED");
    document.getElementById("splitQuickConnection").classList.toggle("is-connected",!!snapshot.connected);
    write("splitQuickChip",quick.chip || "--°C");write("splitQuickPerf",quick.perf || "--%");write("splitQuickPower",quick.power || "N");
    write("splitQuickState",snapshot.state || "--");write("splitQuickStorage",quick.storage || "--");
    write("splitQuickDelay",format(quick.delaySeconds,2));write("splitQuickArm",quick.arm || "--");write("splitQuickPyro",quick.pyro || "--");
    document.getElementById("splitQuickArmLock").hidden = !quick.armLocked;
    ["X","Y","Z"].forEach((axis,index)=>write("splitQuickAttitude"+axis,format(quick.attitude?.[index],1)));
    applyLinkQuality(snapshot.linkQuality);
    airbrakePreview.setSimulation(snapshot.simulation === true, snapshot.stageId, snapshot.airbrake);
    ["X","Y","Z"].forEach((axis,index)=>write("splitDisplayGyro"+axis,format(snapshot.gyro[index],1)));
    if(activeStage !== snapshot.stageId){
      Object.values(history).forEach(values=>{ values.length = 0; });
      activeStage = snapshot.stageId;lastSample = 0;
    }
    if(snapshot.receivedAt && snapshot.receivedAt !== lastSample){
      const values = [snapshot.altitude,snapshot.speed,snapshot.gforce,...snapshot.gyro];
      Object.keys(history).forEach((key,index)=>{
        history[key].push(snapshot.connected ? values[index] : null);
        if(history[key].length > SPLIT_DISPLAY_HISTORY_LIMIT) history[key].shift();
      });
      lastSample = snapshot.receivedAt;
    }
    draw();
  }
  function disconnected(){
    if(peer) offers.delete(peer);
    live = false;peer = null;expectedHost=null;disconnectedAt=Date.now();
    airbrakePreview.setSimulation(false, null);
    wait.classList.remove("hidden");
    write("splitDisplayWaitTitle", "메인 화면 연결을 기다리고 있습니다");
    write("splitDisplayWaitCopy", "이 화면을 열어두면 메인 화면과 자동으로 다시 연결됩니다.");
    write("splitDisplayWaitStatus", "메인 화면을 자동으로 찾는 중입니다.");
    write("splitDisplayConnection", "메인 화면 연결 끊김");
  }
  function connect(nextSession,host){
    if(disposed) return;
    if(link && nextSession===session){
      if(live && peer===host && Date.now()-lastSeen<=3000) return;
      expectedHost=host || null;peer=null;live=false;
      link.send("ready");return;
    }
    if(link){link.send("closed");link.close();}
    if(nextSession!==session){
      Object.values(history).forEach(values=>{values.length=0;});
      linkQuality.samples.length=0;linkQuality.current={};lastSample=0;activeStage=0;
    }
    session=nextSession;expectedHost=host || null;peer=null;live=false;
    try{
      const url=new URL(window.location.href);url.hash="session="+session;
      window.history.replaceState(null,"",url.href);
    }catch(_error){}
    link = window.Flash7.createSplitLink(session, "display", (type, payload, sender)=>{
      if(peer && sender !== peer) return;
      if(expectedHost && sender!==expectedHost) return;
      if(type === "welcome"){
        peer = sender;live = true;lastSeen = Date.now();
        wait.classList.add("hidden");
        apply(payload);
      }else if(type === "snapshot" && live){
        lastSeen = Date.now();apply(payload);
      }else if(type === "closed") disconnected();
    });
    if(window.opener) link.attachWindow(window.opener);
    link.send("ready");
  }
  function findHost(){
    const now=Date.now();
    offers.forEach((offer,key)=>{if(now-offer.seenAt>4000) offers.delete(key);});
    const offer=chooseSplitDisplayOffer(Array.from(offers.values()),session,peer);
    if(!offer || (offer.session!==session && (live || now-disconnectedAt<2500))) return;
    if(!live || peer!==offer.instance || now-lastSeen>3000) connect(offer.session,offer.instance);
  }
  function dispose(){
    if(disposed) return;
    disposed = true;
    clearInterval(heartbeat);
    discovery?.close();
    releaseChartControls();
    airbrakePreview.dispose();
    qualityRoot.removeEventListener("click",chooseLinkMetric);
    if(link){ link.send("closed");link.close(); }
    window.removeEventListener("resize",draw);
    window.removeEventListener("pagehide",suspend);
    window.removeEventListener("pageshow",restored);
  }
  function suspend(event){
    if(document.body.classList.contains("online-mission-viewer")){if(!event.persisted)dispose();return;}
    if(!event.persisted){dispose();return;}
    clearInterval(heartbeat);heartbeat=null;
    discovery?.close();discovery=null;
    if(link){link.send("closed");link.close();link=null;}
    offers.clear();disconnected();
  }
  function restored(event){if(event.persisted&&!document.body.classList.contains("online-mission-viewer")) resume();}
  window.addEventListener("resize",draw);
  window.addEventListener("pagehide",suspend);
  window.addEventListener("pageshow",restored);
  function resume(){
    if(disposed || heartbeat) return;
    try{
      discovery=window.Flash7.createSplitDiscovery("display",(session,instance)=>{
        offers.set(instance,{session,instance,seenAt:Date.now()});findHost();
      });
      if(session) connect(session);
      discovery.find(session);
      heartbeat=setInterval(()=>{
        if(live && Date.now()-lastSeen>15000) disconnected();
        findHost();
        link?.send(live ? "alive" : "ready");
        if(!live) discovery.find(session);
      },1000);
    }catch(_error){
      write("splitDisplayWaitTitle", "화면 연결을 시작하지 못했습니다");
      write("splitDisplayWaitCopy", "같은 브라우저의 메인 화면에서 보조 화면 열기를 눌러주세요.");
    }
  }
  if(document.body.classList.contains("online-mission-viewer")){
    window.Flash7=window.Flash7||{};
    window.Flash7.remoteTelemetry={apply,clear(){Object.values(history).forEach(values=>{values.length=0;});linkQuality.samples=[];linkQuality.current={};activeStage=0;lastSample=0;draw();},seed(points){
      Object.values(history).forEach(values=>{values.length=0;});
      const stage=points.at(-1)?.telemetry?.stageId;
      points.filter(point=>point.telemetry?.stageId===stage).slice(-SPLIT_DISPLAY_HISTORY_LIMIT).forEach(point=>{const s=point.telemetry,values=[s.altitude,s.speed,s.gforce,...s.gyro];Object.keys(history).forEach((key,index)=>history[key].push(values[index]));});activeStage=stage||0;lastSample=points.at(-1)?.telemetry?.receivedAt||0;draw();
    },stale(){write("splitDisplayConnection","수신 끊김 · 마지막 수신값");write("splitQuickConnectionText","DISCONNECTED");document.getElementById("splitQuickConnection").classList.remove("is-connected");},dispose};
  }else resume();
})();
