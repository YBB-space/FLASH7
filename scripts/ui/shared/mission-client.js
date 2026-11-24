/* Connection transport only; no board connection, command or navigation privileges. */
(function(root){
 'use strict';
 function endpoint(raw){
   const url=new URL(raw);
   if(url.username||url.password||url.search||url.hash||url.pathname!=='/'&&url.pathname!=='')throw new Error('중계 주소는 경로 없는 HTTPS 주소를 입력하세요.');
   if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw new Error('HTTPS 중계 주소가 필요합니다.');
   return url.origin;
 }
 function connectionError(error){
   return error?.name==='TypeError'&&/fetch|network|load failed/i.test(error.message||'')?'온라인 서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 페이지를 새로고침해 주세요.':error?.message||'온라인 연결 오류';
 }
 function createClient(options){
   const base=endpoint(options.endpoint),code=String(options.code||'').replace(/[\s-]/g,'').toUpperCase();
   if(!/^[A-Z2-9]{8}$/.test(code))throw new Error('접근 코드 8자리를 확인하세요.');
   let socket=null,disposed=false,retry=null,attempt=0,heartbeat=null,generation=0,lastMessage=0,sequence=0,inflight=null;
   const state=(name,detail)=>options.onState?.(name,detail);
   async function connect(){
     if(disposed)return;const current=++generation;state('connecting');
     try{
       inflight=new AbortController();
       const response=await fetch(base+'/api/missions/'+code+'/join',{method:'POST',headers:{'Content-Type':'application/json',...(options.role==='host'?{Authorization:'Bearer '+options.hostToken}:{})},body:JSON.stringify({role:options.role==='host'?'host':'viewer'}),signal:inflight.signal});
       const auth=await response.json();if(disposed||current!==generation)return;
       if(!response.ok){if([401,403,404,410,429].includes(response.status)){state('rejected',auth.error||'코드 또는 미션 상태를 확인하세요.');return;}throw new Error(auth.error||'중계 연결 오류');}
       const url=new URL(base+'/api/missions/'+code+'/socket');url.protocol=url.protocol==='https:'?'wss:':'ws:';
       const ws=socket=new WebSocket(url,['flash7',auth.ticket]);
       ws.onopen=()=>{if(disposed||current!==generation){ws.close();return;}attempt=0;lastMessage=Date.now();state('connected');clearInterval(heartbeat);heartbeat=setInterval(()=>{if(ws.readyState!==1)return;if(Date.now()-lastMessage>25000){ws.close();return;}ws.send(JSON.stringify({type:'ping'}));},10000);};
       ws.onmessage=event=>{if(disposed||current!==generation)return;lastMessage=Date.now();try{const message=JSON.parse(event.data);if(message.type!=='pong')options.onMessage?.(message);}catch(_error){state('invalid','잘못된 중계 메시지를 무시했습니다.');}};
       ws.onerror=()=>{};
       ws.onclose=event=>{if(disposed||current!==generation)return;clearInterval(heartbeat);heartbeat=null;socket=null;if([4001,4003,4004,4009].includes(event.code)){state('rejected',event.reason||'미션이 종료되었습니다.');return;}reconnect();};
     }catch(error){if(!disposed&&current===generation){state('offline',connectionError(error));reconnect();}}
   }
   function reconnect(){if(disposed||retry)return;state('reconnecting');retry=setTimeout(()=>{retry=null;connect();},Math.min(15000,800*2**Math.min(attempt++,4))+Math.random()*300);}
   return {connect,send(snapshot){if(socket?.readyState!==1)return false;socket.send(JSON.stringify({type:'snapshot',sequence:++sequence,payload:snapshot}));return true;},close(){disposed=true;generation++;inflight?.abort();clearTimeout(retry);clearInterval(heartbeat);if(socket){socket.onclose=null;socket.close(1000,'Client left');}socket=null;}};
 }
 (root.Flash7=root.Flash7||{}).missionClient={endpoint,createClient,connectionError};
 if(typeof module==='object'&&module.exports)module.exports=root.Flash7.missionClient;
})(typeof globalThis!=='undefined'?globalThis:window);
