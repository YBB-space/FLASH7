/* Desktop entry gate and host for a lightweight, read-only companion display. */
const desktopSplitEntry = {scope:null, discovery:null, popup:null, mode:"intro", allowed:false, link:null, peer:null, seenAt:0, session:"", url:"", returnFocus:null};

function syncDesktopSplitEntry(){
  const root = document.getElementById("desktopSplitEntry");
  if(!root) return;
  const show = isDesktopLayout() && document.body.classList.contains("camera-view-active") &&
    !document.body.classList.contains("welcome-connect-active") &&
    !!(welcomeDashboardEntered || simEnabled || replayUiActive || replaySourceActive) && !desktopSplitEntry.allowed;
  const changed = root.classList.contains("hidden") === show;
  root.classList.toggle("hidden", !show);
  root.setAttribute("aria-hidden", String(!show));
  document.body.classList.toggle("desktop-split-entry-active", show);
  if(changed && show){
    desktopSplitEntry.returnFocus = document.activeElement;
    const target = root.querySelector(desktopSplitEntry.mode === "waiting" ? "h2" : "h1");
    if(target) target.focus({preventScroll:true});
  }else if(changed && !show && desktopSplitEntry.returnFocus?.isConnected){
    desktopSplitEntry.returnFocus.focus({preventScroll:true});
  }
}

function setDesktopSplitMode(mode){
  desktopSplitEntry.mode = mode;
  document.getElementById("splitEntryIntro").classList.toggle("hidden", mode === "waiting");
  document.getElementById("splitEntryWaiting").classList.toggle("hidden", mode !== "waiting");
  document.querySelector("#desktopSplitEntry .split-entry-skip").classList.toggle("hidden", mode === "waiting");
  document.getElementById("desktopSplitEntry").setAttribute("aria-labelledby", mode === "waiting" ? "splitEntryWaitingTitle" : "splitEntryTitle");
  document.querySelector(mode === "waiting" ? "#splitEntryWaiting h2" : "#splitEntryTitle").focus({preventScroll:true});
}

function closeDesktopSplitLink(){
  if(desktopSplitEntry.link){
    desktopSplitEntry.link.send("closed");
    desktopSplitEntry.link.close();
  }
  Object.assign(desktopSplitEntry, {link:null,peer:null,seenAt:0});
  const badge = document.getElementById("desktopSplitConnection");
  if(badge) badge.textContent = "화면 연결";
}

function buildDesktopSplitQuickData(snapshot, values){
  const data = getActiveGyroTelemetryData(snapshot.sample) || {};
  const read = (...fields)=>readFirstFiniteLinkMetric(...fields);
  const text = (node, fallback)=>node?.textContent?.trim() || fallback;
  const arm = read(data.sp, data.physical_arm, data.s, data.sw);
  const lock = read(data.al, data.arm_lock);
  const relays = read(data.r, data.rly);
  const channels = Number.isFinite(relays) ? [1,2,3,4].filter(channel=>(relays & (1 << (channel-1))) !== 0).map(channel=>"CH"+channel) : [];
  const ready = read(data.storage_ready, data.spi_flash_ready, data.sd_ready, data.sr);
  const delay = read(data.ignition_delay_ms, data.ignitionDelayMs);
  const delayValid = data.ignition_delay_valid == null || Number(data.ignition_delay_valid) !== 0;
  const chip = read(data.chip_temp_c, data.ctemp, data.chip_temp, data.chipTemp);
  const chipOk = data.chip_temp_ok ?? data.ctemp_ok ?? data.chipTempOk;
  const rate = read(data.stage_rx_hz, data.rx_hz, data.fl_rx_hz, data.flash_link_rx_hz,
    stageTelemetryModeActive ? null : rxHzWindow);
  const power = read(data.bp, data.batt_pct, data.battery_pct);
  const derived = stageTelemetryModeActive ? {} : (snapshot.derived || {});
  const attitude = [read(data.gr, data.gyro_roll_deg, data.roll_deg, derived.rollDeg),
    read(data.gp, data.gyro_pitch_deg, data.pitch_deg, derived.pitchDeg),
    read(data.gyw, data.gyro_yaw_deg, data.yaw_deg, derived.yawDeg)];
  return {
    connection:values.connected ? "CONNECTED" + (Number.isFinite(rate) ? " · " + Math.round(Math.max(0,rate)) + " Hz" : "") : "DISCONNECTED",
    chip:Number.isFinite(chip) && (chipOk == null || Number(chipOk) !== 0) ? chip.toFixed(1)+"°C" : (stageTelemetryModeActive ? "--°C" : text(el.chipTempStatus,"--°C")),
    perf:stageTelemetryModeActive ? stageTelemetryPerfText(data) : text(el.perfStatus,"--%"),
    power:Number.isFinite(power) ? Math.round(Math.max(0,Math.min(100,power)))+"%" : (stageTelemetryModeActive ? "N" : text(el.batteryStatus,"N")),
    storage:Number.isFinite(ready) ? (ready ? "READY" : "NOT READY") : "--",
    delaySeconds:delayValid && Number.isFinite(delay) && delay >= 0 && delay < 4294967295 ? delay/1000 : null,
    arm:Number.isFinite(arm) ? (arm ? "ON" : "OFF") : "--", armLocked:Number.isFinite(lock) && lock !== 0,
    pyro:Number.isFinite(relays) ? (channels.length ? channels.join(", ") : "ALL OFF") : "--",
    attitude:attitude.map(value=>Number.isFinite(value) ? value : null)
  };
}

