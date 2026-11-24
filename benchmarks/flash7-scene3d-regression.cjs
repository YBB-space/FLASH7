const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const frames = new Map();
let nextFrame = 0;
const camera = {targetX:12, targetY:20, targetZ:30, panX:2, panY:3, panZ:4, desiredDistance:10};
const context = vm.createContext({
  GYRO_FOV_DEG:44, DEG_TO_RAD:Math.PI / 180,
  GYRO_TRAIL_BASE_METERS_PER_UNIT:4.2,GYRO_ROCKET_TARGET_LENGTH:1.56,GYRO_ROCKET_ACTUAL_HEIGHT_M:1.9,
  gyroCameraState:camera, gyroGl:{}, el:{gyro3dViewport:null}, document:{hidden:false},
  getGyroRocketActualHeightM:()=>1.9,
  getGyroCameraMinDistance:()=>0.68,
  getGyroCameraMaxDistance:()=>vm.runInContext("getGyroSceneZoomLimit(gyroSceneView.mode, gyroSceneView.flightFrameDistance)", context),
  getGyroPreviewMode:()=>"3d",
  clampLocal:(value, min, max)=>Math.max(min, Math.min(max, value)),
  holdGyroManualZoom:()=>vm.runInContext("gyroSceneView.autoFrame = false; gyroSceneView.userAdjusted = true", context),
  requestAnimationFrame:callback=>{frames.set(++nextFrame, callback); return nextFrame;},
  cancelAnimationFrame:id=>frames.delete(id)
});
vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../scripts/ui/shared/scene3d.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../scripts/ui/shared/scene3d-environment.js"), "utf8"), context);
const gridMetrics = vm.runInContext("getGyroSceneGridMetrics", context);
const clipRange = vm.runInContext("getGyroSceneClipRange", context);
const zoomLimit = vm.runInContext("getGyroSceneZoomLimit", context);
assert.equal(zoomLimit("vehicle", 500), 22.5, "vehicle zoom must not inherit an excessive trajectory-view limit");
assert.ok(Math.abs(zoomLimit("flight", 100) - 115) < 1e-8, "full-path view needs only a small margin beyond its fitted distance");
assert.equal(zoomLimit("flight", 1000), 500, "trajectory framing retains a bounded upper limit");
for(const distance of [0, -1, NaN, Infinity, 0.68, 2, 10, 50, 250, 500]){
  const metrics = gridMetrics(distance);
  assert.ok(Object.values(metrics).every(Number.isFinite), "grid must remain finite at every supported zoom");
  assert.ok(metrics.span > metrics.fadeFar && metrics.fadeFar > metrics.fadeNear, "grid must fade before the ground edge");
  assert.equal(metrics.fadeFar, gridMetrics(1).fadeFar, "zoom must not stretch the world-space ground fog with the camera");
}
for(const distance of [0.68, 2, 50, 250, 500]){
  for(const altitude of [0, 20, 1000]){
    const clip = clipRange(distance, altitude);
    assert.ok(clip.far > Math.hypot(gridMetrics(distance).fadeFar, altitude + distance), "ground must fade before the far clip plane at maximum zoom-out");
    assert.ok(clip.near > 0 && clip.near < distance / 2, "close-up camera must retain model clearance");
  }
}
const orbitPitch = vm.runInContext("getGyroSceneOrbitPitch", context);
assert.ok(orbitPitch(28, 0.68, 2) > 35, "close-up dolly must change the view of the ground");
assert.ok(orbitPitch(28, 20, 2) < 15, "zoom-out must move the horizon instead of preserving the same orbit angle");
assert.equal(orbitPitch(28, 2, 2), 28, "starting a zoom must preserve the current view");
assert.equal(orbitPitch(84, 500, 2), 84, "top view must retain its overhead orientation");
assert.equal(orbitPitch(0, 0.68, 2), 0, "side view must remain level");
for(const distance of [0.68, 2, 22.5]){
  assert.equal(orbitPitch(-80, distance, 2), 0, "orbit and dolly must never rotate underneath the ground");
}
camera.pitchDeg = 28;
camera.distance = 10;
vm.runInContext("gyroSceneView.dollyZoom = true; gyroSceneView.orbitReferenceDistance = 2; rebaseGyroSceneOrbit()", context);
assert.ok(Math.abs(camera.pitchDeg - orbitPitch(28, 10, 2)) < 1e-8, "beginning an orbit drag after a zoom must not jump");
assert.equal(vm.runInContext("gyroSceneView.orbitReferenceDistance", context), 10);
vm.runInContext("gyroSceneView.dollyZoom = false", context);
const frame = vm.runInContext("getGyroSceneFlightFrame", context);
const pixelRatio = vm.runInContext("getGyroScenePixelRatio", context);
assert.equal(pixelRatio(390, 844, 3, true), 2);
assert.equal(pixelRatio(1440, 1000, 1, false), 1);
assert.ok(1440 * 1000 * pixelRatio(1440, 1000, 2, false) ** 2 <= 3000001);
assert.ok(pixelRatio(3840, 2160, 2, false) >= 1, "large displays must retain at least CSS-pixel resolution");
assert.equal(pixelRatio(0, 0, NaN, true), 1);
const first = {bounds:{minX:0, maxX:4, minY:0, maxY:10, minZ:-2, maxZ:2}};
const second = {bounds:{minX:30, maxX:60, minY:5, maxY:40, minZ:-20, maxZ:10}};
const before = JSON.stringify([first, second]);
const fitted = frame(first, second, 1, 1.6);
assert.deepEqual(JSON.parse(JSON.stringify(fitted.target)), {x:30, y:20, z:-5});
const radius = Math.hypot(60, 40, 30) * 0.5;
const sceneFov = vm.runInContext("GYRO_SCENE_FOV_DEG", context);
assert.ok(sceneFov > 44, "flight scene needs a wider field of view for close-ups");
assert.ok(fitted.distance * Math.sin(sceneFov * Math.PI / 360) > radius, "fit must contain both stages, not just their midpoint");
assert.ok(frame(first, second, 1, 0.5).distance > fitted.distance, "portrait framing needs a wider camera distance");
assert.equal(JSON.stringify([first, second]), before, "camera framing must not alter trajectory data");
assert.ok(Number.isFinite(frame({current:{x:0, y:0.23, z:0}}, null, 0.5, 1).distance));

