/* Flight overview plots. Each physical unit has its own scale; gyro axes share one. */
const CAMERA_CHART_COLORS = Object.freeze({
  altitude:"#d5dde4", speed:"#92aec1", gforce:"#bcb6a6",
  gyroX:"#b68f8b", gyroY:"#96ad9e", gyroZ:"#8fa9bf"
});
const CAMERA_CHART_VISIBLE_POINTS = 1000;
const cameraTelemetryChartView = {range:"detail"};

function bindCameraChartControls(onChange){
  const root = document.querySelector(".camera-chart-settings");
  if(!root) return ()=>{};
  const onClick = event=>{
    const button = event.target.closest("[data-camera-chart-range]");
    if(!button || !root.contains(button)) return;
    cameraTelemetryChartView.range = button.dataset.cameraChartRange === "full" ? "full" : "detail";
    root.querySelectorAll("[data-camera-chart-range]").forEach(item=>{
      item.setAttribute("aria-pressed", String(item.dataset.cameraChartRange === cameraTelemetryChartView.range));
    });
    onChange();
  };
  root.addEventListener("click", onClick);
  return ()=>root.removeEventListener("click", onClick);
}

function readCameraGyroRates(data){
  return ["x", "y", "z"].map(axis=>{
    const raw = data && (data["g" + axis] ?? data["gyro_" + axis] ?? data["g" + axis + "_dps"]);
    const value = raw == null || raw === "" ? NaN : Number(raw);
    return Number.isFinite(value) ? value : NaN;
  });
}

function prepareCameraChartSeries(definitions, options){
  const groups = new Map();
  const series = definitions.filter(Boolean).map((definition, index)=>{
    const raw = Array.isArray(definition.source)
      ? definition.source.slice(-CAMERA_CHART_VISIBLE_POINTS).map(value=>value == null || value === "" ? NaN : Number(value))
      : [];
    const key = definition.scaleGroup || String(index);
    if(!groups.has(key)) groups.set(key, {
      key, unit:definition.unit || "", min:Infinity, max:-Infinity,
      minSpan:0.2, symmetric:false, focusRange:false, zeroFloor:false, values:[], range:null, clipped:false
    });
    const group = groups.get(key);
    group.minSpan = Math.max(group.minSpan, Number(definition.minSpan) || 0);
    group.symmetric = group.symmetric || !!definition.symmetric;
    group.focusRange = group.focusRange || !!definition.focusRange;
    group.zeroFloor = group.zeroFloor || !!definition.zeroFloor;
    for(const value of raw){
      if(!Number.isFinite(value)) continue;
      group.min = Math.min(group.min, value);
      group.max = Math.max(group.max, value);
      group.values.push(value);
    }
    return {definition, raw, group};
  });
  for(const group of groups.values()){
    if(!Number.isFinite(group.min)) continue;
    let low = group.min, high = group.max;
    if(options && options.detail && group.focusRange && group.values.length >= 20){
      const sorted = group.values.slice().sort((a,b)=>a-b);
      low = sorted[Math.floor((sorted.length - 1) * 0.05)];
      high = sorted[Math.ceil((sorted.length - 1) * 0.95)];
    }
    if(group.symmetric){
      const extent = Math.max(Math.abs(low), Math.abs(high), group.minSpan / 2) * 1.12;
      group.range = {min:-extent, max:extent, span:extent * 2};
    }else{
      const midpoint = (low + high) / 2;
      const span = Math.max(group.minSpan, high - low);
      const half = span * 0.62;
      const min = group.zeroFloor ? Math.max(0, midpoint - half) : midpoint - half;
      const max = Math.max(midpoint + half, min + group.minSpan);
      group.range = {min, max, span:max - min};
    }
    group.clipped = group.min < group.range.min || group.max > group.range.max;
  }
  return {series, groups:Array.from(groups.values())};
}

function formatCameraChartTick(value){
  const magnitude = Math.abs(value);
  if(magnitude >= 1000) return (value / 1000).toFixed(1) + "k";
  if(magnitude >= 100) return value.toFixed(0);
  return value.toFixed(magnitude >= 1 ? 1 : 2);
}