function buildDesktopSplitLinkQuality(includeHistory){
  const now = Date.now();
  const finite = value=>value != null && Number.isFinite(Number(value)) ? Number(value) : null;
  return {now, stages:[1].map(stageId=>{
    const metrics = getDashboardStageLinkSnapshot(stageId);
    const history = dashboardStageLinkChartSamples[stageId];
    const sampleTime = history.length ? history[history.length-1].time : (stageTelemetryStore[stageId].updatedAt || 0);
    const fresh = metrics.available && sampleTime > 0 && now - sampleTime <= 6000;
    const result = {stageId, time:sampleTime, available:!!fresh,
      rssi:fresh && metrics.rssiValid ? finite(metrics.rssiDbm) : null,
      loss:fresh && Number.isFinite(metrics.lossPermille) ? metrics.lossPermille/10 : null,
      hz:fresh ? finite(metrics.rxHz) : null};
    if(includeHistory) result.samples = history.filter(sample=>sample.time >= now-30000).slice(-162)
      .map(sample=>({time:sample.time,rssi:finite(sample.rssi),loss:finite(sample.loss),hz:finite(sample.hz)}));
    return result;
  })};
}

function buildDesktopMissionTimeline(data, options = {}){
  const steps=["standby","count","ignition","powered","coasting","separation","ejection","descent","landed"];
  if(options.singleStage) steps.splice(5,1);
  if(!options.available) return {steps,active:null,progress:0};
  const st=Number(data.st),phase=Number(data.flightPhaseCode ?? data.flight_phase_code);
  const deployment=Number(data.deploymentState ?? data.deployment_state) || 0;
  const flags=Number(data.deploymentFlags ?? data.deployment_flags) || 0;
  let active=st>=1 && st<=5 ? (st===1 ? "count" : "ignition") : "standby";
  if(phase===1) active="powered";
  else if(phase===2) active="coasting";
  else if(phase===3) active="descent";
  else if(phase===4) active="landed";
  if(!Number.isFinite(phase) || phase<3){
    if((flags & (1<<5)) && !(flags & (1<<6))) active="ejection";
    else if(deployment>=2 && !(flags & (1<<3))) active=options.singleStage ? "ejection" : "separation";
  }
  let fraction=0;
  if(st===1 && data.td!=null && Number.isFinite(Number(data.td))){
    active="count";
    const total=Math.max(3000,Math.min(60000,Number(data.countdownTotalMs ?? options.countdownTotalMs) || 10000));
    fraction=1-Math.min(1,Math.abs(Number(data.td))/total);
  }
  return {steps,active,progress:Math.min(1,(steps.indexOf(active)+fraction)/(steps.length-1))};
}

