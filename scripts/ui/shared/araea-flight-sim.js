/* Frontend demonstration only. No board protocol or actuator commands. Altitudes are AGL. */
const ARAEA_FLIGHT_SIM = Object.freeze({
  targetAltitudeM:3048, targetAltitudeFt:10000, burnSec:6,
  gravity:9.80665, motorAcceleration:86,
  bodyDrag:0.0002, brakeDrag:0.0026, atmosphereHeightM:8500,
  servoTravelDeg:90, deploymentRate:1.1, controlIntervalSec:0.12
});

function createAraeaFlightController(){
  return {deployment:0, target:0, servoAngleDeg:0, predictedApogeeM:0, nextControlSec:0, mode:"STOWED"};
}

function constrainAraeaLaunchRail(state,stepMs,dt,previousAltitude,previousVelocity){
  if(state.railExitMs!=null||state.landed||state.apogeeMs)return;
  const travel=getGyroLaunchRailTravelM();
  if(getGyroLaunchRailState(state.altM).phase==='FREE'&&state.velU>0){
    const fraction=Math.max(0,Math.min(1,(travel-previousAltitude)/Math.max(1e-9,state.altM-previousAltitude)));
    state.railExitMs=stepMs-(1-fraction)*dt*1000;
    state.railExitSpeedMps=previousVelocity+(state.velU-previousVelocity)*fraction;
    const released=1-fraction;state.posE*=released;state.posN*=released;state.velE*=released;state.velN*=released;
    return;
  }
  state.posE=state.posN=state.velE=state.velN=state.accE=state.accN=0;
  state.pitchDeg=GYRO_LAUNCH_RAIL.pitchDeg;state.yawDeg=GYRO_LAUNCH_RAIL.headingDeg;state.rollDeg=0;
}

function araeaDragAcceleration(altitude, velocity, deployment){
  const density = Math.exp(-Math.max(0, altitude) / ARAEA_FLIGHT_SIM.atmosphereHeightM);
  const drag = ARAEA_FLIGHT_SIM.bodyDrag + ARAEA_FLIGHT_SIM.brakeDrag * deployment * deployment;
  return density * drag * velocity * Math.abs(velocity);
}

function predictAraeaApogee(altitude, velocity, deployment){
  let h = Math.max(0, altitude), v = Math.max(0, velocity);
  // Midpoint integration includes the change in atmospheric density during coast.
  for(let i=0;i<1200 && v>0;i++){
    const dt = Math.min(0.15, v / ARAEA_FLIGHT_SIM.gravity);
    const a = -ARAEA_FLIGHT_SIM.gravity - araeaDragAcceleration(h,v,deployment);
    const midV = Math.max(0,v+a*dt*.5), midH = h+v*dt*.5;
    h += midV*dt;
    v += (-ARAEA_FLIGHT_SIM.gravity - araeaDragAcceleration(midH,midV,deployment))*dt;
  }
  return h;
}

function stepAraeaFlightController(control, altitude, velocity, elapsedSec, dt, recovering){
  const boost = elapsedSec < ARAEA_FLIGHT_SIM.burnSec;
  const coasting = !boost && velocity > 0 && !recovering;
  if(!coasting){
    control.target = 0;
    control.mode = boost ? "BOOST" : "RECOVERY";
  }else if(elapsedSec >= control.nextControlSec){
    control.nextControlSec = elapsedSec + ARAEA_FLIGHT_SIM.controlIntervalSec;
    let low = 0, high = 1;
    if(predictAraeaApogee(altitude,velocity,0) <= ARAEA_FLIGHT_SIM.targetAltitudeM){
      high = 0;
    }else{
      for(let i=0;i<11;i++){
        const middle = (low+high)*.5;
        if(predictAraeaApogee(altitude,velocity,middle)>ARAEA_FLIGHT_SIM.targetAltitudeM) low=middle;
        else high=middle;
      }
    }
    control.target = high;
    control.mode = "APOGEE_CONTROL";
  }
  const change = Math.max(-ARAEA_FLIGHT_SIM.deploymentRate*dt,
    Math.min(ARAEA_FLIGHT_SIM.deploymentRate*dt,control.target-control.deployment));
  control.deployment = Math.max(0,Math.min(1,control.deployment+change));
  control.servoAngleDeg = control.deployment*ARAEA_FLIGHT_SIM.servoTravelDeg;
  if(coasting) control.predictedApogeeM = predictAraeaApogee(altitude,velocity,control.deployment);
  const u = Math.max(0,Math.min(1,elapsedSec/ARAEA_FLIGHT_SIM.burnSec));
  const motor = boost ? ARAEA_FLIGHT_SIM.motorAcceleration*(.88+.12*Math.sin(Math.PI*u)) : 0;
  return motor-ARAEA_FLIGHT_SIM.gravity-araeaDragAcceleration(altitude,velocity,control.deployment);
}

function isAraeaFlightSimulation(){
  const profile = simState && (simState.st===1 || simState.flightStartMs!=null) && simState.flightProfile
    ? simState.flightProfile : uiSettings && uiSettings.selectedMission;
  return !!simEnabled && !replaySourceActive && !replayUiActive && !devParachuteDrop &&
    getDisplayOperationModeValue()==="flight" && normalizeSelectedMission(profile)==="araea_i";
}

function isAraeaSimulationRunning(){
  return isAraeaFlightSimulation() && (simState.st===1 || simState.flightStartMs!=null);
}

function syncAraeaSimulationAction(){
  const button=document.getElementById("araeaSimLaunchBtn");
  if(!button) return;
  button.hidden=!(simEnabled && !replaySourceActive && !replayUiActive &&
    getDisplayOperationModeValue()==="flight" && normalizeSelectedMission(uiSettings && uiSettings.selectedMission)==="araea_i");
  button.disabled=isAraeaSimulationRunning() && !simState.landed;
}

function startAraeaFlightSimulation(){
  if(!simEnabled || replaySourceActive || replayUiActive || getDisplayOperationModeValue()!=="flight" ||
     normalizeSelectedMission(uiSettings && uiSettings.selectedMission)!=="araea_i" ||
     (isAraeaSimulationRunning() && !simState.landed)) return false;
  stopCountdownAudio();
  if(virtualMissionActive) stopVirtualMission("user");
  resetReplayMissionRuntime();
  handleSimCommand({http:"/countdown_start"});
  simState.countdownTotalMs=10000;simState.cdMs=10000;
  missionStandbyUiActive=false;userWaitingLocal=false;
  onIncomingSample(buildSimSample(),"SIMULATION",{forceUi:true});
  setControlCenterOpen(false);
  showToast("ARAEA-I · 목표 10,000 ft 비행 시뮬레이션", "info", {key:"araea-flight-simulation"});
  return true;
}

function stopAraeaFlightSimulation(){
  if(!isAraeaSimulationRunning()) return false;
  stopCountdownAudio();handleSimCommand({http:"/abort"});
  onIncomingSample(buildSimSample(),"SIMULATION",{forceUi:true});
  return true;
}
