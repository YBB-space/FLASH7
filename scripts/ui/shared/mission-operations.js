/* PC publication and local recovery. All command paths remain in the main GCS. */
function initMissionOperations(appScope){
  const scope=window.Flash7.createScope('mission-operations'),runtime=window.Flash7;
  let publisher=null,sharing=null,disposed=false,busy=false,lastSent=0,lastSample=0,runId=runtime.createSplitSessionId(),lastMode='',lastPhase='';
  const mainPanel=document.querySelector('#controlCenterPanel .recovery-panel');
  const recovery=mainPanel?runtime.recoveryPanel.createPanel(mainPanel,{map:()=>statusMapState.map}):null;
  const write=(selector,text)=>{const node=document.querySelector(selector);if(node)node.textContent=text;};
  const savedEndpoint=()=>{try{return localStorage.getItem('flash7-mission-endpoint')||'';}catch{return '';}};
  const saveEndpoint=value=>{try{localStorage.setItem('flash7-mission-endpoint',value);}catch{}};
  document.querySelectorAll('[data-mission-endpoint],[data-mission-join-endpoint]').forEach(node=>node.value=savedEndpoint());
  const joinSettings=document.querySelector("#welcomeOnlinePane [data-mission-relay-settings]");
  if(joinSettings&&!savedEndpoint())joinSettings.open=true;
  const query=new URLSearchParams(location.search),configured=query.get('relay');
  if(configured){try{const value=runtime.missionClient.endpoint(configured);document.querySelectorAll('[data-mission-endpoint],[data-mission-join-endpoint]').forEach(node=>node.value=value);}catch{}}
  scope.listen(document.getElementById('welcomeOnlineBtn'),'click',()=>setWelcomeStartView(el.welcomeConnectScreen.dataset.welcomeView==='online'?'flight':'online'));
  const join=document.querySelector('#welcomeOnlinePane [data-mission-join-form]');
  scope.listen(join?.querySelector('[data-mission-demo]'),'click',()=>location.assign(new URL('mission.html#demo=descent',document.baseURI).href));
  scope.listen(join,'submit',event=>{
    event.preventDefault();const status=join.querySelector('[data-mission-join-status]');
    try{const endpoint=runtime.missionClient.endpoint(join.querySelector('[data-mission-join-endpoint]').value.trim()),code=join.querySelector('[data-mission-join-code]').value.replace(/[\s-]/g,'').toUpperCase();if(!/^[A-Z2-9]{8}$/.test(code))throw new Error('접근 코드 8자리를 확인하세요.');saveEndpoint(endpoint);const url=new URL('mission.html',document.baseURI);url.hash=new URLSearchParams({relay:endpoint,code}).toString();location.assign(url.href);}catch(error){status.textContent=error.message;join.querySelector('details').open=true;}
  });
  const finite=(...values)=>{for(const v of values)if(v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v)))return Number(v);return null;};
  function packet(){
    if(typeof buildDesktopSplitSnapshot!=='function'||!uiSettings)return null;
    const raw=runtime.telemetryStore.getSnapshot();if(!raw?.sample||!raw.receivedAt||getDisplayOperationModeValue()==='daq')return null;
    const display=buildDesktopSplitSnapshot(),data=getActiveGyroTelemetryData(raw.sample)||{},age=Math.max(0,Date.now()-raw.receivedAt),phase=String(data.flight_phase||({0:'PRE_FLIGHT',1:'POWERED_FLIGHT',2:'COASTING',3:'DESCENT',4:'LANDED'})[Number(data.flightPhaseCode??data.flight_phase_code)]||({powered:'POWERED_FLIGHT',coasting:'COASTING',descent:'DESCENT',landed:'LANDED',ejection:'EJECTION'})[display.timeline?.active]||'PRE_FLIGHT');
    const mode=[simEnabled?'SIM':replaySourceActive||replayUiActive?'REPLAY':'LIVE',data.simulation_profile||'',display.mission].join(':');
    if(lastMode&&mode!==lastMode||lastPhase==='LANDED'&&phase==='PRE_FLIGHT')runId=runtime.createSplitSessionId();lastMode=mode;lastPhase=phase;
    display.connected=display.connected&&age<5000;
    if(!display.connected)display.quick.connection='DISCONNECTED';
    const activeStage=stageTelemetryModeActive?stageTelemetryStore[display.stageId]:null;
    const selectedAge=activeStage?Math.max(0,Date.now()-(activeStage.updatedAt||0)):age;
    const bo=data.bo??data.baro_valid,altitude=bo!=null&&Number(bo)===0?null:finite(data.alt_m,data.altitude_m,data.baro_alt_m);
    const g=extractTelemetryGeo(data,{koreaOnly:false});
    display.connected=display.connected&&selectedAge<5000;
    return runtime.missionSchema.normalize({version:1,runId,sentAt:Date.now(),sampleAgeMs:Math.max(age,selectedAge),telemetry:display,recovery:{phase,altitudeM:altitude,verticalSpeedMps:finite(data.vertical_speed_mps,raw.derived?.altitudeRateMps),chuteCommanded:parachuteDeployLatched===true||Number(data.parachute_commanded)===1||display.simulation&&!!(simState.drogueDeployed||simState.mainDeployed),chuteConfirmed:Number(data.parachute_open_confirmed)===1,gps:{lat:finite(g?.lat,data.gps_lat),lon:finite(g?.lon,data.gps_lon),alt:finite(g?.alt,data.gps_alt),fix:Number(data.gps_fix)===1,ageMs:finite(data.gps_age_ms),accuracyM:finite(data.gps_hacc_m,data.gps_accuracy_m)}}});
  }
  async function start(event){
    event.preventDefault();if(busy||sharing)return;busy=true;const form=event.currentTarget,button=form.querySelector('[data-mission-start]'),secret=form.querySelector('[data-mission-publish-key]');button.disabled=true;let controller=new AbortController();
    const cancel=()=>controller.abort();scope.add(cancel);
    try{
      const endpoint=runtime.missionClient.endpoint(form.querySelector('[data-mission-endpoint]').value.trim());saveEndpoint(endpoint);
      if(secret.value.length<32)throw new Error('송신 키를 확인하세요.');
      write('[data-mission-message]','온라인 미션을 만드는 중입니다.');
      const response=await fetch(endpoint+'/api/missions',{method:'POST',headers:{Authorization:'Bearer '+secret.value},signal:controller.signal});const result=await response.json();
      if(disposed)return;if(!response.ok)throw new Error(result.error||'미션을 만들지 못했습니다.');
      sharing={...result,endpoint};secret.value='';
      publisher=runtime.missionClient.createClient({endpoint,code:result.code,role:'host',hostToken:result.hostToken,onState(state,detail){write('[data-mission-host-status]',({connecting:'중계 연결 중',connected:'실시간 공유 중',reconnecting:'자동 재연결 중',offline:'중계 연결 끊김',rejected:'공유 종료'})[state]||state);if(detail)write('[data-mission-message]',detail);},onMessage(message){if(message.type==='presence')write('[data-mission-presence]','조회 중 '+message.viewers+'명');}});publisher.connect();
      document.querySelector('[data-mission-share-result]').hidden=false;write('[data-mission-code]',result.code.slice(0,4)+' '+result.code.slice(4));write('[data-mission-expiry]',new Date(result.expiresAt).toLocaleTimeString('ko-KR')+'까지 유효');
      const url=new URL('mission.html',document.baseURI);url.hash=new URLSearchParams({relay:endpoint,code:result.code}).toString();sharing.url=url.href;document.querySelector('[data-mission-open]').href=url.href;
      write('[data-mission-message]','코드 소지자는 선택한 미션 텔레메트리를 조회할 수 있습니다. 폰에서는 기체 명령을 실행할 수 없습니다.');
    }catch(error){if(!disposed)write('[data-mission-message]',error.name==='AbortError'?'공유 요청이 취소되었습니다.':error.message);}finally{busy=false;button.disabled=!!sharing;}
  }
  scope.listen(document.querySelector('[data-mission-publish-form]'),'submit',start);
  scope.listen(document.querySelector('[data-mission-copy]'),'click',async()=>{if(!sharing)return;try{await navigator.clipboard.writeText(sharing.url);write('[data-mission-message]','폰 접속 링크를 복사했습니다.');}catch{write('[data-mission-message]','코드 '+sharing.code+'와 중계 주소를 폰에 입력하세요.');}});
  scope.listen(document.querySelector('[data-mission-end]'),'click',async()=>{
    if(!sharing)return;const previous=sharing;publisher?.close();publisher=null;sharing=null;
    document.querySelector('[data-mission-share-result]').hidden=true;document.querySelector('[data-mission-start]').disabled=false;write('[data-mission-host-status]','공유 중지');
    try{const response=await fetch(previous.endpoint+'/api/missions/'+previous.code+'/end',{method:'DELETE',headers:{Authorization:'Bearer '+previous.hostToken}});if(!response.ok)throw new Error();write('[data-mission-message]','미션 공유를 종료했습니다.');}catch{write('[data-mission-message]','송신을 중지했습니다. 서버 종료 확인은 실패하여 기존 코드는 만료 시 폐기됩니다.');}
  });
  scope.interval(()=>{
    if(disposed)return;const next=packet();if(!next)return;
    if(next.telemetry.receivedAt!==lastSample){lastSample=next.telemetry.receivedAt;recovery?.update(next);}
    if(publisher&&Date.now()-lastSent>=100){lastSent=Date.now();publisher.send(next);}
  },100);
  scope.listen(window,'pagehide',event=>{if(!event.persisted){disposed=true;scope.dispose();}else{publisher?.close();publisher=null;}});
  scope.listen(window,'pageshow',event=>{if(event.persisted&&sharing){publisher=runtime.missionClient.createClient({endpoint:sharing.endpoint,code:sharing.code,role:'host',hostToken:sharing.hostToken,onState:state=>write('[data-mission-host-status]',state==='connected'?'실시간 공유 중':'자동 재연결 중')});publisher.connect();}});
  scope.add(()=>{disposed=true;publisher?.close();recovery?.dispose();});appScope?.add(()=>scope.dispose());
}
