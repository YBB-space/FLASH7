import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(
  new URL("../scripts/flash7-charts-replay.js", import.meta.url),
  "utf8"
);
const storageSource = fs.readFileSync(
  new URL("../scripts/flash7-storage.js", import.meta.url),
  "utf8"
);
const start = source.indexOf("function replayReadMagicText");
const end = source.indexOf("function replayAttachBinProtocolMetadata");
assert.ok(start >= 0 && end > start, "replay protocol classifier source not found");

const context = {ArrayBuffer};
vm.createContext(context);
vm.runInContext(
  [
    "const REPLAY_BIN_RECORD_MARKER = 0xA55A;",
    "const REPLAY_BIN_RECORD_MARKER_ALT = 0x5AA5;",
    "const REPLAY_BIN_METADATA_BYTES = 64;",
    "const REPLAY_BIN_SYNC_METADATA_BYTES = 80;",
    "const REPLAY_BIN_METADATA_MAGIC = 0x32544D48;",
    "const REPLAY_PROTOCOL_COMPATIBLE_MIN = 8;",
    "const REPLAY_PROTOCOL_COMPATIBLE_MAX = 8;",
    source.slice(start, end),
    "globalThis.inspectProtocol = replayInspectBinProtocol;"
  ].join("\n"),
  context
);

function makeHeader(protocolVersion, metadataValid = true, headerSize = 64) {
  const bytes = new Uint8Array(Math.max(64, headerSize));
  const dv = new DataView(bytes.buffer);
  "HWLOGV2".split("").forEach((char, index)=>{
    bytes[index] = char.charCodeAt(0);
  });
  dv.setUint16(8, headerSize >= 64 ? 3 : 2, true);
  dv.setUint16(10, headerSize, true);
  if(headerSize >= 64) {
    dv.setUint32(40, 0x32544D48, true);
    dv.setUint16(44, 1, true);
    dv.setUint16(46, metadataValid ? 1 : 0, true);
    dv.setUint16(52, protocolVersion, true);
    dv.setUint8(56, 1);
  }
  return bytes.buffer.slice(0, headerSize);
}

const oldHeader = context.inspectProtocol(makeHeader(0, false, 40));
assert.equal(oldHeader.candidate, true);
assert.equal(oldHeader.hasMetadata, false);
assert.equal(oldHeader.compatible, false);

const current = context.inspectProtocol(makeHeader(8));
assert.equal(current.hasMetadata, true);
assert.equal(current.compatible, true);
assert.equal(current.protocolVersion, 8);
assert.equal(current.missionTimebaseVersion, 1);

const older = context.inspectProtocol(makeHeader(7));
assert.equal(older.hasMetadata, true);
assert.equal(older.compatible, false);
assert.equal(older.reason, "outside-range");

const newer = context.inspectProtocol(makeHeader(9));
assert.equal(newer.hasMetadata, true);
assert.equal(newer.compatible, false);
assert.equal(newer.reason, "outside-range");

const missingFlag = context.inspectProtocol(makeHeader(8, false));
assert.equal(missingFlag.hasMetadata, false);
assert.equal(missingFlag.compatible, false);

const builderStart = storageSource.indexOf("function buildSpiFlashBinHeader");
const builderEnd = storageSource.indexOf("async function fetchSpiFlashStatusViaSerial");
assert.ok(builderStart >= 0 && builderEnd > builderStart, "BIN header builder source not found");
vm.runInContext(
  [
    "const sampleHistory = [];",
    storageSource.slice(builderStart, builderEnd),
    "globalThis.buildHeader = buildSpiFlashBinHeader;"
  ].join("\n"),
  context
);
const generated = context.buildHeader({
  used_bytes:1040,
  record_count:10,
  protocol:8,
  timebase:1,
  meta:1,
  build:36,
  session_id:12,
  sync_id:42,
  sync_anchor_ms:12500,
  stage_node:2,
  sync_version:1,
  sync_flags:3
});
assert.equal(generated.byteLength, 80);
assert.equal(new DataView(generated.buffer).getUint16(10, true), 80);
const generatedMeta = context.inspectProtocol(Uint8Array.from(generated).buffer);
assert.equal(generatedMeta.compatible, true);
assert.equal(generatedMeta.protocolVersion, 8);
assert.equal(generatedMeta.sessionId, 12);
assert.equal(generatedMeta.firmwareBuildNumber, 36);
assert.equal(generatedMeta.hasMissionSync, true);
assert.equal(generatedMeta.syncId, 42);
assert.equal(generatedMeta.syncLocalAnchorMs, 12500);
assert.equal(generatedMeta.stageNodeId, 2);
assert.equal(generatedMeta.syncVersion, 1);
assert.equal(generatedMeta.syncFlags, 3);

