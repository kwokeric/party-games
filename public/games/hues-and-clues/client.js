import { buildGrid, initPanZoom, cellColor, COL_LETTERS } from "./grid.js";
import { setupLobby, renderLobbyPlayers } from "/shared/lobby.js";
import { avatarEl as playAvatarEl, renderPodium } from "/shared/play.js";

const params = new URLSearchParams(location.search);
const room = params.get("room");
const isHostUrl = params.get("host") === "1";
const playerName = params.get("name") ?? "";

// Minted once per room and kept in sessionStorage, so refreshing this tab
// reconnects as the SAME player (the server re-attaches this id to the new
// connection, restoring the right seat in the turn order) instead of
// creating a new one with no seat at all. A brand-new tab has no copy of
// this room's storage, so it still joins as a new player, same as before.
let pid = null;
if (room) {
  const pidKey = `pg:pid:${room}`;
  try {
    pid = sessionStorage.getItem(pidKey);
    if (!pid) {
      pid = crypto.randomUUID();
      sessionStorage.setItem(pidKey, pid);
    }
  } catch {
    pid = crypto.randomUUID();
  }
}

const el = (id) => document.getElementById(id);

setupLobby("hues-and-clues");

const lobbyView = el("lobby-view");
const turnView = el("turn-view");
const clue2View = el("clue2-view");
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
const lobbySettingsPanel = el("lobby-settings-panel");
const lobbySettingsSummary = el("lobby-settings-summary");
const durationDropdown = el("duration-dropdown");
const durationChip = el("duration-chip");
const durationChipText = el("duration-chip-text");
const durationPopover = el("duration-popover");

const turnBackBtn = el("turn-back-btn");
const turnRoomCodeEl = el("turn-room-code");
const turnStepLabelEl = el("turn-step-label");
const turnCountdownRing = el("turn-countdown-ring");
const turnCountdownNum = el("turn-countdown-num");
const turnCta = el("turn-cta");
const cardDrawBody = el("card-draw-body");
const cardGridEl = el("card-grid");
const cardPickNote = el("card-pick-note");
const cardPickSwatch = el("card-pick-swatch");
const cardPickLabel = el("card-pick-label");
const confirmCardBtn = el("confirm-card-btn");
const giveClueBody = el("give-clue-body");
const mineViewport = el("mine-viewport");
const mineGrid = el("mine-grid");
const mineSwatch = el("mine-swatch");
const mineZoomInBtn = el("mine-zoom-in");
const mineZoomOutBtn = el("mine-zoom-out");
const clueInput = el("clue-input");
const submitClueBtn = el("submit-clue-btn");
const waitingForClueBody = el("waiting-for-clue-body");
const turnWaitingAvatarEl = el("turn-waiting-avatar");
const waitingForClueTextEl = el("waiting-for-clue-text");

const clue2BackBtn = el("clue2-back-btn");
const clue2RoomCodeEl = el("clue2-room-code");
const clue2StepLabelEl = el("clue2-step-label");
const clue2CountdownRing = el("clue2-countdown-ring");
const clue2CountdownNum = el("clue2-countdown-num");
const clue2Cta = el("clue2-cta");
const clue2Viewport = el("clue2-viewport");
const clue2Grid = el("clue2-grid");
const clue2ZoomInBtn = el("clue2-zoom-in");
const clue2ZoomOutBtn = el("clue2-zoom-out");
const clue2MapNoteEl = el("clue2-map-note");
const giveClue2Body = el("give-clue2-body");
const clue2Swatch = el("clue2-swatch");
const clue2Clue1BannerEl = el("clue2-clue1-banner");
const clue2Input = el("clue2-input");
const submitClue2Btn = el("submit-clue2-btn");
const waitingForClue2Body = el("waiting-for-clue2-body");
const clue2WaitingAvatarEl = el("clue2-waiting-avatar");
const waitingForClue2TextEl = el("waiting-for-clue2-text");

