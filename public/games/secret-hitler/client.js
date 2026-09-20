// Role-reveal mockup for a hidden-role party game. This is a front-end-only
// demo: role assignment happens locally in the browser (not over a
// WebSocket, no Durable Object backend yet) so the UI/UX can be reviewed
// before wiring up real multiplayer. A "viewing as" dropdown stands in for
// "each player looks at their own phone" — that dropdown has no equivalent
// in the real game.

const el = (id) => document.getElementById(id);

const lobbyView = el("lobby-view");
const roleView = el("role-view");
const backBtn = el("back-btn");
const roleBackBtn = el("role-back-btn");
const countMinusBtn = el("count-minus-btn");
const countPlusBtn = el("count-plus-btn");
const countVal = el("count-val");
const countBreakdown = el("count-breakdown");
const lobbyPlayerListEl = el("lobby-player-list");
const dealBtn = el("deal-btn");
const viewerSelect = el("viewer-select");
const roleCard = el("role-card");
const roleIcon = el("role-icon");
const roleName = el("role-name");
const roleDesc = el("role-desc");
const roleTeam = el("role-team");
const readyBtn = el("ready-btn");

const MIN_PLAYERS = 5;
const MAX_PLAYERS = 10;

const NAME_POOL = ["Avery", "Blair", "Casey", "Devon", "Emerson", "Finley", "Harper", "Idris", "Jules", "Kai"];

// Fascist count here excludes Hitler. hitlerKnowsTeam mirrors the real
// game's rule: in a 5-6 player game there's only one other fascist to hide,
// so Hitler is told the team; in 7+ player games Hitler stays in the dark.
const ROLE_TABLE = {
  5: { liberal: 3, fascist: 1, hitlerKnowsTeam: true },
  6: { liberal: 4, fascist: 1, hitlerKnowsTeam: true },
  7: { liberal: 4, fascist: 2, hitlerKnowsTeam: false },
  8: { liberal: 5, fascist: 2, hitlerKnowsTeam: false },
  9: { liberal: 5, fascist: 3, hitlerKnowsTeam: false },
  10: { liberal: 6, fascist: 3, hitlerKnowsTeam: false },
};

const ICONS = {
  liberal: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><polyline points="9 12 11 14 15 10"/></svg>`,
  fascist: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M4 8h16M4 8c0 4 3.5 6 8 6s8-2 8-6"/></svg>`,
  hitler: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18l3-9 5-6 5 6 3 9"/><circle cx="12" cy="18" r="2.4"/></svg>`,
};

let playerCount = 7;
let players = []; // [{ name }]
let assignment = null; // { [name]: "liberal" | "fascist" | "hitler" }
let flippedFor = new Set(); // currently showing the revealed face, per viewer
let seenFor = new Set(); // has revealed at least once, per viewer — unlocks Ready
let readyFor = new Set(); // clicked Ready, per viewer

function renderCountBreakdown() {
  const table = ROLE_TABLE[playerCount];
  const knowsText = table.hitlerKnowsTeam
    ? "Hitler is told the fascist team (small game)."
    : "Hitler does not learn who the fascists are.";
  countBreakdown.textContent = `${table.liberal} Liberal · ${table.fascist} Fascist · 1 Hitler — ${knowsText}`;
}

function renderPlayerList() {
  lobbyPlayerListEl.innerHTML = "";
  players.forEach((p) => {
    const li = document.createElement("li");
    li.className = "lobby-player-row";
    const avatar = document.createElement("span");
    avatar.className = "lobby-avatar";
    avatar.textContent = p.name.charAt(0);
    const nameEl = document.createElement("span");
    nameEl.className = "lobby-player-name";
    nameEl.textContent = p.name;
    li.append(avatar, nameEl);
    lobbyPlayerListEl.appendChild(li);
  });
}

function regeneratePlayers() {
  players = NAME_POOL.slice(0, playerCount).map((name) => ({ name }));
  renderPlayerList();
}

function setPlayerCount(next) {
  playerCount = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, next));
  countVal.textContent = String(playerCount);
  countMinusBtn.disabled = playerCount <= MIN_PLAYERS;
  countPlusBtn.disabled = playerCount >= MAX_PLAYERS;
  renderCountBreakdown();
  regeneratePlayers();
}

