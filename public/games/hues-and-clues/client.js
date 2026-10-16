import { buildGrid, initPanZoom, cellColor } from "./grid.js";

const params = new URLSearchParams(location.search);
const room = params.get("room");
const isHostUrl = params.get("host") === "1";
const playerName = params.get("name") ?? "";

const el = (id) => document.getElementById(id);

const lobbyView = el("lobby-view");
const turnView = el("turn-view");
const guessingView = el("guessing-view");
const revealView = el("reveal-view");
const finalView = el("final-view");

const backBtn = el("back-btn");
const lobbyRoomCodeEl = el("lobby-room-code");
const copyCodeBtn = el("copy-code-btn");
const lobbyPlayerListEl = el("lobby-player-list");
const startBtn = el("start-btn");
const readyBtn = el("ready-btn");
const lobbyHintEl = el("lobby-hint");

const turnBackBtn = el("turn-back-btn");
const turnRoomCodeEl = el("turn-room-code");
const turnCountdownRing = el("turn-countdown-ring");
const turnCountdownNum = el("turn-countdown-num");
const turnStatusTextEl = el("turn-status-text");
const cardDrawBody = el("card-draw-body");
const cardGridEl = el("card-grid");
const confirmCardBtn = el("confirm-card-btn");
const giveClueBody = el("give-clue-body");
const mineViewport = el("mine-viewport");
const mineGrid = el("mine-grid");
const mineZoomInBtn = el("mine-zoom-in");
const mineZoomOutBtn = el("mine-zoom-out");
const clueInput = el("clue-input");
const submitClueBtn = el("submit-clue-btn");
const waitingForClueBody = el("waiting-for-clue-body");
const waitingForClueTextEl = el("waiting-for-clue-text");

const guessingBackBtn = el("guessing-back-btn");
const guessingRoomCodeEl = el("guessing-room-code");
const guessingCountdownRing = el("guessing-countdown-ring");
const guessingCountdownNum = el("guessing-countdown-num");
const guessingStatusTextEl = el("guessing-status-text");
const clueBannerEl = el("clue-banner");
const guessInteractiveBody = el("guess-interactive-body");
const guessViewport = el("guess-viewport");
const guessGridEl = el("guess-grid");
const guessZoomInBtn = el("guess-zoom-in");
const guessZoomOutBtn = el("guess-zoom-out");
const lockGuessBtn = el("lock-guess-btn");
const guessWaitingTextEl = el("guess-waiting-text");

const revealBackBtn = el("reveal-back-btn");
const revealRoomCodeEl = el("reveal-room-code");
const revealStatusTextEl = el("reveal-status-text");
const revealViewport = el("reveal-viewport");
const revealGridEl = el("reveal-grid");
const revealZoomInBtn = el("reveal-zoom-in");
const revealZoomOutBtn = el("reveal-zoom-out");
const resultsListEl = el("results-list");
const continueBtn = el("continue-btn");

const finalBackBtn = el("final-back-btn");
const finalRoomCodeEl = el("final-room-code");
const standingsListEl = el("standings-list");
const playAgainBtn = el("play-again-btn");

lobbyRoomCodeEl.textContent = room ?? "(none)";
turnRoomCodeEl.textContent = room ?? "(none)";
guessingRoomCodeEl.textContent = room ?? "(none)";
revealRoomCodeEl.textContent = room ?? "(none)";
finalRoomCodeEl.textContent = room ?? "(none)";

const PLAYER_PALETTE = ["#84bcda", "#d56062", "#8c6fd1", "#4fae8f", "#e8a73a", "#c77dc2", "#5aa9e6", "#e07a5f"];

let myId = null;
let players = [];
let phase = "lobby";
let minPlayers = 3;
let maxPlayers = 8;
let clueGiverId = null;

let roundEndsAt = 0;
let roundDurationMs = 60000;
let countdownTimer = null;

let cardOptions = [];
let pickedCardIndex = null;
let pickedCard = null;

let selectedGuessCell = null;
let guessLocked = false;

function showView(view) {
  lobbyView.hidden = view !== "lobby";
  turnView.hidden = view !== "turn";
  guessingView.hidden = view !== "guessing";
  revealView.hidden = view !== "reveal";
  finalView.hidden = view !== "final";
}

