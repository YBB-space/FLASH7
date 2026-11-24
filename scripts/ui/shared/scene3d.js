/* Shared 3D presentation controls. Camera choices never change telemetry or trajectory units. */
const gyroSceneView = {
  mode:"vehicle", preset:"orbit", grid:true, autoFrame:true, userAdjusted:false,
  anchor:{x:0, y:0, z:0}, frame:0, animateUntil:0,
  dollyZoom:false, orbitReferenceDistance:1.95, flightFrameDistance:0, metersPerUnit:GYRO_TRAIL_BASE_METERS_PER_UNIT
};
const GYRO_SCENE_FOV_DEG = 56;
const GYRO_SCENE_ZOOM_MAX = 22.5;
const GYRO_SCENE_FRAME_MAX = 500;
const GYRO_SCENE_CAMERA_FLOOR = 0.08;

function getGyroSceneMetersPerUnit(value){
  const units=Number(value);return Number.isFinite(units)?Math.max(GYRO_TRAIL_BASE_METERS_PER_UNIT,units):GYRO_TRAIL_BASE_METERS_PER_UNIT;
}
function getGyroSceneUnitRatio(){return GYRO_TRAIL_BASE_METERS_PER_UNIT/getGyroSceneMetersPerUnit(gyroSceneView.metersPerUnit);}
function getGyroSceneCameraFloor(){return GYRO_SCENE_CAMERA_FLOOR*getGyroSceneUnitRatio();}
function rebaseGyroSceneUnits(nextUnits){
  const next=getGyroSceneMetersPerUnit(nextUnits),previous=getGyroSceneMetersPerUnit(gyroSceneView.metersPerUnit);
  if(next===previous)return false;
  const ratio=previous/next;
  for(const key of ['distance','desiredDistance','targetX','targetY','targetZ','panX','panY','panZ'])if(Number.isFinite(gyroCameraState[key]))gyroCameraState[key]*=ratio;
  for(const key of ['x','y','z'])gyroSceneView.anchor[key]*=ratio;
  gyroSceneView.orbitReferenceDistance*=ratio;gyroSceneView.flightFrameDistance*=ratio;gyroSceneView.metersPerUnit=next;return true;
}
function getGyroSceneRocketScale(metersPerUnit){
  const scale=getGyroSceneMetersPerUnit(metersPerUnit);
  // The vehicle and path use the same meters-per-world-unit at every flight scale.
  return getGyroRocketActualHeightM()/(GYRO_ROCKET_TARGET_LENGTH*scale);
}

function getGyroSceneStrokeHalfWidth(point,view,viewportHeight,pixels){
  const depth=Math.max(1e-8,-(view[2]*point.x+view[6]*point.y+view[10]*point.z+view[14]));
  return Math.max(1e-10,depth*Math.tan(GYRO_SCENE_FOV_DEG*DEG_TO_RAD*.5)*pixels/Math.max(1,viewportHeight));
}
function getGyroSceneLaunchOffset(metersPerUnit){
  const units=getGyroSceneMetersPerUnit(metersPerUnit);
  return (getGyroRocketActualHeightM()*.5+.05)/units;
}
function getGyroSceneVehicleLift(scale,altitude,metersPerUnit=GYRO_TRAIL_BASE_METERS_PER_UNIT){
  return Math.max(0,scale*GYRO_ROCKET_TARGET_LENGTH*.5+.05/getGyroSceneMetersPerUnit(metersPerUnit)-(Number(altitude)||0));
}

function getGyroSceneZoomLimit(mode, frameDistance){
  return mode === "flight"
    ? Math.min(GYRO_SCENE_FRAME_MAX, Math.max(GYRO_SCENE_ZOOM_MAX*getGyroSceneUnitRatio(), (Number(frameDistance) || 0) * 1.15))
    : GYRO_SCENE_ZOOM_MAX*getGyroSceneUnitRatio();
}

function constrainGyroScenePan(){
  if(getGyroPreviewMode() !== "3d" || gyroSceneView.mode !== "free") return;
  gyroCameraState.panY = Math.max(gyroCameraState.panY, getGyroSceneCameraFloor() - gyroSceneView.anchor.y);
}

function getGyroSceneOrbitPitch(pitch, distance, referenceDistance){
  const angle = clampLocal(Number(pitch) || 0, 0, 84);
  const blend = clampLocal((Math.abs(angle) - 65) / 19, 0, 1);
  const weight = 1 - blend * blend * (3 - 2 * blend);
  const ratio = Math.max(1e-8, Number(referenceDistance) || 1) / Math.max(1e-8, Number(distance) || 1);
  return clampLocal(Math.atan(Math.tan(angle * DEG_TO_RAD) * Math.pow(ratio, 0.42 * weight)) / DEG_TO_RAD, 0, 84);
}

