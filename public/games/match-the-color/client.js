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
const lobbySettingsPanel = el("lobby-settings-panel");
const lobbySettingsSummary = el("lobby-settings-summary");
const roundsVal = el("rounds-val");
const roundsMinusBtn = el("rounds-minus-btn");
const roundsPlusBtn = el("rounds-plus-btn");
const durationDropdown = el("duration-dropdown");
const durationChip = el("duration-chip");
const durationChipText = el("duration-chip-text");
const durationPopover = el("duration-popover");

const playingBackBtn = el("playing-back-btn");
const playingRoomCodeEl = el("playing-room-code");
const playingRoundLabelEl = el("playing-round-label");
const playingLockedLabelEl = el("playing-locked-label");
const playingRoundTrackEl = el("playing-round-track");
const playingConnectionDotEl = el("playing-connection-dot");
const playingConnectionTextEl = el("playing-connection-text");
const countdownRing = el("countdown-ring");
const countdownNum = el("countdown-num");
const playingStage = el("playing-stage");
const walkerEl = document.querySelector(".walker");
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
const revealReadyLabelEl = el("reveal-ready-label");
const revealRoundTrackEl = el("reveal-round-track");
const revealStageEl = el("reveal-stage");
const revealLineupEl = el("reveal-lineup");
const revealSummary = el("reveal-summary");
const resultsList = el("results-list");
const revealReadyBtn = el("reveal-ready-btn");

const finalBackBtn = el("final-back-btn");
const finalRoomCodeEl = el("final-room-code");
const finalWinnerNameEl = el("final-winner-name");
const finalStatusSubEl = el("final-status-sub");
const finalPodiumEl = el("final-podium");
const podiumSlots = { 1: el("podium-1"), 2: el("podium-2"), 3: el("podium-3") };
const finalTableHead = el("final-table-head");
const finalTableBody = el("final-table-body");
const finalPlayAgainBtn = el("final-play-again-btn");

lobbyRoomCodeEl.textContent = room ?? "(none)";
playingRoomCodeEl.textContent = room ?? "(none)";
revealRoomCodeEl.textContent = room ?? "(none)";
finalRoomCodeEl.textContent = room ?? "(none)";

const START_COLOR = { h: 125, s: 65, b: 70 };

const MIN_ROUNDS = 3;
const MAX_ROUNDS_LIMIT = 20;
const MIN_ROUND_DURATION_MS = 5000;
const MAX_ROUND_DURATION_MS = 30000;
const ROUND_STEP = 1;
const DURATION_STEP_MS = 5000;

let myId = null;
let players = [];
let phase = "lobby";
let target = null; // { name, h, s, b }
let roundEndsAt = 0;
let roundDurationMs = 10000;
let playingRoundNumber = 0;
let playingMaxRounds = 0;
let locked = false;
let countdownTimer = null;
let settings = { maxRounds: 5, roundDurationMs: 15000 };
let lastPulseSecond = null;

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

// Ready dots live inside per-row elements (results-list, final-table-body)
// tagged with data-player-id, so a "players" update can flip them live without
// rebuilding the whole list (which would also wipe the match/score columns).
function updateReadyDots() {
  for (const p of players) {
    for (const list of [resultsList, finalTableBody]) {
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
    renderSettings(amHost);
  }

  if (phase === "playing") {
    const lockedCount = players.filter((p) => p.locked).length;
    const roundLabel = playingMaxRounds ? `Round ${playingRoundNumber} of ${playingMaxRounds}` : "";
    playingRoundLabelEl.textContent = roundLabel;
    playingLockedLabelEl.textContent = `${roundLabel ? " · " : ""}${lockedCount} of ${players.length} locked in`;
  }

  if (phase === "reveal") {
    const me = players.find((p) => p.id === myId);
    revealReadyBtn.disabled = Boolean(me?.ready);
    revealReadyBtn.textContent = me?.ready ? "Waiting for others…" : "Ready";
    const readyCount = players.filter((p) => p.ready).length;
    revealReadyLabelEl.textContent = ` · ${readyCount} of ${players.length} ready`;
  }

  if (phase === "final") {
    const me = players.find((p) => p.id === myId);
    finalPlayAgainBtn.disabled = Boolean(me?.ready);
    finalPlayAgainBtn.textContent = me?.ready ? "Waiting for others…" : "Play again";
  }

  updateReadyDots();
}

function formatDuration(ms) {
  return ms === null ? "No limit" : `${ms / 1000}s`;
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
durationPopover.appendChild(Object.assign(document.createElement("div"), { className: "lobby-dropdown-divider" }));
const noLimitOpt = document.createElement("button");
noLimitOpt.type = "button";
noLimitOpt.className = "lobby-dropdown-option is-untimed";
noLimitOpt.dataset.ms = "";
noLimitOpt.textContent = "No limit";
durationPopover.appendChild(noLimitOpt);

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
  const roundDurationMs = option.dataset.ms === "" ? null : Number(option.dataset.ms);
  closeDurationDropdown();
  sendSettings({ ...settings, roundDurationMs });
});

