import { attachDrawingCanvas, renderStrokes } from "./drawing.js";

const params = new URLSearchParams(location.search);
const room = params.get("room");
const isHostUrl = params.get("host") === "1";
const playerName = params.get("name") ?? "";

const el = (id) => document.getElementById(id);

const lobbyView = el("lobby-view");
const playingView = el("playing-view");
const resultsView = el("results-view");

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
const difficultyDropdown = el("difficulty-dropdown");
const difficultyChip = el("difficulty-chip");
const difficultyChipText = el("difficulty-chip-text");
const difficultyPopover = el("difficulty-popover");

const playingBackBtn = el("playing-back-btn");
const playingRoomCodeEl = el("playing-room-code");
const playingConnectionDotEl = el("playing-connection-dot");
const playingConnectionTextEl = el("playing-connection-text");
const playingStatusTextEl = el("playing-status-text");
const countdownRing = el("countdown-ring");
const countdownNum = el("countdown-num");
const playingKindLabelEl = el("playing-kind-label");
const playingPromptCardEl = el("playing-prompt-card");
const playingPromptCanvasWrapEl = el("playing-prompt-canvas-wrap");
const playingPromptCanvasEl = el("playing-prompt-canvas");
const playingDrawWrapEl = el("playing-draw-wrap");
const playingDrawCanvasEl = el("playing-draw-canvas");
const playingUndoBtn = el("playing-undo-btn");
const playingClearBtn = el("playing-clear-btn");
const playingInputEl = el("playing-input");
const playingSubmitBtn = el("playing-submit-btn");

const resultsBackBtn = el("results-back-btn");
const resultsRoomCodeEl = el("results-room-code");
const chainEntryListEl = el("chain-entry-list");
const chainPrevBtn = el("chain-prev-btn");
const chainNextBtn = el("chain-next-btn");
const chainPagerLabelEl = el("chain-pager-label");
const resultsReadyStatusEl = el("results-ready-status");
const playAgainBtn = el("play-again-btn");

lobbyRoomCodeEl.textContent = room ?? "(none)";
playingRoomCodeEl.textContent = room ?? "(none)";
resultsRoomCodeEl.textContent = room ?? "(none)";

let myId = null;
let players = [];
let phase = "lobby";
let minPlayers = 4;
let maxPlayers = 8;
let roundEndsAt = 0;
let roundDurationMs = 60000;
let countdownTimer = null;
let currentKind = null;
let drawingApi = null;
let alreadySubmitted = false;
let settings = { roundDurationMs: 60000, difficulty: "easy" };
let allChains = [];
let currentChainIndex = 0;

const MIN_ROUND_DURATION_MS = 20000;
const MAX_ROUND_DURATION_MS = 120000;
const DURATION_STEP_MS = 10000;

function showView(view) {
  lobbyView.hidden = view !== "lobby";
  playingView.hidden = view !== "playing";
  resultsView.hidden = view !== "results";
}

function isHost() {
  return players.find((p) => p.id === myId)?.isHost ?? false;
}

function formatDuration(ms) {
  return `${ms / 1000}s`;
}

// Populated once — the option list itself never changes, only which one is
// marked selected.
for (let ms = MIN_ROUND_DURATION_MS; ms <= MAX_ROUND_DURATION_MS; ms += DURATION_STEP_MS) {
  const opt = document.createElement("button");
  opt.type = "button";
  opt.className = "lobby-dropdown-option";
  opt.dataset.ms = String(ms);
  opt.textContent = formatDuration(ms);
  durationPopover.appendChild(opt);
}

function closeDropdowns() {
  for (const chip of [durationChip, difficultyChip]) {
    chip.classList.remove("is-open");
    chip.setAttribute("aria-expanded", "false");
  }
  durationPopover.hidden = true;
  difficultyPopover.hidden = true;
}

function toggleDropdown(chip, popover) {
  const willOpen = popover.hidden;
  closeDropdowns();
  chip.classList.toggle("is-open", willOpen);
  chip.setAttribute("aria-expanded", String(willOpen));
  popover.hidden = !willOpen;
}

durationChip.addEventListener("click", () => toggleDropdown(durationChip, durationPopover));
difficultyChip.addEventListener("click", () => toggleDropdown(difficultyChip, difficultyPopover));

