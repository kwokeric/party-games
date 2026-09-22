const params = new URLSearchParams(location.search);
const room = params.get("room");
const isHostUrl = params.get("host") === "1";
const playerName = params.get("name") ?? "";

const el = (id) => document.getElementById(id);

const lobbyView = el("lobby-view");
const roleView = el("role-view");
const tableView = el("table-view");
const backBtn = el("back-btn");
const lobbyRoomCodeEl = el("lobby-room-code");
const copyCodeBtn = el("copy-code-btn");
const lobbyPlayerListEl = el("lobby-player-list");
const dealBtn = el("deal-btn");
const readyToggleBtn = el("ready-toggle-btn");
const lobbyWaitingEl = el("lobby-waiting");
const lobbyHintEl = el("lobby-hint");

const roleBackBtn = el("role-back-btn");
const roleRoomCodeEl = el("role-room-code");
const roleCard = el("role-card");
const roleIcon = el("role-icon");
const roleName = el("role-name");
const roleDesc = el("role-desc");
const roleTeam = el("role-team");
const readyBtn = el("ready-btn");
const readyStripEl = el("ready-strip");
const readyCountEl = el("ready-count");

const tableBackBtn = el("table-back-btn");
const tableRoomCodeEl = el("table-room-code");
const dealAgainBtn = el("deal-again-btn");
const tableWaitingEl = el("table-waiting");
const continueBoardBtn = el("continue-board-btn");

const boardView = el("board-view");
const boardBackBtn = el("board-back-btn");
const boardRoomCodeEl = el("board-room-code");
const boardLiberalTrackEl = el("board-liberal-track");
const boardFascistTrackEl = el("board-fascist-track");
const boardTrackerEl = el("board-tracker");
const boardLibMinusBtn = el("board-lib-minus");
const boardLibPlusBtn = el("board-lib-plus");
const boardFasMinusBtn = el("board-fas-minus");
const boardFasPlusBtn = el("board-fas-plus");
const boardPresidentNameEl = el("board-president-name");
const boardChancellorNameEl = el("board-chancellor-name");
const boardViewerSelect = el("board-viewer-select");
const nominateCtaBtn = el("nominate-cta-btn");
const boardWaitingTextEl = el("board-waiting-text");

const nominateView = el("nominate-view");
const nominateBackBtn = el("nominate-back-btn");
const nominateRoomCodeEl = el("nominate-room-code");
const nominatePresidentNameEl = el("nominate-president-name");
const nomineeListEl = el("nominee-list");
const nominateConfirmBtn = el("nominate-confirm-btn");

const voteView = el("vote-view");
const voteBackBtn = el("vote-back-btn");
const voteRoomCodeEl = el("vote-room-code");
const votePresidentNameEl = el("vote-president-name");
const voteChancellorNameEl = el("vote-chancellor-name");
const voteViewerSelect = el("vote-viewer-select");
const voteJaBtn = el("vote-ja-btn");
const voteNeinBtn = el("vote-nein-btn");
const voteStatusTextEl = el("vote-status-text");
const voteRevealBtn = el("vote-reveal-btn");

const voteRevealView = el("vote-reveal-view");
const voteRevealBackBtn = el("vote-reveal-back-btn");
const voteRevealRoomCodeEl = el("vote-reveal-room-code");
const voteOutcomeBannerEl = el("vote-outcome-banner");
const voteTallyListEl = el("vote-tally-list");
const voteContinueBtn = el("vote-continue-btn");

lobbyRoomCodeEl.textContent = room ?? "(none)";
roleRoomCodeEl.textContent = room ?? "(none)";
tableRoomCodeEl.textContent = room ?? "(none)";
boardRoomCodeEl.textContent = room ?? "(none)";
nominateRoomCodeEl.textContent = room ?? "(none)";
voteRoomCodeEl.textContent = room ?? "(none)";
voteRevealRoomCodeEl.textContent = room ?? "(none)";

const MIN_PLAYERS = 5;
const MAX_PLAYERS = 10;

const ICONS = {
  liberal: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><polyline points="9 12 11 14 15 10"/></svg>`,
  fascist: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M4 8h16M4 8c0 4 3.5 6 8 6s8-2 8-6"/></svg>`,
  hitler: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18l3-9 5-6 5 6 3 9"/><circle cx="12" cy="18" r="2.4"/></svg>`,
};

