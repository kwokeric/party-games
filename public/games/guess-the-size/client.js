const params = new URLSearchParams(location.search);
const room = params.get("room");
const isHostUrl = params.get("host") === "1";
const playerName = params.get("name") ?? "";

const el = (id) => document.getElementById(id);

const roomCodeEl = el("room-code");
const statusEl = el("connection-status");
const playerListEl = el("player-list");

const lobbyView = el("lobby-view");
const guessingView = el("guessing-view");
const revealView = el("reveal-view");
const startBtn = el("start-btn");
const lobbyMessage = el("lobby-message");

const objectANameEl = el("object-a-name");
const objectASizeEl = el("object-a-size");
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

let myId = null;
let players = [];
let round = null; // { objectA, objectB }
let phase = "lobby";
let guessLength = 1;
let zoom = 1;
let basePxPerMeter = 100;
let hasSubmitted = false;

function formatMeters(m) {
  if (m < 1) return `${m.toFixed(3)} m`;
  if (m < 10) return `${m.toFixed(2)} m`;
  return `${m.toFixed(1)} m`;
}

function showView(view) {
  lobbyView.hidden = view !== "lobby";
  guessingView.hidden = view !== "guessing";
  revealView.hidden = view !== "reveal";
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

  startBtn.hidden = !isHost();
  playAgainBtn.hidden = !isHost();

  if (phase === "lobby") {
    lobbyMessage.textContent = isHost()
      ? "Ready when you are."
      : "Waiting for the host to start a round.";
  }
}

function sizeStyle(pxPerMeter, obj, length_m) {
  const px = Math.max(4, length_m * pxPerMeter);
  return obj.axis === "width"
    ? { width: `${px}px`, height: "auto" }
    : { width: "auto", height: `${px}px` };
}

function applySize(img, style) {
  img.style.width = style.width;
  img.style.height = style.height;
}

function renderObjectA() {
  if (!round) return;
  objectAImg.src = round.objectA.svg;
  applySize(objectAImg, sizeStyle(basePxPerMeter * zoom, round.objectA, round.objectA.length_m));
  objectAStageLabel.textContent = round.objectA.name;
}

function renderObjectB() {
  if (!round) return;
  objectBImg.src = round.objectB.svg;
  applySize(objectBImg, sizeStyle(basePxPerMeter * zoom, round.objectB, guessLength));
  objectBStageLabel.textContent = round.objectB.name;
  resizeHandle.className = `resize-handle axis-${round.objectB.axis}`;
  guessReadout.textContent = `Your guess: ${formatMeters(guessLength)}`;
}

function startGuessing(objectA, objectB) {
  round = { objectA, objectB };
  phase = "guessing";
  hasSubmitted = false;
  guessLength = objectA.length_m;
  zoom = 1;
  basePxPerMeter = 140 / objectA.length_m;

  objectANameEl.textContent = objectA.name;
  objectASizeEl.textContent = formatMeters(objectA.length_m);
  objectBNameEl.textContent = objectB.name;

  submitBtn.disabled = false;
  submitBtn.textContent = "Submit guess";
  waitingMessage.hidden = true;

  renderObjectA();
  renderObjectB();
  showView("guessing");
}

function showReveal(objectBTrueLength_m, guesses) {
  phase = "reveal";
  if (!round) return;

  const mine = guesses.find((g) => g.id === myId);
  const myGuess = mine?.guess_m ?? guessLength;

  const largest = Math.max(myGuess, objectBTrueLength_m);
  const revealPxPerMeter = 220 / largest;

  revealGuessImg.src = round.objectB.svg;
  applySize(revealGuessImg, sizeStyle(revealPxPerMeter, round.objectB, myGuess));

  revealTrueImg.src = round.objectB.svg;
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
}
resizeHandle.addEventListener("pointerup", endDrag);
resizeHandle.addEventListener("pointercancel", endDrag);

zoomInBtn.addEventListener("click", () => {
  zoom = Math.min(5, zoom * 1.25);
  renderObjectA();
  renderObjectB();
});
zoomOutBtn.addEventListener("click", () => {
  zoom = Math.max(0.2, zoom / 1.25);
  renderObjectA();
  renderObjectB();
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
  });

  socket.addEventListener("close", () => {
    statusEl.textContent = "Disconnected.";
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