durationPopover.addEventListener("click", (event) => {
  const option = event.target.closest(".lobby-dropdown-option");
  if (!option) return;
  closeDropdowns();
  sendSettings({ ...settings, roundDurationMs: Number(option.dataset.ms) });
});

difficultyPopover.addEventListener("click", (event) => {
  const option = event.target.closest(".lobby-dropdown-option");
  if (!option) return;
  closeDropdowns();
  sendSettings({ ...settings, difficulty: option.dataset.value });
});

document.addEventListener("click", (event) => {
  if (!durationDropdown.contains(event.target) && !difficultyDropdown.contains(event.target)) closeDropdowns();
});

function renderSettings(amHost) {
  lobbySettingsPanel.hidden = !amHost;
  lobbySettingsSummary.hidden = amHost;

  durationChipText.textContent = formatDuration(settings.roundDurationMs);
  difficultyChipText.textContent = settings.difficulty === "easy" ? "Easy" : "Hard";

  for (const opt of durationPopover.querySelectorAll(".lobby-dropdown-option")) {
    opt.classList.toggle("is-selected", Number(opt.dataset.ms) === settings.roundDurationMs);
  }
  for (const opt of difficultyPopover.querySelectorAll(".lobby-dropdown-option")) {
    opt.classList.toggle("is-selected", opt.dataset.value === settings.difficulty);
  }

  if (!amHost) {
    lobbySettingsSummary.textContent = `${formatDuration(settings.roundDurationMs)} per round · ${
      settings.difficulty === "easy" ? "Easy (one word)" : "Hard (two words)"
    }`;
  }
}

function sendSettings(next) {
  settings = next;
  renderSettings(true);
  socket?.send(JSON.stringify({ type: "settings", roundDurationMs: settings.roundDurationMs, difficulty: settings.difficulty }));
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
    renderSettings(amHost);
  }

  if (phase === "results") updateResultsReadyUI();

  if (phase === "playing") {
    const submittedCount = players.filter((p) => p.submitted).length;
    playingStatusTextEl.textContent = `${submittedCount} of ${players.length} submitted`;
  }
}