function drawCameraTelemetryChart(canvas, definitions, options){
  if(!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const width = canvas.clientWidth || Math.round(rect.width), height = canvas.clientHeight || Math.round(rect.height);
  if(width < 2 || height < 2) return;
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  if(canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)){
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  const ctx = canvas.getContext("2d");
  if(!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const {series, groups} = prepareCameraChartSeries(Array.isArray(definitions) ? definitions : [], options);
  const clippedGroups = groups.filter(group=>group.clipped);
  const plot = {left:3, right:Math.max(4, width - 3), top:3, bottom:Math.max(4, height - (clippedGroups.length ? 19 : 3))};
  const scaleDescription = groups.filter(group=>group.range).map(group=>
    formatCameraChartTick(group.range.min) + "–" + formatCameraChartTick(group.range.max) + " " + group.unit
  ).join(" · ");
  canvas.title = scaleDescription;
  canvas.setAttribute("aria-label", (canvas.closest("section")?.getAttribute("aria-label") || "비행 차트") + (scaleDescription ? ": " + scaleDescription : ": 데이터 없음"));
  const plotWidth = plot.right - plot.left, plotHeight = plot.bottom - plot.top;
  ctx.lineWidth = 1;
  for(let row = 1; row <= 3; row++){
    const y = Math.round(plot.top + plotHeight * row / 4) + 0.5;
    ctx.strokeStyle = "rgba(220,228,235,.13)";
    ctx.beginPath();ctx.moveTo(plot.left, y);ctx.lineTo(plot.right, y);ctx.stroke();
  }
  for(let column = 1; column <= 3; column++){
    const x = Math.round(plot.left + plotWidth * column / 4) + 0.5;
    ctx.strokeStyle = "rgba(220,228,235,.05)";
    ctx.beginPath();ctx.moveTo(x, plot.top);ctx.lineTo(x, plot.bottom);ctx.stroke();
  }
  groups.filter(group=>group.range && group.symmetric).forEach(group=>{
    const range = group.range;
      const zeroY = plot.bottom - (-range.min / range.span) * plotHeight;
      ctx.save();ctx.setLineDash([3, 4]);ctx.strokeStyle = "rgba(214,222,230,.18)";
      ctx.beginPath();ctx.moveTo(plot.left, zeroY);ctx.lineTo(plot.right, zeroY);ctx.stroke();ctx.restore();
  });
  for(const item of series){
    if(!item.group.range) continue;
    const range = item.group.range;
    let drawing = false;
    ctx.beginPath();
    item.raw.forEach((value, index)=>{
      if(!Number.isFinite(value)){ drawing = false; return; }
      const x = plot.left + index / Math.max(1, item.raw.length - 1) * plotWidth;
      const y = plot.bottom - Math.max(0, Math.min(1, (value - range.min) / range.span)) * plotHeight;
      if(drawing) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      drawing = true;
    });
    ctx.strokeStyle = item.definition.color || CAMERA_CHART_COLORS.altitude;
    ctx.lineWidth = item.definition.lineWidth || 1.45;
    ctx.lineJoin = "round";ctx.lineCap = "round";
    ctx.stroke();
    if(item.group.clipped){
      let previousClip = 0;
      ctx.fillStyle = item.definition.color || CAMERA_CHART_COLORS.altitude;
      item.raw.forEach((value,index)=>{
        const clip = !Number.isFinite(value) ? 0 : value > range.max ? 1 : value < range.min ? -1 : 0;
        if(clip && clip !== previousClip){
          const x = plot.left + index / Math.max(1,item.raw.length - 1) * plotWidth;
          const y = clip > 0 ? plot.top : plot.bottom;
          ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-3,y+clip*5);ctx.lineTo(x+3,y+clip*5);ctx.closePath();ctx.fill();
        }
        previousClip = clip;
      });
    }
  }
  if(clippedGroups.length){
    ctx.fillStyle = "#d8c9b0";
    ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.fillText("PEAK " + clippedGroups.map(group=>formatCameraChartTick(Math.max(Math.abs(group.min),Math.abs(group.max))) + " " + group.unit).join(" · "), width / 2, height - 3);
  }
}