const guessingBackBtn = el("guessing-back-btn");
const guessingRoomCodeEl = el("guessing-room-code");
const guessingStepLabelEl = el("guessing-step-label");
const guessingCountdownRing = el("guessing-countdown-ring");
const guessingCountdownNum = el("guessing-countdown-num");
const clueBannerEl = el("clue-banner");
const turnTrackerEl = el("turn-tracker");
const guessViewport = el("guess-viewport");
const guessGridEl = el("guess-grid");
const guessZoomInBtn = el("guess-zoom-in");
const guessZoomOutBtn = el("guess-zoom-out");
const guessMapNoteEl = el("guess-map-note");
const guessPickNote = el("guess-pick-note");
const guessPickSwatch = el("guess-pick-swatch");
const guessPickKicker = el("guess-pick-kicker");
const guessPickLabel = el("guess-pick-label");
const lockGuessBtn = el("lock-guess-btn");

const revealBackBtn = el("reveal-back-btn");
const revealRoomCodeEl = el("reveal-room-code");
const revealStepLabelEl = el("reveal-step-label");
const revealSwatchEl = el("reveal-swatch");
const revealKickerEl = el("reveal-kicker");
const revealTitleEl = el("reveal-title");
const revealCluesEl = el("reveal-clues");
const revealViewport = el("reveal-viewport");
const revealGridEl = el("reveal-grid");
const revealZoomInBtn = el("reveal-zoom-in");
const revealZoomOutBtn = el("reveal-zoom-out");
const resultsListEl = el("results-list");
const revealReadyCountEl = el("reveal-ready-count");
const revealNextLabelEl = el("reveal-next-label");
const continueBtn = el("continue-btn");

const finalBackBtn = el("final-back-btn");
const finalRoomCodeEl = el("final-room-code");
const finalStepLabelEl = el("final-step-label");
const finalTitleEl = el("final-title");
const finalPodiumEl = el("final-podium");
const finalMeEl = el("final-me");
const standingsListEl = el("standings-list");
const finalLeaveBtn = el("final-leave-btn");
const playAgainBtn = el("play-again-btn");

lobbyRoomCodeEl.textContent = room ?? "(none)";
turnRoomCodeEl.textContent = room ?? "(none)";
clue2RoomCodeEl.textContent = room ?? "(none)";
guessingRoomCodeEl.textContent = room ?? "(none)";
revealRoomCodeEl.textContent = room ?? "(none)";
finalRoomCodeEl.textContent = room ?? "(none)";

const PLAYER_PALETTE = ["#84bcda", "#d56062", "#8c6fd1", "#4fae8f", "#e8a73a", "#c77dc2", "#5aa9e6", "#e07a5f"];

const MIN_GUESS_DURATION_MS = 15000;
const MAX_GUESS_DURATION_MS = 60000;
const DURATION_STEP_MS = 15000;

let myId = null;
let players = [];
let phase = "lobby";
let minPlayers = 3;
let maxPlayers = 8;
let clueGiverId = null;
let settings = { guessDurationMs: null };

let roundEndsAt = 0;
let roundDurationMs = 60000;
let countdownTimer = null;

let cardOptions = [];
let pickedCardIndex = null;
let pickedCard = null;

let clue1 = "";
let clue2 = "";
let guessRound = 1;
let currentGuesserId = null;
let round1Pins = [];
let round2Pins = [];
// One stable color per player for the WHOLE game — derived from the
// players list's own (stable, join-order) sequence, so a given player
// reads as the same color in the lobby, the turn tracker, every grid pin,
// and the results/standings lists. Recomputed on every "players" update,
// but that's a no-op in practice once a game is running, since the
// underlying order never changes mid-game.
let globalColorMap = {};

let selectedGuessCell = null;
let guessLocked = false;

function showView(view) {
  lobbyView.hidden = view !== "lobby";
  turnView.hidden = view !== "turn";
  clue2View.hidden = view !== "clue2";
  guessingView.hidden = view !== "guessing";
  revealView.hidden = view !== "reveal";
  finalView.hidden = view !== "final";
}

function isHost() {
  return players.find((p) => p.id === myId)?.isHost ?? false;
}

function initialOf(name) {
  return name?.charAt(0).toUpperCase() || "?";
}

function colorMapFor(entries) {
  const map = {};
  entries.forEach((entry, i) => {
    map[entry.id] = PLAYER_PALETTE[i % PLAYER_PALETTE.length];
  });
  return map;
}

function formatDuration(ms) {
  return ms === null ? "No limit" : `${ms / 1000}s`;
}

