const params = new URLSearchParams(location.search);
const room = params.get("room");
const isHostUrl = params.get("host") === "1";
const playerName = params.get("name") ?? "";

const el = (id) => document.getElementById(id);

const lobbyView = el("lobby-view");
const guessingView = el("guessing-view");
const revealView = el("reveal-view");
const finalView = el("final-view");
const backBtn = el("back-btn");
const lobbyRoomCodeEl = el("lobby-room-code");
const copyCodeBtn = el("copy-code-btn");
const lobbyPlayerListEl = el("lobby-player-list");
const startBtn = el("start-btn");
const readyBtn = el("ready-btn");
const lobbyWaitingEl = el("lobby-waiting");

const guessBackBtn = el("guess-back-btn");
const guessRoomCodeEl = el("guess-room-code");
const guessAvatarStackEl = el("guess-avatar-stack");
const guessStatusTextEl = el("guess-status-text");
const guessConnectionDotEl = el("guess-connection-dot");
const guessConnectionTextEl = el("guess-connection-text");

const objectAArticleEl = el("object-a-article");
const objectANameEl = el("object-a-name");
const objectASizeEl = el("object-a-size");
const objectBArticleEl = el("object-b-article");
const objectBNameEl = el("object-b-name");
const objectAImg = el("object-a-img");
const objectBImg = el("object-b-img");
const objectAStageLabel = el("object-a-stage-label");
const objectBStageLabel = el("object-b-stage-label");
const stage = el("stage");
const resizeHandle = el("resize-handle");
const guessReadout = el("guess-readout");
const submitBtn = el("submit-btn");
const waitingMessage = el("waiting-message");
const zoomInBtn = el("zoom-in");
const zoomOutBtn = el("zoom-out");

const revealBackBtn = el("reveal-back-btn");
const revealRoomCodeEl = el("reveal-room-code");
const revealConnectionDotEl = el("reveal-connection-dot");
const revealConnectionTextEl = el("reveal-connection-text");
const revealRoundLabelEl = el("reveal-round-label");
const revealRoundTrackEl = el("reveal-round-track");
const revealStageEl = el("reveal-stage");
const revealGuessObj = el("reveal-object-b-guess");
const revealTrueObj = el("reveal-object-b-true");
const revealGuessImg = el("reveal-guess-img");
const revealTrueImg = el("reveal-true-img");
const revealTrueLine = el("reveal-true-line");
const revealTrueLabel = el("reveal-true-label");
const revealMarkersEl = el("reveal-markers");
const revealSummary = el("reveal-summary");
const resultsList = el("results-list");
const revealReadyBtn = el("reveal-ready-btn");

const finalBackBtn = el("final-back-btn");
const finalRoomCodeEl = el("final-room-code");
const finalWinnerAvatarEl = el("final-winner-avatar");
const finalWinnerNameEl = el("final-winner-name");
const finalWinnerScoreEl = el("final-winner-score");
const finalStandingsListEl = el("final-standings-list");
const finalPlayAgainBtn = el("final-play-again-btn");

lobbyRoomCodeEl.textContent = room ?? "(none)";
guessRoomCodeEl.textContent = room ?? "(none)";
revealRoomCodeEl.textContent = room ?? "(none)";
finalRoomCodeEl.textContent = room ?? "(none)";

let myId = null;
let players = [];
let round = null; // { objectA, objectB }
let phase = "lobby";
let guessLength = 1;
let zoom = 1;
let basePxPerMeter = 100;
let hasSubmitted = false;

function article(name) {
  return /^[aeiou]/i.test(name) ? "an" : "a";
}

function formatMeters(m) {
  if (m < 1) return `${m.toFixed(3)} m`;
  if (m < 10) return `${m.toFixed(2)} m`;
  return `${m.toFixed(1)} m`;
}

function showView(view) {
  lobbyView.hidden = view !== "lobby";
  guessingView.hidden = view !== "guessing";
  revealView.hidden = view !== "reveal";
  finalView.hidden = view !== "final";
}