function stopCountdown() {
  if (countdownTimer !== null) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

// Shared by the Submit button and the countdown hitting zero. A manual
// click still requires non-empty guess text (force=false); once time's up,
// whatever is on the canvas or in the box goes in as-is (force=true) — the
// server would otherwise silently replace it with a blank placeholder the
// moment its own alarm fires, discarding real work just because Submit was
// never explicitly clicked.
function submitCurrentEntry(force) {
  if (alreadySubmitted) return;
  if (currentKind === "draw") {
    socket?.send(JSON.stringify({ type: "submit", strokes: drawingApi?.getStrokes() ?? [] }));
  } else {
    const text = playingInputEl.value.trim();
    if (!text && !force) return;
    socket?.send(JSON.stringify({ type: "submit", text }));
  }
  alreadySubmitted = true;
  playingInputEl.disabled = true;
  playingSubmitBtn.disabled = true;
  playingSubmitBtn.textContent = "Waiting for others…";
  if (drawingApi) {
    drawingApi.destroy();
    drawingApi = null;
  }
}

// The button starts disabled each round (nothing to submit yet) and stays
// that way until there's a real guess typed or at least one stroke drawn —
// this only governs the manual click; the timeout path (force=true above)
// still submits whatever exists, even nothing, once time is actually up.
function updateSubmitEnabled() {
  if (alreadySubmitted) return;
  playingSubmitBtn.disabled =
    currentKind === "draw" ? !drawingApi || drawingApi.isEmpty() : playingInputEl.value.trim().length === 0;
}

function tickCountdown() {
  const remainingMs = Math.max(0, roundEndsAt - Date.now());
  const remainingS = Math.ceil(remainingMs / 1000);
  countdownNum.textContent = String(remainingS);
  const pct = roundDurationMs ? Math.max(0, Math.min(100, (remainingMs / roundDurationMs) * 100)) : 100;
  countdownRing.style.setProperty("--pct", String(pct));
  if (remainingMs <= 0) {
    stopCountdown();
    submitCurrentEntry(true);
  }
}

function renderPromptCanvas(strokes) {
  const rect = playingPromptCanvasEl.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  playingPromptCanvasEl.width = Math.round(rect.width * dpr);
  playingPromptCanvasEl.height = Math.round(rect.height * dpr);
  renderStrokes(playingPromptCanvasEl.getContext("2d"), strokes, playingPromptCanvasEl.width, playingPromptCanvasEl.height);
}

function startPlaying(round, totalRounds, kind, prevEntry, durationMs, endsAt) {
  phase = "playing";
  currentKind = kind;
  alreadySubmitted = false;
  roundDurationMs = durationMs;
  roundEndsAt = endsAt;
  showView("playing");

  playingKindLabelEl.textContent =
    kind === "draw" ? `Round ${round} of ${totalRounds} — Draw this` : `Round ${round} of ${totalRounds} — Guess what this drawing shows`;

  // What you're responding to: a text prompt (always true on draw rounds)
  // or a drawing to interpret (always true on guess rounds).
  const showingText = prevEntry.type === "text";
  playingPromptCardEl.hidden = !showingText;
  playingPromptCanvasWrapEl.hidden = showingText;
  if (showingText) {
    playingPromptCardEl.textContent = prevEntry.text;
  } else {
    renderPromptCanvas(prevEntry.strokes);
  }

  // Your response surface: the real drawing canvas, or a text box.
  if (drawingApi) {
    drawingApi.destroy();
    drawingApi = null;
  }
  const isDraw = kind === "draw";
  playingDrawWrapEl.hidden = !isDraw;
  playingInputEl.hidden = isDraw;
  if (isDraw) {
    drawingApi = attachDrawingCanvas(playingDrawCanvasEl, {
      // Keeps the server's copy of "what has this player drawn so far"
      // fresh after every completed stroke (not a submission — just a
      // draft), so a timeout that beats this tab's own auto-submit (a
      // backgrounded/throttled tab, a slow network) still has real strokes
      // to fall back to instead of a blank canvas.
      onChange: (state) => {
        socket?.send(JSON.stringify({ type: "draft", strokes: state.strokes }));
        updateSubmitEnabled();
      },
    });
  } else {
    playingInputEl.value = "";
    playingInputEl.placeholder = "Your guess…";
    playingInputEl.disabled = false;
  }

  playingSubmitBtn.textContent = "Submit";
  updateSubmitEnabled();
  stopCountdown();
  tickCountdown();
  countdownTimer = setInterval(tickCountdown, 250);
}

function entryWhoLabel(entry, idx) {
  if (idx === 0) return "The prompt";
  return idx % 2 === 1 ? `${entry.authorName} drew` : `${entry.authorName} guessed`;
}

// Sizing/rendering a canvas needs it already attached to the document (an
// unattached or hidden element measures as 0x0), so this creates it, lets
// the caller attach it, then renders — call sizeAndRenderCanvas only AFTER
// appending the returned element.
function createEntryCanvas(className) {
  const canvas = document.createElement("canvas");
  canvas.className = className;
  return canvas;
}

function sizeAndRenderCanvas(canvas, strokes) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  renderStrokes(canvas.getContext("2d"), strokes, canvas.width, canvas.height);
}

// Renders whichever chain is currently paged to. Entirely local/client-side
// — every chain's full data already arrived in one "results" message, so
// paging back and forth is instant and independent per player, with no
// server round-trip and no one else's view moving along with it.
function renderChainPage() {
  const entries = allChains[currentChainIndex] ?? [];
  chainEntryListEl.innerHTML = "";

  entries.forEach((entry, idx) => {
    const li = document.createElement("li");
    li.className = "reveal-chain-entry";
    chainEntryListEl.appendChild(li); // attach first so canvas sizing below can measure it

    const label = document.createElement("span");
    label.className = "reveal-entry-label";
    label.textContent = entryWhoLabel(entry, idx);
    li.appendChild(label);

    if (entry.type === "drawing") {
      const canvas = createEntryCanvas("reveal-entry-canvas");
      li.appendChild(canvas);
      sizeAndRenderCanvas(canvas, entry.strokes);
    } else {
      const text = document.createElement("p");
      text.className = "reveal-entry-text";
      text.textContent = entry.text;
      li.appendChild(text);
    }
  });

  chainPagerLabelEl.textContent = `Chain ${currentChainIndex + 1} of ${allChains.length}`;
  chainPrevBtn.disabled = currentChainIndex <= 0;
  chainNextBtn.disabled = currentChainIndex >= allChains.length - 1;
}