// Populated once — the option list itself never changes, only which one is
// marked selected.
for (let ms = MIN_GUESS_DURATION_MS; ms <= MAX_GUESS_DURATION_MS; ms += DURATION_STEP_MS) {
  const opt = document.createElement("button");
  opt.type = "button";
  opt.className = "lobby-dropdown-option";
  opt.dataset.ms = String(ms);
  opt.textContent = formatDuration(ms);
  durationPopover.appendChild(opt);
}
durationPopover.appendChild(Object.assign(document.createElement("div"), { className: "lobby-dropdown-divider" }));
const noLimitOpt = document.createElement("button");
noLimitOpt.type = "button";
noLimitOpt.className = "lobby-dropdown-option is-untimed";
noLimitOpt.dataset.ms = "";
noLimitOpt.textContent = "No limit";
durationPopover.appendChild(noLimitOpt);

// Lobby preview: a static slice of the real board (same cellColor as the
// game) showing the target star, two players' final pins and one ghosted
// first guess — what a round looks like mid-reveal.
const PREVIEW_COLS = [15, 25];
const PREVIEW_ROWS = [7, 12];
const previewMarkers = [
  { col: 20, row: 10, type: "flag" },
  { col: 21, row: 10, type: "player", label: "A", color: PLAYER_PALETTE[0] },
  { col: 19, row: 9, type: "player", label: "B", color: PLAYER_PALETTE[1] },
  { col: 23, row: 8, type: "ghost", label: "C", color: PLAYER_PALETTE[2] },
  { col: 22, row: 11, type: "player", label: "C", color: PLAYER_PALETTE[2] },
];
const lobbyPreviewGrid = el("lobby-preview-grid");
lobbyPreviewGrid.style.gridTemplateColumns = `repeat(${PREVIEW_COLS[1] - PREVIEW_COLS[0] + 1}, 26px)`;
for (let r = PREVIEW_ROWS[0]; r <= PREVIEW_ROWS[1]; r++) {
  for (let c = PREVIEW_COLS[0]; c <= PREVIEW_COLS[1]; c++) {
    const cell = document.createElement("div");
    cell.className = "hc-cell";
    cell.style.background = cellColor(c, r);
    const marker = previewMarkers.find((m) => m.col === c && m.row === r);
    if (marker) {
      const pin = document.createElement("div");
      pin.className = "hc-pin";
      const inner = document.createElement("div");
      inner.className = `hc-pin-${marker.type}`;
      if (marker.type === "flag") inner.textContent = "★";
      if (marker.type === "player") {
        inner.textContent = marker.label;
        inner.style.background = marker.color;
      }
      if (marker.type === "ghost") {
        inner.textContent = marker.label;
        inner.style.borderColor = marker.color;
        inner.style.color = marker.color;
      }
      pin.appendChild(inner);
      cell.appendChild(pin);
    }
    lobbyPreviewGrid.appendChild(cell);
  }
}

function closeDurationDropdown() {
  durationChip.classList.remove("is-open");
  durationChip.setAttribute("aria-expanded", "false");
  durationPopover.hidden = true;
}

durationChip.addEventListener("click", () => {
  const willOpen = durationPopover.hidden;
  durationChip.classList.toggle("is-open", willOpen);
  durationChip.setAttribute("aria-expanded", String(willOpen));
  durationPopover.hidden = !willOpen;
});

durationPopover.addEventListener("click", (event) => {
  const option = event.target.closest(".lobby-dropdown-option");
  if (!option) return;
  const guessDurationMs = option.dataset.ms === "" ? null : Number(option.dataset.ms);
  closeDurationDropdown();
  sendSettings({ guessDurationMs });
});

document.addEventListener("click", (event) => {
  if (!durationDropdown.contains(event.target)) closeDurationDropdown();
});

function renderSettings(amHost) {
  lobbySettingsPanel.hidden = !amHost;
  lobbySettingsSummary.hidden = amHost;

  durationChipText.textContent = formatDuration(settings.guessDurationMs);
  for (const opt of durationPopover.querySelectorAll(".lobby-dropdown-option")) {
    const ms = opt.dataset.ms === "" ? null : Number(opt.dataset.ms);
    opt.classList.toggle("is-selected", ms === settings.guessDurationMs);
  }

  if (!amHost) {
    lobbySettingsSummary.textContent = `${formatDuration(settings.guessDurationMs)} per guess`;
  }
}

function sendSettings(next) {
  settings = next;
  renderSettings(true);
  socket?.send(JSON.stringify({ type: "settings", guessDurationMs: settings.guessDurationMs }));
}

