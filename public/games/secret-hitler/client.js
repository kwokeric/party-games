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

const tableBackBtn = el("table-back-btn");
const tableRoomCodeEl = el("table-room-code");
const dealAgainBtn = el("deal-again-btn");
const tableWaitingEl = el("table-waiting");

lobbyRoomCodeEl.textContent = room ?? "(none)";
roleRoomCodeEl.textContent = room ?? "(none)";
tableRoomCodeEl.textContent = room ?? "(none)";

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

function renderRoleCard() {
  if (!myRole) return;
  roleCard.classList.toggle("is-revealed", flipped);
  readyBtn.disabled = !seen;
  readyBtn.textContent = "Ready";

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

backBtn.addEventListener("click", () => (location.href = "/"));
roleBackBtn.addEventListener("click", () => (location.href = "/"));
tableBackBtn.addEventListener("click", () => (location.href = "/"));

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
        }
        // During "reveal", the roster (players[]) is kept in sync silently —
        // the role card itself only reflects this player's own "role"
        // message, not the shared player list.
        break;
      case "role":
        myRole = { role: data.role, teammates: data.teammates, hidden: data.hidden };
        flipped = false;
        seen = false;
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
        showView("lobby");
        renderLobby();
        break;
    }
  });
}
