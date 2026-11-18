/* FLASH7 presentation: mobile/layout.js. Classic-script globals preserve the shared runtime contract. */
    let mobileControlsActive = false;
    let tabletControlsOpen = false;
    let intelligentMobileSessionActive = false;
    let intelligentMobilePreviousHudPreview = false;
    let intelligentMobileRequestedFullscreen = false;
    let intelligentMobileAutoEntering = false;

    function setIntelligentMobileReturnVisible(show){
      const next = !!show;
      document.documentElement.classList.toggle("intelligent-mobile-active", next);
      if(el.intelligentMobileReturn){
        el.intelligentMobileReturn.setAttribute("aria-hidden", next ? "false" : "true");
      }
    }

    function enterIntelligentMobileFromGyroPreview(){
      if(!uiSettings || !isPhoneLandscapeLayout()) return;
      const alreadyActive = intelligentMobileSessionActive && isPhoneLandscapeLayout();
      if(!intelligentMobileSessionActive){
        intelligentMobilePreviousHudPreview = !!uiSettings.mobileHudPreview;
      }
      intelligentMobileSessionActive = true;
      setIntelligentMobileReturnVisible(true);
      uiSettings.mobileHudPreview = true;
      if(el.mobileHudPreviewToggle) el.mobileHudPreviewToggle.checked = true;
      saveSettings();
      applySettingsToUI();
      if(!alreadyActive){
        showToast(t("intelligentMobileEnteredToast"), "info");
      }
      if(!alreadyActive && !isDocumentFullscreen()){
        requestDocumentFullscreen().then((ok)=>{
          intelligentMobileRequestedFullscreen = !!ok;
        });
      }
    }

    function exitIntelligentMobile(){
      if(!uiSettings) return;
      const shouldRestore = intelligentMobileSessionActive;
      intelligentMobileSessionActive = false;
      setIntelligentMobileReturnVisible(false);
      if(shouldRestore){
        uiSettings.mobileHudPreview = !!intelligentMobilePreviousHudPreview;
      }else{
        uiSettings.mobileHudPreview = false;
      }
      if(el.mobileHudPreviewToggle) el.mobileHudPreviewToggle.checked = !!uiSettings.mobileHudPreview;
      saveSettings();
      applySettingsToUI();
      if(intelligentMobileRequestedFullscreen && isDocumentFullscreen()){
        exitDocumentFullscreen();
      }
      intelligentMobileRequestedFullscreen = false;
    }

    function getFullscreenElement(){
      return document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null;
    }

    function isDocumentFullscreen(){
      return !!getFullscreenElement();
    }

    function requestDocumentFullscreen(){
      const root = document.documentElement;
      if(!root) return Promise.resolve(false);
      const fn = root.requestFullscreen || root.webkitRequestFullscreen || root.msRequestFullscreen;
      if(typeof fn !== "function") return Promise.resolve(false);
      try{
        const ret = fn.call(root);
        if(ret && typeof ret.then === "function"){
          return ret.then(()=>true).catch(()=>false);
        }
        return Promise.resolve(true);
      }catch(e){
        return Promise.resolve(false);
      }
    }

    function exitDocumentFullscreen(){
      const fn = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
      if(typeof fn !== "function") return Promise.resolve(false);
      try{
        const ret = fn.call(document);
        if(ret && typeof ret.then === "function"){
          return ret.then(()=>true).catch(()=>false);
        }
        return Promise.resolve(true);
      }catch(e){
        return Promise.resolve(false);
      }
    }

    function isMobileImmersiveEnabled(){
      return !!(uiSettings && uiSettings.mobileImmersive);
    }

    function shouldUseMobileImmersive(){
      if(!isMobileImmersiveEnabled()) return false;
      return document.documentElement.classList.contains("phone-landscape-layout");
    }

    function applyMobileImmersiveMode(fromUserGesture){
      if(shouldUseMobileImmersive()){
        if(!isDocumentFullscreen() && fromUserGesture){
          requestDocumentFullscreen();
        }
        return;
      }
      if(isDocumentFullscreen()){
        exitDocumentFullscreen();
      }
    }

    function syncMobileImmersiveToggleState(){
      if(!uiSettings || !el.mobileFullscreenToggle) return;
      if(uiSettings.mobileImmersive && !isDocumentFullscreen()){
        uiSettings.mobileImmersive = false;
        saveSettings();
      }
      el.mobileFullscreenToggle.checked = !!uiSettings.mobileImmersive;
    }

    function moveMobileControlsPanelToBody(){
      if(!el.mobileControlsPanel || mobileControlsPanelPortalState.mountedToBody) return;
      const parent = el.mobileControlsPanel.parentNode;
      if(!parent) return;
      mobileControlsPanelPortalState.homeParent = parent;
      mobileControlsPanelPortalState.homeNextSibling = el.mobileControlsPanel.nextSibling;
      document.body.appendChild(el.mobileControlsPanel);
      mobileControlsPanelPortalState.mountedToBody = true;
    }

    function restoreMobileControlsPanelFromBody(){
      if(!el.mobileControlsPanel || !mobileControlsPanelPortalState.mountedToBody) return;
      const parent = mobileControlsPanelPortalState.homeParent;
      const nextSibling = mobileControlsPanelPortalState.homeNextSibling;
      if(parent){
        if(nextSibling && nextSibling.parentNode === parent){
          parent.insertBefore(el.mobileControlsPanel, nextSibling);
        }else{
          parent.appendChild(el.mobileControlsPanel);
        }
      }
      mobileControlsPanelPortalState.homeParent = null;
      mobileControlsPanelPortalState.homeNextSibling = null;
      mobileControlsPanelPortalState.mountedToBody = false;
    }

    function isMobileLauncherPanelVisible(){
      return !!(el.mobileControlsPanel && el.mobileControlsPanel.classList.contains("is-launcher-view"));
    }

    function isMobileMissionPanelVisible(){
      return !!(el.mobileControlsPanel && el.mobileControlsPanel.classList.contains("is-mission-view"));
    }

    function isMobileInspectionPanelVisible(){
      return !!(el.mobileControlsPanel && el.mobileControlsPanel.classList.contains("is-inspection-view"));
    }

    function isMobileServoPanelVisible(){
      return !!(el.mobileControlsPanel && el.mobileControlsPanel.classList.contains("is-servo-view"));
    }

    function setMobileLauncherPanelVisible(show){
      if(!el.mobileControlsPanel) return;
      const next = !!show;
      if(next){
        setMobileMissionPanelVisible(false);
        setMobileInspectionPanelVisible(false);
        setMobileServoPanelVisible(false);
      }
      el.mobileControlsPanel.classList.toggle("is-launcher-view", next);
      if(el.mobileLauncherPanel){
        el.mobileLauncherPanel.setAttribute("aria-hidden", next ? "false" : "true");
      }
      syncControlsPanelTitle();
      updateNavActionState();
    }

    function setMobileMissionPanelVisible(show){
      if(!el.mobileControlsPanel) return;
      if(show && isFlightModeUi()) return;
      const next = !!show;
      if(next){
        setMobileLauncherPanelVisible(false);
        setMobileInspectionPanelVisible(false);
        setMobileServoPanelVisible(false);
        setOverlayVisible(el.missionOverlay, false);
        resetMissionToPresetList();
      }
      el.mobileControlsPanel.classList.toggle("is-mission-view", next);
      if(el.mobileMissionPanel){
        el.mobileMissionPanel.setAttribute("aria-hidden", next ? "false" : "true");
      }
      syncControlsPanelTitle();
      updateNavActionState();
    }

    function setMobileInspectionPanelVisible(show){
      if(!el.mobileControlsPanel) return;
      const next = !!show;
      if(next){
        setMobileLauncherPanelVisible(false);
        setMobileMissionPanelVisible(false);
        setMobileServoPanelVisible(false);
        setOverlayVisible(el.inspectionOverlay, false);
      }
      el.mobileControlsPanel.classList.toggle("is-inspection-view", next);
      if(el.mobileInspectionPanel){
        el.mobileInspectionPanel.setAttribute("aria-hidden", next ? "false" : "true");
      }
      syncControlsPanelTitle();
      updateNavActionState();
    }

    function setMobileServoPanelVisible(show){
      if(!el.mobileControlsPanel) return;
      const next = !!show;
      if(next){
        setMobileLauncherPanelVisible(false);
        setMobileMissionPanelVisible(false);
        setMobileInspectionPanelVisible(false);
        setOverlayVisible(el.hardwareServoOverlay, false);
        if(el.hardwareServoDialog && el.mobileServoPanelMount){
          mountDialogToPanel(el.hardwareServoDialog, el.mobileServoPanelMount, servoDialogDockState);
        }
      }else if(el.hardwareServoDialog && el.mobileServoPanelMount && el.hardwareServoDialog.parentNode === el.mobileServoPanelMount){
        restoreDialogFromPanel(el.hardwareServoDialog, servoDialogDockState);
      }
      el.mobileControlsPanel.classList.toggle("is-servo-view", next);
      if(el.mobileServoPanel){
        el.mobileServoPanel.setAttribute("aria-hidden", next ? "false" : "true");
      }
      syncControlsPanelTitle();
      updateNavActionState();
      if(next){
        fetchServoInfo();
      }
    }

    function applyTabletControlsLayout(){
      if(!el.controlsCard) return;
      const active = isTabletControlsLayout();
      document.documentElement.classList.toggle("tablet-controls-layout", active);
      document.documentElement.classList.toggle("tablet-controls-open", active && tabletControlsOpen);
      if(!active){
        tabletControlsOpen = false;
        el.controlsCard.classList.remove("tablet-collapsed");
        el.controlsCard.setAttribute("aria-expanded", "true");
        document.documentElement.classList.remove("tablet-controls-open");
        resetControlsModesOnClose();
        setTimeout(()=>{
          refreshChartLayout();
          redrawCharts();
        }, 0);
        updateControlAccessUI(currentSt);
        updateNavActionState();
        updateTabletAbortButton();
        return;
      }
      el.controlsCard.classList.toggle("tablet-collapsed", !tabletControlsOpen);
      el.controlsCard.setAttribute("aria-expanded", tabletControlsOpen ? "true" : "false");
      setTimeout(()=>{
        refreshChartLayout();
        redrawCharts();
      }, 0);
      updateControlAccessUI(currentSt);
      updateNavActionState();
      updateTabletAbortButton();
    }

    function showTabletControlsPanel(){
      if(!isTabletControlsLayout()) return;
      closeIgnitionModals();
      tabletControlsOpen = true;
      applyTabletControlsLayout();
    }

    function hideTabletControlsPanel(){
      if(!isTabletControlsLayout()) return;
      tabletControlsOpen = false;
      resetControlsModesOnClose();
      applyTabletControlsLayout();
    }

    function applyPhoneLandscapeLayout(){
      const active = isForcedMobileHudPreview() || (PHONE_LANDSCAPE_MEDIA.matches && isTouchCapableDevice());
      const wasActive = document.documentElement.classList.contains("phone-landscape-layout");
      document.documentElement.classList.toggle("phone-landscape-layout", active);
      if(active && !wasActive){
        setMissionPanelVisible(false);
        setInspectionPanelVisible(false);
        setMobileServoPanelVisible(false);
      }
      if(active){

        moveMobileControlsPanelToBody();
        if(!intelligentMobileSessionActive && !intelligentMobileAutoEntering){
          intelligentMobileAutoEntering = true;
          requestAnimationFrame(()=>{
            intelligentMobileAutoEntering = false;
            if(isPhoneLandscapeLayout() && isMobileLayout()){
              enterIntelligentMobileFromGyroPreview();
            }
          });
        }else if(intelligentMobileSessionActive){
          setIntelligentMobileReturnVisible(true);
        }
      }else{
        if(intelligentMobileSessionActive){
          exitIntelligentMobile();
        }else{
          setIntelligentMobileReturnVisible(false);
        }
        setMobileLauncherPanelVisible(false);
        setMobileMissionPanelVisible(false);
        setMobileInspectionPanelVisible(false);
        setMobileServoPanelVisible(false);

        restoreMobileControlsPanelFromBody();
      }
      if(active && isGyroViewportExpanded()){
        setGyroViewportExpanded(false);
      }
      if(wasActive !== active){
        setTimeout(()=>{
          resizeGyroGl();
          if(gyroGl){
            renderGyroGl(gyroPitchDeg, gyroYawDeg, gyroRollDeg);
          }
          renderGyroPreview(gyroPitchDeg, gyroYawDeg, gyroRollDeg);
          renderNavBallPreview(gyroPitchDeg, gyroYawDeg, gyroRollDeg);
          scheduleStatusMapRefresh();
          refreshChartLayout();
          redrawCharts();
          syncExpandedHud();
        }, 0);
      }else if(active){
        setTimeout(()=>{
          scheduleStatusMapRefresh();
          syncExpandedHud();
        }, 0);
      }
      updateNavActionState();
      updateTabletAbortButton();
      applyMobileImmersiveMode(false);
      syncControlsToggleButtonsForSettings();
      syncStatusMapInteractionMode();
      syncWelcomeConnectScreen(connOk || serialConnected || wsConnected);
      if(!active && !isMobileLayout()){
        hideMobileControlsPanel();
      }
    }

    function showMobileControlsPanel(){
      if(!el.mobileControlsPanel || mobileControlsActive) return;
      closeIgnitionModals();
      updateMobileControlPills();
      syncMobileControlButtons();
      updateMobileSequenceStatusLabel(sequenceActive, currentSt, lockoutLatched);
      setMobileLauncherPanelVisible(false);
      setMobileMissionPanelVisible(false);
      setMobileInspectionPanelVisible(false);
      setMobileServoPanelVisible(false);
      mobileControlsActive = true;
      el.mobileControlsPanel.classList.add("is-open");
      el.mobileControlsPanel.setAttribute("aria-hidden","false");
      document.documentElement.classList.add("mobile-controls-active");
    }

    function hideMobileControlsPanel(){
      if(!el.mobileControlsPanel || !mobileControlsActive) return;
      setMobileLauncherPanelVisible(false);
      setMobileMissionPanelVisible(false);
      setMobileInspectionPanelVisible(false);
      setMobileServoPanelVisible(false);
      mobileControlsActive = false;
      el.mobileControlsPanel.classList.remove("is-open");
      el.mobileControlsPanel.setAttribute("aria-hidden","true");
      document.documentElement.classList.remove("mobile-controls-active");
    }

    function updateMobileControlPills(){
      if(!el.mobileControlsPanel) return;
      const setMobileQuickIconTone = (type, toneClass)=>{
        if(!el.mobileControlButtonMap) return;
        const btn = el.mobileControlButtonMap[type];
        if(!btn || !btn.querySelector) return;
        const icon = btn.querySelector(".mobile-quick-icon");
        if(!icon) return;
        icon.classList.remove("tone-green", "tone-red", "tone-gray", "tone-blue");
        if(toneClass) icon.classList.add(toneClass);
      };
      const setMobileQuickPillTone = (node, tone)=>{
        if(!node) return;
        node.classList.remove("pill-green", "pill-red", "pill-gray");
        node.classList.add("mobile-quick-state", "pill");
        if(tone) node.classList.add(tone);
      };
      const serialPill = el.mobileControlPills ? el.mobileControlPills.serial : null;
      if(serialPill){
        const mode = getConnectTransportMode();
        const serialLabel = (mode === "wifi")
          ? t("modeWifi")
          : (serialConnected ? t("serialConnected") : t("serialDisconnected"));
        serialPill.textContent = serialLabel;
        if(mode === "wifi"){
          setMobileQuickPillTone(serialPill, "pill-gray");
          setMobileQuickIconTone("serial", "tone-blue");
        }else{
          setMobileQuickPillTone(serialPill, serialConnected ? "pill-green" : "pill-red");
          setMobileQuickIconTone("serial", serialConnected ? "tone-green" : "tone-red");
        }
      }
      const safetyPill = el.mobileControlPills ? el.mobileControlPills.safety : null;
      if(safetyPill){
        const safetyOn = el.safeModeToggle ? el.safeModeToggle.checked : safetyModeEnabled;
        safetyPill.textContent = safetyOn ? "ON" : "OFF";
        setMobileQuickPillTone(safetyPill, safetyOn ? "pill-green" : "pill-gray");
        setMobileQuickIconTone("safety", safetyOn ? "tone-green" : "tone-gray");
      }
      const inspectionPill = el.mobileControlPills ? el.mobileControlPills.inspection : null;
      if(inspectionPill){
        let tone = "pill-gray";
        let label = t("inspectionWait");
        if(inspectionState === "passed"){
          tone = "pill-green";
          label = t("inspectionOk");
        }else if(inspectionState === "failed"){
          tone = "pill-red";
          label = t("inspectionNeed");
        }else if(inspectionRunning){
          label = t("inspectionRunningLabel");
        }
        inspectionPill.textContent = label;
        setMobileQuickPillTone(inspectionPill, tone);
        setMobileQuickIconTone("inspection", tone === "pill-green" ? "tone-green" : (tone === "pill-red" ? "tone-red" : "tone-gray"));
      }
    }

    function setMobileControlButtonState(type, disabled){
      if(!el.mobileControlButtonMap) return;
      const btn = el.mobileControlButtonMap[type];
      if(!btn) return;
      btn.disabled = !!disabled;
      btn.classList.toggle("disabled", !!disabled);
      btn.setAttribute("aria-disabled", disabled ? "true" : "false");
    }

    function syncMobileControlButtons(){
      if(!el.mobileControlButtonMap) return;
      const sequenceDisabled = !!(el.igniteBtn && el.igniteBtn.disabled);
      const mobileSequenceBlocked = !!(replaySourceActive || lockoutLatched || sequenceActive || isFirmwareSequenceRunningState(currentSt) || localTplusActive || userWaitingLocal || inspectionRunning || safetyModeEnabled);
      const inspectionDisabled = !!(inspectionRunning || replaySourceActive);
      setMobileControlButtonState("sequence", sequenceDisabled);
      setMobileControlButtonState("inspection", inspectionDisabled);
      if(el.mobileSequenceWideBtn){
        el.mobileSequenceWideBtn.disabled = mobileSequenceBlocked;
        el.mobileSequenceWideBtn.classList.toggle("disabled", mobileSequenceBlocked);
        el.mobileSequenceWideBtn.setAttribute("aria-disabled", mobileSequenceBlocked ? "true" : "false");
      }
      syncMobileSequencePrimaryLabels();
    }

    function updateMobileArmLockWideButton(){
      const inFlightMode = isFlightModeUi();
      if(el.mobileArmLockWideBtn){
        const hasArmLockToggle = !!el.armLockToggle;
        const active = !!(inFlightMode && hasArmLockToggle && el.armLockToggle.checked);
        const visible = inFlightMode && hasArmLockToggle;
        el.mobileArmLockWideBtn.classList.toggle("hidden", !visible);
        const disabled = !visible;
        el.mobileArmLockWideBtn.disabled = disabled;
        el.mobileArmLockWideBtn.classList.toggle("disabled", disabled);
        el.mobileArmLockWideBtn.classList.toggle("is-active", active);
        el.mobileArmLockWideBtn.setAttribute("aria-hidden", visible ? "false" : "true");
        el.mobileArmLockWideBtn.setAttribute("aria-disabled", disabled ? "true" : "false");
        el.mobileArmLockWideBtn.title = visible
          ? (active ? "ARM ON LOCK 켜짐 (터치하면 해제)" : "ARM ON LOCK 해제 (스위치 따름)")
          : "Flight 모드에서만 사용 가능합니다.";
      }
      if(el.mobileMissionWideBtn){
        const missionVisible = !inFlightMode;
        el.mobileMissionWideBtn.classList.toggle("hidden", !missionVisible);
        el.mobileMissionWideBtn.disabled = !missionVisible;
        el.mobileMissionWideBtn.classList.toggle("disabled", !missionVisible);
        el.mobileMissionWideBtn.setAttribute("aria-hidden", missionVisible ? "false" : "true");
        el.mobileMissionWideBtn.setAttribute("aria-disabled", missionVisible ? "false" : "true");
        el.mobileMissionWideBtn.title = missionVisible ? "" : "Flight 모드에서는 미션 프로필을 사용할 수 없습니다.";
      }
      updateMobileDashboardSafetyArmState();
    }

    function updateMobileDashboardSafetyArmState(){
      const safetyBtn = document.getElementById("mobileSafetyModeBtn");
      const armBtn = document.getElementById("mobileArmUnlockBtn");
      const safetyOn = !!(el.safeModeToggle && el.safeModeToggle.checked);
      const armLocked = !!(el.armLockToggle && el.armLockToggle.checked);
      if(safetyBtn){
        safetyBtn.classList.toggle("is-active", safetyOn);
        safetyBtn.setAttribute("aria-pressed", safetyOn ? "true" : "false");
      }
      if(armBtn){
        armBtn.classList.toggle("is-locked", armLocked);
        armBtn.setAttribute("aria-pressed", armLocked ? "true" : "false");
        armBtn.setAttribute("aria-label", armLocked ? "ARM 잠김, 누르면 해제" : "ARM 해제");
        const label = armBtn.querySelector(".mobile-device-control-label");
        if(label) label.textContent = armLocked ? "ARM 잠김" : "ARM 해제";
      }
    }

    function shouldShowTabletAbortButton(){
      if(!isTabletControlsLayout() || !el.tabletAbortBtn) return false;
      return sequenceActive || isFirmwareSequenceRunningState(currentSt) || localTplusActive || tplusUiActive;
    }

    function updateTabletAbortButton(){
      if(!el.tabletAbortBtn) return;
      const show = shouldShowTabletAbortButton();
      el.tabletAbortBtn.classList.toggle("hidden", !show);
      el.tabletAbortBtn.disabled = !!(el.abortBtn && el.abortBtn.disabled);
    }

    async function startSequenceFromMobileCard(){
      if(sequenceActive || isFirmwareSequenceRunningState(currentSt) || localTplusActive){
        return;
      }
      const storageGuard = getSequenceStorageGuard();
      if(storageGuard.blocked){
        showSequenceStorageGuardToast(true);
        setButtonsFromState(currentSt, lockoutLatched, sequenceActive);
        return;
      }
      if(lockoutLatched){
        showToast(t("lockoutNoControl"), "error");
        return;
      }
      if(!connOk && !simEnabled){
        showToast(t("inspectionOpenToast"), "notice");
        return;
      }
      if(!isControlUnlocked()){
        const passed = await runInspectionSequence();
        if(!passed) return;
        setButtonsFromState(currentSt, lockoutLatched, sequenceActive);
        return;
      }
      setButtonsFromState(currentSt, lockoutLatched, sequenceActive);
      if(el.igniteBtn && !el.igniteBtn.disabled){
        el.igniteBtn.click();
      }else if(currentSt === 0){
        showConfirm();
      }
    }

    function pauseSequenceFromMobileCard(){
      if(lockoutLatched) return;
      if(currentSt === 2 || currentSt === 3 || localTplusActive){
        showToast("T+ 진행 중에는 일시중지 대신 중단만 가능합니다.", "notice");
        return;
      }
      const cdMs = Math.max(3000, Math.min(60000, ((uiSettings ? uiSettings.countdownSec : 10) * 1000)));
      userWaitingLocal = true;
      sendCommand({http:"/precount?uw=1&cd="+cdMs, ser:"PRECOUNT 1 "+cdMs}, false);
      showToast("시퀀스 일시중지 요청 전송됨", "info", {key:"mobile-sequence-pause"});
    }

    function stopSequenceFromMobileCard(){
      if(el.abortBtn && !el.abortBtn.disabled){
        el.abortBtn.click();
        return;
      }
      if(sequenceActive || isFirmwareSequenceRunningState(currentSt) || localTplusActive || userWaitingLocal){
        lastAbortReason = "user";
        sendCommand({http:"/abort", ser:"ABORT"}, true);
        showToast(t("abortRequestedToast", {safety:safetyLineSuffix()}), "error");
        hideConfirm();
        return;
      }
      showToast("진행 중인 시퀀스 없음", "notice", {key:"mobile-sequence-stop-idle"});
    }
