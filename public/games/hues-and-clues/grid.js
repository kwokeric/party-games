// Shared grid rendering + pan/zoom, used by every in-game view (your
// turn, guessing, reveal). Colors are never sent over the wire — only
// {col, row} coordinates — every client derives the same color from the
// same coordinate via cellColor(), so the grid always matches across
// devices without transmitting any pixel data.

export const COLS = 26;
export const ROWS = 16;
const CELL = 26; // px, must match the .hc-cell size in game.css
// Where cell (0, 0) starts inside the grid content: the row-label column
// (18px) or column-label row (14px), the 3px gap, then the grid's 1px
// border — all from game.css. Cells are CELL wide with a 2px gap.
const ORIGIN_X = 18 + 3 + 1;
const ORIGIN_Y = 14 + 3 + 1;
const PITCH = CELL + 2;
export const COL_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// A color wheel stretched over the rectangle: hue goes around the center
// (red at the top, then clockwise through the rainbow), and lightness falls
// off with distance from the center — pale in the middle, deep at the edges.
// Coordinates are normalized per axis so the wheel fills the whole board.
// Saturation is kept moderate so the board reads as natural, real-world
// colors (leaves, brick, sky) rather than neon.
export function cellColor(col, row) {
  const nx = (col - (COLS - 1) / 2) / ((COLS - 1) / 2);
  const ny = (row - (ROWS - 1) / 2) / ((ROWS - 1) / 2);
  const hue = ((Math.atan2(ny, nx) * 180) / Math.PI + 90 + 360) % 360;
  const dist = Math.min(1, Math.hypot(nx, ny) / Math.SQRT2);
  const light = 86 - dist * 60;
  return `hsl(${hue.toFixed(0)}, 58%, ${light.toFixed(0)}%)`;
}

export function chebyshevDistance(a, b) {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

// Renders (or re-renders) the grid into `content`. `markers` is an array
// of {col, row, type: "flag" | "player" | "self", label?, color?}. Every
// cell carries its own col/row as data attributes regardless of
// `tappable` — initPanZoom uses those to resolve a tap to a cell.
export function buildGrid(content, markers, tappable) {
  content.innerHTML = "";

  const colLabels = document.createElement("div");
  colLabels.className = "hc-col-labels";
  colLabels.style.gridTemplateColumns = `repeat(${COLS}, ${CELL}px)`;
  for (let c = 0; c < COLS; c++) {
    const span = document.createElement("span");
    span.textContent = COL_LETTERS[c] ?? "?";
    colLabels.appendChild(span);
  }

  const rowLabels = document.createElement("div");
  rowLabels.className = "hc-row-labels";
  rowLabels.style.gridTemplateRows = `repeat(${ROWS}, ${CELL}px)`;
  for (let r = 0; r < ROWS; r++) {
    const span = document.createElement("span");
    span.textContent = String(r + 1);
    rowLabels.appendChild(span);
  }

  const grid = document.createElement("div");
  grid.className = "hc-color-grid";
  grid.style.gridTemplateColumns = `repeat(${COLS}, ${CELL}px)`;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = document.createElement("div");
      cell.className = "hc-cell" + (tappable ? " tappable" : "");
      cell.dataset.col = String(c);
      cell.dataset.row = String(r);
      cell.style.background = cellColor(c, r);

      const cellMarkers = markers.filter((m) => m.col === c && m.row === r);
      cellMarkers.forEach((marker, i) => {
        const pin = document.createElement("div");
        pin.className = "hc-pin" + (i > 0 ? " hc-pin-stacked" : "");
        const inner = document.createElement("div");
        inner.className = `hc-pin-${marker.type}`;
        if (marker.type === "flag") inner.textContent = "★";
        // Every player-placed pin (solid, ghost, or your own pending pick)
        // carries the placer's initial and color, so it's always clear
        // whose piece is whose.
        if (marker.type === "player" || marker.type === "self") {
          inner.textContent = marker.label ?? "";
          if (marker.color) inner.style.background = marker.color;
        }
        if (marker.type === "ghost") {
          inner.textContent = marker.label ?? "";
          if (marker.color) {
            inner.style.borderColor = marker.color;
            inner.style.color = marker.color;
          }
        }
        pin.appendChild(inner);
        cell.appendChild(pin);
      });

      grid.appendChild(cell);
    }
  }

  content.append(colLabels, rowLabels, grid);
}