vm.runInContext("zoomGyroSceneByFactor(0.8)", context);
assert.equal(camera.desiredDistance, 8);
assert.equal(vm.runInContext("gyroSceneView.autoFrame", context), false);
for(let i = 0; i < 20; i++) vm.runInContext("requestGyroSceneRender()", context);
assert.equal(frames.size, 1, "pointer bursts must share a single scheduled render");
vm.runInContext("zoomGyroSceneByFactor(1e9)", context);
assert.equal(camera.desiredDistance, 22.5);
const frameCount = frames.size;
vm.runInContext("zoomGyroSceneByFactor(1.25)", context);
assert.equal(frames.size, frameCount, "zooming past the limit must not schedule another animation");
vm.runInContext("zoomGyroSceneByFactor(1e-9)", context);
assert.equal(camera.desiredDistance, 0.68);
vm.runInContext("zoomGyroSceneByFactor(NaN)", context);
assert.equal(camera.desiredDistance, 0.68);

vm.runInContext("freezeGyroSceneCamera()", context);
assert.deepEqual(JSON.parse(vm.runInContext("JSON.stringify(gyroSceneView.anchor)", context)), {x:10, y:17, z:26});
camera.targetX = 99;
vm.runInContext("freezeGyroSceneCamera()", context);
assert.equal(vm.runInContext("gyroSceneView.anchor.x", context), 10);
camera.panY = -100;
vm.runInContext("constrainGyroScenePan()", context);
assert.ok(vm.runInContext("gyroSceneView.anchor.y + gyroCameraState.panY", context) >= 0.08 - 1e-8, "panning must not drag the camera below ground");
vm.runInContext("setGyroScenePreset('top')", context);
assert.equal(camera.pitchDeg, 84);
vm.runInContext("setGyroScenePreset('side')", context);
assert.equal(camera.pitchDeg, 0);
assert.equal(camera.yawDeg, 90);
vm.runInContext("setGyroScenePreset('invalid')", context);
assert.equal(camera.yawDeg, 90);
const vehicleScale=vm.runInContext("getGyroSceneRocketScale",context);
for(const units of [4.2,10,20,1000,10000]) assert.ok(Math.abs(vehicleScale(units)*1.56*units-1.9)<1e-8,"local vehicle size follows the same metric scale as its path");
assert.ok(vehicleScale(1000)<.002,"overview must not enlarge the real vehicle");
const launchOffset=vm.runInContext("getGyroSceneLaunchOffset",context);for(const units of [4.2,20,1000])assert.ok(Math.abs(launchOffset(units)*units-(1.9/2+.05))<1e-8,"launch ground clearance remains five centimeters in physical units");
const vehicleLift=vm.runInContext("getGyroSceneVehicleLift",context);
assert.ok(vehicleLift(vehicleScale(4.2),.23)<.03,"launch-pad clearance stays small");
assert.equal(vehicleLift(vehicleScale(1000),3),0,"airborne vehicle stays on the trajectory endpoint instead of floating above it");
const strokeWidth=vm.runInContext("getGyroSceneStrokeHalfWidth",context);
const view=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
for(const depth of [.68,1.2,22.5]) for(const height of [240,783,1200]){
  const half=strokeWidth({x:0,y:0,z:-depth},view,height,1.1);
  const projected=half*height/(depth*Math.tan(sceneFov*Math.PI/360));
  assert.ok(Math.abs(projected-1.1)<1e-8,"trail stays thin at close-up and overview distances");
}
const core=fs.readFileSync(path.resolve(__dirname,"../scripts/flash7-core.js"),"utf8");
for(const name of ["vec3Cross","vec3Length","vec3Normalize","mat4Perspective","mat4LookAt","mat4Mul","mat4TransformVec4","buildGyroTrailRibbonGeometry","buildGyroTrailArrowGeometry"]){
  const start=core.indexOf("    function "+name+"(");
  const tail=core.slice(start),next=tail.slice(1).search(/^    (?:async )?function /m);
  vm.runInContext(next<0?tail:tail.slice(0,next+1),context);
}
const points=Array.from({length:1600},(_,i)=>({x:0,y:i*.01,z:-4})),original=JSON.stringify(points);
const ribbon=vm.runInContext("buildGyroTrailRibbonGeometry",context)(points,[0,0,0],()=>.002,()=>[1,1,1,1]);
assert.ok(Math.abs(Math.hypot(ribbon.pos[0]-ribbon.pos[3],ribbon.pos[1]-ribbon.pos[4],ribbon.pos[2]-ribbon.pos[5])-.004)<1e-8,"ribbon honors its projected-width callback");
const arrows=vm.runInContext("buildGyroTrailArrowGeometry",context)(points,[0,0,0],()=>.003);
assert.ok(arrows.count>0&&arrows.count<=18,"dense telemetry must not create a chain of oversized arrowheads");
assert.ok(ribbon.pos.every(Number.isFinite)&&arrows.pos.every(Number.isFinite));
assert.equal(JSON.stringify(points),original,"display geometry never changes telemetry positions");
console.log("FLASH7 3D regression: PASS (framing, zoom limits, adaptive grid, metric vehicle scale, pixel-width trails, bounded direction markers)");