document.addEventListener("click", (event) => {
  if (!durationDropdown.contains(event.target)) closeDurationDropdown();
});

function renderSettings(amHost) {
  lobbySettingsPanel.hidden = !amHost;
  lobbySettingsSummary.hidden = amHost;

  roundsVal.textContent = String(settings.maxRounds);
  durationChipText.textContent = formatDuration(settings.roundDurationMs);
  roundsMinusBtn.disabled = settings.maxRounds <= MIN_ROUNDS;
  roundsPlusBtn.disabled = settings.maxRounds >= MAX_ROUNDS_LIMIT;

  for (const opt of durationPopover.querySelectorAll(".lobby-dropdown-option")) {
    const ms = opt.dataset.ms === "" ? null : Number(opt.dataset.ms);
    opt.classList.toggle("is-selected", ms === settings.roundDurationMs);
  }

  if (!amHost) {
    lobbySettingsSummary.textContent = `${settings.maxRounds} rounds · ${formatDuration(settings.roundDurationMs)} per round`;
  }
}

function sendSettings(next) {
  settings = next;
  renderSettings(true);
  socket?.send(
    JSON.stringify({ type: "settings", maxRounds: settings.maxRounds, roundDurationMs: settings.roundDurationMs })
  );
}

roundsMinusBtn.addEventListener("click", () => {
  sendSettings({ ...settings, maxRounds: Math.max(MIN_ROUNDS, settings.maxRounds - ROUND_STEP) });
});
roundsPlusBtn.addEventListener("click", () => {
  sendSettings({ ...settings, maxRounds: Math.min(MAX_ROUNDS_LIMIT, settings.maxRounds + ROUND_STEP) });
});

// The chameleon is drawn in three shades of the one target color: light for
// the body/tail, medium for the neck and the pair of legs nearer the
// viewer, dark for the head and the farther pair of legs. The medium shade
// is the one players are actually dialing in on the sliders — light/dark
// stay close in brightness to it (rather than the wide swing a photoreal
// chameleon would have) so the "same color, different shading" read stays
// obvious instead of looking like three different targets.
const CHAMELEON_SHADE_SPREAD = 6;

function chameleonShades(h, s, b) {
  const clamp = (v) => Math.max(0, Math.min(100, v));
  return {
    light: rgbCss(hsbToRgb(h, s, clamp(b + CHAMELEON_SHADE_SPREAD))),
    medium: rgbCss(hsbToRgb(h, s, b)),
    dark: rgbCss(hsbToRgb(h, s, clamp(b - CHAMELEON_SHADE_SPREAD))),
  };
}

// Side profile, used while the chameleon is pacing during the guess.
// Adapted from chameleon.svg (hand-drawn: right-triangle body/neck/head,
// thick-stroke bent legs, a curled tail) — fills are swapped from fixed
// hexes to the three shade variables, and legs are split into a near/far
// pair per shade. Diagonal leg pairs share a swing class so they read as a
// natural gait (see .cham-swing-a/b in game.css).
const WALK_POSE_MARKUP = `
  <path fill="var(--c-light)" d="M570,470C485,470,395,430,355,445C275,475,250,535,278,592C306,649,374,657,424,620C465,589,462,535,423,511C388,489,347,508,339,542C332,571,352,594,375,595C396,596,408,580,402,565C398,554,386,551,379,558C373,564,377,573,384,573C389,573,392,569,391,565C391,562,388,560,386,562C383,564,384,568,386,568C389,568,390,565,388,563C386,561,383,563,384,565C384,567,386,568,388,567C390,565,389,562,387,562C383,562,381,567,384,571C390,577,400,572,400,564C400,552,387,545,377,551C362,560,365,579,379,584C398,591,416,574,413,553C409,525,379,511,356,525C328,542,333,584,364,599C399,616,437,591,437,554C437,514,402,488,367,496C326,506,304,548,319,586C338,635,397,645,439,617C493,581,500,518,470,485C447,460,413,452,382,456C429,438,494,439,570,458Z"/>
  <g transform="translate(600 470)"><g class="cham-swing-a"><path fill="none" stroke="var(--c-dark)" stroke-width="34" stroke-linecap="round" stroke-linejoin="round" d="M0,0L-70,92L-42,142"/><circle fill="var(--c-dark)" cx="0" cy="0" r="20"/></g></g>
  <g transform="translate(760 470)"><g class="cham-swing-b"><path fill="none" stroke="var(--c-dark)" stroke-width="34" stroke-linecap="round" stroke-linejoin="round" d="M0,0L45,98L68,150"/><circle fill="var(--c-dark)" cx="0" cy="0" r="20"/></g></g>
  <g transform="translate(900 445)"><g class="cham-swing-b"><path fill="none" stroke="var(--c-medium)" stroke-width="34" stroke-linecap="round" stroke-linejoin="round" d="M0,0L-58,78L-83,121"/><circle fill="var(--c-medium)" cx="0" cy="0" r="20"/></g></g>
  <g transform="translate(965 445)"><g class="cham-swing-a"><path fill="none" stroke="var(--c-medium)" stroke-width="34" stroke-linecap="round" stroke-linejoin="round" d="M0,0L55,96L82,143"/><circle fill="var(--c-medium)" cx="0" cy="0" r="20"/></g></g>
  <path fill="var(--c-light)" d="M535,470L965,470L965,245Z"/>
  <path fill="var(--c-medium)" d="M965,245L965,390L825,390Z"/>
  <circle fill="#fff8dc" cx="1090" cy="275" r="53"/>
  <circle fill="#151515" cx="1110" cy="258" r="18"/>
  <path fill="var(--c-dark)" d="M825,390L825,100L1205,390Z"/>
  <circle fill="#fff8dc" cx="955" cy="255" r="65"/>
  <circle fill="#151515" cx="975" cy="235" r="22"/>
`;