function rebaseGyroSceneOrbit(){
  if(gyroSceneView.dollyZoom){
    gyroCameraState.pitchDeg = getGyroSceneOrbitPitch(
      gyroCameraState.pitchDeg, gyroCameraState.distance, gyroSceneView.orbitReferenceDistance
    );
  }
  gyroSceneView.orbitReferenceDistance = Math.max(1e-8, gyroCameraState.distance || gyroCameraState.desiredDistance || 1);
}

function getGyroScenePixelRatio(width, height, deviceRatio, mobile){
  const budget = mobile ? 1500000 : 3000000;
  const pixelLimit = Math.sqrt(budget / Math.max(1, width * height));
  return Math.max(1, Math.min(Number(deviceRatio) || 1, mobile ? 2 : 2.5, pixelLimit));
}

function getGyroSceneFlightFrame(primary, secondary, rocketLength, aspect){
  const boxes = [primary, secondary].filter(Boolean).map(path=>path.bounds || {
    minX:path.current.x, maxX:path.current.x,
    minY:path.current.y, maxY:path.current.y,
    minZ:path.current.z, maxZ:path.current.z
  });
  const low = axis=>Math.min(...boxes.map(box=>box["min" + axis]));
  const high = axis=>Math.max(...boxes.map(box=>box["max" + axis]));
  const radius = Math.hypot(high("X") - low("X"), high("Y") - low("Y"), high("Z") - low("Z")) * 0.5 + rocketLength * 0.65;
  const distance = radius * 1.2 / (Math.sin(GYRO_SCENE_FOV_DEG * DEG_TO_RAD * 0.5) * Math.min(1, Math.max(0.25, aspect)));
  return {
    target:{x:(low("X") + high("X")) * 0.5, y:(low("Y") + high("Y")) * 0.5, z:(low("Z") + high("Z")) * 0.5},
    distance:clampLocal(distance, getGyroCameraMinDistance(), GYRO_SCENE_FRAME_MAX)
  };
}

function syncGyroSceneControls(){
  const view = el.gyro3dViewport;
  if(!view) return;
  const controls = document.querySelector(".scene3d-controls");
  if(!controls) return;
  controls.querySelector('[data-gyro-action="grid"]')?.setAttribute("title","1 m 보조 격자 · 5 m 기준 격자");
  controls.querySelectorAll("[data-gyro-preset]").forEach(button=>{
    button.setAttribute("aria-pressed", String(button.dataset.gyroPreset === gyroSceneView.preset));
  });
  controls.querySelectorAll("[data-gyro-action]").forEach(button=>{
    const action = button.dataset.gyroAction;
    if(action === "zoom-in" || action === "zoom-out"){
      const atLimit = action === "zoom-in"
        ? gyroCameraState.desiredDistance <= getGyroCameraMinDistance() + 0.001
        : gyroCameraState.desiredDistance >= getGyroCameraMaxDistance() - 0.001;
      button.disabled = atLimit;
      button.title = action === "zoom-in" ? (atLimit ? "최대 확대" : "확대") : (atLimit ? "최대 축소" : "축소");
    }
    if(action === "follow") button.setAttribute("aria-pressed", String(gyroSceneView.mode === "vehicle"));
    if(action === "fit") button.setAttribute("aria-pressed", String(gyroSceneView.mode === "flight"));
    if(action === "grid") button.setAttribute("aria-pressed", String(gyroSceneView.grid));
    if(action === "expand"){
      button.setAttribute("aria-expanded", String(isGyroViewportExpanded()));
      button.setAttribute("aria-label", isGyroViewportExpanded() ? "3D 확대 화면 닫기" : "3D 화면 크게 보기");
      const label = button.querySelector("span");
      if(label) label.textContent = isGyroViewportExpanded() ? "화면 닫기" : "화면 확대";
    }
  });
  const label = controls.querySelector("[data-gyro-mode-label]");
  if(label) label.textContent = gyroSceneView.mode === "vehicle" ? "기체 추적" : gyroSceneView.mode === "flight" ? "전체 경로" : "시점 고정";
  view.dataset.cameraMode = gyroSceneView.mode;
  controls.dataset.cameraMode = gyroSceneView.mode;
}