function isOccupiedByOther(cell) {
  return [...round1Pins, ...round2Pins].some((p) => p.col === cell.col && p.row === cell.row && p.id !== myId);
}

// Every placed pin so far this turn, as grid markers: round-1 pins render
// solid while guess round 1 is still live, but once round 2 starts they
// become faint "ghost" outlines (superseded by the solid round-2 pin).
function pinsAsMarkers() {
  const markers = [];
  const round1Type = guessRound === 2 ? "ghost" : "player";
  for (const pin of round1Pins) {
    markers.push({ col: pin.col, row: pin.row, type: round1Type, label: initialOf(pin.name), color: globalColorMap[pin.id] });
  }
  if (guessRound === 2) {
    for (const pin of round2Pins) {
      markers.push({ col: pin.col, row: pin.row, type: "player", label: initialOf(pin.name), color: globalColorMap[pin.id] });
    }
  }
  return markers;
}

function renderPlayers() {
  renderLobbyPlayers(lobbyPlayerListEl, players, { myId, colorOf: (p) => globalColorMap[p.id], maxPlayers });

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
    renderSettings(amHost);
  }

  if (phase === "reveal" || phase === "final") renderReadyState();
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
  ringEl.style.setProperty("--ring-color", remainingS <= 5 ? "#c0392b" : "#1f6feb");
  if (remainingMs <= 0) stopCountdown();
}

function startCountdown(ringEl, numEl) {
  stopCountdown();
  tickCountdown(ringEl, numEl);
  countdownTimer = setInterval(() => tickCountdown(ringEl, numEl), 250);
}

// A player's avatar tile, in their game-long color (globalColorMap) so it
// matches the pins on the board and the lobby.
function avatarEl(id, name) {
  const tile = playAvatarEl(name ?? nameOf(id), players.findIndex((p) => p.id === id));
  if (globalColorMap[id]) tile.style.background = globalColorMap[id];
  return tile;
}

function nameOf(id) {
  return players.find((p) => p.id === id)?.name ?? "Someone";
}

// "Column U · Row 12", matching the board's edge labels.
function cellLabel(cell) {
  return `Column ${COL_LETTERS[cell.col]} · Row ${cell.row + 1}`;
}

function pointsText(n) {
  return `${n} pt${n === 1 ? "" : "s"}`;
}

function ordinal(n) {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
}

// ---- pan/zoom viewports, each initialized exactly once (buildGrid only
// ever touches the content's children, never its transform, so re-running
// buildGrid to update markers never needs to re-init these) ----

const minePanZoom = initPanZoom(mineViewport, mineGrid, { fit: true });
mineZoomInBtn.addEventListener("click", () => minePanZoom.zoomIn());
mineZoomOutBtn.addEventListener("click", () => minePanZoom.zoomOut());

const clue2PanZoom = initPanZoom(clue2Viewport, clue2Grid, { fit: true });
clue2ZoomInBtn.addEventListener("click", () => clue2PanZoom.zoomIn());
clue2ZoomOutBtn.addEventListener("click", () => clue2PanZoom.zoomOut());

const guessPanZoom = initPanZoom(guessViewport, guessGridEl, {
  fit: true,
  onTap: (cell) => {
    if (phase !== "guessing" || guessLocked) return;
    if (currentGuesserId !== myId) return;
    if (isOccupiedByOther(cell)) return;
    selectedGuessCell = cell;
    renderGuessGrid();
    renderGuessPick();
  },
});
guessZoomInBtn.addEventListener("click", () => guessPanZoom.zoomIn());
guessZoomOutBtn.addEventListener("click", () => guessPanZoom.zoomOut());

const revealPanZoom = initPanZoom(revealViewport, revealGridEl, { fit: true });
revealZoomInBtn.addEventListener("click", () => revealPanZoom.zoomIn());
revealZoomOutBtn.addEventListener("click", () => revealPanZoom.zoomOut());

// ---- clue-giver: pick a card, then clue it ----

function renderCardPick() {
  const cell = pickedCardIndex === null ? null : cardOptions[pickedCardIndex];
  cardPickSwatch.style.background = cell ? cellColor(cell.col, cell.row) : "";
  cardPickLabel.textContent = cell ? cellLabel(cell) : "Tap a card";
  confirmCardBtn.disabled = !cell;
}