walkerChameleon.innerHTML = WALK_POSE_MARKUP;

// Lobby preview: a static sample color, with the chameleon set to nearly
// the same shade as the stage — showing what a good match looks like
// before anyone's even picked up a slider.
const lobbyPreviewChameleon = el("lobby-preview-chameleon");
if (lobbyPreviewChameleon) {
  lobbyPreviewChameleon.innerHTML = WALK_POSE_MARKUP;
  const previewShades = chameleonShades(340, 55, 78);
  lobbyPreviewChameleon.style.setProperty("--c-light", previewShades.light);
  lobbyPreviewChameleon.style.setProperty("--c-medium", previewShades.medium);
  lobbyPreviewChameleon.style.setProperty("--c-dark", previewShades.dark);
}

// Mobile: Preview / How to play tabs live in one card (desktop shows both
// panes at once and hides the tabs — see the min-width:721px rule in
// lobby.css — so this listener is a no-op there, which is fine).
const lobbyIntroTabs = el("lobby-intro-tabs");
lobbyIntroTabs?.addEventListener("click", (event) => {
  const btn = event.target.closest("button[data-pane]");
  if (!btn) return;
  for (const b of lobbyIntroTabs.querySelectorAll("button")) b.classList.toggle("is-active", b === btn);
  for (const pane of document.querySelectorAll(".lobby-intro-pane")) {
    pane.classList.toggle("is-active", pane.dataset.pane === btn.dataset.pane);
  }
});

// The results lineup reuses the same walk-pose art, frozen mid-stride
// (see .lineup-slot in reveal.css, which turns off the leg-swing animation)
// rather than a separate standing pose — one consistent look everywhere.
function chameleonSvg(color) {
  const shades = chameleonShades(color.h, color.s, color.b);
  return `
    <svg class="chameleon-svg" viewBox="0 0 1600 800" style="--c-light:${shades.light};--c-medium:${shades.medium};--c-dark:${shades.dark};">
      ${WALK_POSE_MARKUP}
    </svg>
  `;
}

function updateWalkerColor(h, s, b) {
  const shades = chameleonShades(h, s, b);
  walkerChameleon.style.setProperty("--c-light", shades.light);
  walkerChameleon.style.setProperty("--c-medium", shades.medium);
  walkerChameleon.style.setProperty("--c-dark", shades.dark);
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
  const urgent = remainingMs > 0 && remainingS <= 5;
  countdownNum.textContent = String(remainingS);
  countdownRing.style.setProperty("--pct", String(Math.round((remainingMs / roundDurationMs) * 100)));
  countdownRing.style.setProperty("--ring-color", urgent ? "#d56062" : "#067bc2");

  if (urgent) {
    // Retrigger the pulse only when the displayed second actually changes,
    // instead of looping it on its own clock — keeps the beat locked to the
    // real countdown instead of drifting from it.
    if (remainingS !== lastPulseSecond) {
      lastPulseSecond = remainingS;
      countdownRing.classList.remove("urgent");
      void countdownRing.offsetWidth;
      countdownRing.classList.add("urgent");
    }
  } else {
    lastPulseSecond = null;
    countdownRing.classList.remove("urgent");
  }

  if (remainingMs <= 0) {
    stopCountdown();
    walkerEl.classList.add("is-stopped");
  }
}

