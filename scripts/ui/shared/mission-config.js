/* Deployment-owned relay configuration. Viewers never choose a telemetry destination. */
(function(root){
 'use strict';
 // Set once when the production Worker is deployed. This is a public service URL, never a key.
 const relayOrigin='https://flash7-mission-relay.flash7-mission-relay.workers.dev';
 function configuredEndpoint(){
   const host=root.location?.hostname;
   const loopback=host==='localhost'||host==='127.0.0.1';
   if(loopback&&/(?:^|[?&])local_relay=1(?:&|$)/.test(root.location?.search||''))return 'http://'+host+':8787';
   if(root.location?.protocol==='file:')throw new Error('온라인 미션은 HTTPS 사이트 또는 로컬 미리보기에서 열어주세요.');
   if(relayOrigin)return relayOrigin;
   throw new Error('온라인 서비스 연결 준비 중입니다.');
 }
 function viewerUrl(code){
   const local=configuredEndpoint().startsWith('http:');
   const url=new URL(local?'mission.html':'https://flash7.kro.kr/mission.html',local?root.location.href:undefined);
   if(local)url.searchParams.set('local_relay','1');
   url.hash=new URLSearchParams({code}).toString();return url.href;
 }
 (root.Flash7=root.Flash7||{}).missionConfig={configuredEndpoint,viewerUrl};
 if(typeof module==='object'&&module.exports)module.exports=root.Flash7.missionConfig;
})(typeof globalThis!=='undefined'?globalThis:window);