const READY_CHECK_SVG =
  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

// Ready dots live inside per-row list items (results-list, final-standings-list)
// tagged with data-player-id, so a "players" update can flip them live without
// rebuilding the whole list (which would also wipe the guess/score columns).
function updateReadyDots() {
  for (const p of players) {
    for (const list of [resultsList, finalStandingsListEl]) {
      const dot = list.querySelector(`[data-player-id="${p.id}"] .status-dot`);
      if (dot) dot.classList.toggle("on", Boolean(p.ready));
    }
  }
}

function renderRoundTrack(container, roundNumber, maxRounds) {
  container.innerHTML = "";
  for (let i = 1; i <= maxRounds; i++) {
    const span = document.createElement("span");
    if (i <= roundNumber) span.classList.add("done");
    container.appendChild(span);
  }
}

function isHost() {
  return players.find((p) => p.id === myId)?.isHost ?? false;
}

function renderPlayers() {
  lobbyPlayerListEl.innerHTML = "";
  for (const p of players) {
    const li = document.createElement("li");
    li.className = "lobby-player-row";

    const avatar = document.createElement("span");
    avatar.className = "lobby-avatar";
    avatar.textContent = p.name.trim().charAt(0) || "?";

    const nameEl = document.createElement("span");
    nameEl.className = "lobby-player-name";
    nameEl.textContent = p.name + (p.id === myId ? " (you)" : "");

    li.append(avatar, nameEl);

    if (p.isHost) {
      const badge = document.createElement("span");
      badge.className = "lobby-host-badge";
      badge.textContent = "HOST";
      li.append(badge);
    } else if (p.ready) {
      const tag = document.createElement("span");
      tag.className = "lobby-ready-tag";
      tag.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#067bc2" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
      tag.append("Ready");
      li.append(tag);
    }

    lobbyPlayerListEl.appendChild(li);
  }

  guessAvatarStackEl.innerHTML = "";
  for (const p of players) {
    const span = document.createElement("span");
    span.className = "guess-avatar";
    span.textContent = p.name.trim().charAt(0) || "?";
    guessAvatarStackEl.appendChild(span);
  }
  const guessedCount = players.filter((p) => p.hasGuessed).length;
  guessStatusTextEl.textContent = `${guessedCount} of ${players.length} guessed`;

  if (phase === "lobby") {
    const amHost = isHost();
    startBtn.hidden = !amHost;
    readyBtn.hidden = amHost;
    lobbyWaitingEl.hidden = amHost;
    if (!amHost) {
      const host = players.find((p) => p.isHost);
      lobbyWaitingEl.textContent = `Waiting for ${host?.name ?? "the host"} to start the round`;
      const me = players.find((p) => p.id === myId);
      readyBtn.textContent = me?.ready ? "Not ready" : "Ready up";
      readyBtn.classList.toggle("is-ready", Boolean(me?.ready));
    }
  }

  if (phase === "reveal") {
    const me = players.find((p) => p.id === myId);
    revealReadyBtn.disabled = Boolean(me?.ready);
    revealReadyBtn.textContent = me?.ready ? "Waiting for others…" : "Ready";
  }

  if (phase === "final") {
    const me = players.find((p) => p.id === myId);
    finalPlayAgainBtn.disabled = Boolean(me?.ready);
    finalPlayAgainBtn.textContent = me?.ready ? "Waiting for others…" : "Play again";
  }

  updateReadyDots();
}

// <img src="object.svg"> can't have its `currentColor` styled by CSS on
// the page (the SVG is an isolated document as far as color inheritance
// goes), which is why objects used to render solid black regardless of
// the `color` set on their container. Inlining the SVG markup directly
// into the DOM instead makes `currentColor` resolve normally.
const svgTextCache = new Map();