function isHost() {
  return players.find((p) => p.id === myId)?.isHost ?? false;
}

function colorMapFor(entries) {
  const map = {};
  entries.forEach((entry, i) => {
    map[entry.id] = PLAYER_PALETTE[i % PLAYER_PALETTE.length];
  });
  return map;
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
    nameEl.textContent = p.name + (p.id === myId ? " (you)" : "") + (p.connected === false ? " (left)" : "");

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

  if (phase === "lobby") {
    const amHost = isHost();
    const count = players.length;
    const inRange = count >= minPlayers && count <= maxPlayers;
    const others = players.filter((p) => !p.isHost);
    const everyoneElseReady = others.every((p) => p.ready);
    startBtn.hidden = !amHost;
    startBtn.disabled = !inRange || !everyoneElseReady;
    readyBtn.hidden = amHost;

    if (amHost) {
      lobbyHintEl.hidden = inRange && everyoneElseReady;
      if (!inRange) {
        lobbyHintEl.textContent = `Needs ${minPlayers}-${maxPlayers} players (currently ${count}).`;
      } else if (!everyoneElseReady) {
        lobbyHintEl.textContent = "Waiting for everyone to ready up before you can start.";
      }
    } else {
      lobbyHintEl.hidden = true;
      const me = players.find((p) => p.id === myId);
      readyBtn.textContent = me?.ready ? "Not ready" : "Ready up";
      readyBtn.classList.toggle("is-ready", Boolean(me?.ready));
    }
  }

  if (phase === "guessing") {
    const guessers = players.filter((p) => p.id !== clueGiverId);
    const guessedCount = guessers.filter((p) => p.guessed).length;
    guessingStatusTextEl.textContent = `${guessedCount} of ${guessers.length} guessed`;
  }
}