const parseStart = source.indexOf("async function parseReplayBin");
const parseEnd = source.indexOf("function getReplayParserCandidates", parseStart);
const parseSource = source.slice(parseStart, parseEnd);
assert.ok(parseSource.includes("void showReplayLegacyProtocolNotice"));
assert.ok(!parseSource.includes("await showReplayLegacyProtocolNotice"));
vm.runInContext(
  [
    "globalThis.replayBuildSamplesFromBin = ()=>[{sample:{}}];",
    "globalThis.showReplayLegacyProtocolNotice = ()=>new Promise(()=>{});",
    parseSource,
    "globalThis.parseBinWithoutModalGate = parseReplayBin;"
  ].join("\n"),
  context
);
const oldFile = {
  name:"legacy.bin",
  arrayBuffer:async()=>makeHeader(0, false, 40)
};
const parsedWithoutClick = await Promise.race([
  context.parseBinWithoutModalGate(oldFile),
  new Promise((_, reject)=>setTimeout(
    ()=>reject(new Error("legacy notice blocked replay parsing")),
    100
  ))
]);
assert.equal(parsedWithoutClick.length, 1);

// Selection is staged in the picker; entering replay happens only on Proceed.
const transitions = [];
const proceedContext = vm.createContext({
  replayState:{samples:[{sample:{}}], dataMode:"flight"},
  replayAlarmEventsOpen:true,
  replayUiActive:false,
  DATA_SOURCE_REPLAY:"replay",
  el:{welcomeConnectScreen:{classList:{contains:()=>false}}},
  window:{__flashSetActiveView:view=>transitions.push("view:" + view)},
  markWelcomeConnectionReady:()=>{},
  setWelcomeConnectStatus:()=>{},
  setWelcomeConnectVisible:visible=>transitions.push("welcome:" + visible),
  enterReplayMode:()=>transitions.push("enter"),
  setActiveDataSource:source=>transitions.push("source:" + source),
  setFlashLinkDisplayDataMode:mode=>transitions.push("mode:" + mode),
  renderReplayAlarmEvents:()=>{},
  updateReplayModeUi:()=>{},
  updateExportButtonState:()=>{},
  setReplayDataPickerVisible:visible=>transitions.push("picker:" + visible),
  showToast:()=>transitions.push("empty")
});
const activationStart = source.indexOf("function activateReplayModeAfterSelection");
const activationEnd = source.indexOf("function setReplayDataPickerVisible", activationStart);
const proceedStart = source.indexOf("function proceedWithSelectedReplay");
const proceedEnd = source.indexOf("function renderReplayPickerLibrary", proceedStart);
vm.runInContext(source.slice(activationStart, activationEnd) + source.slice(proceedStart, proceedEnd), proceedContext);
assert.equal(vm.runInContext("proceedWithSelectedReplay()", proceedContext), true);
assert.ok(
  transitions.indexOf("welcome:false") < transitions.indexOf("mode:flight"),
  "successful replay must leave the welcome screen before secondary UI updates"
);
assert.ok(transitions.includes("view:Dashboard"), "replay must use the current view router");
assert.equal(transitions.at(-1), "picker:false");
vm.runInContext("replayState.samples = []", proceedContext);
assert.equal(vm.runInContext("proceedWithSelectedReplay()", proceedContext), false);
assert.equal(transitions.at(-1), "empty");

console.log("BIN protocol metadata regression: PASS (64-byte compatibility, 80-byte mission sync, replay transition)");