function startPlaying(roundNumber, maxRounds, newTarget, durationMs, endsAt) {
  phase = "playing";
  target = newTarget;
  roundDurationMs = durationMs;
  roundEndsAt = endsAt || 0;
  playingRoundNumber = roundNumber;
  playingMaxRounds = maxRounds;
  locked = false;
  walkerEl.classList.remove("is-stopped");

  renderRoundTrack(playingRoundTrackEl, roundNumber, maxRounds);

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
  // No timer: the ring just hides and the round waits for everyone to lock
  // in instead (checked server-side), same as a timed round ending early.
  countdownRing.hidden = !roundEndsAt;
  if (roundEndsAt) {
    tickCountdown();
    countdownTimer = setInterval(tickCountdown, 200);
  }
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
    revealSummary.innerHTML = `You scored <strong style="color: #067bc2;">${mine.score}%</strong> matching ${target.name}`;
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

    const scoreEl = document.createElement("span");
    scoreEl.className = index === 0 ? "reveal-result-score top" : "reveal-result-score";
    scoreEl.textContent = `${r.score}%`;

    const readyDot = document.createElement("span");
    readyDot.className = "status-dot";
    readyDot.innerHTML = READY_CHECK_SVG;

    li.append(avatar, nameEl, scoreEl, readyDot);
    resultsList.appendChild(li);
  });

  showView("reveal");
  renderPlayers();
}

function renderPodium(standings) {
  const showPodium = standings.length >= 3;
  finalPodiumEl.hidden = !showPodium;
  if (!showPodium) return;

  [1, 2, 3].forEach((rank) => {
    const s = standings[rank - 1];
    const slot = podiumSlots[rank];
    slot.querySelector(".podium-avatar").textContent = s.name.trim().charAt(0) || "?";
    slot.querySelector(".podium-name").textContent = s.name + (s.id === myId ? " (you)" : "");
    slot.querySelector(".podium-score").textContent = `${s.avgScore.toFixed(1)} avg`;
  });
}

function renderFinalTable(maxRounds, standings) {
  finalTableHead.innerHTML = "";
  const headCells = ["Player", ...Array.from({ length: maxRounds }, (_, i) => `R${i + 1}`), "Avg", ""];
  headCells.forEach((label) => {
    const th = document.createElement("th");
    th.textContent = label;
    finalTableHead.appendChild(th);
  });

  finalTableBody.innerHTML = "";
  standings.forEach((s) => {
    const tr = document.createElement("tr");
    tr.className = s.id === myId ? "is-you" : "";
    tr.dataset.playerId = s.id;

    const nameTd = document.createElement("td");
    nameTd.className = "final-table-name";
    nameTd.textContent = s.name + (s.id === myId ? " (you)" : "");
    tr.appendChild(nameTd);

    for (let i = 0; i < maxRounds; i++) {
      const td = document.createElement("td");
      const score = s.roundScores[i];
      td.textContent = score != null ? String(score) : "–";
      tr.appendChild(td);
    }

    const avgTd = document.createElement("td");
    avgTd.className = "final-table-avg";
    avgTd.textContent = s.avgScore.toFixed(1);
    tr.appendChild(avgTd);

    const readyTd = document.createElement("td");
    readyTd.className = "final-table-ready";
    const readyDot = document.createElement("span");
    readyDot.className = "status-dot";
    readyDot.innerHTML = READY_CHECK_SVG;
    readyTd.appendChild(readyDot);
    tr.appendChild(readyTd);

    finalTableBody.appendChild(tr);
  });
}

function showFinal(maxRounds, standings) {
  phase = "final";
  showView("final");

  finalStatusSubEl.textContent = `${maxRounds} round${maxRounds === 1 ? "" : "s"} played`;

  const winner = standings[0];
  finalWinnerNameEl.textContent = winner?.name ?? "-";

  renderPodium(standings);
  renderFinalTable(maxRounds, standings);

  renderPlayers();
}

lockBtn.addEventListener("click", () => {
  if (locked) return;
  locked = true;
  [hueSlider, satSlider, briSlider].forEach((sliderEl) => (sliderEl.disabled = true));
  lockBtn.disabled = true;
  lockBtn.textContent = "Waiting for others…";
  walkerEl.classList.add("is-stopped");
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
        if (data.settings) settings = data.settings;
        renderPlayers();
        if (phase === "lobby") showView("lobby");
        break;
      case "round-start":
        startPlaying(data.roundNumber, data.maxRounds, data.target, data.durationMs, data.endsAt);
        break;
      case "reveal":
        showReveal(data.roundNumber, data.maxRounds, data.target, data.results);
        break;
      case "final":
        showFinal(data.maxRounds, data.standings);
        break;
    }
  });
}
