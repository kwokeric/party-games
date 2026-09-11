const params = new URLSearchParams(location.search);
const room = params.get("room");
const isHostUrl = params.get("host") === "1";
const playerName = params.get("name") ?? "";

const el = (id) => document.getElementById(id);

const gameHeaderEl = document.querySelector(".game-header");
const playersPanelEl = document.querySelector(".players-panel");
const roomCodeEl = el("room-code");
const statusEl = el("connection-status");
const playerListEl = el("player-list");

const lobbyView = el("lobby-view");
const guessingView = el("guessing-view");
const revealView = el("reveal-view");
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

const revealGuessImg = el("reveal-guess-img");
const revealTrueImg = el("reveal-true-img");
const revealTrueLine = el("reveal-true-line");
const revealTrueLabel = el("reveal-true-label");
const revealSummary = el("reveal-summary");
const resultsList = el("results-list");
const playAgainBtn = el("play-again-btn");

roomCodeEl.textContent = room ?? "(none)";
lobbyRoomCodeEl.textContent = room ?? "(none)";
guessRoomCodeEl.textContent = room ?? "(none)";

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
  // The shared dark header/player-pill bar is only still used by the
  // (not yet redesigned) reveal view — lobby and guessing each have
  // their own banner and player list now.
  gameHeaderEl.hidden = view !== "reveal";
  playersPanelEl.hidden = view !== "reveal";
}

function isHost() {
  return players.find((p) => p.id === myId)?.isHost ?? false;
}

function renderPlayers() {
  playerListEl.innerHTML = "";
  for (const p of players) {
    const li = document.createElement("li");
    li.textContent = p.name + (p.isHost ? " (host)" : "");
    if (p.id === myId) li.classList.add("you");
    if (p.hasGuessed) li.classList.add("guessed");
    playerListEl.appendChild(li);
  }

  lobbyPlayerListEl.innerHTML = "";
  for (const p of players) {
    const li = document.createElement("li");
    li.className = "lobby-player-row";
    const initial = p.name.trim().charAt(0) || "?";
    const badge = p.isHost
      ? `<span class="lobby-host-badge">HOST</span>`
      : p.ready
      ? `<span class="lobby-ready-tag"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#067bc2" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>Ready</span>`
      : "";
    li.innerHTML = `
      <span class="lobby-avatar">${initial}</span>
      <span class="lobby-player-name">${p.name}${p.id === myId ? " (you)" : ""}</span>
      ${badge}
    `;
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

  playAgainBtn.hidden = !isHost();

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

// Object B starts just to the right of wherever object A actually ends,
// rather than a fixed offset, so a small reference object leaves more
// room to drag before running off the visible stage.
function positionObjectB() {
  const stageRect = stage.getBoundingClientRect();
  const aRect = el("object-a").getBoundingClientRect();
  const gap = 24;
  el("object-b").style.left = `${aRect.right - stageRect.left + gap}px`;
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

async function showReveal(objectBTrueLength_m, guesses) {
  phase = "reveal";
  if (!round) return;

  const mine = guesses.find((g) => g.id === myId);
  const myGuess = mine?.guess_m ?? guessLength;

  const largest = Math.max(myGuess, objectBTrueLength_m);
  const revealPxPerMeter = 220 / largest;

  await Promise.all([
    setObjectVisual(revealGuessImg, round.objectB.svg),
    setObjectVisual(revealTrueImg, round.objectB.svg),
  ]);
  applySize(revealGuessImg, sizeStyle(revealPxPerMeter, round.objectB, myGuess));
  applySize(revealTrueImg, sizeStyle(revealPxPerMeter, round.objectB, objectBTrueLength_m));

  if (round.objectB.axis === "width") {
    revealTrueLine.hidden = false;
    const truePx = objectBTrueLength_m * revealPxPerMeter;
    revealTrueLine.style.width = `${truePx + 30}px`;
    revealTrueLabel.textContent = `${formatMeters(objectBTrueLength_m)} true size`;
  } else {
    revealTrueLine.hidden = true;
  }

  if (mine) {
    const pctOff = Math.round((Math.abs(myGuess - objectBTrueLength_m) / objectBTrueLength_m) * 100);
    revealSummary.textContent = `You said ${formatMeters(myGuess)} · true size ${formatMeters(
      objectBTrueLength_m
    )} · off by ${pctOff}% · score ${mine.score}/100`;
  } else {
    revealSummary.textContent = `True size: ${formatMeters(objectBTrueLength_m)}`;
  }

  resultsList.innerHTML = "";
  for (const g of guesses) {
    const li = document.createElement("li");
    const guessText = g.guess_m === null ? "no guess" : formatMeters(g.guess_m);
    li.textContent = `${g.name} — ${guessText} — ${g.score}/100`;
    resultsList.appendChild(li);
  }

  showView("reveal");
}

let dragging = false;
let dragStartPos = 0;
let dragStartGuess = 0;

resizeHandle.addEventListener("pointerdown", (e) => {
  if (hasSubmitted) return;
  dragging = true;
  resizeHandle.setPointerCapture(e.pointerId);
  resizeHandle.classList.add("dragging");
  dragStartGuess = guessLength;
  dragStartPos = round.objectB.axis === "width" ? e.clientX : e.clientY;
});

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
});

function endDrag() {
  if (!dragging) return;
  dragging = false;
  resizeHandle.classList.remove("dragging");
  autoFitZoom();
}
resizeHandle.addEventListener("pointerup", endDrag);
resizeHandle.addEventListener("pointercancel", endDrag);

zoomInBtn.addEventListener("click", () => {
  zoom = Math.min(5, zoom * 2);
  renderObjectA();
  renderObjectB();
  positionObjectB();
});
zoomOutBtn.addEventListener("click", () => {
  zoom = Math.max(0.2, zoom * 0.75);
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
playAgainBtn.addEventListener("click", () => {
  socket.send(JSON.stringify({ type: "start" }));
});
readyBtn.addEventListener("click", () => {
  socket.send(JSON.stringify({ type: "ready" }));
});
backBtn.addEventListener("click", () => {
  location.href = "/";
});
guessBackBtn.addEventListener("click", () => {
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
  statusEl.textContent = "No room code provided.";
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
    statusEl.textContent = "Connected.";
    guessConnectionDotEl.className = "guess-dot connected";
    guessConnectionTextEl.textContent = "Connected";
  });

  socket.addEventListener("close", () => {
    statusEl.textContent = "Disconnected.";
    guessConnectionDotEl.className = "guess-dot disconnected";
    guessConnectionTextEl.textContent = "Disconnected";
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
        showReveal(data.objectBTrueLength_m, data.guesses);
        break;
    }
  });
}