async function loadSvgText(url) {
  if (!svgTextCache.has(url)) {
    svgTextCache.set(
      url,
      fetch(url).then((res) => res.text())
    );
  }
  return svgTextCache.get(url);
}

async function setObjectVisual(container, url) {
  container.innerHTML = await loadSvgText(url);
}

function sizeStyle(pxPerMeter, obj, length_m) {
  const px = Math.max(4, length_m * pxPerMeter);
  return obj.axis === "width"
    ? { width: `${px}px`, height: "auto" }
    : { width: "auto", height: `${px}px` };
}

function applySize(container, style) {
  const svg = container.querySelector("svg");
  if (!svg) return;
  svg.style.width = style.width;
  svg.style.height = style.height;
}

function renderObjectA() {
  if (!round) return;
  applySize(objectAImg, sizeStyle(basePxPerMeter * zoom, round.objectA, round.objectA.length_m));
  objectAStageLabel.textContent = round.objectA.name;
}

function renderObjectB() {
  if (!round) return;
  applySize(objectBImg, sizeStyle(basePxPerMeter * zoom, round.objectB, guessLength));
  objectBStageLabel.textContent = round.objectB.name;
  resizeHandle.className = `resize-handle axis-${round.objectB.axis}`;
  guessReadout.textContent = `Your guess: ${formatMeters(guessLength)}`;
}

// Matches .baseline{bottom:48px} in game.css.
const BASELINE_OFFSET = 48;

// Object B starts just to the right of wherever object A actually ends,
// rather than a fixed offset, so a small reference object leaves more
// room to drag before running off the visible stage. The label can be much
// wider than a narrow icon (e.g. "Chess King (Piece)"), so its right edge
// has to be considered too or it overlaps object B's own label.
function positionObjectB() {
  const stageRect = stage.getBoundingClientRect();
  const aRect = el("object-a").getBoundingClientRect();
  const aLabelRect = objectAStageLabel.getBoundingClientRect();
  const rightEdge = Math.max(aRect.right, aLabelRect.right);
  const gap = 24;
  el("object-b").style.left = `${rightEdge - stageRect.left + gap}px`;
}

// Keeps the larger of the two objects within a comfortable size on
// screen by zooming out (never in) — called after the user lets go of
// the drag handle, since a big drag can otherwise leave the object
// towering off the visible stage.
const STAGE_FIT_PX = 300;

function autoFitZoom() {
  if (!round) return;
  const aPx = round.objectA.length_m * basePxPerMeter * zoom;
  const bPx = guessLength * basePxPerMeter * zoom;
  const largest = Math.max(aPx, bPx);
  if (largest <= STAGE_FIT_PX) return;
  zoom = Math.max(0.2, zoom * (STAGE_FIT_PX / largest));
  renderObjectA();
  renderObjectB();
  positionObjectB();
}

async function startGuessing(objectA, objectB) {
  round = { objectA, objectB };
  phase = "guessing";
  hasSubmitted = false;
  guessLength = objectA.length_m;
  zoom = 1;
  basePxPerMeter = 140 / objectA.length_m;

  objectAArticleEl.textContent = article(objectA.name);
  objectANameEl.textContent = objectA.name;
  objectASizeEl.textContent = formatMeters(objectA.length_m);
  objectBArticleEl.textContent = article(objectB.name);
  objectBNameEl.textContent = objectB.name;

  submitBtn.disabled = false;
  submitBtn.textContent = "Submit guess";
  waitingMessage.hidden = true;

  await Promise.all([
    setObjectVisual(objectAImg, objectA.svg),
    setObjectVisual(objectBImg, objectB.svg),
  ]);
  renderObjectA();
  renderObjectB();
  // positionObjectB() measures object A's rendered box, which only has
  // real layout once the (currently hidden) guessing view is shown.
  showView("guessing");
  positionObjectB();
}