function renderCardOptions() {
  cardGridEl.innerHTML = "";
  cardOptions.forEach((cell, i) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "hc-card";
    card.setAttribute("aria-label", cellLabel(cell));
    card.style.background = cellColor(cell.col, cell.row);

    const check = document.createElement("span");
    check.className = "check";
    check.textContent = "✓";
    card.appendChild(check);

    card.addEventListener("click", () => {
      pickedCardIndex = i;
      cardGridEl.querySelectorAll(".hc-card").forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
      renderCardPick();
    });

    cardGridEl.appendChild(card);
  });
  renderCardPick();
}

// The clue-giver's own board: their color starred, plus any first-round
// pins already placed (shown while they think up the second clue).
function giverMarkers(pins) {
  const markers = pickedCard ? [{ col: pickedCard.col, row: pickedCard.row, type: "flag" }] : [];
  for (const pin of pins) {
    markers.push({ col: pin.col, row: pin.row, type: "player", label: initialOf(pin.name), color: globalColorMap[pin.id] });
  }
  return markers;
}

function renderMineGrid() {
  buildGrid(mineGrid, giverMarkers([]), false);
  mineSwatch.style.background = pickedCard ? cellColor(pickedCard.col, pickedCard.row) : "";
}

// ---- guessing ----

function renderGuessGrid() {
  const markers = pinsAsMarkers();
  if (selectedGuessCell) {
    const me = players.find((p) => p.id === myId);
    markers.push({ col: selectedGuessCell.col, row: selectedGuessCell.row, type: "self", label: initialOf(me?.name), color: globalColorMap[myId] });
  }
  buildGrid(guessGridEl, markers, currentGuesserId === myId && !guessLocked);
}

// The bottom bar while it's your turn: the cell you've tapped so far.
function renderGuessPick() {
  guessPickKicker.textContent = "Your pin";
  guessPickSwatch.style.background = selectedGuessCell ? cellColor(selectedGuessCell.col, selectedGuessCell.row) : "";
  guessPickLabel.textContent = selectedGuessCell ? cellLabel(selectedGuessCell) : "Tap the board";
  lockGuessBtn.disabled = !selectedGuessCell || guessLocked;
}

function renderTurnTracker(order, turnIndex) {
  turnTrackerEl.innerHTML = "";
  order.forEach((entry, i) => {
    const chip = document.createElement("div");
    chip.className = "hc-tracker-chip" + (i < turnIndex ? " done" : i === turnIndex ? " active" : "");
    const label = document.createElement("span");
    label.textContent = entry.id === myId ? "You" : entry.name;
    chip.append(avatarEl(entry.id, entry.name), label);
    turnTrackerEl.appendChild(chip);
  });
}

function startTurn(data) {
  phase = "turn";
  clueGiverId = data.clueGiverId ?? clueGiverId;
  roundDurationMs = data.durationMs;
  roundEndsAt = data.endsAt;
  clue1 = "";
  clue2 = "";
  round1Pins = [];
  round2Pins = [];
  showView("turn");

  cardDrawBody.hidden = true;
  giveClueBody.hidden = true;
  waitingForClueBody.hidden = true;

  if (data.isClueGiver) {
    turnStepLabelEl.textContent = `Round ${data.round} of ${data.totalRounds} · Clue-giver`;
    cardOptions = data.cardOptions ?? [];
    pickedCardIndex = null;
    pickedCard = null;
    cardDrawBody.hidden = false;
    renderCardOptions();

    turnCta.hidden = false;
    cardPickNote.hidden = false;
    confirmCardBtn.hidden = false;
    submitClueBtn.hidden = true;
    clueInput.value = "";
    clueInput.disabled = false;
    submitClueBtn.disabled = true;
    submitClueBtn.textContent = "Send clue";
  } else {
    turnStepLabelEl.textContent = `Round ${data.round} of ${data.totalRounds}`;
    waitingForClueBody.hidden = false;
    turnWaitingAvatarEl.replaceChildren(avatarEl(clueGiverId, data.clueGiverName));
    waitingForClueTextEl.textContent = `${data.clueGiverName} is picking a color`;
    turnCta.hidden = true;
  }

  startCountdown(turnCountdownRing, turnCountdownNum);
}

