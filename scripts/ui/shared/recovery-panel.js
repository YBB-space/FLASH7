/* Shared read-only recovery presentation. Phone sensor data stays on this device. */
(function(root){
 'use strict';
 function createPanel(element,options={}){
  const api=root.Flash7.recovery,estimator=api.createEstimator();let current=estimator.snapshot(),observer=null,orientation=null,orientationAt=0,cameraOrientation=null,cameraOrientationAt=0,manualNorth=false,northBias=0,watch=null,sensorGeneration=0,positionError='',directionError='',disposed=false,lastPacketKey='',lastMapAt=0,map=null,ownedMap=false,targetLayer=null,landingLayer=null,observerLayer=null,centered=false;
  const config={observerHeightM:0,yawOffsetDeg:0,pitchOffsetDeg:0},listeners=[];
  let active=false,sensorStarted=false,visibilityObserver=null;
  const write=(key,value)=>{const node=element.querySelector('[data-recovery="'+key+'"]');if(node&&node.textContent!==value)node.textContent=value;};
  const on=(node,type,fn)=>{node?.addEventListener(type,fn);listeners.push(()=>node?.removeEventListener(type,fn));};
  const fmt=(n,d=0)=>typeof n==='number'&&Number.isFinite(n)?n.toFixed(d):'--';
  function mapUpdate(){
   if(Date.now()-lastMapAt<1000)return;lastMapAt=Date.now();
   if(!root.L)return;const external=options.map?.();
   if(external&&map!==external){targetLayer?.remove();landingLayer?.remove();observerLayer?.remove();map=external;centered=true;}
   if(!map&&!options.map&&element.querySelector('[data-recovery-map]')?.getBoundingClientRect().height>0){map=root.L.map(element.querySelector('[data-recovery-map]'),{zoomControl:true}).setView([35.15,128.1],8);ownedMap=true;root.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);}
   if(!map)return;
   const target=current.target,landing=current.landing;
   if(target&&target.ageMs<=5000){if(!targetLayer)targetLayer=root.L.circleMarker([target.lat,target.lon],{radius:5,color:'#e5e8eb',weight:2,fillColor:'#6f8392',fillOpacity:1}).addTo(map).bindTooltip('기체 위치 추정');else targetLayer.setLatLng([target.lat,target.lon]);if(!centered&&ownedMap){map.setView([target.lat,target.lon],12);centered=true;}}
   else if(targetLayer){targetLayer.remove();targetLayer=null;}
   if(landing){if(!landingLayer)landingLayer=root.L.circle([landing.lat,landing.lon],{radius:landing.radiusM,color:'#a8bdaa',weight:1,fillOpacity:.12,dashArray:'4 5'}).addTo(map).bindTooltip('예상 착지 영역 · 통계적 신뢰구간 아님');else landingLayer.setLatLng([landing.lat,landing.lon]).setRadius(landing.radiusM);}
   else if(landingLayer){landingLayer.remove();landingLayer=null;}
   if(observer&&(observer.manual||Date.now()-observer.timestamp<15000)){if(!observerLayer)observerLayer=root.L.circleMarker([observer.lat,observer.lon],{radius:4,color:'#91b2cc',fillOpacity:1}).addTo(map).bindTooltip('관측 위치');else observerLayer.setLatLng([observer.lat,observer.lon]);}else if(observerLayer){observerLayer.remove();observerLayer=null;}
  }
  function render(){
   if(disposed)return;current=estimator.snapshot();
   write('status',({waiting:'수신 대기',tracking:current.target?.extrapolated?'위치 보간 중':'위치 추적 중',stale:'텔레메트리 수신 끊김','gps-stale':'GPS 수신 대기','gps-rejected':'GPS 이상값 제외'})[current.status]||'수신 대기');
   const land=current.landing;
   write('eta',land?land.etaSec===0?'00:00':Math.floor(land.etaSec/60).toString().padStart(2,'0')+':'+Math.floor(land.etaSec%60).toString().padStart(2,'0'):'--');
   write('landing',land?fmt(land.lat,5)+', '+fmt(land.lon,5):'--');write('radius',land?'추정 반경 약 '+fmt(land.radiusM)+' m · 신뢰구간 미보정':'예상 영역 대기');
   write('landingState',land?({reported:'FC 착지 보고',inferred:'착지 추정',descent:'안정 하강 기반 추정',provisional:'초기 하강 기반 · 오차 큼'})[land.state]:current.status==='stale'?'수신 복구 후 다시 계산':/POWERED|COAST/.test(current.phase||'')?'하강 시작 후 계산':'하강 데이터 대기');
   write('chute',({unknown:'미확인',commanded:'전개 명령',inferred:'전개 추정',confirmed:'센서 확인'})[current.chute]);write('vertical',fmt(current.verticalSpeedMps,1)+' m/s');
   write('reference',current.groundOffsetM===0?'착지 지면: 발사점과 같은 높이 가정':'착지 지면: 발사점 대비 '+fmt(current.groundOffsetM)+' m');
   const gpsFresh=observer&&(observer.manual||Date.now()-observer.timestamp<15000),attitudeFresh=orientation&&Date.now()-orientationAt<3000;
   const attitude=attitudeFresh&&(orientation.absolute||manualNorth)?{headingDeg:(orientation.headingDeg+northBias+360)%360,pitchDeg:orientation.pitchDeg}:null;
   const aim=api.guidance(current.target,gpsFresh?observer:null,attitude,config);
   write('bearing',aim?fmt(aim.bearingDeg)+'°':'--');write('elevation',aim?fmt(aim.elevationDeg,1)+'°':'--');write('distance',aim?(aim.distanceM>=1000?fmt(aim.distanceM/1000,2)+' km':fmt(aim.distanceM)+' m'):'--');
   let instruction='위치·방향 수신 대기';
   if(current.status==='stale')instruction='수신 복구 대기';
   else if(['gps-stale','gps-rejected'].includes(current.status)||current.target?.ageMs>5000)instruction='기체 GPS 수신 대기';
   else if(aim&&aim.yawErrorDeg===null)instruction='방위각을 기준으로 조준하세요.';
   else if(aim){const yaw=aim.yawErrorDeg,pitch=aim.pitchErrorDeg;instruction=[Math.abs(yaw)<5?'좌우 정렬':(yaw>0?'오른쪽 ':'왼쪽 ')+fmt(Math.abs(yaw))+'°',pitch===null?'':Math.abs(pitch)<5?'높이 정렬':(pitch>0?'위로 ':'아래로 ')+fmt(Math.abs(pitch))+'°'].filter(Boolean).join(' · ');}
   write('instruction',instruction);
   const arrow=element.querySelector('[data-recovery-arrow]');if(arrow)arrow.style.transform=aim&&aim.yawErrorDeg!==null?'rotate('+aim.yawErrorDeg+'deg)':'none';
   write('aimQuality',aim?'방위 불확실성 약 ±'+fmt(Math.min(180,aim.bearingUncertaintyDeg))+'° · 관측지 높이차 '+fmt(config.observerHeightM)+' m 기준':'휴대폰 화면 상단을 안테나 방향에 맞추세요.');
   if(watch!==null||orientation||cameraOrientation||positionError||directionError)write('sensorState',positionError||(!cameraOrientation&&!orientation?directionError:'')||(!gpsFresh?'위치 수신 대기':!attitudeFresh&&(!cameraOrientation||Date.now()-cameraOrientationAt>=3000)?'방향 수신 대기':orientation?.absolute||cameraOrientation?.absolute?'절대 방위 사용':manualNorth?'수동 북쪽 기준 · 주기적 재보정':'북쪽 보정 필요'));
   mapUpdate();
  }
  function orientationEvent(event){
   if(disposed)return;
   const angle=root.screen?.orientation?.angle??root.orientation??0,axis=api.orientationAxis(event.alpha,event.beta,event.gamma,angle);
   const compass=typeof event.webkitCompassHeading==='number'&&event.webkitCompassHeading>=0&&(event.webkitCompassAccuracy==null||event.webkitCompassAccuracy>=0);
   const absolute=compass||event.absolute===true;
   if(!absolute&&cameraOrientation?.absolute&&Date.now()-cameraOrientationAt<1000)return;
   if(absolute&&cameraOrientation&&!cameraOrientation.absolute){manualNorth=false;northBias=0;}
   const correction=compass?api.wrap(event.webkitCompassHeading-((360-event.alpha)%360)):0;
   const cameraBasis=root.Flash7.recoveryCamera.basis(event.alpha,event.beta,event.gamma,angle,correction);
   if(cameraBasis){cameraOrientation={basis:cameraBasis,absolute:compass||event.absolute===true};cameraOrientationAt=Date.now();}
   if(!axis||axis.horizontalStrength<.15){orientation=null;return;}
   axis.headingDeg=(axis.headingDeg+correction+360)%360;orientation={...axis,absolute:compass||event.absolute===true};orientationAt=Date.now();
  }
  function stopSensors(closeCamera=true){sensorStarted=false;if(closeCamera)camera?.close();sensorGeneration++;if(watch!==null)navigator.geolocation?.clearWatch(watch);watch=null;observer=null;orientation=null;cameraOrientation=null;positionError=directionError='';manualNorth=false;northBias=0;root.removeEventListener('deviceorientation',orientationEvent);root.removeEventListener('deviceorientationabsolute',orientationEvent);write('sensorState','위치·방향 자동 연결');render();}
  function setActive(value){
   active=!!value;if(disposed)return;
   if(active&&!element.ownerDocument.hidden){if(!sensorStarted)void sensors();}
   else stopSensors();
  }
  async function sensors(){
   stopSensors(false);sensorStarted=true;const generation=sensorGeneration;
   if(!root.isSecureContext){positionError='HTTPS 또는 네이티브 앱에서 연결하세요.';write('sensorState',positionError);return;}
   let direction=typeof root.DeviceOrientationEvent!=='undefined';
   try{if(typeof root.DeviceOrientationEvent?.requestPermission==='function')direction=await root.DeviceOrientationEvent.requestPermission(true)==='granted';}catch{direction=false;}
   if(disposed||generation!==sensorGeneration)return;
   if(!direction)directionError=typeof root.DeviceOrientationEvent==='undefined'?'방향 센서를 지원하지 않는 기기입니다.':'방향 센서 권한을 허용해 주세요.';
   if(direction){root.addEventListener('deviceorientation',orientationEvent);root.addEventListener('deviceorientationabsolute',orientationEvent);}
   if(navigator.geolocation)watch=navigator.geolocation.watchPosition(position=>{if(disposed||generation!==sensorGeneration)return;positionError='';observer={lat:position.coords.latitude,lon:position.coords.longitude,accuracyM:position.coords.accuracy,timestamp:position.timestamp};render();},error=>{if(generation!==sensorGeneration)return;positionError=error.code===1?'위치 권한을 허용해 주세요.':'위치 정보를 받지 못했습니다. 야외에서 다시 연결해 주세요.';write('sensorState',positionError);},{enableHighAccuracy:true,maximumAge:2000,timeout:15000});
   else positionError='위치 정보를 지원하지 않는 환경입니다.';
   write('sensorState',direction?'센서 수신 대기':'방향 권한 없음 · 위치만 사용');
  }
  function calibrateNorth(){
   if(!orientation||Date.now()-orientationAt>3000){write('sensorState','폰을 잠시 눕히고 상단을 북쪽으로 맞춰주세요.');return false;}
   northBias=-orientation.headingDeg;manualNorth=true;render();return true;
  }
  const camera=root.Flash7.recoveryCamera.create(element.querySelector('[data-recovery-camera]'),{
   getState(){const state=estimator.snapshot(),gpsFresh=observer&&(observer.manual||Date.now()-observer.timestamp<15000),poseFresh=cameraOrientation&&Date.now()-cameraOrientationAt<3000;
    return {sensorError:positionError||(!poseFresh?directionError:''),observer:gpsFresh?observer:null,pose:poseFresh?cameraOrientation.basis:null,absolute:!!(poseFresh&&(cameraOrientation.absolute||manualNorth)),northBias:manualNorth?northBias:0,observerHeightM:config.observerHeightM,telemetryStatus:state.status,stale:state.status==='stale',targets:{rocket:state.target,landing:state.landing?{...state.landing,heightM:state.groundOffsetM,ageMs:state.target?.ageMs??Infinity,uncertaintyM:state.landing.radiusM}:null}};
   },calibrate:calibrateNorth,onClose:()=>{if(!active)stopSensors(false);}
  });
  on(element.querySelector('[data-recovery-camera-open]'),'click',()=>{setActive(true);if(directionError)void sensors();camera.open();});
  on(element.querySelector('[data-recovery-north]'),'click',calibrateNorth);
  on(element.querySelector('[data-recovery-ground]'),'change',event=>{const value=Number(event.target.value);if(Number.isFinite(value)&&value>=-2000&&value<=10000)estimator.configure({groundOffsetM:value});render();});
  for(const [selector,field]of [['observer-height','observerHeightM'],['yaw-offset','yawOffsetDeg'],['pitch-offset','pitchOffsetDeg']])on(element.querySelector('[data-recovery-'+selector+']'),'change',event=>{if(event.target.validity.valid)config[field]=Number(event.target.value);render();});
  on(element.querySelector('[data-recovery-station-form]'),'submit',event=>{event.preventDefault();const lat=Number(element.querySelector('[data-recovery-lat]').value),lon=Number(element.querySelector('[data-recovery-lon]').value);if(api.coordinates(lat,lon)){observer={lat,lon,accuracyM:30,timestamp:Date.now(),manual:true};write('sensorState','관측 위치 직접 입력');render();}});
  on(element.querySelector('[data-recovery-reset]'),'click',()=>{estimator.reset();lastPacketKey='';render();});
  const timer=setInterval(render,200),resize=()=>{lastMapAt=0;map?.invalidateSize?.();render();};on(root,'resize',resize);
  on(root,'pagehide',()=>stopSensors());
  on(element.ownerDocument,'visibilitychange',()=>{if(element.ownerDocument.hidden)stopSensors();else if(active)setActive(true);});
  if(options.observeVisibility!==false&&root.IntersectionObserver){visibilityObserver=new root.IntersectionObserver(entries=>{if(!camera.isOpen())setActive(entries.some(entry=>entry.isIntersecting));});visibilityObserver.observe(element);}
  render();
  return {setActive,update(packet,receivedAt=Date.now(),extraAge=0){if(!packet)return;const unique=packet.runId+':'+packet.telemetry.stageId+':'+packet.telemetry.receivedAt;if(unique===lastPacketKey)return;lastPacketKey=unique;estimator.update({...packet.recovery,timestamp:receivedAt-packet.sampleAgeMs-extraAge,stageId:packet.telemetry.stageId,epochId:packet.runId});},render,snapshot:()=>estimator.snapshot(),dispose(){disposed=true;active=false;visibilityObserver?.disconnect();clearInterval(timer);camera.dispose();stopSensors();listeners.forEach(fn=>fn());targetLayer?.remove();landingLayer?.remove();observerLayer?.remove();if(ownedMap)map?.remove();}};
 }
 (root.Flash7=root.Flash7||{}).recoveryPanel={createPanel};
})(typeof globalThis!=='undefined'?globalThis:window);
