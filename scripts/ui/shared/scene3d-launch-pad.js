/* IREC single-stage solid rail reference; support frame and guide locations are illustrative.
 * 2026 DTEG 11.1.2: minimum 5.2 m, 1.5 inch / 1515 rail. All geometry is in meters.
 * https://static1.squarespace.com/static/687d3841f7d71450d1ba824d/t/69a0d16686b10911a06afa5e/1772147046804/2026%2BIREC%2BDTEG%2BV1.1.pdf
 */
const GYRO_LAUNCH_RAIL=Object.freeze({lengthM:5.2,widthM:.0381,baseM:.35,nozzleM:.35,
  lowerGuideM:.55,upperGuideM:2.05,headingDeg:34,pitchDeg:90,rocketLengthM:3.409});
function getGyroLaunchRailTravelM(){return GYRO_LAUNCH_RAIL.lengthM-GYRO_LAUNCH_RAIL.lowerGuideM;}
function getGyroLaunchPadFrameBounds(metersPerUnit){
  const units=getGyroSceneMetersPerUnit(metersPerUnit);
  return {minX:-1.5/units,maxX:1.5/units,minY:0,maxY:(GYRO_LAUNCH_RAIL.baseM+GYRO_LAUNCH_RAIL.lengthM)/units,minZ:-1.5/units,maxZ:1.5/units};
}
function getGyroLaunchRailState(altitudeM,departed=false){
  const travel=Math.max(0,Number(altitudeM)||0),remaining=getGyroLaunchRailTravelM()-travel;
  return {phase:departed||remaining<=0?'FREE':travel+GYRO_LAUNCH_RAIL.upperGuideM>=GYRO_LAUNCH_RAIL.lengthM?'CLEARING':travel>0?'GUIDED':'PAD',
    lowerEngaged:!departed&&remaining>0,upperEngaged:!departed&&travel+GYRO_LAUNCH_RAIL.upperGuideM<GYRO_LAUNCH_RAIL.lengthM,
    remainingM:Math.max(0,remaining),travelM:travel};
}
function getGyroLaunchVehicleQuat(pitchDeg,yawDeg,rollDeg){
  // Mesh +Y is the longitudinal axis; simulator pitch is elevation above the horizon.
  const elevation=Math.max(-90,Math.min(90,Number(pitchDeg)||0))*Math.PI/180,heading=(Number(yawDeg)||0)*Math.PI/180;
  const axis=[Math.cos(elevation)*Math.sin(heading),Math.sin(elevation),Math.cos(elevation)*Math.cos(heading)],w=Math.sqrt(Math.max(0,(1+axis[1])/2));
  const tilt=w<1e-6?[0,1,0,0]:[w,axis[2]/(2*w),0,-axis[0]/(2*w)];
  const yaw=quatFromAxisAngle([0,1,0],heading),roll=quatFromAxisAngle([0,1,0],(Number(rollDeg)||0)*Math.PI/180);
  // At vertical keep a stable pad heading so the guides line up with the rail.
  return quatNormalize(quatMul(tilt,quatMul(yaw,roll)));
}
function positionGyroLaunchPadPath(path,units){
  const lift=(GYRO_LAUNCH_RAIL.nozzleM-.05)/getGyroSceneMetersPerUnit(units),raised=point=>({...point,y:point.y+lift});
  path.current=raised(path.current);path.trailWorldPoints=path.trailWorldPoints.map(raised);
  path.bounds={...path.bounds,minY:path.bounds.minY+lift,maxY:path.bounds.maxY+lift};path.lookTarget=raised(path.lookTarget);
}
function buildGyroLaunchPadGeometry(){
  const pad={pos:[],norm:[],col:[]},guides={pos:[],norm:[],col:[]};
  const steel=[.31,.35,.38,1],aluminum=[.58,.62,.64,1],dark=[.12,.15,.17,1],plate=[.38,.40,.41,1];
  const sub=(a,b)=>a.map((n,i)=>n-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=v=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n);};
  function beam(mesh,a,b,width,depth,color){
    const direction=unit(sub(b,a)),right=unit(cross(direction,Math.abs(direction[1])>.9?[0,0,1]:[0,1,0])),up=unit(cross(right,direction));
    const points=[];for(const end of [a,b])for(const [r,u]of [[-1,-1],[1,-1],[1,1],[-1,1]])points.push(end.map((n,i)=>n+right[i]*r*width*.5+up[i]*u*depth*.5));
    for(const face of [[0,1,2,3],[4,7,6,5],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]]){
      const normal=unit(cross(sub(points[face[1]],points[face[0]]),sub(points[face[2]],points[face[0]])));
      for(const index of [0,1,2,0,2,3]){mesh.pos.push(...points[face[index]]);mesh.norm.push(...normal);mesh.col.push(...color);}
    }
  }
  const x=.095,z=-.095,base=GYRO_LAUNCH_RAIL.baseM,top=base+GYRO_LAUNCH_RAIL.lengthM;
  // Four lands and two internal webs suggest the open T-slots without a heavy mesh.
  const half=GYRO_LAUNCH_RAIL.widthM/2,land=.010;
  for(const dx of [-half+land/2,half-land/2])for(const dz of [-half+land/2,half-land/2])beam(pad,[x+dx,base,z+dz],[x+dx,top,z+dz],land,land,aluminum);
  beam(pad,[x,base,z],[x,top,z],GYRO_LAUNCH_RAIL.widthM,.006,aluminum);
  beam(pad,[x,base,z],[x,top,z],.006,GYRO_LAUNCH_RAIL.widthM,aluminum);
  // Tripod, backstay, rail clamps and a separate steel blast deflector.
  const hub=[x,.32,z-.22];beam(pad,[x,.10,z-.22],[x,4.25,z-.22],.065,.065,steel);
  for(const foot of [[-1.1,.07,.63],[1.1,.07,.63],[x,.07,-1.35]]){
    beam(pad,hub,foot,.08,.08,steel);beam(pad,[foot[0],0,foot[2]],[foot[0],.04,foot[2]],.23,.20,dark);
  }
  beam(pad,[x,.10,-1.22],[x,2.85,z-.22],.045,.045,steel);
  for(const h of [.55,1.8,3.05,4.2])beam(pad,[x,h,z-.23],[x,h,z],.07,.035,steel);
  beam(pad,[0,.12,.22],[0,.25,-.30],.64,.016,plate);
  // Adjustable mechanical standoff below the nozzle; leaves the exhaust path open.
  beam(pad,[x,base,z],[.058,base,-.058],.025,.025,dark);
  for(const h of [GYRO_LAUNCH_RAIL.lowerGuideM,GYRO_LAUNCH_RAIL.upperGuideM]){
    const y=h-GYRO_LAUNCH_RAIL.rocketLengthM/2;
    beam(guides,[.053,y,-.053],[.081,y,-.081],.018,.018,dark);
    beam(guides,[.077,y-.011,-.077],[.077,y+.011,-.077],.027,.012,steel);
  }
  return {pad:{...pad,count:pad.pos.length/3},guides:{...guides,count:guides.pos.length/3},railBaseM:base,railTopM:top};
}
function createGyroLaunchPadBuffers(gl){
  const geometry=buildGyroLaunchPadGeometry(),upload=mesh=>({count:mesh.count,posBuf:createGyroArrayBuffer(gl,mesh.pos,gl.STATIC_DRAW),normBuf:createGyroArrayBuffer(gl,mesh.norm,gl.STATIC_DRAW),colBuf:createGyroArrayBuffer(gl,mesh.col,gl.STATIC_DRAW)});
  return {pad:upload(geometry.pad),guides:upload(geometry.guides)};
}
function disposeGyroLaunchPadBuffers(gl,buffers){for(const mesh of Object.values(buffers||{}))for(const key of ['posBuf','normBuf','colBuf'])if(mesh[key])gl.deleteBuffer(mesh[key]);}
function drawGyroLaunchPad(view,style,rocketPosition,rocketRotation){
  const units=getGyroSceneMetersPerUnit(gyroSceneView.metersPerUnit),buffers=gyroGl.launchPad;
  if(!buffers)return;
  const scale=mat4Scale(1/units,1/units,1/units),padRotation=quatToMat4(quatFromAxisAngle([0,1,0],GYRO_LAUNCH_RAIL.headingDeg*Math.PI/180));
  const padStyle={...style,materialDetail:0,colorLift:0,sheen:.05,fogNear:120/units,fogFar:500/units};
  const padModel=mat4Mul(padRotation,scale),guideModel=mat4Mul(mat4Translate(rocketPosition.x,rocketPosition.y,rocketPosition.z),mat4Mul(rocketRotation,scale));
  for(const [mesh,model]of [[buffers.pad,padModel],[buffers.guides,guideModel]])drawSolidBatch(mesh.posBuf,mesh.normBuf,mesh.colBuf,mesh.count,model,view,padStyle);
}
