/* Dock existing tool surfaces without replacing their controls or command lifecycle. */
const controlCenterSurfaceSpecs = Object.freeze({
  daqValveUnlockOverlay:{title:"밸브 제어 잠금 해제", close:"#daqValveUnlockCancel", width:400, contextual:true},
  settingsOverlay:{title:"설정", close:"#settingsClose", width:480, dismiss:()=>hideSettings()},
  loadcellOverlay:{title:"로드셀 보정", close:"#loadcellClose", width:440},
  chipTempOverlay:{title:"칩 온도", close:"#chipTempClose", width:480},
  perfOverlay:{title:"성능", close:"#perfClose", width:480},
  gpsHelpOverlay:{title:"GPS", close:"#gpsHelpCloseBtn", width:400},
  intelligentCalibrationOverlay:{title:"센서 보정", close:"#intelligentCalibrationCloseBtn", width:520},
  firmwareUpdateOverlay:{title:"펌웨어 업데이트", close:"#firmwareUpdateClose", width:520},
  flashLinkRoleConfigOverlay:{title:"통신 역할 설정", close:"#flashLinkRoleConfigCancel", width:460},
  flashLinkIdentityResetOverlay:{title:"장치 초기화", close:"#flashLinkIdentityResetCancel", width:420},
  connectMethodOverlay:{title:"연결 방식", close:"#connectMethodCancelBtn", width:400, contextual:true},
  wifiConnectOverlay:{title:"Wi-Fi 연결", close:"#wifiConnectCloseBtn", width:420, contextual:true},
  serialConnectOverlay:{title:"USB 연결", close:"#serialConnectCloseBtn", width:420, contextual:true},
  hardwareServoOverlay:{title:"서보 제어", close:"#hardwareServoClose", width:420},
  pyroControlOverlay:{title:"파이로 제어", close:"#pyroControlClose", width:420},
  dataListOverlay:{title:"저장공간", close:"#dataListCloseBtn", width:420},
  gyroZeroOverlay:{title:"자이로 영점", close:"#gyroZeroCancel", width:400},
  rebootConfirmOverlay:{title:"재부팅", close:"#rebootConfirmCancel", width:400},
  flashLinkReportOverlay:{title:"비행 보고서", close:"#flashLinkReportClose", width:460},
  dataResetConfirmOverlay:{title:"저장공간 초기화", close:"#dataResetCancelBtn", width:400},
  dataDownloadConfirmOverlay:{title:"기록 다운로드", close:"#dataDownloadConfirmCancel", width:400},
  storageDownloadProgressOverlay:{title:"다운로드", close:null, width:400},
  confirmOverlay:{title:"시퀀스 시작", close:"#confirmCancel", width:420, contextual:true},
  forceOverlay:{title:"강제 구동", close:"#forceConfirmCancel", width:420, contextual:true},
  missionForceOverlay:{title:"강제 미션", close:"#missionForceCancel", width:440, contextual:true},
  missionStandbyReviewOverlay:{title:"미션 대기", close:"#missionStandbyReviewCancel", width:440, contextual:true}
});
const controlCenterSurfaceStack = [];

function isControlCenterSurface(node){
  return controlCenterSurfaceStack.some(entry=>entry.node === node);
}
function hasControlCenterSurface(){ return controlCenterSurfaceStack.length > 0; }