let myId = null;
let players = [];
let phase = "lobby";
let flipped = false;
let seen = false;
let myRole = null; // { role, teammates, hidden }

function isHost() {
  return players.find((p) => p.id === myId)?.isHost ?? false;
}

function showView(view) {
  lobbyView.hidden = view !== "lobby";
  roleView.hidden = view !== "role";
  tableView.hidden = view !== "table";
  boardView.hidden = view !== "board";
  nominateView.hidden = view !== "nominate";
  voteView.hidden = view !== "vote";
  voteRevealView.hidden = view !== "vote-reveal";
}

function renderPlayerList() {
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
}

function renderLobby() {
  renderPlayerList();

  const amHost = isHost();
  const count = players.length;
  const inRange = count >= MIN_PLAYERS && count <= MAX_PLAYERS;

  dealBtn.hidden = !amHost;
  dealBtn.disabled = !inRange;
  readyToggleBtn.hidden = amHost;
  lobbyWaitingEl.hidden = amHost;

  if (amHost) {
    lobbyHintEl.hidden = inRange;
    if (!inRange) {
      lobbyHintEl.textContent =
        count < MIN_PLAYERS
          ? `Need at least ${MIN_PLAYERS} players (${count} so far).`
          : `Too many players for one game — ${MAX_PLAYERS} max (${count} joined).`;
    }
  } else {
    lobbyHintEl.hidden = true;
    const host = players.find((p) => p.isHost);
    lobbyWaitingEl.textContent = `Waiting for ${host?.name ?? "the host"} to deal`;
    const me = players.find((p) => p.id === myId);
    readyToggleBtn.textContent = me?.ready ? "Not ready" : "Ready up";
    readyToggleBtn.classList.toggle("is-ready", Boolean(me?.ready));
  }
}

const READY_CHECK_SVG =
  '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

function renderReadyStrip() {
  readyStripEl.innerHTML = "";
  for (const p of players) {
    const item = document.createElement("div");
    item.className =
      "sh-ready-item" + (p.ready ? " is-ready" : "") + (p.id === myId ? " is-me" : "");

    const avatar = document.createElement("div");
    avatar.className = "sh-ready-avatar";
    avatar.textContent = p.name.trim().charAt(0) || "?";
    if (p.ready) {
      const badge = document.createElement("span");
      badge.className = "sh-ready-badge";
      badge.innerHTML = READY_CHECK_SVG;
      avatar.appendChild(badge);
    }

    const name = document.createElement("span");
    name.className = "sh-ready-name";
    name.textContent = p.name;

    item.append(avatar, name);
    readyStripEl.appendChild(item);
  }

  const readyCount = players.filter((p) => p.ready).length;
  readyCountEl.textContent = `${readyCount} of ${players.length} ready`;
}

function updateReadyButton() {
  const iAmReady = players.find((p) => p.id === myId)?.ready ?? false;
  readyBtn.disabled = !seen || iAmReady;
  readyBtn.textContent = iAmReady ? "Waiting…" : "Ready";
}

function renderRoleCard() {
  if (!myRole) return;
  roleCard.classList.toggle("is-revealed", flipped);
  updateReadyButton();

  const backEl = roleCard.querySelector(".sh-card-back");
  backEl.className = "sh-card-face sh-card-back role-" + myRole.role;
  roleIcon.innerHTML = ICONS[myRole.role];
  roleTeam.innerHTML = "";

  if (myRole.role === "liberal") {
    roleName.textContent = "Liberal";
    roleDesc.textContent = "You don't know anyone else's role. Watch how people vote and argue for policies you trust.";
  } else if (myRole.role === "fascist") {
    roleName.textContent = "Fascist";
    roleDesc.textContent = "Help your team seize power without getting caught. Here's who you're working with:";
    myRole.teammates.forEach(({ name, role }) => {
      const chip = document.createElement("span");
      chip.className = "sh-team-chip" + (role === "hitler" ? " is-hitler" : "");
      chip.textContent = role === "hitler" ? `${name} — Hitler` : name;
      roleTeam.appendChild(chip);
    });
  } else {
    roleName.textContent = "Hitler";
    roleDesc.textContent =
      "You lead the fascists. If three fascist policies pass and you're then elected Chancellor, your side wins on the spot — so staying likable matters more than staying loyal-looking.";
    if (myRole.hidden) {
      const note = document.createElement("p");
      note.className = "sh-team-note";
      note.textContent = "This game has enough players that you're kept in the dark on who your fascists are, same as the liberals.";
      roleTeam.appendChild(note);
    } else {
      myRole.teammates.forEach(({ name }) => {
        const chip = document.createElement("span");
        chip.className = "sh-team-chip";
        chip.textContent = name;
        roleTeam.appendChild(chip);
      });
    }
  }

  renderReadyStrip();
}