function startClue2(data) {
  phase = "clue2";
  roundDurationMs = data.durationMs;
  roundEndsAt = data.endsAt;
  clue1 = data.clue1;
  guessRound = 1;
  round1Pins = data.round1Pins ?? round1Pins;
  showView("clue2");

  clue2StepLabelEl.textContent = `Round ${data.round} of ${data.totalRounds} · Clue 2 of 2`;

  giveClue2Body.hidden = !data.isClueGiver;
  waitingForClue2Body.hidden = data.isClueGiver;
  clue2Cta.hidden = !data.isClueGiver;

  // Everyone sees where the first guesses landed; the clue-giver also sees
  // their own color, to steer the second clue.
  if (data.isClueGiver) {
    buildGrid(clue2Grid, giverMarkers(round1Pins), false);
    clue2MapNoteEl.textContent = "Your color is starred ★";
    clue2Swatch.style.background = pickedCard ? cellColor(pickedCard.col, pickedCard.row) : "";
    const first = document.createElement("b");
    first.textContent = data.clue1;
    clue2Clue1BannerEl.replaceChildren("First clue: ", first, " · you can reuse it");

    clue2Input.value = "";
    clue2Input.disabled = false;
    submitClue2Btn.disabled = true;
    submitClue2Btn.textContent = "Send clue";
  } else {
    buildGrid(clue2Grid, pinsAsMarkers(), false);
    clue2MapNoteEl.textContent = "Everyone's first guesses";
    const giverName = nameOf(clueGiverId);
    clue2WaitingAvatarEl.replaceChildren(avatarEl(clueGiverId, giverName));
    waitingForClue2TextEl.textContent = `${giverName} is thinking of a second clue`;
  }
  clue2PanZoom.reset();

  startCountdown(clue2CountdownRing, clue2CountdownNum);
}

function startGuessTurn(data) {
  const isNewRound = phase !== "guessing" || guessRound !== data.guessRound;
  phase = "guessing";
  roundDurationMs = data.durationMs;
  roundEndsAt = data.endsAt;
  guessRound = data.guessRound;
  currentGuesserId = data.guesserId;
  clue1 = data.clue1;
  clue2 = data.clue2;
  round1Pins = data.round1Pins ?? [];
  round2Pins = data.round2Pins ?? [];
  showView("guessing");

  guessingStepLabelEl.textContent = `Round ${data.round} of ${data.totalRounds} · Guess ${data.guessRound} of 2`;

  const giverName = clueGiverId === myId ? "Your" : `${nameOf(clueGiverId)}'s`;
  const kicker = document.createElement("small");
  kicker.textContent = data.guessRound === 2 ? `${giverName} clues` : `${giverName} clue`;
  const clueText = document.createElement("b");
  if (data.guessRound === 2) {
    const old = document.createElement("span");
    old.className = "hc-clue-old";
    old.textContent = `${data.clue1} → `;
    clueText.append(old, data.clue2);
  } else {
    clueText.textContent = data.clue1;
  }
  clueBannerEl.replaceChildren(kicker, clueText);

  renderTurnTracker(data.order, data.turnIndex);

  const isMyTurn = currentGuesserId === myId;
  selectedGuessCell = null;
  guessLocked = false;
  renderGuessGrid();
  // Keep everyone's pan/zoom as pins land one by one; only re-home the
  // board when a new guess round starts.
  if (isNewRound || isMyTurn) guessPanZoom.reset();

  lockGuessBtn.hidden = !isMyTurn;
  if (isMyTurn) {
    guessMapNoteEl.textContent = "Tap a cell to place your pin";
    lockGuessBtn.textContent = "Lock in pin";
    renderGuessPick();
  } else {
    guessMapNoteEl.textContent = "";
    const guesserName = data.order.find((o) => o.id === currentGuesserId)?.name ?? "Someone";
    guessPickSwatch.style.background = globalColorMap[currentGuesserId] ?? "";
    guessPickKicker.textContent = myId === clueGiverId ? "Everyone's guessing your color" : `Guess ${data.turnIndex + 1} of ${data.order.length}`;
    guessPickLabel.textContent = `${guesserName} is placing a pin…`;
  }

  // "No limit" (the server sends durationMs: null) means there's nothing
  // to count down — hide the ring entirely rather than show a countdown
  // that never actually ends anything.
  const timed = Boolean(data.durationMs);
  guessingCountdownRing.hidden = !timed;
  if (timed) {
    startCountdown(guessingCountdownRing, guessingCountdownNum);
  } else {
    stopCountdown();
  }
}