function refreshControlCenterSurface(){
  const panel = document.getElementById("controlCenterPanel");
  if(!panel) return;
  const top = controlCenterSurfaceStack[controlCenterSurfaceStack.length - 1];
  const home = document.getElementById("controlCenterHome");
  const content = document.getElementById("controlCenterContent");
  const back = panel.querySelector('[data-control-center-action="back"]');
  const title = document.getElementById("controlCenterPageTitle");
  if(title) title.textContent = top ? top.spec.title : "제어 센터";
  if(home) home.hidden = !!top;
  if(content) content.hidden = !top;
  if(back){
    back.hidden = !top;
    back.setAttribute("aria-label", controlCenterSurfaceStack.length > 1 ? "이전 화면으로" : "제어 센터 메뉴로");
    back.disabled = !!top && !top.spec.close && !top.spec.dismiss;
  }
  const close = panel.querySelector(".control-center-close");
  if(close) close.disabled = !!top && !top.spec.close && !top.spec.dismiss;
  panel.classList.toggle("is-detail", !!top);
  if(top) panel.style.setProperty("--control-center-detail-width", top.spec.width + "px");
  else panel.style.removeProperty("--control-center-detail-width");
  controlCenterSurfaceStack.forEach(entry=>{
    const suspended = entry !== top;
    entry.node.classList.toggle("is-control-center-suspended", suspended);
    entry.node.inert = suspended;
    entry.node.setAttribute("aria-hidden", String(suspended));
  });
}

function mountControlCenterSurface(node){
  const spec = node && controlCenterSurfaceSpecs[node.id];
  const content = document.getElementById("controlCenterContent");
  if(!spec || !content || (spec.contextual && !controlCenterIsOpen())) return false;
  if(isControlCenterSurface(node)) return true;
  const dialog = node.querySelector('[role="dialog"], [role="alertdialog"]');
  controlCenterSurfaceStack.push({node, spec, parent:node.parentNode, next:node.nextSibling,
    dialog, modal:dialog && dialog.getAttribute("aria-modal"), inert:node.inert,
    focus:document.activeElement, scroll:el.controlCenterPanel.scrollTop, contentScroll:content.scrollTop});
  content.appendChild(node);
  node.classList.add("control-center-surface");
  if(dialog) dialog.setAttribute("aria-modal", "false");
  refreshControlCenterSurface();
  setControlCenterOpen(true);
  el.controlCenterPanel.scrollTop = 0;
  content.scrollTop = 0;
  return true;
}

function releaseControlCenterSurface(node){
  const index = controlCenterSurfaceStack.findIndex(entry=>entry.node === node);
  if(index < 0) return false;
  const wasTop = index === controlCenterSurfaceStack.length - 1;
  const entry = controlCenterSurfaceStack.splice(index, 1)[0];
  node.classList.remove("control-center-surface", "is-control-center-suspended");
  node.inert = entry.inert;
  if(entry.dialog){
    if(entry.modal == null) entry.dialog.removeAttribute("aria-modal");
    else entry.dialog.setAttribute("aria-modal", entry.modal);
  }
  if(entry.parent) entry.parent.insertBefore(node, entry.next && entry.next.parentNode === entry.parent ? entry.next : null);
  refreshControlCenterSurface();
  if(wasTop){
    el.controlCenterPanel.scrollTop = entry.scroll;
    document.getElementById("controlCenterContent").scrollTop = entry.contentScroll;
    if(entry.focus && entry.focus.isConnected && !entry.focus.closest('[hidden],.hidden,[inert]')){
      entry.focus.focus({preventScroll:true});
    }
  }
  return true;
}

function dismissControlCenterSurface(){
  const entry = controlCenterSurfaceStack[controlCenterSurfaceStack.length - 1];
  if(!entry) return true;
  if(entry.spec.dismiss){
    entry.spec.dismiss();
    return !isControlCenterSurface(entry.node);
  }
  const button = entry.spec.close && entry.node.querySelector(entry.spec.close);
  if(!button || button.disabled) return false;
  // Use the existing cancel/close path, including busy guards and pending promises.
  button.click();
  return !isControlCenterSurface(entry.node);
}

function navigateControlCenterBack(){
  const entry = controlCenterSurfaceStack[controlCenterSurfaceStack.length - 1];
  if(entry && entry.node.id === "dataListOverlay"){
    const back = entry.node.querySelector("#dataListBackBtn");
    if(back && !back.hidden && !back.disabled){
      back.click();
      return;
    }
  }
  dismissControlCenterSurface();
}

function dismissAllControlCenterSurfaces(){
  while(hasControlCenterSurface()){
    if(!dismissControlCenterSurface()) return false;
  }
  return true;
}