roleCard.addEventListener("click", () => {
  flipped = !flipped;
  if (flipped) seen = true;
  renderRoleCard();
});

readyBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  socket?.send(JSON.stringify({ type: "ready" }));
});

dealBtn.addEventListener("click", () => {
  socket?.send(JSON.stringify({ type: "deal" }));
});

readyToggleBtn.addEventListener("click", () => {
  socket?.send(JSON.stringify({ type: "ready" }));
});

dealAgainBtn.addEventListener("click", () => {
  socket?.send(JSON.stringify({ type: "reset" }));
});

function renderTable() {
  const amHost = isHost();
  dealAgainBtn.hidden = !amHost;
  tableWaitingEl.hidden = amHost;
}

// --- Board / nomination / voting mockup ---------------------------------
// Everything below runs locally on this one device only (see the banner on
// the board view) — nominating, voting, and the board state itself aren't
// sent over the socket yet. A "viewing as" picker stands in for "each
// player looks at their own phone" while this is still a UI mockup, same
// pattern the role reveal started from before it got wired up for real.

let board = null;

function initBoard() {
  board = {
    liberalPolicies: 0,
    fascistPolicies: 0,
    tracker: 0,
    round: 1,
    presidentIdx: 0,
    chancellorId: null,
    lastPresidentId: null,
    lastChancellorId: null,
    votes: {},
    viewerId: players[0]?.id ?? null,
    pendingOutcome: false,
  };
}

function currentPresident() {
  if (!board || players.length === 0) return null;
  return players[board.presidentIdx % players.length];
}

// The previous Chancellor is always term-limited out of the next
// nomination; the previous President is too, but only once the table's
// big enough that skipping them doesn't stall the rotation (mirrors the
// real game's 5-6 vs 7+ player distinction).
function eligibleNominees() {
  const president = currentPresident();
  return players.filter((p) => {
    if (p.id === president?.id) return false;
    if (p.id === board.lastChancellorId) return false;
    if (players.length > 6 && p.id === board.lastPresidentId) return false;
    return true;
  });
}

function renderTrackSlots(container, total, filled) {
  container.innerHTML = "";
  for (let i = 0; i < total; i++) {
    const slot = document.createElement("span");
    slot.className = "sh-track-slot" + (i < filled ? " is-filled" : "");
    container.appendChild(slot);
  }
}

function populateViewerSelect(selectEl) {
  if (selectEl.options.length !== players.length) {
    selectEl.innerHTML = "";
    for (const p of players) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      selectEl.appendChild(opt);
    }
  }
}

function renderBoard() {
  if (!board) return;
  renderTrackSlots(boardLiberalTrackEl, 5, board.liberalPolicies);
  renderTrackSlots(boardFascistTrackEl, 6, board.fascistPolicies);
  renderTrackSlots(boardTrackerEl, 3, board.tracker);

  const president = currentPresident();
  boardPresidentNameEl.textContent = president ? president.name : "—";
  const chancellor = players.find((p) => p.id === board.chancellorId);
  boardChancellorNameEl.textContent = chancellor ? chancellor.name : "—";

  populateViewerSelect(boardViewerSelect);
  boardViewerSelect.value = board.viewerId;

  const viewingPresident = board.viewerId === president?.id;
  nominateCtaBtn.hidden = !viewingPresident;
  boardWaitingTextEl.hidden = viewingPresident;
  if (!viewingPresident) {
    boardWaitingTextEl.textContent = `Waiting for ${president?.name ?? "the President"} to nominate a Chancellor…`;
  }
}

