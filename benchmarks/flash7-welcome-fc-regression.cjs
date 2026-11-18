const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function sourceFunction(file,name){
 const source=fs.readFileSync(path.join(__dirname,'../scripts/',file),'utf8');
 const start=source.search(new RegExp('^    (?:async )?function '+name+'\\(', 'm'));
 assert.ok(start>=0,name+' exists');
 const tail=source.slice(start),next=tail.slice(1).search(/^    (?:async )?function /m);
 return next<0?tail:tail.slice(0,next+1);
}
function node(){const classes=new Set();return{hidden:false,disabled:false,textContent:'',dataset:{welcomeView:'flight'},style:{},
 classList:{contains:x=>classes.has(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x)},
 setAttribute(k,v){this[k]=v;},focus(){}};}
(async()=>{
 let now=10000,entries=0,visible=true,searches=0;const state=node();
 const ids=new Map(['welcomeFcGuide','welcomeFlightBtn','welcomeEnterGroundBtn'].map(id=>[id,node()]));
 const screen=node();screen.querySelector=()=>state;
 const el={welcomeConnectScreen:screen,welcomeConnectStatus:node(),welcomeBoardSearchBtn:node(),welcomeBoardSearchLabel:node(),
  welcomeConnectDescription:node(),welcomeEnterGroundBtn:ids.get('welcomeEnterGroundBtn'),welcomeFcGuideStatus:node()};
 const c=vm.createContext({Date:{now:()=>now},el,document:{getElementById:id=>ids.get(id)},
  serialEnabled:true,serialConnected:false,serialConnectedRole:'ground',serialConnectBusy:false,serialSessionId:1,
  connOk:false,wsConnected:false,lastOkMs:now,latestTelemetry:{},DISCONNECT_GRACE_MS:3000,
  simEnabled:false,replayUiActive:false,replaySourceActive:false,welcomeDashboardEntered:false,welcomeBoardSearchBusy:false,
  welcomeConnectCompleted:false,welcomeConnectionVerifiedAtMs:0,welcomeConnectAttempted:false,
  wifiConnectStage:'idle',serialConnectStage:'idle',isMobileLayout:()=>false,isDesktopWelcomeLayout:()=>true,
  hideDisconnectOverlay(){},syncMobileGroundStationWaitOverlay(){},showToast(){},
  requestAnimationFrame(){entries++;},setWelcomeConnectVisible:on=>{visible=on;},
  closeSerialConnectWizard(){c.serialConnectStage='idle';},closeWifiConnectWizard(){c.wifiConnectStage='idle';},
  startWelcomeBoardSearch:async()=>{searches++;}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../scripts/ui/shared/welcome-screen.js'),'utf8'),c);
 for(const name of ['isVerifiedBoardTransportConnected','isSupportedBoardTelemetry','welcomeConnectedBoardRole','connectedBoardRoleLabel',
  'isWelcomeAvionicsConnected','isWelcomeConnectionReady','markWelcomeConnectionReady','clearWelcomeConnectionReady',
  'syncWelcomePrimaryAction','syncWelcomeConnectCopy','setWelcomeConnectStatus','syncWelcomeConnectScreen','enterWelcomeDashboard','handleWelcomePrimaryAction']){
  vm.runInContext(sourceFunction('flash7-shell.js',name),c);
 }
 vm.runInContext(sourceFunction('flash7-views.js','normalizeFlashLinkRole'),c);
 c.syncWelcomeConnectScreen(false);assert.equal(el.welcomeBoardSearchLabel.textContent,'지상국 연결');
 assert.equal(c.enterWelcomeDashboard(),false);assert.equal(el.welcomeEnterGroundBtn.disabled,true);
 await c.handleWelcomePrimaryAction();assert.equal(searches,1);
 c.serialConnected=true;c.syncWelcomeConnectScreen(true);
 assert.equal(el.welcomeConnectStatus.textContent,'기기 찾는중');assert.equal(state.textContent,'SEARCHING');
 assert.equal(el.welcomeBoardSearchLabel.textContent,'FC 연결하기');assert.equal(c.welcomeDashboardEntered,false);
 await c.handleWelcomePrimaryAction();assert.equal(screen.dataset.welcomeView,'fc');assert.equal(ids.get('welcomeFcGuide').hidden,false);
 assert.equal(c.enterWelcomeDashboard(),true,'ground-only entry is explicitly available');assert.equal(visible,false);assert.equal(entries,1);
 c.welcomeDashboardEntered=false;visible=true;c.setWelcomeStartView('flight');
 c.recordWelcomeBoardLink({flash_link_role:'ground',fl_link:1,fl_remote_valid:0},'SER');c.syncWelcomeConnectScreen(true);
 assert.equal(c.welcomeDashboardEntered,false,'radio link without valid FC telemetry keeps waiting');
 c.recordWelcomeBoardLink({flash_link_role:'ground',fl_link:1,fl_remote_valid:1},'SER');c.syncWelcomeConnectScreen(true);
 assert.equal(c.welcomeDashboardEntered,true);assert.equal(visible,false);assert.equal(entries,2);
 c.syncWelcomeConnectScreen(true);assert.equal(entries,2,'repeated telemetry cannot re-enter');
 c.welcomeDashboardEntered=false;c.serialSessionId++;c.syncWelcomeConnectScreen(true);
 assert.equal(c.welcomeDashboardEntered,false,'a new USB session cannot reuse old remote validity');
 c.recordWelcomeBoardLink({flash_link_role:'ground',fl_link:1,fl_remote_valid:1},'SER');now+=3001;c.syncWelcomeConnectScreen(true);
 assert.equal(c.welcomeDashboardEntered,false,'expired FC evidence cannot trigger entry on a control-only link');
 c.serialEnabled=false;c.connOk=true;c.lastOkMs=now;
 c.recordWelcomeBoardLink({flash_link_role:'ground',flash_link_connected:1,flash_link_remote_valid:0},'WIFI');c.syncWelcomeConnectScreen(true);
 assert.equal(c.connectedBoardRoleLabel(),'지상국','Wi-Fi role comes from the full packet, not reduced latestTelemetry');
 assert.equal(c.welcomeDashboardEntered,false);
 c.recordWelcomeBoardLink({flash_link_role:'avionics'},'SIM');c.syncWelcomeConnectScreen(true);
 assert.equal(c.welcomeDashboardEntered,false,'simulation evidence cannot replace live board state');
 c.recordWelcomeBoardLink({fl_role:1,flash_link_connected:true,flash_link_remote_valid:true},'WIFI');c.syncWelcomeConnectScreen(true);
 assert.equal(c.welcomeDashboardEntered,true,'long-form and numeric-role telemetry support auto entry');
 c.welcomeDashboardEntered=false;c.serialEnabled=true;c.serialConnectedRole='avionics';c.syncWelcomeConnectScreen(true);
 assert.equal(c.welcomeDashboardEntered,true,'a directly connected verified avionics board enters automatically');
 c.welcomeDashboardEntered=false;c.simEnabled=true;c.syncWelcomeConnectScreen(true);
 assert.equal(c.welcomeDashboardEntered,false,'simulator entry remains separate');
 console.log('FLASH7 welcome FC: PASS (ground-only state, ordered guide, optional entry, USB/Wi-Fi automatic FC entry, session/freshness isolation, simulator isolation)');
})().catch(error=>{console.error(error);process.exitCode=1;});