function buildDesktopSplitSnapshot(includeHistory = false){
  const snapshot = window.Flash7.telemetryStore.getSnapshot();
  const derived = snapshot.derived || {};
  const araea = simEnabled && !replaySourceActive && !replayUiActive &&
    snapshot.sample?.simulation_profile === "araea_i_10000ft";
  const values = buildCameraHudStageValues({
    connected:!!(simEnabled || connOk || serialConnected || wsConnected || replaySourceActive),
    altitudeM:derived.altitudeM, speedMps:derived.speedMps, gforceG:derived.totalAccelG,
    stateText:araea ? (Number(snapshot.sample.st)===1 ? "COUNTDOWN" :
      String(snapshot.sample.flight_phase || "PRE_FLIGHT").replace(/_/g," ")) : el.statusPill?.textContent || "--"
  });
  const rates = readCameraGyroRates(getActiveGyroTelemetryData(snapshot.sample));
  const selected = stageTelemetryModeActive ? stageTelemetryStore[cameraHudActiveStageId] : null;
  const hasData = !stageTelemetryModeActive || !!selected?.valid;
  const finite = value=>hasData && value != null && Number.isFinite(Number(value)) ? Number(value) : null;
  return {
    receivedAt:snapshot.receivedAt || 0, source:snapshot.source || "",
    simulation:!!simEnabled && !replaySourceActive && !replayUiActive,
    airbrake:simEnabled && !replaySourceActive && !replayUiActive &&
      snapshot.sample && snapshot.sample.simulation_profile === "araea_i_10000ft"
      ? snapshot.sample.simulation_airbrake : null,
    stageId:values.stageId || derived.stageId || 1, connected:!!values.connected,
    mission:el.cameraSequenceMissionName?.textContent || "FLASH7 MISSION",
    state:values.stateText || "--", countdown:(el.cameraHudTimerTag?.textContent || "T-") + " " + (el.cameraHudCountdown?.textContent || "00:00"),
    altitude:finite(values.altitudeM), speed:finite(values.speedMps), gforce:finite(values.gforceG),
    gyro:rates.map(finite), quick:buildDesktopSplitQuickData(snapshot,values),
    timeline:buildDesktopMissionTimeline(Object.assign({},getActiveGyroTelemetryData(snapshot.sample),values),{
      available:hasData && !!values.connected,
      singleStage:snapshot.sample?.simulation_profile === "araea_i_10000ft" || (!replaySourceActive && uiSettings.selectedMission === "araea_i"),
      countdownTotalMs:(Number(uiSettings.countdownSec) || 10)*1000
    }),
    linkQuality:buildDesktopSplitLinkQuality(includeHistory)
  };
}

function ensureDesktopSplitLink(){
  if(desktopSplitEntry.link) return;
  const key="flash7-display-session:"+new URL(".",document.baseURI).pathname;
  let session=desktopSplitEntry.session;
  try{if(!session) session=window.sessionStorage.getItem(key);}catch(_error){}
  if(!/^[a-f0-9]{32}$/.test(session)) session=window.Flash7.createSplitSessionId();
  try{window.sessionStorage.setItem(key,session);}catch(_error){}
  const url = new URL("split-display.html", document.baseURI);
  url.searchParams.set("v",window.__flashBoot?.version || "7");
  url.hash = "session=" + session;
  desktopSplitEntry.session = session;
  desktopSplitEntry.url = url.href;
  desktopSplitEntry.link = window.Flash7.createSplitLink(session, "host", (type, _payload, peer)=>{
    if(type === "ready"){
      const changed=desktopSplitEntry.peer!==peer;
      desktopSplitEntry.peer = peer;
      desktopSplitEntry.seenAt = Date.now();
      desktopSplitEntry.link.send("welcome", buildDesktopSplitSnapshot(true));
      desktopSplitEntry.allowed = true;
      document.getElementById("desktopSplitConnection").textContent = "2개 화면 연결됨";
      syncDesktopSplitEntry();
      if(changed) window.dispatchEvent(new Event("resize"));
    }else if(desktopSplitEntry.peer && desktopSplitEntry.peer !== peer){
      return;
    }else if(type === "alive"){
      desktopSplitEntry.seenAt = Date.now();
    }else if(type === "closed"){
      desktopSplitEntry.peer = null;
      desktopSplitEntry.seenAt = 0;
      document.getElementById("desktopSplitConnection").textContent = "보조 화면 연결 끊김";
    }
  });
  document.getElementById("splitEntryLink").value = url.href;
  desktopSplitEntry.discovery?.announce(session,desktopSplitEntry.link.id);
}

function startDesktopSplitLink(){
  ensureDesktopSplitLink();
  if(desktopSplitEntry.peer){syncDesktopSplitEntry();return;}
  document.getElementById("splitEntryStatus").textContent = "보조 화면 연결을 대기 중입니다.";
  setDesktopSplitMode("waiting");
}