boardLibMinusBtn.addEventListener("click", () => {
  board.liberalPolicies = Math.max(0, board.liberalPolicies - 1);
  renderBoard();
});
boardLibPlusBtn.addEventListener("click", () => {
  board.liberalPolicies = Math.min(5, board.liberalPolicies + 1);
  renderBoard();
});
boardFasMinusBtn.addEventListener("click", () => {
  board.fascistPolicies = Math.max(0, board.fascistPolicies - 1);
  renderBoard();
});
boardFasPlusBtn.addEventListener("click", () => {
  board.fascistPolicies = Math.min(6, board.fascistPolicies + 1);
  renderBoard();
});
boardViewerSelect.addEventListener("change", () => {
  board.viewerId = boardViewerSelect.value;
  renderBoard();
});

continueBoardBtn.addEventListener("click", () => {
  if (!board) initBoard();
  showView("board");
  renderBoard();
});

nominateCtaBtn.addEventListener("click", () => {
  showView("nominate");
  renderNominate();
});

function renderNominate() {
  const president = currentPresident();
  nominatePresidentNameEl.textContent = president ? president.name : "—";
  nominateConfirmBtn.disabled = true;
  delete nominateConfirmBtn.dataset.nomineeId;

  nomineeListEl.innerHTML = "";
  const eligible = eligibleNominees();
  for (const p of players) {
    if (p.id === president?.id) continue;
    const isEligible = eligible.some((e) => e.id === p.id);

    const li = document.createElement("li");
    const rowBtn = document.createElement("button");
    rowBtn.type = "button";
    rowBtn.className = "sh-nominee-row" + (isEligible ? "" : " is-ineligible");
    rowBtn.disabled = !isEligible;

    const nameSpan = document.createElement("span");
    nameSpan.className = "sh-nominee-name";
    nameSpan.textContent = p.name;
    rowBtn.appendChild(nameSpan);

    if (!isEligible) {
      const note = document.createElement("span");
      note.className = "sh-nominee-note";
      note.textContent = "term-limited";
      rowBtn.appendChild(note);
    }

    rowBtn.addEventListener("click", () => {
      for (const row of nomineeListEl.querySelectorAll(".sh-nominee-row")) row.classList.remove("is-selected");
      rowBtn.classList.add("is-selected");
      nominateConfirmBtn.disabled = false;
      nominateConfirmBtn.dataset.nomineeId = p.id;
    });

    li.appendChild(rowBtn);
    nomineeListEl.appendChild(li);
  }
}

nominateConfirmBtn.addEventListener("click", () => {
  const nomineeId = nominateConfirmBtn.dataset.nomineeId;
  if (!nomineeId) return;
  board.chancellorId = nomineeId;
  board.votes = {};
  showView("vote");
  renderVote();
});

function renderVote() {
  const president = currentPresident();
  const chancellor = players.find((p) => p.id === board.chancellorId);
  votePresidentNameEl.textContent = president ? president.name : "—";
  voteChancellorNameEl.textContent = chancellor ? chancellor.name : "—";

  populateViewerSelect(voteViewerSelect);
  voteViewerSelect.value = board.viewerId;

  const myVote = board.votes[board.viewerId];
  voteJaBtn.classList.toggle("is-picked", myVote === "ja");
  voteNeinBtn.classList.toggle("is-picked", myVote === "nein");

  const votedCount = Object.keys(board.votes).length;
  const allVoted = votedCount === players.length;
  voteStatusTextEl.textContent = allVoted ? "Everyone's voted." : `${votedCount} of ${players.length} voted.`;
  voteRevealBtn.hidden = !allVoted;
}

voteViewerSelect.addEventListener("change", () => {
  board.viewerId = voteViewerSelect.value;
  renderVote();
});

// After voting, jump to the next player who hasn't voted yet — keeps a
// "pass the device around the table" flow moving without extra taps.
function advanceVoteViewer() {
  const next = players.find((p) => !board.votes[p.id]);
  if (next) board.viewerId = next.id;
}

