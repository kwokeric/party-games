const params = new URLSearchParams(location.search);
const room = params.get("room");
const isHostUrl = params.get("host") === "1";
const playerName = params.get("name") ?? "";

const el = (id) => document.getElementById(id);

const lobbyView = el("lobby-view");
const playingView = el("playing-view");
const revealView = el("reveal-view");
const finalView = el("final-view");
const backBtn = el("back-btn");
const lobbyRoomCodeEl = el("lobby-room-code");
const copyCodeBtn = el("copy-code-btn");
const lobbyPlayerListEl = el("lobby-player-list");
const startBtn = el("start-btn");
const readyBtn = el("ready-btn");
const lobbyWaitingEl = el("lobby-waiting");

const playingBackBtn = el("playing-back-btn");
const playingRoomCodeEl = el("playing-room-code");
const playingStatusTextEl = el("playing-status-text");
const playingConnectionDotEl = el("playing-connection-dot");
const playingConnectionTextEl = el("playing-connection-text");
const countdownRing = el("countdown-ring");
const countdownNum = el("countdown-num");
const playingStage = el("playing-stage");
const walkerChameleon = el("walker-chameleon");
const hueSlider = el("hue-slider");
const satSlider = el("sat-slider");
const briSlider = el("bri-slider");
const hueVal = el("hue-val");
const satVal = el("sat-val");
const briVal = el("bri-val");
const lockBtn = el("lock-btn");

const revealBackBtn = el("reveal-back-btn");
const revealRoomCodeEl = el("reveal-room-code");
const revealConnectionDotEl = el("reveal-connection-dot");
const revealConnectionTextEl = el("reveal-connection-text");
const revealRoundLabelEl = el("reveal-round-label");
const revealRoundTrackEl = el("reveal-round-track");
const revealStageEl = el("reveal-stage");
const revealLineupEl = el("reveal-lineup");
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
playingRoomCodeEl.textContent = room ?? "(none)";
revealRoomCodeEl.textContent = room ?? "(none)";
finalRoomCodeEl.textContent = room ?? "(none)";

const START_COLOR = { h: 125, s: 65, b: 70 };

let myId = null;
let players = [];
let phase = "lobby";
let target = null; // { name, h, s, b }
let roundEndsAt = 0;
let roundDurationMs = 10000;
let locked = false;
let countdownTimer = null;

function hsbToRgb(h, s, b) {
  const sat = s / 100;
  const bri = b / 100;
  const k = (n) => (n + h / 60) % 6;
  const f = (n) => bri - bri * sat * Math.max(0, Math.min(k(n), 4 - k(n), 1));
  return [Math.round(f(5) * 255), Math.round(f(3) * 255), Math.round(f(1) * 255)];
}

function rgbCss([r, g, b]) {
  return `rgb(${r}, ${g}, ${b})`;
}

function showView(view) {
  lobbyView.hidden = view !== "lobby";
  playingView.hidden = view !== "playing";
  revealView.hidden = view !== "reveal";
  finalView.hidden = view !== "final";
}

const READY_CHECK_SVG =
  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