countMinusBtn.addEventListener("click", () => setPlayerCount(playerCount - 1));
countPlusBtn.addEventListener("click", () => setPlayerCount(playerCount + 1));

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function dealRoles() {
  const table = ROLE_TABLE[playerCount];
  const order = shuffle(players.map((p) => p.name));
  const result = {};
  let idx = 0;
  result[order[idx++]] = "hitler";
  for (let i = 0; i < table.fascist; i++) result[order[idx++]] = "fascist";
  for (let i = 0; i < table.liberal; i++) result[order[idx++]] = "liberal";
  assignment = { table, byName: result };
  flippedFor = new Set();
  seenFor = new Set();
  readyFor = new Set();

  viewerSelect.innerHTML = "";
  players.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.name;
    opt.textContent = p.name;
    viewerSelect.appendChild(opt);
  });

  showView("role");
  renderRoleFor(viewerSelect.value);
}

function fascistTeammates(excludeName) {
  return Object.entries(assignment.byName)
    .filter(([name, role]) => name !== excludeName && (role === "fascist" || role === "hitler"))
    .map(([name, role]) => ({ name, role }));
}

function renderRoleFor(name) {
  const role = assignment.byName[name];
  roleCard.classList.toggle("is-revealed", flippedFor.has(name));
  readyBtn.disabled = !seenFor.has(name) || readyFor.has(name);
  readyBtn.textContent = readyFor.has(name) ? "Waiting for others…" : "Ready";

  const backEl = roleCard.querySelector(".sh-card-back");
  backEl.className = "sh-card-face sh-card-back role-" + role;
  roleIcon.innerHTML = ICONS[role];
  roleTeam.innerHTML = "";

  if (role === "liberal") {
    roleName.textContent = "Liberal";
    roleDesc.textContent = "You don't know anyone else's role. Watch how people vote and argue for policies you trust.";
  } else if (role === "fascist") {
    roleName.textContent = "Fascist";
    roleDesc.textContent = "Help your team seize power without getting caught. Here's who you're working with:";
    fascistTeammates(name).forEach(({ name: teammate, role: teammateRole }) => {
      const chip = document.createElement("span");
      chip.className = "sh-team-chip" + (teammateRole === "hitler" ? " is-hitler" : "");
      chip.textContent = teammateRole === "hitler" ? `${teammate} — Hitler` : teammate;
      roleTeam.appendChild(chip);
    });
  } else {
    roleName.textContent = "Hitler";
    roleDesc.textContent =
      "You lead the fascists. If three fascist policies pass and you're then elected Chancellor, your side wins on the spot — so staying likable matters more than staying loyal-looking.";
    if (assignment.table.hitlerKnowsTeam) {
      fascistTeammates(name).forEach(({ name: teammate }) => {
        const chip = document.createElement("span");
        chip.className = "sh-team-chip";
        chip.textContent = teammate;
        roleTeam.appendChild(chip);
      });
    } else {
      const note = document.createElement("p");
      note.className = "sh-team-note";
      note.textContent = "This game has enough players that you're kept in the dark on who your fascists are, same as the liberals.";
      roleTeam.appendChild(note);
    }
  }
}

viewerSelect.addEventListener("change", () => renderRoleFor(viewerSelect.value));

roleCard.addEventListener("click", () => {
  const name = viewerSelect.value;
  const nowFlipped = !flippedFor.has(name);
  flippedFor[nowFlipped ? "add" : "delete"](name);
  if (nowFlipped) seenFor.add(name);
  renderRoleFor(name);
});

readyBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  readyFor.add(viewerSelect.value);
  renderRoleFor(viewerSelect.value);
});

function showView(view) {
  lobbyView.hidden = view !== "lobby";
  roleView.hidden = view !== "role";
}

dealBtn.addEventListener("click", dealRoles);
backBtn.addEventListener("click", () => (location.href = "/"));
roleBackBtn.addEventListener("click", () => showView("lobby"));

setPlayerCount(playerCount);