// A real pinch-to-zoom + drag-to-pan viewport: a fixed-size window
// (overflow:hidden) clipping a much larger absolutely-positioned content
// block, moved/scaled via a CSS transform — the same mechanic as a map.
// A plain tap (no meaningful drag, only one finger ever down) resolves to
// the cell under the pointer via elementFromPoint, which — because it
// reads real painted layout — accounts for the current pan/zoom transform
// automatically, so no manual reverse-transform math is needed.
//
// With `fit`, the default view scales the whole board to the viewport's
// width (and never lets you zoom out past that), so it can run edge to edge.
export function initPanZoom(viewport, content, { minScale = 0.45, maxScale = 3, initialScale = 0.9, fit = false, onTap } = {}) {
  let scale = initialScale;
  let x = 0;
  let y = 0;
  const pointers = new Map();
  let panStart = null;
  let pinchStartDist = null;
  let dragDistance = 0;
  let singlePointerTap = false;

  // Only meaningful once the viewport is laid out (a hidden view measures 0).
  function homeScale() {
    if (!fit || !viewport.clientWidth || !content.offsetWidth) return initialScale;
    const fitted = viewport.clientWidth / content.offsetWidth;
    minScale = fitted;
    return fitted;
  }

  function apply() {
    content.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  }

  function clampPosition() {
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const cw = content.offsetWidth * scale;
    const ch = content.offsetHeight * scale;
    x = cw <= vw ? (vw - cw) / 2 : Math.min(0, Math.max(vw - cw, x));
    y = ch <= vh ? (vh - ch) / 2 : Math.min(0, Math.max(vh - ch, y));
  }

  function zoomAt(clientX, clientY, factor) {
    const rect = viewport.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const newScale = Math.min(maxScale, Math.max(minScale, scale * factor));
    const ratio = newScale / scale;
    x = px - (px - x) * ratio;
    y = py - (py - y) * ratio;
    scale = newScale;
    clampPosition();
    apply();
  }

  viewport.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      zoomAt(e.clientX, e.clientY, factor);
    },
    { passive: false }
  );

  viewport.addEventListener("pointerdown", (e) => {
    viewport.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    viewport.classList.add("panning");
    if (pointers.size === 1) {
      panStart = { x: e.clientX, y: e.clientY };
      dragDistance = 0;
      singlePointerTap = true;
    } else {
      pinchStartDist = null;
      singlePointerTap = false;
    }
  });

  viewport.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      if (pinchStartDist != null) zoomAt(midX, midY, dist / pinchStartDist);
      pinchStartDist = dist;
    } else if (pointers.size === 1 && panStart) {
      dragDistance += Math.hypot(e.clientX - prev.x, e.clientY - prev.y);
      x += e.clientX - panStart.x;
      y += e.clientY - panStart.y;
      panStart = { x: e.clientX, y: e.clientY };
      clampPosition();
      apply();
    }
  });

  function release(e) {
    const wasTap = singlePointerTap && pointers.size === 1 && dragDistance < 6;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStartDist = null;
    panStart = pointers.size === 1 ? [...pointers.values()][0] : null;
    if (pointers.size === 0) viewport.classList.remove("panning");

    if (wasTap && onTap) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (el && el.classList.contains("hc-cell")) {
        onTap({ col: Number(el.dataset.col), row: Number(el.dataset.row) });
      }
    }
    singlePointerTap = false;
  }
  viewport.addEventListener("pointerup", release);
  viewport.addEventListener("pointercancel", release);

  clampPosition();
  apply();

  return {
    zoomIn: () => {
      const rect = viewport.getBoundingClientRect();
      zoomAt(rect.left + viewport.clientWidth / 2, rect.top + viewport.clientHeight / 2, 1.3);
    },
    zoomOut: () => {
      const rect = viewport.getBoundingClientRect();
      zoomAt(rect.left + viewport.clientWidth / 2, rect.top + viewport.clientHeight / 2, 1 / 1.3);
    },
    // Re-homes to the default scale/position — call once when a fresh
    // round's grid content replaces the old (buildGrid itself never
    // touches the transform, so marker-only re-renders within the same
    // round should NOT call this, or the user's pan/zoom would keep
    // getting yanked back to center every time a pin updates).
    reset: () => {
      scale = homeScale();
      x = 0;
      y = 0;
      clampPosition();
      apply();
    },
    // Zooms in `factor` times past the home view, centered on one cell —
    // e.g. the target at the reveal.
    centerOn: ({ col, row }, factor = 2) => {
      scale = Math.min(maxScale, homeScale() * factor);
      x = viewport.clientWidth / 2 - (ORIGIN_X + col * PITCH + CELL / 2) * scale;
      y = viewport.clientHeight / 2 - (ORIGIN_Y + row * PITCH + CELL / 2) * scale;
      clampPosition();
      apply();
    },
  };
}
