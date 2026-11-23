/* Geographic recovery estimates only. Never use the display's relative 3D path. */
(function(root){
  "use strict";
  const R=6371008.8,rad=Math.PI/180;
  const finite=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v));
  const number=v=>finite(v)?Number(v):null;
  const wrap=v=>((v+540)%360)-180;
  function coordinates(lat,lon){return finite(lat)&&finite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180;}
  function offset(a,b){const latitude=(a.lat+b.lat)*rad/2;return {east:R*wrap(b.lon-a.lon)*rad*Math.cos(latitude),north:R*(b.lat-a.lat)*rad};}
  function moved(p,east,north){return {lat:Math.max(-89.9999,Math.min(89.9999,p.lat+north/R/rad)),lon:wrap(p.lon+east/(R*Math.max(.00001,Math.cos(p.lat*rad)))/rad)};}
  function bearingDistance(a,b){
    const p=a.lat*rad,q=b.lat*rad,d=(b.lat-a.lat)*rad,l=wrap(b.lon-a.lon)*rad;
    const hav=Math.sin(d/2)**2+Math.cos(p)*Math.cos(q)*Math.sin(l/2)**2;
    return {distanceM:2*R*Math.asin(Math.sqrt(Math.min(1,hav))),bearingDeg:(Math.atan2(Math.sin(l)*Math.cos(q),Math.cos(p)*Math.sin(q)-Math.sin(p)*Math.cos(q)*Math.cos(l))/rad+360)%360};
  }
  function orientationAxis(alpha,beta,gamma,screenAngle){
    if(![alpha,beta,gamma].every(finite))return null;
    const a=alpha*rad,b=beta*rad,g=gamma*rad,s=(screenAngle||0)*rad;
    // Screen-top antenna axis: Rz(alpha) Rx(beta) Ry(gamma), corrected for screen rotation.
    const x=-Math.sin(s),y=Math.cos(s);
    const X=Math.cos(a)*Math.cos(g)*x-Math.sin(a)*Math.sin(b)*Math.sin(g)*x-Math.sin(a)*Math.cos(b)*y;
    const Y=Math.sin(a)*Math.cos(g)*x+Math.cos(a)*Math.sin(b)*Math.sin(g)*x+Math.cos(a)*Math.cos(b)*y;
    const Z=-Math.cos(b)*Math.sin(g)*x+Math.sin(b)*y;
    return {headingDeg:(Math.atan2(X,Y)/rad+360)%360,pitchDeg:Math.asin(Math.max(-1,Math.min(1,Z)))/rad,horizontalStrength:Math.hypot(X,Y)};
  }
  function guidance(target,observer,orientation,config={}){
    if(!target||target.ageMs>5000||!observer||!coordinates(observer.lat,observer.lon)||!coordinates(target.lat,target.lon))return null;
    const geo=bearingDistance(observer,target),height=number(target.heightM),ground=number(config.observerHeightM)??0;
    const elevation=height===null?null:Math.atan2(height-ground,Math.max(.01,geo.distanceM))/rad;
    const heading=number(orientation?.headingDeg),pitch=number(orientation?.pitchDeg),yawOffset=number(config.yawOffsetDeg)||0,pitchOffset=number(config.pitchOffsetDeg)||0;
    return {...geo,elevationDeg:elevation,slantDistanceM:height===null?null:Math.hypot(geo.distanceM,height-ground),
      yawErrorDeg:heading===null?null:wrap(geo.bearingDeg-heading-yawOffset),pitchErrorDeg:pitch===null||elevation===null?null:elevation-pitch-pitchOffset,
      bearingUncertaintyDeg:Math.atan2((number(target.uncertaintyM)||30)+(number(observer.accuracyM)||30),Math.max(1,geo.distanceM))/rad};
  }
  function createEstimator(settings={}){
    let options={groundOffsetM:0,terrainUncertaintyM:20,...settings},epoch=null,last=null,fix=null,velocityFix=null,velocity={east:0,north:0},velocityKnown=false,altitudes=[],vertical=null,airborne=false,groundSince=0,commanded=false,confirmed=false,rejected=false;
    function reset(key){epoch=key;last=fix=velocityFix=null;velocity={east:0,north:0};velocityKnown=false;altitudes=[];vertical=null;airborne=false;groundSince=0;commanded=confirmed=rejected=false;}
    function update(sample,now=Date.now()){
      if(!sample||!finite(sample.timestamp))return snapshot(now);
      const key=String(sample.epochId||'live')+':'+String(sample.stageId||1);
      if(epoch!==key)reset(key);
      const time=Number(sample.timestamp);
      if(last&&time<=last.timestamp)return snapshot(now);
      if(last&&time-last.timestamp>15000){altitudes=[];vertical=null;velocityKnown=false;groundSince=0;}
      last={...sample,timestamp:time,altitudeM:number(sample.altitudeM)};
      commanded=commanded||sample.chuteCommanded===true;confirmed=confirmed||sample.chuteConfirmed===true;
      const h=last.altitudeM;
      if(h!==null&&h>=-1000&&h<=1000000){
        if(h-options.groundOffsetM>20)airborne=true;
        if(!altitudes.length||time-altitudes.at(-1).t>=100)altitudes.push({t:time,h});
        altitudes=altitudes.filter(p=>time-p.t<=8000).slice(-90);
        const points=altitudes.filter(p=>time-p.t<=3000),span=points.length?points.at(-1).t-points[0].t:0;
        if(points.length>=4&&span>=1000){
          const meanT=points.reduce((s,p)=>s+(p.t-time)/1000,0)/points.length,meanH=points.reduce((s,p)=>s+p.h,0)/points.length;
          let numerator=0,denominator=0;for(const p of points){const dt=(p.t-time)/1000-meanT;numerator+=dt*(p.h-meanH);denominator+=dt*dt;}
          const slope=numerator/Math.max(.001,denominator);
          if(Math.abs(slope)<=1500)vertical=vertical===null?slope:vertical*.6+slope*.4;
        }else if(finite(sample.verticalSpeedMps)&&Math.abs(sample.verticalSpeedMps)<=1500)vertical=Number(sample.verticalSpeedMps);
      }else{last.altitudeM=null;vertical=null;altitudes=[];}
      rejected=false;
      const gps=sample.gps;
      if(gps&&gps.fix===true&&coordinates(gps.lat,gps.lon)&&finite(gps.ageMs)&&gps.ageMs>=0&&gps.ageMs<=5000){
        const measuredAt=time-gps.ageMs,point={lat:Number(gps.lat),lon:Number(gps.lon)},accuracy=Math.max(3,Math.min(1000,number(gps.accuracyM)??30));
        if(!fix||measuredAt>fix.measuredAt+50){
          let accept=true;
          if(fix){
            const dt=(measuredAt-fix.measuredAt)/1000,delta=offset(fix,point),distance=Math.hypot(delta.east,delta.north);
            if(dt>0&&dt<=10&&distance>Math.max(100,(accuracy+fix.accuracyM)*3+1200*dt)){accept=false;rejected=true;}

          }
          if(accept){
            const accepted={...point,measuredAt,accuracyM:accuracy},anchor=velocityFix||fix;
            if(anchor){const dt=(measuredAt-anchor.measuredAt)/1000;
              if(dt>=.2&&dt<=5){const delta=offset(anchor,point),gain=velocityKnown?.35:1;velocity.east+=(delta.east/dt-velocity.east)*gain;velocity.north+=(delta.north/dt-velocity.north)*gain;velocityKnown=true;velocityFix=accepted;}
              else if(dt>5){velocityKnown=false;velocityFix=accepted;}
            }
            if(!velocityFix)velocityFix=accepted;fix=accepted;
          }
        }
      }
      const phase=String(sample.phase||'').toUpperCase();
      const stationary=airborne&&last.altitudeM!==null&&Math.abs(last.altitudeM-options.groundOffsetM)<5&&vertical!==null&&Math.abs(vertical)<1&&velocityKnown&&Math.hypot(velocity.east,velocity.north)<2&&fix&&time-fix.measuredAt<3000;
      if(stationary){if(!groundSince)groundSince=time;}else groundSince=0;
      last.landed=phase==='LANDED'?'reported':groundSince&&time-groundSince>=8000?'inferred':null;
      return snapshot(now);
    }
    function snapshot(now=Date.now()){
      if(!last)return {status:'waiting',target:null,landing:null,chute:'unknown',verticalSpeedMps:null};
      const age=Math.max(0,now-last.timestamp),gpsAge=fix?Math.max(0,now-fix.measuredAt):Infinity;
      const extrapolation=Math.min(5,gpsAge/1000),point=fix?moved(fix,velocityKnown?velocity.east*extrapolation:0,velocityKnown?velocity.north*extrapolation:0):null;
      const recent=altitudes.length>=4&&altitudes.at(-1).t-altitudes[0].t>=3000;
      const phase=String(last.phase||'').toUpperCase(),descending=vertical!==null&&vertical<-.5&&(airborne||/DESCENT|EJECTION/.test(phase));
      const stable=recent&&vertical!==null&&vertical<=-2&&vertical>=-20&&altitudes.slice(-20).every((p,i,a)=>!i||p.h<=a[i-1].h+1.5);
      const chute=confirmed?'confirmed':commanded&&stable?'inferred':commanded?'commanded':'unknown';
      const currentAltitude=age<=5000&&last.altitudeM!==null&&vertical!==null?last.altitudeM+vertical*Math.min(age/1000,5):last.altitudeM;
      const currentHeight=currentAltitude===null?null:currentAltitude-options.groundOffsetM;
      const uncertainty=fix?fix.accuracyM+(velocityKnown?3:15)*gpsAge/1000:null;
      const target=point?{...point,ageMs:gpsAge,heightM:currentAltitude,uncertaintyM:uncertainty,extrapolated:gpsAge>1500}:null;
      let landing=null;
      if(age<=5000&&gpsAge<=5000&&currentHeight!==null&&last.landed){landing={...point,etaSec:0,radiusM:Math.max(10,uncertainty),state:last.landed};}
      else if(age<=5000&&gpsAge<=5000&&descending&&recent&&currentHeight>0){
        const eta=currentHeight/-vertical;
        if(eta<=1800){const destination=moved(point,velocityKnown?velocity.east*eta:0,velocityKnown?velocity.north*eta:0);
          landing={...destination,etaSec:eta,radiusM:Math.max(30,uncertainty+eta*(stable?2:6)+options.terrainUncertaintyM/Math.max(.5,-vertical)*(Math.hypot(velocity.east,velocity.north)+2)),state:stable&&velocityKnown?'descent':'provisional'};}
      }
      return {status:age>5000?'stale':gpsAge>5000?'gps-stale':rejected?'gps-rejected':'tracking',sampleAgeMs:age,target,landing,chute,verticalSpeedMps:age<=5000?vertical:null,groundOffsetM:options.groundOffsetM,landed:last.landed,phase,velocityKnown,groundAssumption:'manual-relative-to-launch'};
    }
    return {update,snapshot,reset:()=>reset(null),configure(next){options={...options,...next};groundSince=0;}};
  }
  const api={createEstimator,guidance,orientationAxis,bearingDistance,offset,moved,coordinates,wrap};
  (root.Flash7=root.Flash7||{}).recovery=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
