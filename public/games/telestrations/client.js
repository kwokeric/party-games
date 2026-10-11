const params = new URLSearchParams(location.search);
const room = params.get("room");
const isHostUrl = params.get("host") === "1";
const playerName = params.get("name") ?? "";

const el = (id) => document.getElementById(id);

const lobbyView = el("lobby-view");
const playingView = el("playing-view");
const revealView = el("reveal-view");
const resultsView = el("results-view");

const backBtn = el("back-btn");
const lobbyRoomCodeEl = el("lobby-room-code");
const copyCodeBtn = el("copy-code-btn");
const lobbyPlayerListEl = el("lobby-player-list");
const lobbyRangeHintEl = el("lobby-range-hint");
const startBtn = el("start-btn");
const readyBtn = el("ready-btn");
const lobbyWaitingEl = el("lobby-waiting");

const playingBackBtn = el("playing-back-btn");
const playingRoomCodeEl = el("playing-room-code");
const playingConnectionDotEl = el("playing-connection-dot");
const playingConnectionTextEl = el("playing-connection-text");
const playingStatusTextEl = el("playing-status-text");
const countdownRing = el("countdown-ring");
const countdownNum = el("countdown-num");
const playingKindLabelEl = el("playing-kind-label");
const playingPromptCardEl = el("playing-prompt-card");
const playingInputEl = el("playing-input");
const playingSubmitBtn = el("playing-submit-btn");

const revealBackBtn = el("reveal-back-btn");
const revealRoomCodeEl = el("reveal-room-code");
const revealStatusTextEl = el("reveal-status-text");
const revealVoteProgressEl = el("reveal-vote-progress");
const revealChainListEl = el("reveal-chain-list");
const voteBtn = el("vote-btn");
const nextChainBtn = el("next-chain-btn");

const resultsBackBtn = el("results-back-btn");
const resultsRoomCodeEl = el("results-room-code");
const resultsListEl = el("results-list");
const playAgainBtn = el("play-again-btn");
const resultsWaitingEl = el("results-waiting");

lobbyRoomCodeEl.textContent = room ?? "(none)";
playingRoomCodeEl.textContent = room ?? "(none)";
revealRoomCodeEl.textContent = room ?? "(none)";
resultsRoomCodeEl.textContent = room ?? "(none)";

let myId = null;
let players = [];
let phase = "lobby";
let minPlayers = 4;
let maxPlayers = 8;
let roundEndsAt = 0;
let roundDurationMs = 60000;
let countdownTimer = null;
let hasVotedThisChain = false;

function showView(view) {
  lobbyView.hidden = view !== "lobby";
  playingView.hidden = view !== "playing";
  revealView.hidden = view !== "reveal";
  resultsView.hidden = view !== "results";
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
    startBtn.hidden = !amHost;
    startBtn.disabled = !inRange;
    readyBtn.hidden = amHost;
    lobbyWaitingEl.hidden = amHost;
    lobbyRangeHintEl.textContent = inRange ? "" : `Needs ${minPlayers}-${maxPlayers} players (currently ${count}).`;
    if (!amHost) {
      const host = players.find((p) => p.isHost);
      lobbyWaitingEl.textContent = `Waiting for ${host?.name ?? "the host"} to start`;
      const me = players.find((p) => p.id === myId);
      readyBtn.textContent = me?.ready ? "Not ready" : "Ready up";
      readyBtn.classList.toggle("is-ready", Boolean(me?.ready));
    }
  }

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

function tickCountdown() {
  const remainingMs = Math.max(0, roundEndsAt - Date.now());
  const remainingS = Math.ceil(remainingMs / 1000);
  countdownNum.textContent = String(remainingS);
  const pct = roundDurationMs ? Math.max(0, Math.min(100, (remainingMs / roundDurationMs) * 100)) : 100;
  countdownRing.style.setProperty("--pct", String(pct));
  if (remainingMs <= 0) stopCountdown();
}

