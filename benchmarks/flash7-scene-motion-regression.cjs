const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const camera={targetX:0,targetY:0,targetZ:0},context=vm.createContext({GYRO_TRAIL_BASE_METERS_PER_UNIT:4.2,GYRO_ROCKET_TARGET_LENGTH:1.56,getGyroRocketActualHeightM:()=>3.409,gyroCameraState:camera,Date,Math});
vm.runInContext(fs.readFileSync('scripts/ui/shared/scene3d.js','utf8'),context);vm.runInContext(fs.readFileSync('scripts/ui/shared/scene3d-motion.js','utf8'),context);
const sample=vm.runInContext('getGyroSceneMotionFrame',context),reset=vm.runInContext('resetGyroSceneMotion',context),colors=vm.runInContext('getGyroSceneTrailColors',context),apply=vm.runInContext('applyGyroSceneMotion',context),follow=vm.runInContext('updateGyroSceneCameraTarget',context);
const start=100000,identity=[1,0,0,0];
for(const speed of [200,-70]){
 reset();let previous=null,maxStep=0;
 for(let frame=0;frame<240;frame++){
  const at=frame*1000/60,packet=Math.floor(at/100)*100,units=4.2+packet*.2,altitude=1000+speed*packet/1000;
  const state=sample(1,{x:0,y:altitude/units,z:0,ms:start+packet},units,identity,'flight',start+at),height=state.position.y*units;
  if(previous&&at>500)maxStep=Math.max(maxStep,Math.abs(height-previous.height));
  follow(state.position,.34,true);assert.ok(Math.abs(camera.targetY-state.position.y)<1e-12,'camera and rocket share the exact displayed position');previous={height};
 }
 assert.ok(maxStep<Math.abs(speed)/60*1.35,'packet steps are interpolated across display frames');
}
reset();const first=sample(1,{x:0,y:1,z:0,ms:1000},1000,identity,'a',1000);const changedScale=sample(1,{x:0,y:2,z:0,ms:1000},500,identity,'a',1016);assert.ok(Math.abs(first.position.y*1000-changedScale.position.y*500)<1e-8,'normalization cannot introduce a position jump');
sample(1,{x:0,y:4,z:0,ms:1100},500,[-1,0,0,0],'a',1100);const rotation=sample(1,{x:0,y:4,z:0,ms:1100},500,[-1,0,0,0],'a',1150);assert.ok(Math.abs(rotation.quaternion[0])>.999,'quaternion sign flips cannot cause full rotations');
const resetFrame=sample(1,{x:1,y:0,z:2,ms:50},4.2,identity,'b',1200);assert.equal(resetFrame.position.y,0,'replay seeks and mission changes reset interpolation');
reset();sample(1,{x:0,y:0,z:0,ms:1000},4.2,identity,'a',1000);const points=[{x:0,y:0,z:0,ms:1000},{x:0,y:10,z:0,ms:1100}];const path={current:{...points[1]},trailWorldPoints:points};apply(1,path,4.2,identity,'a',1100);assert.equal(path.trailWorldPoints.at(-1).y,path.current.y,'trail ends at the displayed rocket');assert.equal(points.length,2,'display clipping does not mutate recorded path');
const atTime=10000,flight=[0,20,80,100,100.2,100.1,99.9,95,70,20].map((y,i)=>({y,ms:atTime+i*300})),palette=colors(flight,1);
assert.ok(palette[0][0]>palette[0][2],'ascent is warm');assert.ok(palette.at(-1)[2]>palette.at(-1)[0],'descent is cool');assert.ok(palette[5][0]>palette[8][0],'apogee transition is gradual');
const jitter=colors([0,10,10.2,9.9,10.1].map((y,i)=>({y,ms:i*200})),1);assert.ok(jitter.every(c=>c[0]===jitter[0][0]),'small apogee noise does not alternate trail colors');
console.log('FLASH7 scene motion: PASS (10 Hz ascent/descent interpolation, metric scale changes, exact vehicle follow, quaternion continuity, replay/mission reset, trail endpoint, smooth phase colors and apex jitter)');