async function showReveal(roundNumber, maxRounds, objectBTrueLength_m, guesses) {
  phase = "reveal";
  if (!round) return;

  const mine = guesses.find((g) => g.id === myId);
  const myGuess = mine?.guess_m ?? guessLength;

  // Scale is picked across every guess (not just mine) plus the true size, so
  // no opponent marker ever falls off the edge of the stage.
  const allSizes = guesses
    .map((g) => g.guess_m)
    .filter((v) => typeof v === "number");
  const largest = Math.max(objectBTrueLength_m, myGuess, ...allSizes);
  const revealPxPerMeter = 220 / largest;

  await Promise.all([
    setObjectVisual(revealGuessImg, round.objectB.svg),
    setObjectVisual(revealTrueImg, round.objectB.svg),
  ]);

  // Show the view before measuring reveal-stage's clientHeight below —
  // a hidden element reports 0, which broke the height-axis tick position.
  showView("reveal");

  revealRoundLabelEl.textContent = `Round ${roundNumber} of ${maxRounds}`;
  renderRoundTrack(revealRoundTrackEl, roundNumber, maxRounds);

  applySize(revealGuessImg, sizeStyle(revealPxPerMeter, round.objectB, myGuess));
  applySize(revealTrueImg, sizeStyle(revealPxPerMeter, round.objectB, objectBTrueLength_m));

  // Whichever silhouette is smaller sits in front, so it's never fully
  // hidden behind the larger one when the two are close in size.
  const guessIsSmaller = myGuess <= objectBTrueLength_m;
  revealGuessObj.style.zIndex = guessIsSmaller ? "2" : "1";
  revealTrueObj.style.zIndex = guessIsSmaller ? "1" : "2";

  revealTrueLine.hidden = false;
  revealTrueLabel.textContent = `${formatMeters(objectBTrueLength_m)} true size`;
  if (round.objectB.axis === "width") {
    // Horizontal dashed line spans exactly to the true shape's rendered
    // right edge — measured from the actual SVG box rather than computed
    // from length_m, so it lines up with the silhouette even when the
    // cropped viewBox doesn't start flush at its container's left edge.
    const stageRect = revealStageEl.getBoundingClientRect();
    const trueSvgRect = revealTrueImg.querySelector("svg").getBoundingClientRect();
    revealTrueLine.style.left = `${trueSvgRect.left - stageRect.left}px`;
    revealTrueLine.style.width = `${trueSvgRect.width}px`;
    revealTrueLine.style.top = "38px";
  } else {
    // A full-width line doesn't mean anything for a height comparison —
    // use a short tick at the true shape's actual height instead.
    const trueHeightPx = objectBTrueLength_m * revealPxPerMeter;
    const stageHeight = revealStageEl.clientHeight;
    const topPx = Math.max(8, stageHeight - BASELINE_OFFSET - trueHeightPx - 12);
    revealTrueLine.style.left = "26px";
    revealTrueLine.style.width = "40px";
    revealTrueLine.style.top = `${topPx}px`;
  }

  // Opponents' guesses are plotted as small markers on the same scale as the
  // two silhouettes, rather than full shapes, to keep the stage legible.
  revealMarkersEl.innerHTML = "";
  const opponents = guesses.filter((g) => g.id !== myId && typeof g.guess_m === "number");
  opponents.forEach((g, index) => {
    const marker = document.createElement("div");
    marker.className = "reveal-marker";

    const tick = document.createElement("span");
    tick.className = "reveal-marker-tick";
    const chip = document.createElement("span");
    chip.className = "reveal-marker-chip";
    chip.textContent = g.name.trim().charAt(0) || "?";
    marker.append(tick, chip);

    const px = g.guess_m * revealPxPerMeter;
    if (round.objectB.axis === "width") {
      marker.style.left = `${26 + px}px`;
      marker.style.bottom = `${BASELINE_OFFSET}px`;
    } else {
      marker.style.left = `${40 + index * 18}px`;
      marker.style.bottom = `${BASELINE_OFFSET + px}px`;
    }
    revealMarkersEl.appendChild(marker);
  });

  if (mine) {
    const pctOff = Math.round((Math.abs(myGuess - objectBTrueLength_m) / objectBTrueLength_m) * 100);
    // Safe to use innerHTML here: every interpolated value is a number we
    // formatted ourselves, never raw user text (unlike player names below).
    revealSummary.innerHTML = `You said <strong>${formatMeters(myGuess)}</strong> · true size <strong>${formatMeters(
      objectBTrueLength_m
    )}</strong> · off by ${pctOff}% · score <strong style="color: #067bc2;">${mine.score}/100</strong>`;
  } else {
    revealSummary.textContent = `True size: ${formatMeters(objectBTrueLength_m)}`;
  }

  resultsList.innerHTML = "";
  guesses.forEach((g, index) => {
    const li = document.createElement("li");
    li.className = "reveal-result-row" + (g.id === myId ? " is-you" : "");
    li.dataset.playerId = g.id;

    const avatar = document.createElement("span");
    avatar.className = "reveal-avatar";
    avatar.textContent = g.name.trim().charAt(0) || "?";

    const nameEl = document.createElement("span");
    nameEl.className = "reveal-result-name";
    nameEl.textContent = g.name;
    if (g.id === myId) {
      const tag = document.createElement("span");
      tag.className = "you-tag";
      tag.textContent = " (you)";
      nameEl.appendChild(tag);
    }

    const guessEl = document.createElement("span");
    guessEl.className = "reveal-result-guess";
    guessEl.textContent = typeof g.guess_m === "number" ? formatMeters(g.guess_m) : "-";

    const scoreEl = document.createElement("span");
    scoreEl.className = index === 0 ? "reveal-result-score top" : "reveal-result-score";
    scoreEl.textContent = String(g.score);

    const readyDot = document.createElement("span");
    readyDot.className = "status-dot";
    readyDot.innerHTML = READY_CHECK_SVG;

    li.append(avatar, nameEl, guessEl, scoreEl, readyDot);
    resultsList.appendChild(li);
  });

  renderPlayers();
}