function stopCountdown() {
  if (countdownTimer !== null) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

function tickCountdown(ringEl, numEl) {
  const remainingMs = Math.max(0, roundEndsAt - Date.now());
  const remainingS = Math.ceil(remainingMs / 1000);
  numEl.textContent = String(remainingS);
  const pct = roundDurationMs ? Math.max(0, Math.min(100, (remainingMs / roundDurationMs) * 100)) : 100;
  ringEl.style.setProperty("--pct", String(pct));
  if (remainingMs <= 0) stopCountdown();
}

function startCountdown(ringEl, numEl) {
  stopCountdown();
  tickCountdown(ringEl, numEl);
  countdownTimer = setInterval(() => tickCountdown(ringEl, numEl), 250);
}

// ---- pan/zoom viewports, each initialized exactly once (buildGrid only
// ever touches the content's children, never its transform, so re-running
// buildGrid to update markers never needs to re-init these) ----

const minePanZoom = initPanZoom(mineViewport, mineGrid);
mineZoomInBtn.addEventListener("click", () => minePanZoom.zoomIn());
mineZoomOutBtn.addEventListener("click", () => minePanZoom.zoomOut());

const guessPanZoom = initPanZoom(guessViewport, guessGridEl, {
  onTap: (cell) => {
    if (phase !== "guessing" || guessLocked || myId === clueGiverId) return;
    selectedGuessCell = cell;
    lockGuessBtn.disabled = false;
    renderGuessGrid();
  },
});
guessZoomInBtn.addEventListener("click", () => guessPanZoom.zoomIn());
guessZoomOutBtn.addEventListener("click", () => guessPanZoom.zoomOut());

const revealPanZoom = initPanZoom(revealViewport, revealGridEl);
revealZoomInBtn.addEventListener("click", () => revealPanZoom.zoomIn());
revealZoomOutBtn.addEventListener("click", () => revealPanZoom.zoomOut());

function renderCardOptions() {
  cardGridEl.innerHTML = "";
  cardOptions.forEach((cell, i) => {
    const card = document.createElement("div");
    card.className = "color-card";
    card.style.background = cellColor(cell.col, cell.row);

    const check = document.createElement("div");
    check.className = "check";
    check.textContent = "✓";
    card.appendChild(check);

    card.addEventListener("click", () => {
      pickedCardIndex = i;
      confirmCardBtn.disabled = false;
      cardGridEl.querySelectorAll(".color-card").forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
    });

    cardGridEl.appendChild(card);
  });
}

function renderMineGrid() {
  buildGrid(mineGrid, pickedCard ? [{ col: pickedCard.col, row: pickedCard.row, type: "dot" }] : [], false);
}

function renderGuessGrid() {
  const markers = selectedGuessCell ? [{ col: selectedGuessCell.col, row: selectedGuessCell.row, type: "self" }] : [];
  buildGrid(guessGridEl, markers, true);
}

function startTurn(data) {
  phase = "turn";
  roundDurationMs = data.durationMs;
  roundEndsAt = data.endsAt;
  showView("turn");

  turnStatusTextEl.textContent = `Round ${data.round} of ${data.totalRounds}`;

  cardDrawBody.hidden = true;
  giveClueBody.hidden = true;
  waitingForClueBody.hidden = true;

  if (data.isClueGiver) {
    cardOptions = data.cardOptions ?? [];
    pickedCardIndex = null;
    pickedCard = null;
    confirmCardBtn.disabled = true;
    cardDrawBody.hidden = false;
    renderCardOptions();

    clueInput.value = "";
    clueInput.disabled = false;
    submitClueBtn.disabled = true;
    submitClueBtn.textContent = "Send clue";
  } else {
    waitingForClueBody.hidden = false;
    waitingForClueTextEl.textContent = `Waiting for ${data.clueGiverName} to pick a color and give a clue…`;
  }

  startCountdown(turnCountdownRing, turnCountdownNum);
}

function startGuessing(data) {
  phase = "guessing";
  roundDurationMs = data.durationMs;
  roundEndsAt = data.endsAt;
  showView("guessing");

  guessingStatusTextEl.textContent = `Round ${data.round} of ${data.totalRounds}`;

  clueBannerEl.innerHTML = "";
  const label = document.createElement("span");
  label.textContent = `${data.clueGiverName}'s clue:`;
  const strong = document.createElement("strong");
  strong.textContent = data.clue;
  clueBannerEl.append(label, strong);

  const amClueGiver = myId === clueGiverId;
  guessInteractiveBody.hidden = amClueGiver;
  guessWaitingTextEl.hidden = !amClueGiver;

  if (!amClueGiver) {
    selectedGuessCell = null;
    guessLocked = false;
    lockGuessBtn.disabled = true;
    lockGuessBtn.textContent = "Lock in guess";
    renderGuessGrid();
    guessPanZoom.reset();
  }

  startCountdown(guessingCountdownRing, guessingCountdownNum);
}

function renderReveal(data) {
  phase = "reveal";
  showView("reveal");
  stopCountdown();

  revealStatusTextEl.textContent = `Round ${data.round} of ${data.totalRounds} — ${data.clueGiverName}'s color`;

  const colorFor = colorMapFor(data.results);
  const markers = [];
  if (data.target) markers.push({ col: data.target.col, row: data.target.row, type: "flag" });
  for (const r of data.results) {
    if (r.col === null || r.row === null) continue;
    markers.push({ col: r.col, row: r.row, type: "player", label: r.name.charAt(0).toUpperCase() || "?", color: colorFor[r.id] });
  }
  buildGrid(revealGridEl, markers, false);
  revealPanZoom.reset();

  resultsListEl.innerHTML = "";
  const sorted = [...data.results].sort((a, b) => b.points - a.points);
  for (const r of sorted) {
    const li = document.createElement("li");
    li.className = "results-row";

    const rank = document.createElement("span");
    rank.className = "results-rank";
    rank.textContent = `#${sorted.indexOf(r) + 1}`;

    const avatar = document.createElement("span");
    avatar.className = "results-avatar";
    avatar.textContent = r.name.charAt(0).toUpperCase() || "?";
    avatar.style.background = colorFor[r.id] ?? "#84bcda";

    const name = document.createElement("span");
    name.className = "results-name";
    name.textContent = r.name;

    const dist = document.createElement("span");
    dist.className = "results-dist";
    dist.textContent = r.distance === null ? "No guess" : r.distance === 0 ? "Right on!" : r.distance === 1 ? "1 away" : `${r.distance} away`;

    const pts = document.createElement("span");
    pts.className = "results-pts";
    pts.textContent = `+${r.points}`;

    li.append(rank, avatar, name, dist, pts);
    resultsListEl.appendChild(li);
  }

  continueBtn.disabled = false;
  continueBtn.textContent = "Continue";
}

function renderFinal(standings) {
  phase = "final";
  showView("final");

  standingsListEl.innerHTML = "";
  standings.forEach((s, i) => {
    const li = document.createElement("li");
    li.className = "standings-row" + (i === 0 ? " is-winner" : "");

    const rank = document.createElement("span");
    rank.className = "standings-rank";
    rank.textContent = `#${i + 1}`;

    const name = document.createElement("span");
    name.className = "standings-name";
    name.textContent = s.name + (s.id === myId ? " (you)" : "");

    const score = document.createElement("span");
    score.className = "standings-score";
    score.textContent = `${s.score} pts`;

    li.append(rank, name, score);
    standingsListEl.appendChild(li);
  });

  playAgainBtn.disabled = false;
  playAgainBtn.textContent = "Play again";
}

confirmCardBtn.addEventListener("click", () => {
  if (pickedCardIndex === null) return;
  pickedCard = cardOptions[pickedCardIndex];
  socket?.send(JSON.stringify({ type: "pick-card", index: pickedCardIndex }));

  cardDrawBody.hidden = true;
  giveClueBody.hidden = false;
  renderMineGrid();
  minePanZoom.reset();
});

clueInput.addEventListener("input", () => {
  submitClueBtn.disabled = clueInput.value.trim().length === 0;
});

submitClueBtn.addEventListener("click", () => {
  const text = clueInput.value.trim();
  if (!text) return;
  socket?.send(JSON.stringify({ type: "submit-clue", text }));
  clueInput.disabled = true;
  submitClueBtn.disabled = true;
  submitClueBtn.textContent = "Waiting…";
});

lockGuessBtn.addEventListener("click", () => {
  if (!selectedGuessCell || guessLocked) return;
  guessLocked = true;
  socket?.send(JSON.stringify({ type: "submit-guess", col: selectedGuessCell.col, row: selectedGuessCell.row }));
  lockGuessBtn.disabled = true;
  lockGuessBtn.textContent = "Waiting for others…";
});

continueBtn.addEventListener("click", () => {
  continueBtn.disabled = true;
  continueBtn.textContent = "Waiting for others…";
  socket?.send(JSON.stringify({ type: "ready" }));
});

playAgainBtn.addEventListener("click", () => {
  playAgainBtn.disabled = true;
  playAgainBtn.textContent = "Waiting for others…";
  socket?.send(JSON.stringify({ type: "ready" }));
});

startBtn.addEventListener("click", () => {
  socket?.send(JSON.stringify({ type: "start" }));
});
readyBtn.addEventListener("click", () => {
  socket?.send(JSON.stringify({ type: "ready" }));
});

for (const btn of [backBtn, turnBackBtn, guessingBackBtn, revealBackBtn, finalBackBtn]) {
  btn.addEventListener("click", () => {
    location.href = "/";
  });
}

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
  console.warn("Hues and Clues loaded without a room code.");
} else {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const connectParams = new URLSearchParams();
  if (isHostUrl) connectParams.set("host", "1");
  if (playerName) connectParams.set("name", playerName);
  const query = connectParams.toString();
  socket = new WebSocket(
    `${protocol}//${location.host}/parties/hues-and-clues/${room}${query ? `?${query}` : ""}`
  );

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
        minPlayers = data.minPlayers;
        maxPlayers = data.maxPlayers;
        clueGiverId = data.clueGiverId;
        renderPlayers();
        if (phase === "lobby") showView("lobby");
        break;
      case "turn-start":
        startTurn(data);
        break;
      case "guessing-start":
        startGuessing(data);
        break;
      case "reveal":
        renderReveal(data);
        break;
      case "final":
        renderFinal(data.standings);
        break;
      case "lobby":
        phase = "lobby";
        showView("lobby");
        break;
    }
  });
}