// No votes or ranking — everyone can browse every chain at their own pace.
// This screen is also "ready to go again?": each non-host player presses
// Play again once (one-way, like the lobby's ready-up), and the host's own
// button stays disabled until every one of them has.
function updateResultsReadyUI() {
  const amHost = isHost();
  const others = players.filter((p) => !p.isHost);
  const readyCount = others.filter((p) => p.ready).length;

  if (amHost) {
    const everyoneElseReady = others.length === 0 || others.every((p) => p.ready);
    playAgainBtn.disabled = !everyoneElseReady;
    playAgainBtn.textContent = "Play again";
    resultsReadyStatusEl.textContent = everyoneElseReady ? "" : `${readyCount} of ${others.length} players ready`;
  } else {
    const me = players.find((p) => p.id === myId);
    playAgainBtn.disabled = Boolean(me?.ready);
    playAgainBtn.textContent = me?.ready ? "Waiting for others…" : "Play again";
    resultsReadyStatusEl.textContent = me?.ready ? "Waiting for the host to start a new game…" : "";
  }
}

function renderResults(chains) {
  phase = "results";
  allChains = chains;
  currentChainIndex = 0;
  showView("results");
  renderChainPage();
  updateResultsReadyUI();
}

playingSubmitBtn.addEventListener("click", () => submitCurrentEntry(false));

playingUndoBtn.addEventListener("click", () => drawingApi?.undo());
playingClearBtn.addEventListener("click", () => drawingApi?.clear());
playingInputEl.addEventListener("input", updateSubmitEnabled);

chainPrevBtn.addEventListener("click", () => {
  if (currentChainIndex <= 0) return;
  currentChainIndex -= 1;
  renderChainPage();
});

chainNextBtn.addEventListener("click", () => {
  if (currentChainIndex >= allChains.length - 1) return;
  currentChainIndex += 1;
  renderChainPage();
});

playAgainBtn.addEventListener("click", () => {
  if (isHost()) {
    socket?.send(JSON.stringify({ type: "reset" }));
  } else {
    socket?.send(JSON.stringify({ type: "ready" }));
  }
});

startBtn.addEventListener("click", () => {
  socket?.send(JSON.stringify({ type: "start" }));
});
readyBtn.addEventListener("click", () => {
  socket?.send(JSON.stringify({ type: "ready" }));
});

backBtn.addEventListener("click", () => {
  location.href = "/";
});
playingBackBtn.addEventListener("click", () => {
  location.href = "/";
});
resultsBackBtn.addEventListener("click", () => {
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
  console.warn("Telestrations loaded without a room code.");
} else {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const connectParams = new URLSearchParams();
  if (isHostUrl) connectParams.set("host", "1");
  if (playerName) connectParams.set("name", playerName);
  const query = connectParams.toString();
  socket = new WebSocket(
    `${protocol}//${location.host}/parties/telestrations/${room}${query ? `?${query}` : ""}`
  );

  socket.addEventListener("open", () => {
    playingConnectionDotEl.className = "guess-dot connected";
    playingConnectionTextEl.textContent = "Connected";
  });

  socket.addEventListener("close", () => {
    playingConnectionDotEl.className = "guess-dot disconnected";
    playingConnectionTextEl.textContent = "Disconnected";
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
        minPlayers = data.minPlayers;
        maxPlayers = data.maxPlayers;
        if (data.settings) settings = data.settings;
        renderPlayers();
        if (phase === "lobby") showView("lobby");
        break;
      case "round-start":
        startPlaying(data.round, data.totalRounds, data.kind, data.prevEntry, data.durationMs, data.endsAt);
        break;
      case "results":
        renderResults(data.chains);
        break;
      case "lobby":
        phase = "lobby";
        showView("lobby");
        break;
    }
  });
}
