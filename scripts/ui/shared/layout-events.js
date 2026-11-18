/* FLASH7 presentation lifecycle. Coalesce viewport work without delaying telemetry or commands. */
let platformLayoutEventsBound = false;

function bindPlatformLayoutEvents(scope){
  if(platformLayoutEventsBound) return;
  platformLayoutEventsBound = true;
  let frame = 0;
  let tabletChanged = false;
  let mobilePanelChanged = false;
  let disposed = false;

  function refreshLayout(){
    frame = 0;
    if(disposed) return;
    if(mobilePanelChanged && !MOBILE_PANEL_MEDIA.matches) hideMobileControlsPanel();
    if(tabletChanged) applyTabletControlsLayout();
    mobilePanelChanged = false;
    tabletChanged = false;
    applyPhoneLandscapeLayout();
    syncDesktopGyroPreviewMount();
    syncCameraMapPreviewMount();
    syncMobileMapPreviewMount();
    resizeMobileMockup3d();
    if(gyroGl){
      resizeGyroGl();
      renderGyroGl(gyroPitchDeg, gyroYawDeg, gyroRollDeg);
    }
    refreshChartLayout();
    scheduleStatusMapRefresh();
    renderChipTempModal();
    syncWelcomeConnectScreen(connOk || serialConnected || wsConnected);
  }

  function scheduleLayout(){
    if(!disposed && !frame) frame = requestAnimationFrame(refreshLayout);
  }

  function listen(target, type, callback){
    target.addEventListener(type, callback);
    scope.add(()=>target.removeEventListener(type, callback));
  }

  function listenMedia(media, callback){
    if(media.addEventListener){
      listen(media, "change", callback);
    }else if(media.addListener){
      media.addListener(callback);
      scope.add(()=>media.removeListener(callback));
    }
  }

  listenMedia(MOBILE_PANEL_MEDIA, ()=>{
    mobilePanelChanged = true;
    scheduleLayout();
  });
  listenMedia(PHONE_LANDSCAPE_MEDIA, scheduleLayout);
  listenMedia(DESKTOP_LAYOUT_MEDIA, scheduleLayout);
  listenMedia(TABLET_CONTROLS_MEDIA, ()=>{
    tabletChanged = true;
    scheduleLayout();
  });
  listen(window, "resize", scheduleLayout);
  listen(window, "orientationchange", scheduleLayout);
  ["fullscreenchange", "webkitfullscreenchange", "MSFullscreenChange"].forEach(type=>{
    listen(document, type, syncMobileImmersiveToggleState);
  });
  scope.add(()=>{
    disposed = true;
    if(frame) cancelAnimationFrame(frame);
    platformLayoutEventsBound = false;
  });
}
