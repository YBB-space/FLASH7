/* Shared link-quality scales and plotting for the dashboard and companion display. */
    function getFlashLinkChartDefinition(metric, samples){
      const list = Array.isArray(samples) ? samples : [];
      if(metric === "loss"){
        let observedMax = 0;
        list.forEach((sample)=>{
          const value = readFirstFiniteLinkMetric(sample && sample.loss);
          if(isFinite(value)) observedMax = Math.max(observedMax, value);
        });
        let max = 5;
        if(observedMax > 5) max = 10;
        if(observedMax > 10) max = 25;
        if(observedMax > 25) max = 50;
        if(observedMax > 50) max = 100;
        return {key:"loss", unit:"%", color:"#ef4444", min:0, max, digits:1};
      }
      if(metric === "hz"){
        let observedMax = 0;
        list.forEach((sample)=>{
          const value = readFirstFiniteLinkMetric(sample && sample.hz);
          if(isFinite(value)) observedMax = Math.max(observedMax, value);
        });
        return {
          key:"hz",
          unit:"Hz",
          color:"#3b82f6",
          min:0,
          max:Math.max(60, Math.ceil(observedMax / 10) * 10),
          digits:0
        };
      }
      return {key:"rssi", unit:"dBm", color:"#22c55e", min:-110, max:-20, digits:0};
    }
    function formatFlashLinkChartValue(value, definition){
      const number = value == null || value === "" ? NaN : Number(value);
      if(!isFinite(number)) return "-- " + definition.unit;
      return number.toFixed(definition.digits) + " " + definition.unit;
    }
    function readFirstFiniteLinkMetric(){
      for(let index = 0; index < arguments.length; index++){
        const raw = arguments[index];
        if(raw == null || raw === "") continue;
        const value = Number(raw);
        if(isFinite(value)) return value;
      }
      return NaN;
    }
    function drawFlashLinkQualityChartTarget(canvas, valueTarget, samples, definition, now, options = {}){
      if(!canvas) return;
      const size = typeof ensureCanvasSize === "function" ? ensureCanvasSize(canvas) : prepareLinkQualityCanvas(canvas);
      if(!size) return;
      const {w:width, h:height, ctx} = size;
      const windowMs = 30000;
      const cutoff = now - windowMs;
      const language = document.documentElement.lang || "ko";
      const dark = document.documentElement.dataset.theme === "dark";
      const textColor = dark ? "rgba(203,213,225,0.72)" : "rgba(71,85,105,0.72)";
      const gridColor = dark ? "rgba(148,163,184,0.15)" : "rgba(100,116,139,0.15)";
      const plot = options.compact ? {left:32,top:8,right:8,bottom:18} : {left:38,top:18,right:10,bottom:24};
      const plotLeft = plot.left;
      const plotTop = plot.top;
      const plotRight = width - plot.right;
      const plotBottom = height - plot.bottom;
      const plotWidth = Math.max(40, plotRight - plotLeft);
      const plotHeight = Math.max(1, plotBottom - plotTop);
      const span = Math.max(1, definition.max - definition.min);

      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.font = (options.compact && height < 100 ? 9 : (options.fontSize || 10)) + "px -apple-system,BlinkMacSystemFont,system-ui,sans-serif";
      ctx.lineWidth = 1;
      ctx.textBaseline = "middle";

      const rows = options.compact && plotHeight < 80 ? 2 : 4;
      for(let index = 0; index <= rows; index++){
        const ratio = index / rows;
        const y = plotTop + (plotHeight * ratio);
        const value = definition.max - (span * ratio);
        ctx.strokeStyle = gridColor;
        ctx.beginPath();
        ctx.moveTo(plotLeft, y);
        ctx.lineTo(plotRight, y);
        ctx.stroke();
        ctx.fillStyle = textColor;
        ctx.textAlign = "right";
        ctx.fillText(value.toFixed(definition.digits), plotLeft - 6, y);
      }
      for(let index = 0; index <= 3; index++){
        const ratio = index / 3;
        const x = plotLeft + (plotWidth * ratio);
        ctx.strokeStyle = gridColor;
        ctx.beginPath();
        ctx.moveTo(x, plotTop);
        ctx.lineTo(x, plotBottom);
        ctx.stroke();
        ctx.fillStyle = textColor;
        ctx.textAlign = index === 0 ? "left" : (index === 3 ? "right" : "center");
        const seconds = Math.round((1 - ratio) * (windowMs / 1000));
        ctx.fillText(seconds === 0 ? (language === "ko" ? "현재" : "now") : ("-" + seconds + "s"), x, plotBottom + 14);
      }

      let latestValue = NaN;
      for(let index = samples.length - 1; index >= 0; index--){
        const value = readFirstFiniteLinkMetric(
          samples[index] && samples[index][definition.key]
        );
        if(isFinite(value)){
          latestValue = value;
          break;
        }
      }
      if(valueTarget){
        valueTarget.textContent = formatFlashLinkChartValue(latestValue, definition);
        valueTarget.style.color = definition.color;
      }

      const validCount = samples.reduce((count, sample)=>(
        isFinite(readFirstFiniteLinkMetric(sample && sample[definition.key]))
          ? count + 1
          : count
      ), 0);
      if(validCount === 0){
        ctx.fillStyle = textColor;
        ctx.font = "12px -apple-system,BlinkMacSystemFont,system-ui,sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(language === "ko" ? "수신 데이터 대기 중" : "Waiting for link data", plotLeft + (plotWidth / 2), plotTop + (plotHeight / 2));
        ctx.restore();
        return;
      }

      const xForTime = (time)=>plotLeft + (((time - cutoff) / windowMs) * plotWidth);
      const yForValue = (value)=>{
        const clamped = Math.max(definition.min, Math.min(definition.max, value));
        return plotBottom - (((clamped - definition.min) / span) * plotHeight);
      };
      ctx.strokeStyle = definition.color;
      ctx.lineWidth = 2.2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      let drawing = false;
      let lastPoint = null;
      samples.forEach((sample)=>{
        if(sample.time < cutoff || sample.time > now) return;
        const value = readFirstFiniteLinkMetric(sample && sample[definition.key]);
        if(!isFinite(value)){
          drawing = false;
          return;
        }
        if(lastPoint && sample.time - lastPoint.time > 1500) drawing = false;
        const x = xForTime(sample.time);
        const y = yForValue(value);
        if(!drawing) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        drawing = true;
        lastPoint = {x, y, time:sample.time};
      });
      ctx.stroke();
      if(lastPoint){
        ctx.fillStyle = definition.color;
        ctx.beginPath();
        ctx.arc(lastPoint.x, lastPoint.y, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

function prepareLinkQualityCanvas(canvas){
  const rect = canvas.getBoundingClientRect();
  if(rect.width < 2 || rect.height < 2) return null;
  const w = canvas.clientWidth || Math.round(rect.width), h = canvas.clientHeight || Math.round(rect.height);
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  if(canvas.width !== Math.round(w*dpr) || canvas.height !== Math.round(h*dpr)){
    canvas.width = Math.round(w*dpr);canvas.height = Math.round(h*dpr);
  }
  const ctx = canvas.getContext("2d");
  if(!ctx) return null;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  return {w,h,ctx};
}