voteJaBtn.addEventListener("click", () => {
  board.votes[board.viewerId] = "ja";
  advanceVoteViewer();
  renderVote();
});
voteNeinBtn.addEventListener("click", () => {
  board.votes[board.viewerId] = "nein";
  advanceVoteViewer();
  renderVote();
});

voteRevealBtn.addEventListener("click", () => {
  showView("vote-reveal");
  renderVoteReveal();
});

function renderVoteReveal() {
  const jaCount = Object.values(board.votes).filter((v) => v === "ja").length;
  const neinCount = Object.values(board.votes).filter((v) => v === "nein").length;
  const passed = jaCount > neinCount;
  board.pendingOutcome = passed;

  voteOutcomeBannerEl.className = "sh-outcome-banner " + (passed ? "is-pass" : "is-fail");
  voteOutcomeBannerEl.innerHTML = passed
    ? `Government approved!<p>${jaCount} Ja · ${neinCount} Nein — draw and resolve the legislative session at the table.</p>`
    : `Government rejected.<p>${jaCount} Ja · ${neinCount} Nein — the election tracker moves up${
        board.tracker >= 2 ? " (one more fail and the top policy auto-enacts)" : ""
      }.</p>`;

  voteTallyListEl.innerHTML = "";
  for (const p of players) {
    const li = document.createElement("li");
    li.className = "sh-vote-tally-row";
    const name = document.createElement("span");
    name.className = "sh-vote-tally-name";
    name.textContent = p.name;
    const badge = document.createElement("span");
    const vote = board.votes[p.id];
    badge.className = "sh-vote-tally-badge is-" + vote;
    badge.textContent = vote === "ja" ? "Ja" : "Nein";
    li.append(name, badge);
    voteTallyListEl.appendChild(li);
  }
}

voteContinueBtn.addEventListener("click", () => {
  const president = currentPresident();
  if (board.pendingOutcome) {
    board.lastPresidentId = president?.id ?? null;
    board.lastChancellorId = board.chancellorId;
    board.tracker = 0;
  } else {
    board.tracker += 1;
    // Chaos: three failed elections in a row auto-enacts the top policy at
    // the table (not modeled here since there's no real policy deck yet)
    // and resets the tracker.
    if (board.tracker >= 3) board.tracker = 0;
  }
  board.chancellorId = null;
  board.votes = {};
  board.presidentIdx = (board.presidentIdx + 1) % Math.max(1, players.length);
  board.round += 1;
  showView("board");
  renderBoard();
});

backBtn.addEventListener("click", () => (location.href = "/"));
roleBackBtn.addEventListener("click", () => (location.href = "/"));
tableBackBtn.addEventListener("click", () => (location.href = "/"));
boardBackBtn.addEventListener("click", () => (location.href = "/"));
nominateBackBtn.addEventListener("click", () => (location.href = "/"));
voteBackBtn.addEventListener("click", () => (location.href = "/"));
voteRevealBackBtn.addEventListener("click", () => (location.href = "/"));

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
  console.warn("Secret Hitler loaded without a room code.");
} else {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const connectParams = new URLSearchParams();
  if (isHostUrl) connectParams.set("host", "1");
  if (playerName) connectParams.set("name", playerName);
  const query = connectParams.toString();
  socket = new WebSocket(
    `${protocol}//${location.host}/parties/secret-hitler/${room}${query ? `?${query}` : ""}`
  );

  socket.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    switch (data.type) {
      case "you":
        myId = data.id;
        renderLobby();
        break;
      case "players":
        players = data.players;
        phase = data.phase;
        if (phase === "lobby") {
          flipped = false;
          seen = false;
          myRole = null;
          showView("lobby");
          renderLobby();
        } else if (phase === "table") {
          renderTable();
        } else if (phase === "reveal") {
          renderReadyStrip();
          updateReadyButton();
        }
        break;
      case "role":
        myRole = { role: data.role, teammates: data.teammates, hidden: data.hidden };
        flipped = false;
        seen = false;
        board = null;
        showView("role");
        renderRoleCard();
        break;
      case "table":
        showView("table");
        renderTable();
        break;
      case "lobby":
        flipped = false;
        seen = false;
        myRole = null;
        board = null;
        showView("lobby");
        renderLobby();
        break;
    }
  });
}