const originalDistance=camera.distance,originalPan=camera.panX;vm.runInContext('rebaseGyroSceneUnits(1000)',context);assert.ok(Math.abs(camera.distance*1000-originalDistance*4.2)<1e-8,'normalization preserves physical camera distance');assert.ok(Math.abs(camera.panX*1000-originalPan*4.2)<1e-8,'normalization preserves physical pan');assert.ok(Math.abs(zoomLimit('vehicle',0)*1000-22.5*4.2)<1e-8,'maximum vehicle zoom remains the same physical distance');assert.ok(clipRange(.008,3,1000).near<.008,'metric close-up camera must not clip the whole model');assert.ok(Math.abs(gridMetrics(.008,1000).fadeFar*1000-gridMetrics(2,4.2).fadeFar*4.2)<1e-8,'ground fade retains its metric distance');context.getGyroRocketActualHeightM=()=>3.409;for(const units of [4.2,1000,10000])assert.ok(Math.abs(vehicleScale(units)*1.56*units-3.409)<1e-8,'ARAEA source length remains exact at all flight extents');

// Ground remains visible beneath a vehicle-follow camera at the 10,000 ft apogee.
for(const units of [4.2,1000]){
 const altitude=3048/units,distance=8/units,metrics=gridMetrics(distance,units,altitude);
 const groundDistance=altitude/Math.tan(28*Math.PI/180);
 assert.ok(metrics.span>groundDistance*1.5&&metrics.fadeFar>groundDistance*2,'high-altitude ground must not disappear into a single-color background');
 assert.ok(clipRange(distance,altitude,units).far>Math.hypot(metrics.span,altitude),'expanded reference ground stays inside the far clip');
 assert.ok(Math.abs(metrics.fadeFar*units-3048*12)<1e-7,'ground coverage tracks physical altitude across unit rebases');
 assert.equal(metrics.fadeFar,gridMetrics(distance*10,units,altitude).fadeFar,'zoom alone must not move ground fog');
}

