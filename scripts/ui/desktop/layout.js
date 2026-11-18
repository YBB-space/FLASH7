/* FLASH7 presentation: desktop/layout.js. Classic-script globals preserve the shared runtime contract. */
    const desktopSystemClockFormatter = new Intl.DateTimeFormat("ko-KR", {
      timeZone:"Asia/Seoul", month:"numeric", day:"numeric", weekday:"short",
      hour:"numeric", minute:"2-digit", second:"2-digit", hour12:true
    });
    function updateDesktopSystemClock(now = new Date()){
      if(!el.cameraSystemClock) return;
      const parts = Object.fromEntries(desktopSystemClockFormatter.formatToParts(now).map(part=>[part.type, part.value]));
      el.cameraSystemClock.textContent = parts.month + "월 " + parts.day + "일 (" + parts.weekday + ") " +
        parts.dayPeriod + " " + parts.hour + ":" + parts.minute + ":" + parts.second;
      el.cameraSystemClock.dateTime = now.toISOString();
    }

    // Move the live flight HUD, retaining its data bindings and button handlers.
    // Keep the map's own return mount outside this portal to avoid a DOM cycle.
    const desktopMapFlightHudPortal = [];
    function syncDesktopMapFlightHud(){
      const mount = document.getElementById("cameraMapFlightHudMount");
      const active = !!mount && isDesktopLayout() && isStatusMapViewportExpanded() &&
        document.body.classList.contains("camera-view-active");
      if(active && !desktopMapFlightHudPortal.length){
        ["#cameraSystemStatusBar", ".camera-flight-instruments", ".camera-sequence-heading"].forEach(selector=>{
          const node = document.querySelector(selector);
          if(!node || !node.parentNode) return;
          desktopMapFlightHudPortal.push({node, parent:node.parentNode, next:node.nextSibling});
          mount.appendChild(node);
        });
      }else if(!active){
        desktopMapFlightHudPortal.splice(0).reverse().forEach(({node, parent, next})=>{
          parent.insertBefore(node, next && next.parentNode === parent ? next : null);
        });
      }
      if(mount) mount.hidden = !active;
    }

    let dashboardDrawerHideTimer = 0;
    function restoreGyroViewportFromDesktopPreview(){
      if(!el.gyro3dViewport || !desktopGyroPreviewPortalState.mounted) return;
      const parent = desktopGyroPreviewPortalState.homeParent;
      const nextSibling = desktopGyroPreviewPortalState.homeNextSibling;
      if(parent){
        if(nextSibling && nextSibling.parentNode === parent){
          parent.insertBefore(el.gyro3dViewport, nextSibling);
        }else{
          parent.appendChild(el.gyro3dViewport);
        }
      }
      el.gyro3dViewport.classList.remove("is-desktop-preview-mounted");
      desktopGyroPreviewPortalState.homeParent = null;
      desktopGyroPreviewPortalState.homeNextSibling = null;
      desktopGyroPreviewPortalState.mounted = false;
    }

    function syncDesktopGyroPreviewMount(){
      // The dashboard now dedicates this space to vehicle status. The same
      // renderer is still portaled into the camera view when that page opens.
      restoreGyroViewportFromDesktopPreview();
    }
    function positionDesktopNavAbortButton(){
      if(!el.desktopNavAbortBtn || window.innerWidth <= 900) return;
      el.desktopNavAbortBtn.style.removeProperty("top");
      el.desktopNavAbortBtn.style.removeProperty("right");
    }

    function updateDesktopNavAbortButton(){
      if(!el.desktopNavAbortBtn) return;
      const disabled = !el.abortBtn || !!el.abortBtn.disabled;
      const sequenceConfirmOpen = !!(
        confirmOverlayEl &&
        !confirmOverlayEl.classList.contains("hidden") &&
        confirmOverlayEl.getAttribute("aria-hidden") !== "true"
      );
      const visible = !sequenceConfirmOpen && !missionStandbyUiActive && !!(
        virtualMissionActive || sequenceActive ||
        isFirmwareSequenceRunningState(currentSt) ||
        localTplusActive || tplusUiActive || isAraeaSimulationRunning()
      );
      el.desktopNavAbortBtn.disabled = disabled;
      el.desktopNavAbortBtn.classList.toggle("is-visible", visible);
      el.desktopNavAbortBtn.classList.toggle("is-active", visible && !disabled);
      const isStop = tplusUiActive || isFirmwareTplusState(currentSt) || localTplusActive;
      const label = isAraeaSimulationRunning() ? "비행 시뮬레이션 중단" : isStop ? "시퀀스 종료" : "시퀀스 중단";
      const text=el.desktopNavAbortBtn.querySelector(".desktop-nav-abort-label");
      if(text) text.textContent=isStop && !isAraeaSimulationRunning() ? "END SEQUENCE" : "ABORT";
      el.desktopNavAbortBtn.setAttribute("aria-label", label);
      el.desktopNavAbortBtn.setAttribute("title", label);
      if(visible) positionDesktopNavAbortButton();
    }

    function isDesktopControlDrawerOpen(){
      return !isMobileLayout() && document.documentElement.classList.contains("control-drawer-open");
    }

    function setDesktopControlDrawerOpen(open){
      const next = !!open && !isMobileLayout();
      if(el.controlsOverlay && !el.controlsOverlay.classList.contains("hidden") && controlsCardParent){
        el.controlsOverlay.classList.add("hidden");
        if(controlsCardNext && controlsCardNext.parentNode === controlsCardParent){
          controlsCardParent.insertBefore(el.controlsCard, controlsCardNext);
        }else if(el.controlsCard){
          controlsCardParent.appendChild(el.controlsCard);
        }
        if(el.controlsOverlayClose) el.controlsOverlay.appendChild(el.controlsOverlayClose);
      }
      if(next && el.desktopControlDrawerMount && el.controlsCard &&
         el.controlsCard.parentNode !== el.desktopControlDrawerMount){
        el.desktopControlDrawerMount.appendChild(el.controlsCard);
      }
      document.documentElement.classList.toggle("control-drawer-open", next);
      document.body.classList.toggle("control-drawer-open", next);
      if(el.controlsCard){
        el.controlsCard.classList.toggle("control-drawer-card", next);
        el.controlsCard.setAttribute("aria-expanded", next ? "true" : "false");
      }
      if(el.desktopControlDrawerMount){
        el.desktopControlDrawerMount.setAttribute("aria-hidden", next ? "false" : "true");
      }
      if(!next) resetControlsModesOnClose();
      updateNavActionState();
      requestAnimationFrame(()=>{
        refreshChartLayout();
        redrawCharts();
      });
    }

    function toggleDesktopControlDrawer(){
      setDesktopControlDrawerOpen(!isDesktopControlDrawerOpen());
    }

    function setDashboardDrawerOpen(open, immediate){
      if(!el.dashboardView || !isDesktopLayout()) return;
      clearTimeout(dashboardDrawerHideTimer);
      if(open){
        el.dashboardView.classList.remove("hidden");
        el.dashboardView.setAttribute("aria-hidden", "false");
        document.body.classList.add("dashboard-view-active");
        requestAnimationFrame(()=>{
          document.body.classList.add("dashboard-drawer-open");
          syncChartHeightToControls(0);
          scheduleStatusMapRefresh();
          resizeGyroGl();
          if(gyroGl) renderGyroGl(gyroPitchDeg, gyroYawDeg, gyroRollDeg);
        });
        return;
      }
      document.body.classList.remove("dashboard-drawer-open");
      document.body.classList.remove("dashboard-view-active");
      const finish = ()=>{
        if(document.body.classList.contains("camera-view-active")){
          el.dashboardView.classList.add("hidden");
          el.dashboardView.setAttribute("aria-hidden", "true");
        }
      };
      if(immediate) finish();
      else dashboardDrawerHideTimer = setTimeout(finish, 360);
    }