// ---- reveal / final ----

function rowEl(id, name, { rank, extra, pts, scored, giver }) {
  const li = document.createElement("li");
  li.className = "hc-row" + (id === myId ? " is-you" : "") + (giver ? " is-giver" : "");

  const nameEl = document.createElement("span");
  nameEl.className = "hc-row-name";
  nameEl.textContent = name;
  if (id === myId) {
    const tag = document.createElement("span");
    tag.className = "you-tag";
    tag.textContent = " (you)";
    nameEl.appendChild(tag);
  }

  if (rank !== undefined) {
    const rankEl = document.createElement("span");
    rankEl.className = "hc-row-rank";
    rankEl.textContent = String(rank);
    li.appendChild(rankEl);
  }
  li.append(avatarEl(id, name), nameEl);
  if (extra) {
    const extraEl = document.createElement("span");
    extraEl.className = "hc-row-dist";
    extraEl.textContent = extra;
    li.appendChild(extraEl);
  }
  const ptsEl = document.createElement("span");
  ptsEl.className = "hc-row-pts" + (scored ? " is-scored" : "");
  ptsEl.textContent = pts;
  li.appendChild(ptsEl);
  return li;
}

function distanceText(r) {
  if (r.isClueGiver) return "Clue-giver";
  if (r.distance === null) return "No guess";
  if (r.distance === 0) return "Bullseye!";
  return r.distance === 1 ? "1 away" : `${r.distance} away`;
}

// The ready count in the bottom bar, shared by reveal and final.
function renderReadyState() {
  const me = players.find((p) => p.id === myId);
  const live = players.filter((p) => p.connected !== false);
  const readyCount = live.filter((p) => p.ready).length;
  if (phase === "reveal") {
    revealReadyCountEl.textContent = `${readyCount} of ${live.length} ready`;
    continueBtn.disabled = Boolean(me?.ready);
    continueBtn.textContent = me?.ready ? "Waiting…" : "Ready";
  } else if (phase === "final") {
    playAgainBtn.disabled = Boolean(me?.ready);
    playAgainBtn.textContent = me?.ready ? `${readyCount} of ${live.length} ready` : "Play again";
  }
}

function renderReveal(data) {
  phase = "reveal";
  showView("reveal");
  stopCountdown();

  revealStepLabelEl.textContent = `Round ${data.round} of ${data.totalRounds} · Results`;
  revealNextLabelEl.textContent = data.round < data.totalRounds ? `Next: round ${data.round + 1}` : "Final results next";

  const mine = data.results.find((r) => r.id === myId);
  revealSwatchEl.style.background = data.target ? cellColor(data.target.col, data.target.row) : "";
  if (mine?.isClueGiver) {
    revealKickerEl.textContent = "Your color";
  } else if (mine) {
    revealKickerEl.textContent = mine.distance === null ? "No guess" : mine.distance === 0 ? "Bullseye" : `${mine.distance} cell${mine.distance === 1 ? "" : "s"} away`;
  } else {
    revealKickerEl.textContent = `${data.clueGiverName}'s color`;
  }
  revealTitleEl.textContent = mine ? `+${mine.points} for you` : data.target ? cellLabel(data.target) : "";
  const clueText = data.clue2 ? `${data.clue1} → ${data.clue2}` : data.clue1;
  revealCluesEl.textContent = `${mine?.isClueGiver ? "Your" : `${data.clueGiverName}'s`} clues: ${clueText.toUpperCase()}`;

  const markers = [];
  if (data.target) markers.push({ col: data.target.col, row: data.target.row, type: "flag" });
  for (const pin of data.round1Pins ?? []) {
    markers.push({ col: pin.col, row: pin.row, type: "ghost", label: initialOf(pin.name), color: globalColorMap[pin.id] });
  }
  for (const r of data.results) {
    if (r.col === null || r.row === null) continue;
    markers.push({ col: r.col, row: r.row, type: "player", label: initialOf(r.name), color: globalColorMap[r.id] });
  }
  buildGrid(revealGridEl, markers, false);
  if (data.target) revealPanZoom.centerOn(data.target, 2.2);
  else revealPanZoom.reset();

  resultsListEl.innerHTML = "";
  const sorted = [...data.results].sort((a, b) => b.points - a.points);
  for (const r of sorted) {
    resultsListEl.appendChild(
      rowEl(r.id, r.name, { extra: distanceText(r), pts: `+${r.points}`, scored: r.points > 0, giver: r.isClueGiver })
    );
  }

  renderReadyState();
}