function showFinal(standings) {
  phase = "final";
  showView("final");

  const winner = standings[0];
  finalWinnerAvatarEl.textContent = winner?.name.trim().charAt(0) || "?";
  finalWinnerNameEl.textContent = winner?.name ?? "-";
  finalWinnerScoreEl.textContent = winner ? winner.avgScore.toFixed(1) : "-";

  finalStandingsListEl.innerHTML = "";
  standings.forEach((s, index) => {
    const li = document.createElement("li");
    li.className =
      "reveal-result-row" + (s.id === myId ? " is-you" : "") + (index === 0 ? " champ" : "");
    li.dataset.playerId = s.id;

    const rank = document.createElement("span");
    rank.className = `roster-rank r${index + 1}`;
    rank.textContent = String(index + 1);

    const avatar = document.createElement("span");
    avatar.className = "reveal-avatar";
    avatar.textContent = s.name.trim().charAt(0) || "?";

    const nameEl = document.createElement("span");
    nameEl.className = "reveal-result-name";
    nameEl.textContent = s.name;
    if (s.id === myId) {
      const tag = document.createElement("span");
      tag.className = "you-tag";
      tag.textContent = " (you)";
      nameEl.appendChild(tag);
    }

    const scoreEl = document.createElement("span");
    scoreEl.className = index === 0 ? "reveal-result-score top" : "reveal-result-score";
    scoreEl.textContent = s.avgScore.toFixed(1);

    const readyDot = document.createElement("span");
    readyDot.className = "status-dot";
    readyDot.innerHTML = READY_CHECK_SVG;

    li.append(rank, avatar, nameEl, scoreEl, readyDot);
    finalStandingsListEl.appendChild(li);
  });

  renderPlayers();
}

let dragging = false;
let dragStartPos = 0;
let dragStartGuess = 0;

