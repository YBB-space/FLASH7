const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../scripts/ui/shared/flight-charts.js"), "utf8"), context);
const prepare = vm.runInContext("prepareCameraChartSeries", context);
const readRates = vm.runInContext("readCameraGyroRates", context);
assert.deepEqual(Array.from(readRates({gx:0, gyro_y:-2, gz_dps:3.25})), [0,-2,3.25]);
assert.ok(Array.from(readRates(null)).every(Number.isNaN), "missing gyro is a gap, not a false zero-rate stability signal");
assert.ok(Number.isNaN(readRates({gx:"invalid"})[0]));

const sources = [[-1,null,1],[-80,80],[NaN,0],[1,1.1]];
const before = sources.map(values=>values.slice());
const prepared = prepare(sources.map((source,index)=>({
  source, scaleGroup:index < 3 ? "gyro" : "gforce",
  symmetric:index < 3, minSpan:index < 3 ? 10 : 0.5, unit:index < 3 ? "°/s" : "g"
})));
assert.equal(prepared.series[0].group, prepared.series[1].group, "gyro axes must share a scale for amplitude comparison");
assert.equal(prepared.series[0].group, prepared.series[2].group);
assert.notEqual(prepared.series[0].group, prepared.series[3].group, "g and degrees/second require separate scales");
const gyroRange = prepared.series[0].group.range;
assert.equal(gyroRange.min, -gyroRange.max, "gyro scale must be centered on zero");
assert.ok(gyroRange.max >= 80 && gyroRange.min <= -80);
assert.ok(Number.isNaN(prepared.series[0].raw[1]), "missing samples must break a trace");
assert.deepEqual(sources, before, "plot preparation must not mutate recorded samples");
const quiet = prepare([{source:[0,0.001,-0.001], scaleGroup:"gyro", symmetric:true, minSpan:10}]);
assert.ok(quiet.series[0].group.range.span >= 10, "tiny gyro noise must not expand to the full plot height");
const limited = prepare([{source:Array.from({length:1200},(_,index)=>index)}]);
assert.equal(limited.series[0].raw.length, 1000, "drawing cost must remain bounded");
const vibration = Array.from({length:300},(_,index)=>Math.sin(index / 5) * 2);
vibration[150] = 1400;
const vibrationBefore = vibration.slice();
const focusedDefs = [{source:vibration, scaleGroup:"gyro", minSpan:10, symmetric:true, focusRange:true}];
const detail = prepare(focusedDefs, {detail:true}).groups[0];
const full = prepare(focusedDefs, {detail:false}).groups[0];
assert.ok(detail.range.max < 20, "isolated peaks must not flatten normal vibration in DETAIL");
assert.equal(detail.max, 1400, "actual peak magnitude must remain available to the peak indicator");
assert.equal(detail.clipped, true, "focused ranges must explicitly mark overflow");
assert.ok(full.range.max > 1400 && !full.clipped, "FULL must include every original peak");
assert.deepEqual(vibration, vibrationBefore, "focus view must never alter flight samples");
assert.ok(prepare([{source:[0,0], zeroFloor:true, minSpan:1}]).groups[0].range.min >= 0, "speed/g scales must not imply negative magnitudes");

console.log("FLASH7 flight charts: PASS (gyro scale, unit separation, gaps, DETAIL/FULL peak preservation, bounded history)");
