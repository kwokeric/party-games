// Freehand drawing, recorded as vector strokes rather than a raster
// snapshot. Points are normalized to a fixed, device-independent space
// (NORM_WIDTH x NORM_HEIGHT) so the same stroke data replays correctly on
// any viewer's canvas regardless of their screen size or devicePixelRatio,
// and so the wire payload stays small and resolution-independent. This is
// also what keeps the door open for a future live-reveal: the exact same
// {x,y} stream this file records is what streaming would forward as it's
// drawn, instead of a one-shot image blob.

export const NORM_WIDTH = 1000;
export const NORM_HEIGHT = 750;

const DEFAULT_COLOR = "#1a1a1a";
const DEFAULT_LINE_WIDTH = 7;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function createDrawingState() {
  return { strokes: [], currentStroke: null };
}

export function isEmpty(state) {
  return state.strokes.length === 0;
}

export function beginStroke(state, point) {
  state.currentStroke = [point];
  state.strokes.push(state.currentStroke);
}

export function addPoint(state, point) {
  if (!state.currentStroke) return;
  state.currentStroke.push(point);
}

export function endStroke(state) {
  state.currentStroke = null;
}

export function undo(state) {
  state.strokes.pop();
  state.currentStroke = null;
}

export function clear(state) {
  state.strokes = [];
  state.currentStroke = null;
}

// Maps a pointer event's client coordinates into the normalized space,
// using the canvas's own rendered size (so it works at any CSS size/zoom)
// and clamping so a drag that leaves the canvas still records a sane point
// instead of one that falls off the normalized space entirely.
export function toNormalizedPoint(clientX, clientY, rect) {
  const x = ((clientX - rect.left) / rect.width) * NORM_WIDTH;
  const y = ((clientY - rect.top) / rect.height) * NORM_HEIGHT;
  return { x: clamp(x, 0, NORM_WIDTH), y: clamp(y, 0, NORM_HEIGHT) };
}

// Replays a strokes array onto a 2D context sized canvasWidth x
// canvasHeight, scaling from the normalized space — this is the same
// function a live drawer's own canvas uses to redraw after an Undo/Clear
// and that a guesser's canvas uses to render a drawing it received.
export function renderStrokes(ctx, strokes, canvasWidth, canvasHeight, options = {}) {
  const scaleX = canvasWidth / NORM_WIDTH;
  const scaleY = canvasHeight / NORM_HEIGHT;
  const lineWidth = options.lineWidth ?? DEFAULT_LINE_WIDTH;

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = options.color ?? DEFAULT_COLOR;
  ctx.fillStyle = options.color ?? DEFAULT_COLOR;
  ctx.lineWidth = lineWidth;

  for (const stroke of strokes) {
    if (stroke.length === 0) continue;
    if (stroke.length === 1) {
      // A single tap with no drag — draw a dot so it isn't invisible.
      ctx.beginPath();
      ctx.arc(stroke[0].x * scaleX, stroke[0].y * scaleY, lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(stroke[0].x * scaleX, stroke[0].y * scaleY);
    for (let i = 1; i < stroke.length; i++) {
      ctx.lineTo(stroke[i].x * scaleX, stroke[i].y * scaleY);
    }
    ctx.stroke();
  }
}

// Wires pointer events on `canvasEl` to a drawing state + live redraw, and
// returns a small API for the surrounding UI (Undo/Clear buttons, reading
// the strokes out to submit). Sizes the canvas's backing bitmap by
// devicePixelRatio for crisp lines, while all stroke math stays in the
// normalized space above so the DPR scaling never leaks into the data.
const DRAFT_THROTTLE_MS = 250;

export function attachDrawingCanvas(canvasEl, options = {}) {
  const ctx = canvasEl.getContext("2d");
  const state = createDrawingState();
  let activePointerId = null;
  let lastChangeNotifyAt = 0;

  function resize() {
    const rect = canvasEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvasEl.width = Math.round(rect.width * dpr);
    canvasEl.height = Math.round(rect.height * dpr);
    redraw();
  }

  function redraw() {
    renderStrokes(ctx, state.strokes, canvasEl.width, canvasEl.height, options);
  }

  function pointFromEvent(event) {
    const rect = canvasEl.getBoundingClientRect();
    return toNormalizedPoint(event.clientX, event.clientY, rect);
  }

  function notifyChange() {
    lastChangeNotifyAt = Date.now();
    options.onChange?.(state);
  }

  // A long, uninterrupted drag only calls pointerdown and pointerup once
  // each, many seconds apart — if a caller uses onChange to mirror strokes
  // elsewhere (e.g. a live "draft" checkpoint in case a round's timer cuts
  // the drag off mid-stroke), that checkpoint would otherwise sit stale for
  // the drag's entire duration. Throttled rather than per-pointermove
  // (which can fire 60+ times/sec) to keep that mirroring cheap.
  function notifyChangeThrottled() {
    if (Date.now() - lastChangeNotifyAt < DRAFT_THROTTLE_MS) return;
    notifyChange();
  }

  function onPointerDown(event) {
    if (activePointerId !== null) return;
    activePointerId = event.pointerId;
    canvasEl.setPointerCapture(activePointerId);
    beginStroke(state, pointFromEvent(event));
    redraw();
    notifyChange();
  }

  function onPointerMove(event) {
    if (event.pointerId !== activePointerId) return;
    addPoint(state, pointFromEvent(event));
    redraw();
    notifyChangeThrottled();
  }

  function onPointerUp(event) {
    if (event.pointerId !== activePointerId) return;
    canvasEl.releasePointerCapture(activePointerId);
    activePointerId = null;
    endStroke(state);
    notifyChange();
  }

  canvasEl.addEventListener("pointerdown", onPointerDown);
  canvasEl.addEventListener("pointermove", onPointerMove);
  canvasEl.addEventListener("pointerup", onPointerUp);
  canvasEl.addEventListener("pointercancel", onPointerUp);

  const ro = new ResizeObserver(resize);
  ro.observe(canvasEl);
  resize();

  return {
    undo() {
      undo(state);
      redraw();
      notifyChange();
    },
    clear() {
      clear(state);
      redraw();
      notifyChange();
    },
    getStrokes() {
      return state.strokes;
    },
    isEmpty() {
      return isEmpty(state);
    },
    loadStrokes(strokes) {
      state.strokes = strokes;
      state.currentStroke = null;
      redraw();
    },
    destroy() {
      ro.disconnect();
      canvasEl.removeEventListener("pointerdown", onPointerDown);
      canvasEl.removeEventListener("pointermove", onPointerMove);
      canvasEl.removeEventListener("pointerup", onPointerUp);
      canvasEl.removeEventListener("pointercancel", onPointerUp);
    },
  };
}
