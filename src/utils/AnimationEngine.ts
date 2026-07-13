/**
 * AnimationEngine — pure canvas animation calculator.
 *
 * Given a currentTime (seconds), fps, and element details,
 * returns { tx, ty, scale, rotation, opacity, blur, scaleX, scaleY }
 * that the canvas compositor uses to draw the element — plain math,
 * no player library or React hooks involved.
 */

export interface AnimState {
  tx: number;       // x translation
  ty: number;       // y translation
  scale: number;    // uniform scale
  scaleX: number;   // x scale (for mirror/squeeze)
  scaleY: number;   // y scale
  rotation: number; // degrees
  opacity: number;
  blur: number;     // px
  visible: boolean;
}

// Spring simulation (critically-damped spring physics)
function spring(frame: number, fps: number, from: number, to: number,
  stiffness = 100, damping = 15, mass = 1, durationFrames = 30): number {
  const dt = 1 / fps;
  let x = from - to, v = 0;
  const totalFrames = Math.min(frame, durationFrames);
  for (let i = 0; i < totalFrames; i++) {
    const a = (-stiffness * x - damping * v) / mass;
    v += a * dt;
    x += v * dt;
  }
  return to + x;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function interpolate(v: number, inRange: number[], outRange: number[]): number {
  // Multi-point interpolation
  for (let i = 0; i < inRange.length - 1; i++) {
    const i0 = inRange[i], i1 = inRange[i + 1];
    const o0 = outRange[i], o1 = outRange[i + 1];
    if (v <= i1 || i === inRange.length - 2) {
      if (i1 === i0) return o0;
      const t = (v - i0) / (i1 - i0);
      const result = o0 + t * (o1 - o0);
      return clamp(result, Math.min(...outRange), Math.max(...outRange));
    }
  }
  return outRange[outRange.length - 1];
}

export function computeAnimState(
  animation: string,
  currentTime: number,
  startTime: number,
  endTime: number,
  fps: number,
  x: number, y: number,
  canvasWidth: number, canvasHeight: number,
  fontSize: number = 100
): AnimState {
  const base: AnimState = { tx: x, ty: y, scale: 1, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, blur: 0, visible: true };

  if (animation === "none") return base;

  const startFrame = startTime * fps;
  const endFrame = endTime * fps;
  const frame = currentTime * fps;
  const duration = endFrame - startFrame;
  const relFrame = frame - startFrame;
  const minDur = Math.min(fps * 1, duration);

  const OL = -fontSize - canvasWidth;
  const OT = -fontSize - canvasHeight;
  const OB = canvasHeight;
  const OR = canvasWidth;

  // Before sequence
  if (frame < startFrame) {
    base.visible = false;
    return base;
  }

  // After sequence ends
  if (frame >= endFrame) {
    const out: AnimState = { ...base };
    switch (animation) {
      case "fadeOut": case "shrink": case "unfoldOut": case "explodeOut":
      case "fastForwardOut": case "collapse": case "stretchOut": case "disperse":
        out.opacity = 0; out.visible = false; break;
    }
    return out;
  }

  // During animation
  const s: AnimState = { ...base };

  switch (animation) {
    case "slideIn": {
      s.tx = spring(relFrame, fps, OL, x, 100, 15, 1, minDur);
      s.opacity = interpolate(relFrame, [0, fps * 0.2], [0, 1]);
      break;
    }
    case "slideInRight": {
      s.tx = spring(relFrame, fps, OR, x, 100, 15, 1, minDur);
      s.opacity = interpolate(relFrame, [0, fps * 0.2], [0, 1]);
      break;
    }
    case "slideInFromLeftFade": {
      s.tx = spring(relFrame, fps, OL, x, 100, 15, 1, minDur);
      s.opacity = interpolate(relFrame, [0, minDur * 0.5], [0, 1]);
      break;
    }
    case "slideUp": {
      s.ty = spring(relFrame, fps, OB, y, 100, 15, 1, minDur);
      s.opacity = interpolate(relFrame, [0, fps * 0.2], [0, 1]);
      break;
    }
    case "slideDown": {
      s.ty = spring(relFrame, fps, OT, y, 100, 15, 1, minDur);
      s.opacity = interpolate(relFrame, [0, fps * 0.2], [0, 1]);
      break;
    }
    case "slideFromBottom": {
      s.ty = spring(relFrame, fps, OB, y, 120, 18, 1, minDur);
      s.opacity = interpolate(relFrame, [0, fps * 0.3], [0, 1]);
      break;
    }
    case "slideFromTop": {
      s.ty = spring(relFrame, fps, OT, y, 120, 18, 1, minDur);
      s.opacity = interpolate(relFrame, [0, fps * 0.3], [0, 1]);
      break;
    }
    case "fadeIn": {
      s.opacity = interpolate(relFrame, [0, Math.min(fps * 0.5, duration)], [0, 1]);
      break;
    }
    case "fadeOut": {
      s.opacity = interpolate(relFrame, [0, duration], [1, 0]);
      break;
    }
    case "slowFade": {
      s.opacity = interpolate(relFrame, [0, duration * 0.8], [0, 1]);
      break;
    }
    case "zoomIn": {
      s.scale = spring(relFrame, fps, 0, 1, 100, 10, 1, minDur);
      s.opacity = interpolate(relFrame, [0, fps * 0.2], [0, 1]);
      break;
    }
    case "grow": {
      s.scale = spring(relFrame, fps, 0.5, 1, 100, 10, 1, minDur);
      s.opacity = interpolate(relFrame, [0, fps * 0.2], [0, 1]);
      break;
    }
    case "shrink": {
      s.scale = spring(relFrame, fps, 1, 0, 100, 10, 1, minDur);
      s.opacity = interpolate(relFrame, [0, duration], [1, 0]);
      break;
    }
    case "rotateIn": {
      s.rotation = spring(relFrame, fps, -90, 0, 100, 15, 1, minDur);
      s.opacity = interpolate(relFrame, [0, fps * 0.5], [0, 1]);
      break;
    }
    case "rewindIn": {
      s.rotation = spring(relFrame, fps, -180, 0, 100, 15, 1, minDur);
      s.opacity = interpolate(relFrame, [0, fps * 0.3], [0, 1]);
      break;
    }
    case "mirrorIn": {
      s.scaleX = spring(relFrame, fps, -1, 1, 100, 15, 1, minDur);
      s.scaleY = spring(relFrame, fps, 0, 1, 100, 10, 1, minDur);
      break;
    }
    case "pulse": {
      const cycleDur = fps * 0.5;
      const cycleFrame = relFrame % cycleDur;
      s.scale = interpolate(cycleFrame, [0, cycleDur / 2, cycleDur], [1, 1.05, 1]);
      break;
    }
    case "bounceIn": {
      s.scale = spring(relFrame, fps, 0, 1, 150, 8, 1, minDur);
      s.opacity = interpolate(relFrame, [0, fps * 0.2], [0, 1]);
      break;
    }
    case "flipBounceIn": {
      s.scale = spring(relFrame, fps, 0, 1, 200, 8, 1, minDur);
      s.rotation = spring(relFrame, fps, -15, 0, 150, 8, 1, minDur);
      s.opacity = interpolate(relFrame, [0, fps * 0.2], [0, 1]);
      break;
    }
    case "twirlIn": {
      s.scale = spring(relFrame, fps, 0, 1, 100, 12, 1, minDur);
      s.rotation = spring(relFrame, fps, -540, 0, 100, 12, 1, minDur);
      s.opacity = interpolate(relFrame, [0, fps * 0.3], [0, 1]);
      break;
    }
    case "spinIn": {
      s.scale = spring(relFrame, fps, 0, 1, 100, 15, 1, minDur);
      s.rotation = spring(relFrame, fps, -360, 0, 100, 15, 1, minDur);
      s.opacity = interpolate(relFrame, [0, fps * 0.3], [0, 1]);
      break;
    }
    case "scaleRotateIn": {
      s.scale = spring(relFrame, fps, 0, 1, 100, 12, 1, minDur);
      s.rotation = spring(relFrame, fps, 45, 0, 100, 15, 1, minDur);
      s.opacity = interpolate(relFrame, [0, fps * 0.3], [0, 1]);
      break;
    }
    case "squeezeIn": {
      s.scale = spring(relFrame, fps, 0, 1, 100, 15, 1, minDur);
      s.scaleY = spring(relFrame, fps, 1.5, 1, 100, 15, 1, minDur);
      s.opacity = interpolate(relFrame, [0, fps * 0.2], [0, 1]);
      break;
    }
    case "targetZoom": {
      s.scale = spring(relFrame, fps, 3, 1, 80, 15, 1, minDur);
      s.opacity = interpolate(relFrame, [0, fps * 0.3], [0, 1]);
      break;
    }
    case "blurIn": {
      s.blur = interpolate(relFrame, [0, Math.min(fps * 0.8, duration)], [10, 0]);
      s.opacity = interpolate(relFrame, [0, fps * 0.5], [0, 1]);
      break;
    }
    case "lightSpeedIn": {
      s.tx = spring(relFrame, fps, OL, x, 200, 20, 1, minDur);
      s.opacity = interpolate(relFrame, [0, fps * 0.3], [0, 1]);
      break;
    }
    case "popInUp": {
      s.ty = spring(relFrame, fps, y + 30, y, 300, 15, 0.8, minDur);
      s.scale = spring(relFrame, fps, 0.8, 1, 300, 15, 0.8, minDur);
      s.opacity = interpolate(relFrame, [0, fps * 0.2], [0, 1]);
      break;
    }
    case "popInDown": {
      s.ty = spring(relFrame, fps, y - 30, y, 300, 15, 0.8, minDur);
      s.scale = spring(relFrame, fps, 0.8, 1, 300, 15, 0.8, minDur);
      s.opacity = interpolate(relFrame, [0, fps * 0.2], [0, 1]);
      break;
    }
    case "waveIn": {
      s.ty = spring(relFrame, fps, y + 100, y, 100, 15, 1, minDur);
      s.rotation = spring(relFrame, fps, 10, 0, 100, 15, 1, minDur);
      s.opacity = interpolate(relFrame, [0, fps * 0.3], [0, 1]);
      break;
    }
    case "flashIn": {
      s.opacity = Math.round(relFrame / 2) % 2 === 0
        ? interpolate(relFrame, [0, fps * 0.6], [0, 1])
        : interpolate(relFrame, [0, fps * 0.6], [1, 0.5]);
      break;
    }
    case "flicker": {
      const seed = Math.sin(relFrame * 7.3) * 0.5 + 0.5;
      s.opacity = relFrame < fps * 0.5 ? seed : 1;
      break;
    }
    case "glowIn": {
      s.opacity = interpolate(relFrame, [0, fps * 0.5], [0, 1]);
      s.blur = interpolate(relFrame, [0, fps * 0.5], [8, 0]);
      break;
    }
    case "blingIn": {
      s.scale = spring(relFrame, fps, 0, 1.2, 200, 8, 1, minDur * 0.5);
      if (relFrame > minDur * 0.5) {
        s.scale = spring(relFrame - minDur * 0.5, fps, 1.2, 1, 200, 15, 1, minDur * 0.5);
      }
      s.opacity = interpolate(relFrame, [0, fps * 0.2], [0, 1]);
      break;
    }
    case "expand": {
      s.scale = spring(relFrame, fps, 0, 1, 80, 10, 1, minDur);
      s.opacity = interpolate(relFrame, [0, fps * 0.3], [0, 1]);
      break;
    }
    case "smoothIn": {
      s.tx = spring(relFrame, fps, x - 50, x, 80, 20, 1, minDur);
      s.ty = spring(relFrame, fps, y - 20, y, 80, 20, 1, minDur);
      s.scale = spring(relFrame, fps, 0.8, 1, 80, 20, 1, minDur);
      s.opacity = interpolate(relFrame, [0, fps * 0.5], [0, 1]);
      break;
    }
    case "revealUp": {
      s.ty = spring(relFrame, fps, y + 40, y, 150, 20, 1, minDur);
      s.opacity = interpolate(relFrame, [0, fps * 0.3], [0, 1]);
      break;
    }
    case "explodeOut": {
      s.scale = spring(relFrame, fps, 1, 2, 100, 10, 1, minDur);
      s.opacity = interpolate(relFrame, [0, duration], [1, 0]);
      break;
    }
    case "fastForwardOut": {
      s.tx = spring(relFrame, fps, x, OR + 100, 200, 10, 1, minDur);
      s.rotation = spring(relFrame, fps, 0, 180, 200, 10, 1, minDur);
      s.opacity = interpolate(relFrame, [duration * 0.7, duration], [1, 0]);
      break;
    }
    case "collapse": {
      s.scale = spring(relFrame, fps, 1, 0, 100, 10, 1, minDur);
      s.opacity = interpolate(relFrame, [0, duration], [1, 0]);
      break;
    }
    case "stretchOut": {
      s.scaleX = spring(relFrame, fps, 1, 3, 100, 10, 1, minDur);
      s.scaleY = spring(relFrame, fps, 1, 0, 100, 10, 1, minDur);
      s.opacity = interpolate(relFrame, [duration * 0.5, duration], [1, 0]);
      break;
    }
    case "jigsawIn": {
      s.scale = spring(relFrame, fps, 0, 1, 100, 15, 1, minDur);
      s.rotation = spring(relFrame, fps, 360, 0, 100, 15, 1, minDur);
      s.opacity = interpolate(relFrame, [0, fps * 0.3], [0, 1]);
      break;
    }
    case "chainReaction": {
      s.scale = spring(relFrame, fps, 0, 1, 120, 12, 1, minDur);
      s.ty = spring(relFrame, fps, y - 20, y, 120, 12, 1, minDur);
      s.opacity = interpolate(relFrame, [0, fps * 0.3], [0, 1]);
      break;
    }
    case "stackIn": {
      s.ty = spring(relFrame, fps, y - 60, y, 100, 18, 1, minDur);
      s.scale = spring(relFrame, fps, 0.7, 1, 100, 18, 1, minDur);
      s.opacity = interpolate(relFrame, [0, fps * 0.4], [0, 1]);
      break;
    }
    case "drawIn": {
      s.scaleX = interpolate(relFrame, [0, minDur], [0, 1]);
      s.opacity = interpolate(relFrame, [0, fps * 0.2], [0, 1]);
      break;
    }
    case "loadingSpin": {
      s.rotation = (relFrame / fps) * 360;
      break;
    }
    case "staggerIn": {
      s.opacity = interpolate(relFrame, [0, Math.min(fps, duration)], [0, 1]);
      s.ty = spring(relFrame, fps, y + 20, y, 100, 18, 1, minDur);
      break;
    }
    case "typewriter": {
      // For canvas we just fade in progressively
      s.opacity = interpolate(relFrame, [0, Math.min(fps * 1.5, duration)], [0, 1]);
      break;
    }
    case "foldIn": {
      const foldScale = spring(relFrame, fps, 0, 1, 100, 15, 1, minDur);
      s.scaleY = foldScale;
      s.opacity = interpolate(relFrame, [0, fps * 0.3], [0, 1]);
      break;
    }
    case "flipX": case "flipY": {
      const flipScale = spring(relFrame, fps, 0, 1, 100, 15, 1, minDur);
      if (animation === "flipX") s.scaleX = flipScale;
      else s.scaleY = flipScale;
      s.opacity = interpolate(relFrame, [0, fps * 0.3], [0, 1]);
      break;
    }
    case "maskReveal": {
      s.opacity = 1;
      s.scaleX = interpolate(relFrame, [0, minDur], [0, 1]);
      break;
    }
    case "unfoldOut": {
      s.scaleY = interpolate(relFrame, [0, duration], [1, 0]);
      s.opacity = interpolate(relFrame, [duration * 0.5, duration], [1, 0]);
      break;
    }
    case "disperse": {
      s.tx = x + Math.sin(relFrame * 0.3) * interpolate(relFrame, [0, duration], [0, 80]);
      s.ty = y + Math.cos(relFrame * 0.3) * interpolate(relFrame, [0, duration], [0, 80]);
      s.opacity = interpolate(relFrame, [0, duration], [1, 0]);
      break;
    }
    case "dotsFade": {
      s.opacity = Math.abs(Math.sin((relFrame / fps) * Math.PI));
      break;
    }
    case "slideRight": {
      s.tx = spring(relFrame, fps, OL, x, 100, 15, 1, minDur);
      s.opacity = interpolate(relFrame, [0, fps * 0.2], [0, 1]);
      break;
    }
    default: {
      // Unknown animation — just fade in
      s.opacity = interpolate(relFrame, [0, fps * 0.5], [0, 1]);
      break;
    }
  }

  return s;
}

// Transition blending — returns opacity/transform for canvas ctx
export interface TransitionState {
  progress: number;  // 0..1
  type: string;
}

export function computeTransition(
  transitionType: string,
  currentTime: number,
  clipEndTime: number,
  _fps?: number
): TransitionState | null {
  const duration = 0.6; // seconds
  // The window must end exactly AT clipEndTime, not straddle it — the
  // compositor stops drawing this clip once currentTime passes its
  // endPosition, so any part of the window past that point would never
  // run and the transition would visibly hard-cut partway through
  // instead of completing (progress would cap at 0.5 instead of reaching 1).
  const start = clipEndTime - duration;
  const end = clipEndTime;
  if (currentTime < start || currentTime > end) return null;
  const progress = clamp((currentTime - start) / duration, 0, 1);
  return { progress, type: transitionType };
}