resizeHandle.addEventListener("pointerdown", (e) => {
  if (hasSubmitted) return;
  // On desktop (mouse, not touch) a drag that passes over the object labels
  // can otherwise kick off the browser's native text-selection/drag-ghost
  // behavior, which steals the remaining pointermove events from us — the
  // resize visually "sticks" mid-drag and then reverts on release since our
  // state was never updated. preventDefault blocks that native behavior.
  e.preventDefault();
  dragging = true;
  resizeHandle.setPointerCapture(e.pointerId);
  resizeHandle.classList.add("dragging");
  dragStartGuess = guessLength;
  dragStartPos = round.objectB.axis === "width" ? e.clientX : e.clientY;
});

// Keeps the drag handle from reaching the edge of the stage mid-drag by
// zooming out live, rather than only correcting after the drag ends.
// Steps by the same 1/1.5 factor as the zoom-out button (rather than a
// continuous exact-fit ratio) so drag-triggered zoom always lands on the
// same increments as the manual controls.
const EDGE_MARGIN_PX = 28;

// After a correction, the drag anchor (dragStartPos/dragStartGuess) is
// rebased to the pointer's current position and the now-corrected guess.
// Without this, the NEXT pointermove recomputes guessLength from the
// original anchor using the new (smaller) zoom — since that division by a
// smaller pxPerMeter inflates the result, it springs the object right back
// past the edge it was just pulled back from.
function keepHandleInBounds(e) {
  if (!round) return;
  let corrected = false;
  for (let i = 0; i < 30 && zoom > 0.2 && isStageOverflowing(EDGE_MARGIN_PX); i++) {
    zoom = Math.max(0.2, zoom / 1.5);
    renderObjectA();
    renderObjectB();
    positionObjectB();
    corrected = true;
  }
  // An extreme/fast drag can still overflow even at the minimum zoom — as a
  // last resort, shrink the guess itself so the silhouette never bleeds past
  // the stage no matter how far or fast the pointer moved.
  for (let i = 0; i < 60 && isStageOverflowing(EDGE_MARGIN_PX); i++) {
    guessLength = Math.max(0.01, guessLength / 1.1);
    renderObjectB();
    corrected = true;
  }
  if (corrected) {
    dragStartGuess = guessLength;
    dragStartPos = round.objectB.axis === "width" ? e.clientX : e.clientY;
  }
}

resizeHandle.addEventListener("pointermove", (e) => {
  if (!dragging || !round) return;
  const pxPerMeter = basePxPerMeter * zoom;
  let deltaPx;
  if (round.objectB.axis === "width") {
    deltaPx = e.clientX - dragStartPos;
  } else {
    deltaPx = dragStartPos - e.clientY;
  }
  guessLength = Math.max(0.01, dragStartGuess + deltaPx / pxPerMeter);
  renderObjectB();
  keepHandleInBounds(e);
});

function endDrag() {
  if (!dragging) return;
  dragging = false;
  resizeHandle.classList.remove("dragging");
  autoFitZoom();
}
resizeHandle.addEventListener("pointerup", endDrag);
resizeHandle.addEventListener("pointercancel", endDrag);

// Neither object's own anchor point (object A's left edge, object B's
// bottom via the baseline) ever moves when zoom changes — but since each
// object's aspect ratio is locked, growing along EITHER axis grows both the
// right edge (width) and the top edge (height) at once. So both edges need
// checking regardless of which axis a given object measures. An optional
// margin lets a caller (the live drag correction) react before the edge is
// actually reached, rather than only once it's truly overflowing.
function isStageOverflowing(marginPx = 0) {
  if (!round) return false;
  const stageRect = stage.getBoundingClientRect();
  const aRect = el("object-a").getBoundingClientRect();
  const bRect = el("object-b").getBoundingClientRect();
  return (
    aRect.right > stageRect.right - marginPx ||
    aRect.top < stageRect.top + marginPx ||
    bRect.right > stageRect.right - marginPx ||
    bRect.top < stageRect.top + marginPx
  );
}

