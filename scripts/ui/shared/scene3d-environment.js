/* A clear sky and world-anchored ground grid, independent of vehicle materials. */
function getGyroSceneEnvironmentPalette(dark){
  return dark ? {
    sky:[0.51,0.56,0.60], horizon:[0.61,0.66,0.70],
    ground:[0.22,0.24,0.27], line:[0.40,0.46,0.52]
  } : {
    sky:[0.56,0.61,0.65], horizon:[0.66,0.71,0.75],
    ground:[0.26,0.28,0.31], line:[0.45,0.51,0.57]
  };
}

function getGyroSceneGridMetrics(distance,metersPerUnit=GYRO_TRAIL_BASE_METERS_PER_UNIT){
  const ratio=GYRO_TRAIL_BASE_METERS_PER_UNIT/getGyroSceneMetersPerUnit(metersPerUnit);
  const numericDistance = Number(distance);
  const safeDistance = Math.max(0.05, Number.isFinite(numericDistance) ? numericDistance : 1);
  return {
    span:Math.max(1200*ratio, safeDistance * 18),
    fadeNear:120*ratio, fadeFar:900*ratio
  };
}

function getGyroSceneClipRange(distance, targetY, metersPerUnit=GYRO_TRAIL_BASE_METERS_PER_UNIT){
  const ratio=GYRO_TRAIL_BASE_METERS_PER_UNIT/getGyroSceneMetersPerUnit(metersPerUnit);
  const safeDistance = Math.max(0.05, Number(distance) || 1);
  return {
    near:Math.max(0.025*ratio, Math.min(0.25*ratio, safeDistance / 2000)),
    far:Math.max(1800*ratio, Math.abs(Number(targetY) || 0) + safeDistance * 24)
  };
}

function createGyroSceneEnvironment(gl){
  const derivatives = !!gl.getExtension("OES_standard_derivatives");
  const precision = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT).precision > 0 ? "highp" : "mediump";
  const vertex = `
    precision ${precision} float;
    attribute vec2 aPos;
    uniform mat4 uViewProj;
    uniform vec2 uCenter;
    uniform float uSpan;
    uniform float uSky;
    varying ${precision} vec2 vWorld;
    varying ${precision} float vDepth;
    void main(){
      vWorld = uCenter + aPos * uSpan;
      gl_Position = uSky > 0.5 ? vec4(aPos, 0.999, 1.0)
        : uViewProj * vec4(vWorld.x, 0.0, vWorld.y, 1.0);
      vDepth = gl_Position.w;
    }`;
  const fragment = `${derivatives ? "#extension GL_OES_standard_derivatives : enable" : ""}
    precision ${precision} float;
    varying ${precision} vec2 vWorld;
    varying ${precision} float vDepth;
    uniform float uSky;
    uniform float uHeight;
    uniform float uWidth;
    uniform vec2 uProjection;
    uniform vec2 uProjectionOffset;
    uniform vec3 uViewY;
    uniform vec3 uSkyColor;
    uniform vec3 uHorizonColor;
    uniform vec3 uGroundColor;
    uniform vec3 uLineColor;
    uniform vec2 uEye;
    uniform float uEyeHeight;
    uniform float uGrid;
    uniform float uMetersPerUnit;
    uniform float uFadeNear;
    uniform float uFadeFar;
    float gridLine(float stepSize){
      vec2 cell = vWorld * uMetersPerUnit / stepSize;
      vec2 footprint = ${derivatives ? "max(fwidth(cell), vec2(0.0001))" : "vec2(max(0.0001, 2.0 * vDepth * uMetersPerUnit / (uHeight * uProjection.y * stepSize)))"};
      vec2 edge = abs(fract(cell - 0.5) - 0.5);
      vec2 line = 1.0 - smoothstep(footprint * 0.35, footprint * 1.25, edge);
      float visible = 1.0 - smoothstep(0.03125, 0.0625, max(footprint.x, footprint.y));
      return max(line.x, line.y) * visible;
    }
    void main(){
      vec2 screen = (gl_FragCoord.xy / vec2(uWidth, uHeight) * 2.0 - 1.0 + uProjectionOffset) / uProjection;
      float elevation = dot(vec3(screen, 1.0), uViewY) / length(vec3(screen, 1.0));
      vec3 sky = mix(uHorizonColor, uSkyColor, smoothstep(-0.035, 0.75, elevation));
      if(uSky > 0.5){
        gl_FragColor = vec4(sky, 1.0);
      }else{
        // Normalize before length() to stay within mediump range on older GPUs.
        float distanceXZ = length((vWorld - uEye) / uFadeFar);
        float fade = 1.0 - smoothstep(uFadeNear / uFadeFar, 1.0, distanceXZ);
        // At a low viewing angle a world-space fade can collapse to one pixel.
        // Retain a soft horizon even at maximum zoom-out.
        float slope = abs(uEyeHeight / uFadeFar) / max(0.0001, distanceXZ);
        fade *= smoothstep(0.0, 0.035, slope);
        vec3 ground = mix(uGroundColor, uHorizonColor, (1.0 - fade) * 0.18);
        if(uGrid > 0.5){
          // These spacings belong to the world. Subpixel levels fade through
          // their pixel footprint, rather than growing along with the camera.
          float grid = min(0.23, gridLine(1.0) * 0.07 + gridLine(5.0) * 0.13
            + gridLine(25.0) * 0.09 + gridLine(125.0) * 0.07 + gridLine(625.0) * 0.05);
          ground = mix(ground, uLineColor, grid * fade);
        }
        gl_FragColor = vec4(ground, fade);
      }
    }`;
  const prog = createGyroProgram(gl, vertex, fragment);
  const environment = {
    prog, aPos:gl.getAttribLocation(prog, "aPos"),
    posBuf:createGyroArrayBuffer(gl, [-1,-1, 1,-1, 1,1, -1,-1, 1,1, -1,1], gl.STATIC_DRAW)
  };
  for(const name of ["ViewProj", "Center", "Span", "Sky", "Height", "Width", "Projection", "ProjectionOffset", "ViewY", "SkyColor", "HorizonColor", "GroundColor", "LineColor", "Eye", "EyeHeight", "Grid", "MetersPerUnit", "FadeNear", "FadeFar"]){
    environment["u" + name] = gl.getUniformLocation(prog, "u" + name);
  }
  return environment;
}