function requestGyroSceneRender(){
  gyroSceneView.animateUntil = Date.now() + 600;
  if(gyroSceneView.frame || !gyroGl) return;
  const draw = ()=>{
    gyroSceneView.frame = 0;
    if(document.hidden || !gyroGl) return;
    renderGyroGl(gyroPitchDeg, gyroYawDeg, gyroRollDeg);
    if(Date.now() < gyroSceneView.animateUntil){
      gyroSceneView.frame = requestAnimationFrame(draw);
    }
  };
  gyroSceneView.frame = requestAnimationFrame(draw);
}

function freezeGyroSceneCamera(){
  if(gyroSceneView.mode === "free") return;
  gyroSceneView.anchor = {
    x:gyroCameraState.targetX - gyroCameraState.panX,
    y:gyroCameraState.targetY - gyroCameraState.panY,
    z:gyroCameraState.targetZ - gyroCameraState.panZ
  };
  gyroSceneView.mode = "free";
  gyroSceneView.autoFrame = false;
  gyroSceneView.userAdjusted = true;
  syncGyroSceneControls();
}

function zoomGyroSceneByFactor(factor){
  if(!Number.isFinite(factor) || factor <= 0) return;
  const nextDistance = clampLocal(
    gyroCameraState.desiredDistance * factor, getGyroCameraMinDistance(), getGyroCameraMaxDistance()
  );
  if(Math.abs(nextDistance - gyroCameraState.desiredDistance) < 0.00001) return;
  holdGyroManualZoom();
  gyroCameraState.desiredDistance = nextDistance;
  syncGyroSceneControls();
  requestGyroSceneRender();
}

function setGyroScenePreset(preset){
  const poses = {orbit:[42, 28], top:[0, 84], side:[90, 0]};
  if(!poses[preset]) return;
  gyroSceneView.preset = preset;
  gyroSceneView.userAdjusted = true;
  gyroCameraState.yawDeg = poses[preset][0];
  gyroCameraState.pitchDeg = poses[preset][1];
  gyroSceneView.dollyZoom = false;
  gyroSceneView.orbitReferenceDistance = gyroCameraState.distance || gyroCameraState.desiredDistance || 1;
  syncGyroSceneControls();
  requestGyroSceneRender();
}

function bindGyroSceneControls(){
  const controls = document.querySelector(".scene3d-controls");
  if(!controls) return;
  controls.querySelector('[data-gyro-action="grid"]')?.setAttribute("title","1 m 보조 격자 · 5 m 기준 격자");
  const scope = window.Flash7.createScope("scene3d");
  window.Flash7.appScope.add(()=>scope.dispose());
  scope.listen(controls, "click", event=>{
    const button = event.target.closest("[data-gyro-action], [data-gyro-preset]");
    if(!button || !controls.contains(button)) return;
    event.preventDefault();
    event.stopPropagation();
    if(button.dataset.gyroPreset){ setGyroScenePreset(button.dataset.gyroPreset); return; }
    const action = button.dataset.gyroAction;
    if(action === "zoom-in"){ zoomGyroSceneByFactor(0.8); return; }
    if(action === "zoom-out"){ zoomGyroSceneByFactor(1.25); return; }
    if(action === "expand"){
      setGyroViewportExpanded(!isGyroViewportExpanded());
      syncGyroSceneControls();
      requestGyroSceneRender();
      return;
    }
    if(action === "grid") gyroSceneView.grid = !gyroSceneView.grid;
    else if(action === "follow" && gyroSceneView.mode === "vehicle") freezeGyroSceneCamera();
    else if(action === "follow" || action === "fit" || action === "reset"){
      rebaseGyroSceneOrbit();
      gyroSceneView.dollyZoom = false;
      gyroSceneView.mode = action === "fit" ? "flight" : "vehicle";
      gyroSceneView.autoFrame = true;
      gyroCameraState.manualZoomUntilMs = 0;
      gyroCameraState.panX = gyroCameraState.panY = gyroCameraState.panZ = 0;
      if(action === "reset"){
        resetGyroCameraPose(true);
        gyroSceneView.preset = "orbit";
        gyroSceneView.grid = true;
      }
    }
    gyroSceneView.userAdjusted = true;
    syncGyroSceneControls();
    requestGyroSceneRender();
  });
  scope.add(()=>{
    if(gyroSceneView.frame) cancelAnimationFrame(gyroSceneView.frame);
    gyroSceneView.frame = 0;
  });
  syncGyroSceneControls();
}
