/* Deployment-owned relay configuration. Viewers never choose a telemetry destination. */
(function(root){
 'use strict';
 // Set once when the production Worker is deployed. This is a public service URL, never a key.
 const relayOrigin='https://flash7-mission-relay.flash7-mission-relay.workers.dev';
 function configuredEndpoint(){
   const host=root.location?.hostname;
   if(host==='localhost'||host==='127.0.0.1')return 'http://'+host+':8787';
   if(relayOrigin)return relayOrigin;
   throw new Error('온라인 서비스 연결 준비 중입니다.');
 }
 (root.Flash7=root.Flash7||{}).missionConfig={configuredEndpoint};
 if(typeof module==='object'&&module.exports)module.exports=root.Flash7.missionConfig;
})(typeof globalThis!=='undefined'?globalThis:window);
