/* Display-only interpolation. Never changes received telemetry, trajectory exports or flight physics. */
const gyroSceneMotionStates=new Map();
let gyroSceneMotionUntil=0;
function resetGyroSceneMotion(){gyroSceneMotionStates.clear();gyroSceneMotionUntil=0;}
function interpolateGyroSceneQuat(a,b,t){
  if(!a)return b;if(!b)return a;
  const sign=a.reduce((sum,n,i)=>sum+n*b[i],0)<0?-1:1,blend=a.map((n,i)=>n+(sign*b[i]-n)*t),length=Math.hypot(...blend)||1;
  return blend.map(n=>n/length);
}
function getGyroSceneMotionFrame(stageId,point,metersPerUnit,quaternion,epoch,now=Date.now()){
  const units=getGyroSceneMetersPerUnit(metersPerUnit),stamp=Number(point?.ms),position={x:point.x*units,y:point.y*units,z:point.z*units};
  if(!Number.isFinite(stamp)||!stamp){gyroSceneMotionStates.delete(stageId);return {position:point,quaternion,ms:point.ms};}
  let state=gyroSceneMotionStates.get(stageId),previous=state?.samples.at(-1);
  const jump=previous?Math.hypot(position.x-previous.position.x,position.y-previous.position.y,position.z-previous.position.z):0;
  if(!state||state.epoch!==epoch||stamp<(previous?.ms||0)||now-(previous?.at||0)>1000||jump>Math.max(200,1500*Math.max(.02,(now-(previous?.at||now))/1000))){state={epoch,samples:[],interval:80};gyroSceneMotionStates.set(stageId,state);previous=null;}
  const angleChanged=previous?.quaternion&&quaternion?1-Math.abs(previous.quaternion.reduce((s,n,i)=>s+n*quaternion[i],0))>1e-8:previous?.quaternion!==quaternion;
  if(!previous||stamp!==previous.ms||jump>1e-5||angleChanged){
    if(previous&&now>previous.at)state.interval=state.interval*.7+Math.min(250,Math.max(16,now-previous.at))*.3;
    state.samples.push({at:now,ms:stamp,position,quaternion:quaternion?.slice()||null});state.samples=state.samples.slice(-24);
    gyroSceneMotionUntil=Math.max(gyroSceneMotionUntil,now+Math.min(150,Math.max(50,state.interval*1.2))+90);
  }
  const delay=Math.min(150,Math.max(50,state.interval*1.2)),time=now-delay,samples=state.samples;
  let left=samples[0],right=left;
  for(let i=1;i<samples.length;i++){right=samples[i];if(right.at>=time)break;left=right;}
  const t=left===right?0:Math.max(0,Math.min(1,(time-left.at)/Math.max(1,right.at-left.at))),value={};
  for(const axis of ['x','y','z'])value[axis]=(left.position[axis]+(right.position[axis]-left.position[axis])*t)/units;
  return {position:value,quaternion:interpolateGyroSceneQuat(left.quaternion,right.quaternion,t),ms:left.ms+(right.ms-left.ms)*t};
}
function applyGyroSceneMotion(stageId,path,units,quaternion,epoch,now=Date.now()){
  const frame=getGyroSceneMotionFrame(stageId,path.current,units,quaternion,epoch,now),points=path.trailWorldPoints;
  path.current={...frame.position,ms:frame.ms};
  if(points?.length&&Number.isFinite(frame.ms)){
    let end=points.length;while(end&&points[end-1].ms>frame.ms)end--;
    const visible=points.slice(0,end);
    if(visible.length&&visible.at(-1).ms===frame.ms)visible[visible.length-1]=path.current;else visible.push(path.current);
    path.trailWorldPoints=visible;
  }
  return frame.quaternion||quaternion;
}
function getGyroSceneTrailColors(points,metersPerUnit,stageId=1){
  if(!points.length)return [];
  const units=getGyroSceneMetersPerUnit(metersPerUnit),rise=stageId===2?[.76,.66,.52]:[.77,.51,.42],fall=[.43,.66,.73];
  let peak=0;for(let i=1;i<points.length;i++)if(points[i].y>points[peak].y)peak=i;
  const drop=(points[peak].y-points.at(-1).y)*units,descending=peak<points.length-1&&drop>Math.max(1.5,(points[peak].y-points[0].y)*units*.001);
  const pivot=Number(points[peak].ms)||0;
  return points.map((point,index)=>{const age=(Number(point.ms)||0)-pivot,ratio=descending&&index>=peak?Math.max(0,Math.min(1,age/900)):0,blend=ratio*ratio*(3-2*ratio);return rise.map((n,i)=>n+(fall[i]-n)*blend);});
}
function updateGyroSceneCameraTarget(target,response,followVehicle){
  const amount=followVehicle?1:Math.max(0,Math.min(1,response));
  for(const [axis,key]of [['x','targetX'],['y','targetY'],['z','targetZ']])gyroCameraState[key]+=(target[axis]-gyroCameraState[key])*amount;
}