function startPlaying(round, totalRounds, kind, promptText, durationMs, endsAt) {
  phase = "playing";
  roundDurationMs = durationMs;
  roundEndsAt = endsAt;
  playingKindLabelEl.textContent =
    kind === "draw"
      ? `Round ${round} of ${totalRounds} — Draw this (Phase 1 stand-in: describe it in words)`
      : `Round ${round} of ${totalRounds} — Guess what this describes`;
  playingPromptCardEl.textContent = promptText;
  playingInputEl.value = "";
  playingInputEl.placeholder = kind === "draw" ? "Describe what you'd draw…" : "Your guess…";
  playingInputEl.disabled = false;
  playingSubmitBtn.disabled = false;
  playingSubmitBtn.textContent = "Submit";
  showView("playing");
  stopCountdown();
  tickCountdown();
  countdownTimer = setInterval(tickCountdown, 250);
}

function renderRevealChain(chainIndex, totalChains, entries) {
  phase = "reveal";
  hasVotedThisChain = false;
  revealStatusTextEl.textContent = `Chain ${chainIndex + 1} of ${totalChains}`;
  revealVoteProgressEl.textContent = "";
  revealChainListEl.innerHTML = "";

  entries.forEach((entry, idx) => {
    const li = document.createElement("li");
    li.className = "reveal-chain-entry";

    const label = document.createElement("span");
    label.className = "reveal-entry-label";
    label.textContent =
      idx === 0
        ? "The prompt"
        : idx % 2 === 1
          ? `${entry.authorName} drew`
          : `${entry.authorName} guessed`;

    const text = document.createElement("p");
    text.className = "reveal-entry-text";
    text.textContent = entry.text;

    li.append(label, text);
    revealChainListEl.appendChild(li);
  });

  voteBtn.disabled = false;
  voteBtn.textContent = "😂 Vote for this chain";
  nextChainBtn.hidden = !isHost();
  nextChainBtn.textContent = chainIndex >= totalChains - 1 ? "See results" : "Next chain";
  showView("reveal");
}

function renderResults(chains) {
  phase = "results";
  resultsListEl.innerHTML = "";

  chains.forEach((chain, rank) => {
    const li = document.createElement("li");
    li.className = "results-chain-item";

    const head = document.createElement("div");
    head.className = "results-chain-head";
    const rankEl = document.createElement("span");
    rankEl.className = "results-rank";
    rankEl.textContent = `#${rank + 1}`;
    const votesEl = document.createElement("span");
    votesEl.className = "results-votes";
    votesEl.textContent = `${chain.votes} vote${chain.votes === 1 ? "" : "s"}`;
    head.append(rankEl, votesEl);
    li.appendChild(head);

    chain.entries.forEach((entry, idx) => {
      const p = document.createElement("p");
      p.className = "results-entry-text";
      const who = document.createElement("strong");
      who.textContent = `${idx === 0 ? "Prompt" : idx % 2 === 1 ? `${entry.authorName} drew` : `${entry.authorName} guessed`}: `;
      p.append(who, document.createTextNode(entry.text));
      li.appendChild(p);
    });

    resultsListEl.appendChild(li);
  });

  playAgainBtn.hidden = !isHost();
  resultsWaitingEl.hidden = isHost();
  showView("results");
}

playingSubmitBtn.addEventListener("click", () => {
  const text = playingInputEl.value.trim();
  if (!text) return;
  socket?.send(JSON.stringify({ type: "submit", text }));
  playingInputEl.disabled = true;
  playingSubmitBtn.disabled = true;
  playingSubmitBtn.textContent = "Waiting for others…";
});

voteBtn.addEventListener("click", () => {
  if (hasVotedThisChain) return;
  hasVotedThisChain = true;
  voteBtn.disabled = true;
  voteBtn.textContent = "Voted!";
  socket?.send(JSON.stringify({ type: "vote" }));
});

nextChainBtn.addEventListener("click", () => {
  socket?.send(JSON.stringify({ type: "next-chain" }));
});

playAgainBtn.addEventListener("click", () => {
  socket?.send(JSON.stringify({ type: "reset" }));
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
revealBackBtn.addEventListener("click", () => {
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
  console.warn("Chain Doodles loaded without a room code.");
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
        renderPlayers();
        if (phase === "lobby") showView("lobby");
        break;
      case "round-start":
        startPlaying(data.round, data.totalRounds, data.kind, data.promptText, data.durationMs, data.endsAt);
        break;
      case "reveal-chain":
        renderRevealChain(data.chainIndex, data.totalChains, data.entries);
        break;
      case "vote-progress":
        revealVoteProgressEl.textContent = `${data.votedCount} of ${data.total} voted`;
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