function initDesktopSplitEntry(){
  if(desktopSplitEntry.scope) return;
  const root = document.getElementById("desktopSplitEntry");
  if(!root || !isDesktopLayout()) return;
  const scope = desktopSplitEntry.scope = window.Flash7.createScope("desktop-split-entry");
  window.Flash7.appScope.add(()=>scope.dispose());
  desktopSplitEntry.discovery=window.Flash7.createSplitDiscovery("host",requested=>{
    if(desktopSplitEntry.link && (!requested || requested===desktopSplitEntry.session)){
      desktopSplitEntry.discovery.announce(desktopSplitEntry.session,desktopSplitEntry.link.id);
    }
  });
  ensureDesktopSplitLink();
  scope.interval(()=>{
    if(desktopSplitEntry.link) desktopSplitEntry.discovery.announce(desktopSplitEntry.session,desktopSplitEntry.link.id);
  },1000);
  scope.listen(window, "resize", syncDesktopSplitEntry);
  scope.listen(window, "pagehide", closeDesktopSplitLink);
  scope.listen(window, "pageshow",event=>{if(event.persisted) ensureDesktopSplitLink();});
  scope.listen(document, "click", async event=>{
    const button = event.target.closest("[data-split-action]");
    if(!button) return;
    const action = button.dataset.splitAction;
    const error = document.getElementById("splitEntryError");
    error.textContent = "";
    if(action === "start"){
      try{ startDesktopSplitLink(); }
      catch(_error){ error.textContent = "화면 연결을 준비하지 못했습니다. 다시 시도해 주세요."; }
    }else if(action === "open"){
      ensureDesktopSplitLink();
      let popup=desktopSplitEntry.popup;
      if(!popup || popup.closed) popup=window.open("", "flash7-display-" + desktopSplitEntry.session, "popup,width=1280,height=800");
      if(popup){
        desktopSplitEntry.popup=popup;
        try{if(popup.location.href!==desktopSplitEntry.url) popup.location.href=desktopSplitEntry.url;}catch(_error){popup.location=desktopSplitEntry.url;}
        desktopSplitEntry.link.attachWindow(popup);popup.focus();
      }
      else error.textContent = "새 창이 차단되었습니다. 팝업을 허용하거나 링크를 복사해 열어주세요.";
    }else if(action === "copy"){
      try{
        await navigator.clipboard.writeText(desktopSplitEntry.url);
        document.getElementById("splitEntryStatus").textContent = "링크를 복사했습니다. 보조 화면 연결을 대기 중입니다.";
      }catch(_error){
        document.getElementById("splitEntryLink").select();
        error.textContent = "링크를 선택했습니다. 복사해서 새 창에서 열어주세요.";
      }
    }else if(action === "skip"){
      closeDesktopSplitLink();
      desktopSplitEntry.allowed = true;
      syncDesktopSplitEntry();
    }else if(action === "cancel"){
      closeDesktopSplitLink();
      setDesktopSplitMode("intro");
    }else if(action === "setup"){
      setAlarmHistoryOpen(false);
      setControlCenterOpen(false);
      ensureDesktopSplitLink();
      desktopSplitEntry.allowed = !!desktopSplitEntry.peer;
      setDesktopSplitMode(desktopSplitEntry.link ? "waiting" : "intro");
      syncDesktopSplitEntry();
    }
  });
  scope.listen(root, "keydown", event=>{
    if(event.key !== "Tab") return;
    const focusable = Array.from(root.querySelectorAll("button,input")).filter(node=>node.getClientRects().length);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if(event.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement))){ event.preventDefault();last?.focus(); }
    else if(!event.shiftKey && (document.activeElement === last || !focusable.includes(document.activeElement))){ event.preventDefault();first?.focus(); }
  });
  let lastSample = 0, lastSentAt = 0;
  scope.interval(()=>{
    if(!desktopSplitEntry.link || !desktopSplitEntry.peer) return;
    if(Date.now() - desktopSplitEntry.seenAt > 15000){
      desktopSplitEntry.peer = null;
      document.getElementById("desktopSplitConnection").textContent = "보조 화면 연결 끊김";
      return;
    }
    const snapshot = buildDesktopSplitSnapshot();
    if(snapshot.receivedAt !== lastSample || Date.now() - lastSentAt > 1000){
      desktopSplitEntry.link.send("snapshot", snapshot);
      lastSample = snapshot.receivedAt;
      lastSentAt = Date.now();
    }
  }, 100);
  scope.add(()=>{ closeDesktopSplitLink();desktopSplitEntry.discovery.close();desktopSplitEntry.discovery=null;desktopSplitEntry.scope = null; });
}