function drawGyroSceneEnvironment(sky, palette, viewProj, eye, distance, view){
  const {gl, environment, width, height, proj} = gyroGl;
  const units=getGyroSceneMetersPerUnit(gyroSceneView.metersPerUnit),snap=256*GYRO_TRAIL_BASE_METERS_PER_UNIT/units;
  const metrics = getGyroSceneGridMetrics(distance,units);
  gl.useProgram(environment.prog);
  bindGyroVertexAttributes([environment.aPos]);
  gl.bindBuffer(gl.ARRAY_BUFFER, environment.posBuf);
  gl.vertexAttribPointer(environment.aPos, 2, gl.FLOAT, false, 0, 0);
  gl.uniformMatrix4fv(environment.uViewProj, false, new Float32Array(viewProj));
  gl.uniform2f(environment.uCenter, Math.floor(eye[0] / snap) * snap, Math.floor(eye[2] / snap) * snap);
  gl.uniform1f(environment.uSpan, metrics.span);
  gl.uniform1f(environment.uSky, sky ? 1 : 0);
  gl.uniform1f(environment.uHeight, height);
  gl.uniform1f(environment.uWidth, width);
  gl.uniform2f(environment.uProjection, proj[0], proj[5]);
  gl.uniform2f(environment.uProjectionOffset, proj[8], proj[9]);
  gl.uniform3f(environment.uViewY, view[4], view[5], -view[6]);
  gl.uniform3fv(environment.uSkyColor, palette.sky);
  gl.uniform3fv(environment.uHorizonColor, palette.horizon);
  gl.uniform3fv(environment.uGroundColor, palette.ground);
  gl.uniform3fv(environment.uLineColor, palette.line);
  gl.uniform2f(environment.uEye, eye[0], eye[2]);
  gl.uniform1f(environment.uEyeHeight, eye[1]);
  gl.uniform1f(environment.uGrid, gyroSceneView.grid ? 1 : 0);
  gl.uniform1f(environment.uMetersPerUnit, units);
  gl.uniform1f(environment.uFadeNear, metrics.fadeNear);
  gl.uniform1f(environment.uFadeFar, metrics.fadeFar);
  if(sky){
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
  }
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  if(sky){
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
  }
}
