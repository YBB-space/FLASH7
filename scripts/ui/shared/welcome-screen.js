/* Start views reuse the existing mission and replay controls without modal shells. */
let welcomeMissionSettingsState=null;
let welcomeReplayPickerState=null;
const welcomeConnectionSurfaces=new Map();
let welcomeBoardLink=null;
function recordWelcomeBoardLink(data,source){
  if(!data || !["SER","WS","WIFI"].includes(source)) return;
  welcomeBoardLink={
    role:normalizeFlashLinkRole(data.flash_link_role ?? data.fl_role ?? data.fl_role_code ?? (source==="SER" ? serialConnectedRole : "avionics")),
    linked:Number(data.fl_link ?? data.flash_link_connected ?? 0)===1,
    remoteValid:Number(data.fl_remote_valid ?? data.flash_link_remote_valid ?? 0)===1,
    source,session:serialSessionId,receivedAt:Date.now()
  };
}
function currentWelcomeBoardLink(){
  const link=welcomeBoardLink;
  if(!link || Date.now()-link.receivedAt>DISCONNECT_GRACE_MS) return null;
  if(serialEnabled ? link.source!=="SER" || link.session!==serialSessionId : link.source==="SER") return null;
  return link;
}
function isWelcomeStartVisible(){return !!el.welcomeConnectScreen && !el.welcomeConnectScreen.classList.contains("hidden");}
function mountWelcomeConnectionSurface(node){
  if(!isWelcomeStartVisible() || !["connectMethodOverlay","wifiConnectOverlay","serialConnectOverlay"].includes(node.id)) return false;
  if(!welcomeConnectionSurfaces.has(node)) welcomeConnectionSurfaces.set(node,{parent:node.parentNode,next:node.nextSibling});
  el.welcomeConnectScreen.appendChild(node);
  return true;
}
function releaseWelcomeConnectionSurface(node){
  const origin=welcomeConnectionSurfaces.get(node);
  if(!origin) return;
  if(origin.parent) origin.parent.insertBefore(node,origin.next && origin.next.parentNode===origin.parent ? origin.next : null);
  welcomeConnectionSurfaces.delete(node);
}
function setWelcomeStartView(view){
  const root=el.welcomeConnectScreen;
  if(!root) return;
  const next=["flight","simulation","replay","mission","fc"].includes(view) ? view : "flight";
  root.dataset.welcomeView=next;
  if(next!=="mission" && welcomeMissionSettingsState) finishWelcomeMissionSettings();
  if(next!=="replay" && welcomeReplayPickerState) setReplayDataPickerVisible(false);
  for(const [id,name] of [["welcomeSimulationChoices","simulation"],["welcomeReplayPane","replay"],["welcomeMissionPane","mission"],["welcomeFcGuide","fc"]]){
    const node=document.getElementById(id);if(node) node.hidden=next!==name;
  }
  for(const [id,name] of [["welcomeFlightBtn","flight"],["welcomeReplayBtn","replay"],["welcomeSimConnectBtn","simulation"]]){
    const node=document.getElementById(id);if(node) node.setAttribute("aria-pressed",String(next===name));
  }
  const simulation=document.getElementById("welcomeSimConnectBtn");
  if(simulation) simulation.setAttribute("aria-expanded",String(next==="simulation"));
  const mission=document.getElementById("welcomeMissionBtn");
  if(mission) mission.setAttribute("aria-expanded",String(next==="mission"));
  el.welcomeBoardSearchBtn?.setAttribute("aria-expanded",String(next==="fc"));
}
function openWelcomeFcGuide(){
  if(!isWelcomeStartVisible() || !isWelcomeConnectionReady()) return;
  setWelcomeStartView("fc");
  el.welcomeEnterGroundBtn?.focus({preventScroll:true});
}
function setWelcomeSimulationChoicesVisible(visible){
  setWelcomeStartView(visible ? "simulation" : "flight");
  const target=document.querySelector(visible ? '#welcomeSimulationChoices [data-simulation-mode]' : '#welcomeSimConnectBtn');
  if(target && isWelcomeStartVisible()) target.focus({preventScroll:true});
}
function selectWelcomeFlight(){
  setWelcomeStartView("flight");
  if(uiSettings && !isVerifiedBoardTransportConnected()){
    uiSettings.opMode="flight";setFlashLinkDisplayDataMode("flight");saveSettings();applySettingsToUI();
  }
  document.getElementById("welcomeFlightBtn")?.focus({preventScroll:true});
}
function openWelcomeMissionSettings(){
  if(!isWelcomeStartVisible() || welcomeBoardSearchBusy) return;
  setWelcomeStartView("mission");
  if(welcomeMissionSettingsState) return;
  const node=document.querySelector('.settings-panel[data-panel="sequence"]');
  const mount=document.getElementById("welcomeMissionMount");
  if(!node || !mount) return;
  welcomeMissionSettingsState={node,parent:node.parentNode,next:node.nextSibling,active:node.classList.contains("active")};
  mount.appendChild(node);node.classList.add("active");
  const note=document.getElementById("welcomeMissionNote");
  if(note) note.textContent="미션 선택은 자동으로 저장됩니다. 연결 전 설정은 이 기기에 저장되며, 보드 적용은 연결 후 확인해 주세요.";
  requestAnimationFrame(()=>{if(welcomeMissionSettingsState) el.missionProfileSelect?.focus({preventScroll:true});});
}
function finishWelcomeMissionSettings(){
  const state=welcomeMissionSettingsState;
  if(!state) return;
  welcomeMissionSettingsState=null;
  if(state.next && state.next.parentNode===state.parent) state.parent.insertBefore(state.node,state.next);
  else state.parent.appendChild(state.node);
  state.node.classList.toggle("active",state.active);
  if(el.welcomeConnectScreen.dataset.welcomeView==="mission"){
    setWelcomeStartView("flight");document.getElementById("welcomeMissionBtn")?.focus({preventScroll:true});
  }
}
function mountWelcomeReplayPicker(){
  if(!isWelcomeStartVisible()) return false;
  setWelcomeStartView("replay");
  if(welcomeReplayPickerState) return true;
  const node=el.replayDataPickerOverlay,mount=document.getElementById("welcomeReplayMount");
  if(!node || !mount) return false;
  const dialog=node.querySelector('[role="dialog"]');
  welcomeReplayPickerState={node,parent:node.parentNode,next:node.nextSibling,style:node.getAttribute("style"),dialog,role:dialog?.getAttribute("role"),modal:dialog?.getAttribute("aria-modal")};
  mount.appendChild(node);node.classList.add("is-welcome-inline");
  if(dialog){dialog.setAttribute("role","region");dialog.removeAttribute("aria-modal");}
  return true;
}
function unmountWelcomeReplayPicker(){
  const state=welcomeReplayPickerState;
  if(!state) return;
  welcomeReplayPickerState=null;
  state.node.classList.remove("is-welcome-inline");
  if(state.style==null) state.node.removeAttribute("style");else state.node.setAttribute("style",state.style);
  state.node.style.setProperty("display","none","important");
  if(state.next && state.next.parentNode===state.parent) state.parent.insertBefore(state.node,state.next);
  else state.parent.appendChild(state.node);
  if(state.dialog){
    for(const [key,value] of [["role",state.role],["aria-modal",state.modal]]){
      if(value==null) state.dialog.removeAttribute(key);else state.dialog.setAttribute(key,value);
    }
  }
  if(el.welcomeConnectScreen.dataset.welcomeView==="replay"){
    setWelcomeStartView("flight");if(isWelcomeStartVisible()) document.getElementById("welcomeReplayBtn")?.focus({preventScroll:true});
  }
}
function isWelcomeMissionLocalEdit(){return !!welcomeMissionSettingsState && !simEnabled && !isVerifiedBoardTransportConnected();}
function acknowledgeWelcomeMissionLocalSave(){
  if(!isWelcomeMissionLocalEdit()) return false;
  const note=document.getElementById("welcomeMissionNote");
  if(note) note.textContent="이 기기에 저장했습니다. 보드 적용은 기체 연결 후 설정에서 확인해 주세요.";
  return true;
}