zoomInBtn.addEventListener("click", () => {
  const previousZoom = zoom;
  zoom = Math.min(5, zoom * 1.5);
  renderObjectA();
  renderObjectB();
  positionObjectB();
  if (isStageOverflowing()) {
    // This step would push an object past the stage background — undo it
    // rather than let the silhouette clip out of view.
    zoom = previousZoom;
    renderObjectA();
    renderObjectB();
    positionObjectB();
  }
});
zoomOutBtn.addEventListener("click", () => {
  zoom = Math.max(0.2, zoom / 1.5);
  renderObjectA();
  renderObjectB();
  positionObjectB();
});

submitBtn.addEventListener("click", () => {
  if (hasSubmitted) return;
  hasSubmitted = true;
  submitBtn.disabled = true;
  submitBtn.textContent = "Submitted";
  waitingMessage.hidden = false;
  socket.send(JSON.stringify({ type: "guess", length_m: guessLength }));
});

startBtn.addEventListener("click", () => {
  socket.send(JSON.stringify({ type: "start" }));
});
readyBtn.addEventListener("click", () => {
  socket.send(JSON.stringify({ type: "ready" }));
});
revealReadyBtn.addEventListener("click", () => {
  socket.send(JSON.stringify({ type: "ready" }));
});
finalPlayAgainBtn.addEventListener("click", () => {
  socket.send(JSON.stringify({ type: "ready" }));
});
backBtn.addEventListener("click", () => {
  location.href = "/";
});
guessBackBtn.addEventListener("click", () => {
  location.href = "/";
});
revealBackBtn.addEventListener("click", () => {
  location.href = "/";
});
finalBackBtn.addEventListener("click", () => {
  location.href = "/";
});
copyCodeBtn.addEventListener("click", async () => {
  if (!room) return;
  try {
    await navigator.clipboard.writeText(room);
    const original = copyCodeBtn.innerHTML;
    copyCodeBtn.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#067bc2" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    setTimeout(() => (copyCodeBtn.innerHTML = original), 1200);
  } catch {
    // Clipboard access can fail (permissions, insecure context); the code
    // is already visible on screen, so this is a nice-to-have only.
  }
});

let socket;

if (!room) {
  // No room code in the URL — nothing to connect to. The lobby view's
  // room code display already falls back to "(none)" in this case.
  console.warn("Guess the Size loaded without a room code.");
} else {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const connectParams = new URLSearchParams();
  if (isHostUrl) connectParams.set("host", "1");
  if (playerName) connectParams.set("name", playerName);
  const query = connectParams.toString();
  socket = new WebSocket(
    `${protocol}//${location.host}/parties/guess-the-size/${room}${query ? `?${query}` : ""}`
  );

  socket.addEventListener("open", () => {
    guessConnectionDotEl.className = "guess-dot connected";
    guessConnectionTextEl.textContent = "Connected";
    revealConnectionDotEl.className = "guess-dot connected";
    revealConnectionTextEl.textContent = "Connected";
  });

  socket.addEventListener("close", () => {
    guessConnectionDotEl.className = "guess-dot disconnected";
    guessConnectionTextEl.textContent = "Disconnected";
    revealConnectionDotEl.className = "guess-dot disconnected";
    revealConnectionTextEl.textContent = "Disconnected";
  });

  socket.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    switch (data.type) {
      case "you":
        myId = data.id;
        renderPlayers();
        break;
      case "players":
        players = data.players;
        phase = data.phase;
        renderPlayers();
        if (phase === "lobby") showView("lobby");
        break;
      case "round-start":
        startGuessing(data.objectA, data.objectB);
        break;
      case "reveal":
        showReveal(data.roundNumber, data.maxRounds, data.objectBTrueLength_m, data.guesses);
        break;
      case "final":
        showFinal(data.standings);
        break;
    }
  });
}