// Ready dots live inside per-row list items (results-list, final-standings-list)
// tagged with data-player-id, so a "players" update can flip them live without
// rebuilding the whole list (which would also wipe the match/score columns).
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

  if (phase === "playing") {
    const lockedCount = players.filter((p) => p.locked).length;
    playingStatusTextEl.textContent = `${lockedCount} of ${players.length} locked in`;
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

function chameleonSvg(color) {
  return `
    <svg class="chameleon-svg" viewBox="0 0 140 100" style="color:${rgbCss(hsbToRgb(color.h, color.s, color.b))};">
      <path d="M34 56c-4-24 21-40 48-38 24 1.6 42 16 44 32 1.4 11-6.4 20-17 23-1.6 6.4-8.4 10.6-16 10.6-8 0-40-2-52-13-5.6-5-7.4-10-7-14.6z" fill="currentColor"/>
      <path d="M118 34c9-5 20-4.6 22 2 1.6 5.4-6 10.6-14 10.6-4.6 0-9-1.4-12-4z" fill="currentColor"/>
      <circle cx="112" cy="27" r="10" fill="currentColor"/>
      <circle class="eye" cx="113.5" cy="26" r="4.6"/>
      <circle cx="115.5" cy="24" r="1.5" fill="#fff"/>
      <path d="M38 62c-16 1-27 10-25 20 1.6 8 11 11 15 5 2.4-3.4 0.6-8-3-9.6-3.4-1.6-4.6-5-2-8 2.6-3 7-4.6 11-4.6z" fill="currentColor"/>
    </svg>
  `;
}

function updateWalkerColor(h, s, b) {
  walkerChameleon.style.color = rgbCss(hsbToRgb(h, s, b));
  satSlider.style.setProperty("--hue-pure", rgbCss(hsbToRgb(h, 100, 100)));
  briSlider.style.setProperty("--hue-sat", rgbCss(hsbToRgb(h, s, 100)));
}

function onSliderInput() {
  const h = Number(hueSlider.value);
  const s = Number(satSlider.value);
  const b = Number(briSlider.value);
  hueVal.textContent = `${h}°`;
  satVal.textContent = `${s}%`;
  briVal.textContent = `${b}%`;
  updateWalkerColor(h, s, b);
  if (phase === "playing" && !locked) {
    socket?.send(JSON.stringify({ type: "color", h, s, b }));
  }
}
[hueSlider, satSlider, briSlider].forEach((sliderEl) => sliderEl.addEventListener("input", onSliderInput));

function stopCountdown() {
  if (countdownTimer !== null) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

function tickCountdown() {
  const remainingMs = Math.max(0, roundEndsAt - Date.now());
  const remainingS = Math.ceil(remainingMs / 1000);
  countdownNum.textContent = String(remainingS);
  countdownRing.style.setProperty("--pct", String(Math.round((remainingMs / roundDurationMs) * 100)));
  countdownRing.style.setProperty("--ring-color", remainingS <= 3 ? "#d56062" : "#067bc2");
  if (remainingMs <= 0) stopCountdown();
}

function startPlaying(newTarget, durationMs, endsAt) {
  phase = "playing";
  target = newTarget;
  roundDurationMs = durationMs;
  roundEndsAt = endsAt;
  locked = false;

  playingStage.style.setProperty("--target-color", rgbCss(hsbToRgb(target.h, target.s, target.b)));

  hueSlider.value = String(START_COLOR.h);
  satSlider.value = String(START_COLOR.s);
  briSlider.value = String(START_COLOR.b);
  [hueSlider, satSlider, briSlider].forEach((sliderEl) => (sliderEl.disabled = false));
  onSliderInput();

  lockBtn.disabled = false;
  lockBtn.textContent = "Lock it in";

  showView("playing");
  stopCountdown();
  tickCountdown();
  countdownTimer = setInterval(tickCountdown, 200);
}

function showReveal(roundNumber, maxRounds, revealedTarget, results) {
  phase = "reveal";
  stopCountdown();
  target = revealedTarget;

  revealStageEl.style.setProperty("--target-color", rgbCss(hsbToRgb(target.h, target.s, target.b)));
  revealRoundLabelEl.textContent = `Round ${roundNumber} of ${maxRounds}`;
  renderRoundTrack(revealRoundTrackEl, roundNumber, maxRounds);

  const topScore = results.length ? results[0].score : 0;

  revealLineupEl.innerHTML = "";
  results.forEach((r) => {
    const slot = document.createElement("div");
    slot.className =
      "lineup-slot" + (r.id === myId ? " is-you" : "") + (r.score === topScore ? " is-winner" : "");
    slot.innerHTML = chameleonSvg(r);

    const tag = document.createElement("span");
    tag.className = "lineup-tag";
    tag.textContent = r.id === myId ? "You" : r.name;
    slot.appendChild(tag);

    revealLineupEl.appendChild(slot);
  });

  const mine = results.find((r) => r.id === myId);
  if (mine) {
    revealSummary.innerHTML = `You matched <strong>${mine.match}%</strong> of ${target.name} · score <strong style="color: #067bc2;">${mine.score}/100</strong>`;
  } else {
    revealSummary.textContent = `Target: ${target.name}`;
  }

  resultsList.innerHTML = "";
  results.forEach((r, index) => {
    const li = document.createElement("li");
    li.className = "reveal-result-row" + (r.id === myId ? " is-you" : "");
    li.dataset.playerId = r.id;

    const avatar = document.createElement("span");
    avatar.className = "reveal-avatar";
    avatar.textContent = r.name.trim().charAt(0) || "?";

    const nameEl = document.createElement("span");
    nameEl.className = "reveal-result-name";
    nameEl.textContent = r.name;
    if (r.id === myId) {
      const tag = document.createElement("span");
      tag.className = "you-tag";
      tag.textContent = " (you)";
      nameEl.appendChild(tag);
    }

    const matchEl = document.createElement("span");
    matchEl.className = "reveal-result-match";
    matchEl.textContent = `${r.match}%`;

    const scoreEl = document.createElement("span");
    scoreEl.className = index === 0 ? "reveal-result-score top" : "reveal-result-score";
    scoreEl.textContent = String(r.score);

    const readyDot = document.createElement("span");
    readyDot.className = "status-dot";
    readyDot.innerHTML = READY_CHECK_SVG;

    li.append(avatar, nameEl, matchEl, scoreEl, readyDot);
    resultsList.appendChild(li);
  });

  showView("reveal");
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

lockBtn.addEventListener("click", () => {
  if (locked) return;
  locked = true;
  [hueSlider, satSlider, briSlider].forEach((sliderEl) => (sliderEl.disabled = true));
  lockBtn.disabled = true;
  lockBtn.textContent = "Waiting for others…";
  socket?.send(JSON.stringify({ type: "lock" }));
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
playingBackBtn.addEventListener("click", () => {
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
  console.warn("Match the Color loaded without a room code.");
} else {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const connectParams = new URLSearchParams();
  if (isHostUrl) connectParams.set("host", "1");
  if (playerName) connectParams.set("name", playerName);
  const query = connectParams.toString();
  socket = new WebSocket(
    `${protocol}//${location.host}/parties/match-the-color/${room}${query ? `?${query}` : ""}`
  );

  socket.addEventListener("open", () => {
    playingConnectionDotEl.className = "guess-dot connected";
    playingConnectionTextEl.textContent = "Connected";
    revealConnectionDotEl.className = "guess-dot connected";
    revealConnectionTextEl.textContent = "Connected";
  });

  socket.addEventListener("close", () => {
    playingConnectionDotEl.className = "guess-dot disconnected";
    playingConnectionTextEl.textContent = "Disconnected";
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
        startPlaying(data.target, data.durationMs, data.endsAt);
        break;
      case "reveal":
        showReveal(data.roundNumber, data.maxRounds, data.target, data.results);
        break;
      case "final":
        showFinal(data.standings);
        break;
    }
  });
}