// Reproduce the close top-view report with the actual projection/view helpers.
const projectionFor=vm.runInContext('getGyroSceneProjection',context),eyeDistanceFor=vm.runInContext('getGyroSceneEyeDistance',context),lookAt=vm.runInContext('mat4LookAt',context),multiply=vm.runInContext('mat4Mul',context),transform=vm.runInContext('mat4TransformVec4',context);
for(const units of [4.2,1000])for(const meters of [2.856,5,12]){
 const distance=meters/units,center=[0,2.0545/units,0],pitch=84*Math.PI/180,eyeDistance=eyeDistanceFor(distance,'orthographic',units),eye=[0,center[1]+Math.sin(pitch)*eyeDistance,Math.cos(pitch)*eyeDistance],view=lookAt(eye,center,[0,1,0]),clip=clipRange(distance,center[1],units),projection=projectionFor(distance,1.5,clip.near,clip.far,'top'),vp=multiply(projection.matrix,view);
 const rail=[[.095,.35,-.095],[.095,5.55,-.095]].map(p=>p.map(n=>n/units)),rocket=[[0,.35,0],[0,3.759,0]].map(p=>p.map(n=>n/units)),project=p=>{const q=transform(vp,...p,1);assert.equal(q[3],1);return[q[0],q[1]];};
 const ray=points=>{const [a,b]=points.map(project);return[b[0]-a[0],b[1]-a[1]];},r=ray(rail),v=ray(rocket);
 assert.ok(Math.abs(r[0]*v[1]-r[1]*v[0])<1e-10,'rail and rocket axes remain parallel on screen at close top-view zoom');
 for(const point of [...rail,...rocket])assert.ok(-transform(view,...point,1)[2]>clip.near,'camera remains outside the full launcher rather than slicing through its upper rail');
 const width=strokeWidth({x:0,y:0,z:-5},view,900,1.3,projection.span);assert.ok(Math.abs(width*2*900/projection.span-1.3)<1e-8,'orthographic trails preserve their pixel width');
}
const orbitProjection=projectionFor(2,1.5,.025,100,'orbit');assert.equal(orbitProjection.mode,'perspective');assert.equal(orbitProjection.matrix[11],-1);assert.equal(eyeDistanceFor(2,'perspective',4.2),2,'ordinary orbit view keeps its existing perspective and eye distance');
const nearEye=[0,2.0545+Math.sin(84*Math.PI/180)*2.856,Math.cos(84*Math.PI/180)*2.856];assert.ok(-transform(lookAt(nearEye,[0,2.0545,0],[0,1,0]),.095,5.55,-.095,1)[2]<0,'the former close top-view camera placed the rail tip behind the eye');
console.log('FLASH7 top view: PASS (reported near-camera rail clipping reproduced, parallel screen axes, safe eye placement, metric zoom and constant-width trails)');