function renderFinal(standings) {
  phase = "final";
  showView("final");
  stopCountdown();

  finalStepLabelEl.textContent = `Game over · ${standings.length} round${standings.length === 1 ? "" : "s"}`;
  const winners = standings.filter((s) => s.score === standings[0]?.score);
  finalTitleEl.textContent = winners.length > 1 ? "It's a tie!" : `${standings[0]?.name ?? "Nobody"} wins!`;
  renderPodium(
    finalPodiumEl,
    standings.map((s) => ({ ...s, score: pointsText(s.score) })),
    (entry) => avatarEl(entry.id, entry.name)
  );

  // Your own placing up top, then everyone the podium doesn't show.
  const myIndex = standings.findIndex((s) => s.id === myId);
  finalMeEl.innerHTML = "";
  if (myIndex >= 0) {
    const text = document.createElement("div");
    const line = document.createElement("b");
    // Ties share a place: 1 + however many scored strictly more.
    const place = standings.filter((st) => st.score > standings[myIndex].score).length + 1;
    line.textContent = `You placed ${ordinal(place)}`;
    const pts = document.createElement("span");
    pts.textContent = pointsText(standings[myIndex].score);
    text.append(line, pts);
    finalMeEl.append(avatarEl(myId, standings[myIndex].name), text);
  }

  standingsListEl.innerHTML = "";
  standings.slice(3).forEach((s, i) => {
    standingsListEl.appendChild(rowEl(s.id, s.name, { rank: i + 4, pts: pointsText(s.score) }));
  });

  renderReadyState();
}

confirmCardBtn.addEventListener("click", () => {
  if (pickedCardIndex === null) return;
  pickedCard = cardOptions[pickedCardIndex];
  socket?.send(JSON.stringify({ type: "pick-card", index: pickedCardIndex }));

  cardDrawBody.hidden = true;
  giveClueBody.hidden = false;
  cardPickNote.hidden = true;
  confirmCardBtn.hidden = true;
  submitClueBtn.hidden = false;
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

clue2Input.addEventListener("input", () => {
  submitClue2Btn.disabled = clue2Input.value.trim().length === 0;
});

submitClue2Btn.addEventListener("click", () => {
  const text = clue2Input.value.trim();
  if (!text) return;
  socket?.send(JSON.stringify({ type: "submit-clue2", text }));
  clue2Input.disabled = true;
  submitClue2Btn.disabled = true;
  submitClue2Btn.textContent = "Waiting…";
});

lockGuessBtn.addEventListener("click", () => {
  if (!selectedGuessCell || guessLocked) return;
  guessLocked = true;
  socket?.send(JSON.stringify({ type: "submit-guess", col: selectedGuessCell.col, row: selectedGuessCell.row }));
  lockGuessBtn.disabled = true;
  lockGuessBtn.textContent = "Locked in";
});

continueBtn.addEventListener("click", () => {
  continueBtn.disabled = true;
  continueBtn.textContent = "Waiting…";
  socket?.send(JSON.stringify({ type: "ready" }));
});

playAgainBtn.addEventListener("click", () => {
  playAgainBtn.disabled = true;
  playAgainBtn.textContent = "Waiting…";
  socket?.send(JSON.stringify({ type: "ready" }));
});

startBtn.addEventListener("click", () => {
  socket?.send(JSON.stringify({ type: "start" }));
});
readyBtn.addEventListener("click", () => {
  socket?.send(JSON.stringify({ type: "ready" }));
});

for (const btn of [backBtn, turnBackBtn, clue2BackBtn, guessingBackBtn, revealBackBtn, finalBackBtn, finalLeaveBtn]) {
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
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>Copied';
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
  if (pid) connectParams.set("pid", pid);
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
        if (data.settings) settings = data.settings;
        globalColorMap = colorMapFor(players);
        renderPlayers();
        if (phase === "lobby") showView("lobby");
        break;
      case "turn-start":
        startTurn(data);
        break;
      case "clue2-start":
        startClue2(data);
        break;
      case "guess-turn":
        startGuessTurn(data);
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
