const params = new URLSearchParams(location.search);
const room = params.get("room");
const isHostUrl = params.get("host") === "1";
const playerName = params.get("name") ?? "";

// Minted once per room and kept in sessionStorage, so refreshing this tab
// reconnects as the SAME player (the server re-attaches this id to the new
// connection and replays their word) instead of creating a new one.
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

const lobbyView = el("lobby-view");
const revealView = el("reveal-view");
const votingView = el("voting-view");
const resultsView = el("results-view");

const lobbySubtitleEl = el("lobby-subtitle");
const copyCodeBtn = el("copy-code-btn");
const introTabsEl = el("lobby-intro-tabs");
const settingsPanel = el("lobby-settings-panel");
const settingsSummaryEl = el("lobby-settings-summary");
const imposterCountEl = el("imposter-count");
const imposterCountSubEl = el("imposter-count-sub");
const imposterMinusBtn = el("imposter-minus");
const imposterPlusBtn = el("imposter-plus");
const hintToggle = el("hint-toggle");
const categoryToggle = el("category-toggle");
const categoriesAllBtn = el("categories-all-btn");
const categoryChipsEl = el("category-chips");
const playersHeadingEl = el("players-heading");
const lobbyPlayerListEl = el("lobby-player-list");
const startBtn = el("start-btn");
const readyBtn = el("ready-btn");
const lobbyHintEl = el("lobby-hint");

const wordCard = el("word-card");
const wordCardBack = el("word-card-back");
const firstUpAvatarEl = el("first-up-avatar");
const firstUpNameEl = el("first-up-name");
const seenBtn = el("seen-btn");
const seenStripEl = el("seen-strip");

const voteSubEl = el("vote-sub");
const peekBtn = el("peek-btn");
const voteListEl = el("vote-list");
const voteBtn = el("vote-btn");
const votedStripEl = el("voted-strip");
const voteWaitEl = el("vote-wait");

const outcomeEl = el("outcome");
const outcomeDetailEl = el("outcome-detail");
const imposterKickerEl = el("imposter-kicker");
const imposterRevealEl = el("imposter-reveal");
const resultWordEl = el("result-word");
const resultHintFactEl = el("result-hint-fact");
const resultHintEl = el("result-hint");
const tallyListEl = el("tally-list");
const lastChanceEl = el("last-chance");
const playAgainBtn = el("play-again-btn");
const lobbyBtn = el("lobby-btn");
const resultsWaitEl = el("results-wait");

for (const codeEl of document.querySelectorAll(".js-room-code")) {
  codeEl.textContent = room ?? "(none)";
}

const IMPOSTER_ICON =
  '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><line x1="3" y1="3" x2="21" y2="21"/></svg>';
const READY_CHECK_SVG =
  '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

let myId = null;
let players = [];
let phase = "lobby";
let minPlayers = 3;
let maxPlayers = 12;
let settings = { imposterCount: 1, imposterHint: true, showCategory: true, categories: [] };
let categories = [];
let roster = [];
let myVote = null;

// This round's private deal, straight from the server: { isImposter, word,
// hint, category, firstPlayerId }. Only ever about this player.
let myWord = null;
let results = null;

// Purely local view state, reset whenever a new word is dealt.
let flipped = false;
let hasLooked = false;
let pickedId = null;
let peeking = false;

// Roughly one imposter per 3-4 players. Must match maxImposters() in
// party/games/imposter.ts.
function maxImposters(count) {
  return Math.max(1, Math.floor((count - 1) / 3));
}

function me() {
  return players.find((p) => p.id === myId);
}

function isHost() {
  return me()?.isHost ?? false;
}

function inRound() {
  return roster.includes(myId);
}

function playerById(id) {
  return players.find((p) => p.id === id);
}

function nameOf(id) {
  return playerById(id)?.name ?? "Someone";
}

function initialOf(name) {
  return name?.trim().charAt(0).toUpperCase() || "?";
}

function rosterPlayers() {
  return roster.map(playerById).filter(Boolean);
}

function h(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function avatar(name, extraClass = "") {
  return h("span", `imp-avatar ${extraClass}`.trim(), initialOf(name));
}

function showView(view) {
  lobbyView.hidden = view !== "lobby";
  revealView.hidden = view !== "reveal";
  votingView.hidden = view !== "voting";
  resultsView.hidden = view !== "results";
}

// Someone who joined mid-round sits in the lobby until the next deal.
function currentView() {
  if (phase === "lobby" || !inRound()) return "lobby";
  if (phase === "results" && !results) return "voting";
  return phase;
}

function render() {
  const view = currentView();
  showView(view);
  if (view === "lobby") renderLobby();
  else if (view === "reveal") renderReveal();
  else if (view === "voting") renderVoting();
  else if (view === "results") renderResults();
}

// --- Lobby -----------------------------------------------------------------

function renderLobby() {
  const amHost = isHost();
  const spectating = phase !== "lobby";
  const count = players.length;

  lobbySubtitleEl.textContent = spectating ? "A round is in progress" : "Waiting for players to join";

  settingsPanel.hidden = !amHost || spectating;
  settingsSummaryEl.hidden = amHost && !spectating;
  renderSettings(count);

  playersHeadingEl.textContent = `Players · ${count}`;
  lobbyPlayerListEl.innerHTML = "";
  for (const p of players) {
    const li = h("li", "lobby-player-row");
    const nameEl = h(
      "span",
      "lobby-player-name",
      p.name + (p.id === myId ? " (you)" : "") + (p.connected === false ? " (left)" : "")
    );
    li.append(h("span", "lobby-avatar", initialOf(p.name)), nameEl);
    if (p.isHost) {
      li.append(h("span", "lobby-host-badge", "HOST"));
    } else if (p.ready && !spectating) {
      const tag = h("span", "lobby-ready-tag");
      tag.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#067bc2" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
      tag.append("Ready");
      li.append(tag);
    }
    lobbyPlayerListEl.appendChild(li);
  }

  const inRange = count >= minPlayers && count <= maxPlayers;
  const hasCategories = settings.categories.length > 0;
  const allReady = players.filter((p) => !p.isHost).every((p) => p.ready);
  const iAmReady = me()?.ready ?? false;

  startBtn.hidden = !amHost || spectating;
  startBtn.disabled = !inRange || !hasCategories || !allReady;
  readyBtn.hidden = amHost || spectating;
  readyBtn.textContent = iAmReady ? "Not ready" : "Ready up";
  readyBtn.classList.toggle("is-ready", iAmReady);

  let hint = "";
  if (spectating) {
    hint = "You'll be dealt in when the next round starts.";
  } else if (count < minPlayers) {
    hint = `Need at least ${minPlayers} players (${count} so far).`;
  } else if (count > maxPlayers) {
    hint = `Too many players for one game, ${maxPlayers} max (${count} joined).`;
  } else if (!hasCategories) {
    hint = amHost ? "Pick at least one category." : "Waiting for the host to pick a category…";
  } else if (amHost && !allReady) {
    hint = "Waiting for everyone to ready up.";
  } else if (!amHost && iAmReady) {
    hint = `Waiting for ${players.find((p) => p.isHost)?.name ?? "the host"} to start the round…`;
  }
  lobbyHintEl.textContent = hint;
  lobbyHintEl.hidden = !hint;
}

readyBtn.addEventListener("click", () => {
  socket?.send(JSON.stringify({ type: "ready" }));
});

// The host's stored count can be higher than this headcount allows (it's
// clamped at deal time), so the lobby always shows what would actually be
// dealt right now.
function effectiveImposterCount(count) {
  return Math.min(settings.imposterCount, maxImposters(count));
}

function renderSettings(count) {
  const max = maxImposters(count);
  const imposters = effectiveImposterCount(count);
  imposterCountEl.textContent = String(imposters);
  imposterMinusBtn.disabled = imposters <= 1;
  imposterPlusBtn.disabled = imposters >= max;
  imposterCountSubEl.textContent = `Up to ${max} with ${count} player${count === 1 ? "" : "s"}`;

  hintToggle.setAttribute("aria-checked", String(settings.imposterHint));
  categoryToggle.setAttribute("aria-checked", String(settings.showCategory));

  categoryChipsEl.innerHTML = "";
  for (const cat of categories) {
    const chip = h("button", "imp-chip", cat.name);
    chip.type = "button";
    chip.dataset.id = cat.id;
    chip.classList.toggle("is-selected", settings.categories.includes(cat.id));
    categoryChipsEl.appendChild(chip);
  }
  const allSelected = categories.length > 0 && categories.every((c) => settings.categories.includes(c.id));
  categoriesAllBtn.textContent = allSelected ? "Clear" : "Select all";

  const catNames = categories.filter((c) => settings.categories.includes(c.id)).map((c) => c.name);
  settingsSummaryEl.textContent = [
    `${imposters} imposter${imposters === 1 ? "" : "s"}`,
    `hint ${settings.imposterHint ? "on" : "off"}`,
    allSelected ? "all categories" : catNames.join(", ") || "no categories",
  ].join(" · ");
}

function sendSettings(patch) {
  settings = { ...settings, ...patch };
  render();
  socket?.send(JSON.stringify({ type: "settings", settings: patch }));
}

imposterMinusBtn.addEventListener("click", () => {
  sendSettings({ imposterCount: effectiveImposterCount(players.length) - 1 });
});

imposterPlusBtn.addEventListener("click", () => {
  sendSettings({ imposterCount: effectiveImposterCount(players.length) + 1 });
});

hintToggle.addEventListener("click", () => {
  sendSettings({ imposterHint: !settings.imposterHint });
});

categoryToggle.addEventListener("click", () => {
  sendSettings({ showCategory: !settings.showCategory });
});

categoryChipsEl.addEventListener("click", (event) => {
  const chip = event.target.closest(".imp-chip");
  if (!chip) return;
  const id = chip.dataset.id;
  const next = settings.categories.includes(id)
    ? settings.categories.filter((c) => c !== id)
    : [...settings.categories, id];
  sendSettings({ categories: next });
});

categoriesAllBtn.addEventListener("click", () => {
  const allSelected = categories.every((c) => settings.categories.includes(c.id));
  sendSettings({ categories: allSelected ? [] : categories.map((c) => c.id) });
});

introTabsEl.addEventListener("click", (event) => {
  const tab = event.target.closest("button");
  if (!tab) return;
  for (const btn of introTabsEl.querySelectorAll("button")) btn.classList.toggle("is-active", btn === tab);
  for (const pane of document.querySelectorAll(".lobby-intro-pane")) {
    pane.classList.toggle("is-active", pane.dataset.pane === tab.dataset.pane);
  }
});

startBtn.addEventListener("click", () => {
  socket?.send(JSON.stringify({ type: "start" }));
});

// --- Word reveal -------------------------------------------------------------

function renderWordCardBack() {
  wordCardBack.innerHTML = "";
  if (!myWord) return;
  if (myWord.isImposter) {
    const icon = h("div", "imp-role-icon");
    icon.innerHTML = IMPOSTER_ICON;
    wordCardBack.append(icon, h("div", "imp-role-title", "You're the imposter"));
    if (myWord.hint) {
      const hintBox = h("div", "imp-hint-box");
      hintBox.append(h("small", "", "Your hint"), h("b", "", myWord.hint));
      wordCardBack.append(hintBox);
    }
    if (myWord.category) wordCardBack.append(h("div", "imp-cat-chip", `Category: ${myWord.category}`));
    wordCardBack.append(h("p", "imp-card-desc", "Blend in, and work out the word from everyone's clues."));
  } else {
    wordCardBack.append(h("div", "imp-kicker", "The word is"), h("div", "imp-big-word", myWord.word));
    if (myWord.category) wordCardBack.append(h("div", "imp-cat-chip", myWord.category));
    wordCardBack.append(
      h("p", "imp-card-desc", "Give a one-word clue that proves you know it, without making it easy for the imposter.")
    );
  }
}

function renderStrip(stripEl, isDone) {
  stripEl.innerHTML = "";
  for (const p of rosterPlayers()) {
    const done = isDone(p);
    const item = h(
      "div",
      "imp-ready-item" + (done ? " is-ready" : "") + (p.id === myId ? " is-me" : "")
    );
    const av = h("div", "imp-ready-avatar", initialOf(p.name));
    if (done) {
      const badge = h("span", "imp-ready-badge");
      badge.innerHTML = READY_CHECK_SVG;
      av.appendChild(badge);
    }
    item.append(av, h("span", "imp-ready-name", p.name));
    stripEl.appendChild(item);
  }
}

// Shrinks an element's font until its longest word fits on one line, so a
// word like "Skateboarding" never breaks mid-word. Needs the element laid
// out (its view visible) to measure.
function fitText(node, maxPx, minPx = 14) {
  let size = maxPx;
  node.style.fontSize = `${size}px`;
  while (node.scrollWidth > node.clientWidth && size > minPx) {
    size -= 1;
    node.style.fontSize = `${size}px`;
  }
}

function renderReveal() {
  renderWordCardBack();
  const bigWord = wordCardBack.querySelector(".imp-big-word");
  if (bigWord) fitText(bigWord, 34);
  wordCard.classList.toggle("is-revealed", flipped);

  const firstId = myWord?.firstPlayerId;
  const firstName = nameOf(firstId);
  firstUpAvatarEl.textContent = initialOf(firstName);
  firstUpNameEl.textContent = firstId === myId ? "You go first" : `${firstName} goes first`;

  const iHaveSeen = me()?.seen ?? false;
  seenBtn.disabled = !hasLooked || iHaveSeen;
  seenBtn.textContent = iHaveSeen ? "Waiting for others…" : "Got it";

  renderStrip(seenStripEl, (p) => p.seen);
}

// Tapping only flips the card — "Got it" is its own step, so the last
// player to look doesn't get yanked to voting before they've read it.
wordCard.addEventListener("click", () => {
  flipped = !flipped;
  if (flipped) hasLooked = true;
  render();
});

seenBtn.addEventListener("click", () => {
  flipped = false;
  socket?.send(JSON.stringify({ type: "seen" }));
  render();
});

// --- Voting ------------------------------------------------------------------

function renderVoting() {
  const locked = myVote !== null;
  const chosen = myVote ?? pickedId;

  if (locked) voteSubEl.textContent = `You voted for ${nameOf(myVote)}`;
  else if (pickedId) voteSubEl.textContent = `Voting for ${nameOf(pickedId)}`;
  else voteSubEl.textContent = "Tap a player to vote for them";

  if (peeking && myWord) {
    peekBtn.textContent = myWord.isImposter
      ? `You're the imposter${myWord.hint ? ` · hint: ${myWord.hint}` : ""}`
      : `Your word: ${myWord.word}`;
  } else {
    peekBtn.textContent = "Show my word";
  }
  peekBtn.classList.toggle("is-showing", peeking);

  voteListEl.innerHTML = "";
  for (const p of rosterPlayers()) {
    const isMe = p.id === myId;
    const li = h("li");
    const btn = h("button", "imp-vote-option" + (p.id === chosen ? " is-picked" : ""));
    btn.type = "button";
    btn.dataset.id = p.id;
    btn.disabled = isMe || locked;
    btn.append(
      avatar(p.name),
      h("span", "imp-vote-name", p.name + (isMe ? " (you)" : "")),
      h("span", "imp-vote-check")
    );
    li.appendChild(btn);
    voteListEl.appendChild(li);
  }

  voteBtn.disabled = locked || !pickedId;
  voteBtn.textContent = locked ? "Vote locked in" : "Lock in vote";

  renderStrip(votedStripEl, (p) => p.voted);

  const live = rosterPlayers().filter((p) => p.connected);
  const waiting = live.filter((p) => !p.voted);
  const votedCount = live.length - waiting.length;
  voteWaitEl.textContent =
    waiting.length > 0 && waiting.length <= 2
      ? `${votedCount} of ${live.length} voted · waiting on ${waiting.map((p) => p.name).join(" and ")}`
      : `${votedCount} of ${live.length} voted`;
}

voteListEl.addEventListener("click", (event) => {
  const btn = event.target.closest(".imp-vote-option");
  if (!btn || btn.disabled) return;
  pickedId = btn.dataset.id;
  render();
});

voteBtn.addEventListener("click", () => {
  if (!pickedId || myVote) return;
  socket?.send(JSON.stringify({ type: "vote", targetId: pickedId }));
});

peekBtn.addEventListener("click", () => {
  peeking = !peeking;
  render();
});

// --- Results -----------------------------------------------------------------

function renderResults() {
  const { tally, votedOutId, caught, imposterIds, word, hint } = results;
  const multiple = imposterIds.length > 1;

  outcomeEl.textContent = caught ? "Caught!" : multiple ? "They escaped!" : "The imposter escaped!";
  outcomeEl.className = `imp-outcome ${caught ? "is-caught" : "is-escaped"}`;
  if (votedOutId === null) {
    outcomeDetailEl.textContent = "The vote was a tie, so nobody was voted out.";
  } else if (caught) {
    outcomeDetailEl.textContent = `Most votes went to ${nameOf(votedOutId)}.`;
  } else {
    outcomeDetailEl.textContent = "";
  }
  outcomeDetailEl.hidden = !outcomeDetailEl.textContent;

  imposterKickerEl.textContent = multiple ? "The imposters were" : "The imposter was";
  imposterRevealEl.innerHTML = "";
  for (const id of imposterIds) {
    const suspect = h("div", "imp-suspect");
    suspect.append(avatar(nameOf(id)), h("b", "", nameOf(id)));
    imposterRevealEl.appendChild(suspect);
  }

  resultWordEl.textContent = word;
  resultHintEl.textContent = hint;
  resultHintFactEl.hidden = !settings.imposterHint;
  resultHintFactEl.parentElement.classList.toggle("is-single", !settings.imposterHint);
  fitText(resultWordEl, 19, 11);
  fitText(resultHintEl, 19, 11);

  // Everyone who got a vote, plus any imposter who didn't — so a clean
  // escape still shows the imposter sitting at zero.
  tallyListEl.innerHTML = "";
  const voters = Math.max(1, roster.length);
  for (const { id, votes } of tally) {
    const isImposter = imposterIds.includes(id);
    if (votes === 0 && !isImposter) continue;
    const li = h("li", isImposter ? "is-imposter" : "");
    const bar = h("span", "imp-tally-bar");
    const fill = h("i");
    fill.style.width = `${(votes / voters) * 100}%`;
    bar.appendChild(fill);
    li.append(avatar(nameOf(id)), h("span", "imp-tally-name", nameOf(id)), bar, h("b", "imp-tally-count", String(votes)));
    tallyListEl.appendChild(li);
  }

  lastChanceEl.textContent = caught
    ? `${nameOf(votedOutId)} gets one guess at the word, out loud. If they get it right, the imposter still wins.`
    : multiple
      ? "The imposters win this round."
      : "The imposter wins this round.";

  const amHost = isHost();
  const connectedCount = players.filter((p) => p.connected).length;
  playAgainBtn.hidden = !amHost;
  lobbyBtn.hidden = !amHost;
  playAgainBtn.disabled = connectedCount < minPlayers || connectedCount > maxPlayers;
  resultsWaitEl.textContent = amHost
    ? "Play again keeps the same settings and deals a new word."
    : `Waiting for ${players.find((p) => p.isHost)?.name ?? "the host"} to start the next round…`;
}

playAgainBtn.addEventListener("click", () => {
  socket?.send(JSON.stringify({ type: "play-again" }));
});

lobbyBtn.addEventListener("click", () => {
  socket?.send(JSON.stringify({ type: "reset" }));
});

// --- Shared ------------------------------------------------------------------

for (const btn of document.querySelectorAll(".js-back")) {
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

// Fredoka is wider than the fallback font, so text fitted before it loaded
// can overflow once it swaps in — fit again once it's ready.
document.fonts?.ready.then(() => render());

let socket;

if (!room) {
  console.warn("Imposter loaded without a room code.");
} else {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const connectParams = new URLSearchParams();
  if (isHostUrl) connectParams.set("host", "1");
  if (playerName) connectParams.set("name", playerName);
  if (pid) connectParams.set("pid", pid);
  const query = connectParams.toString();
  socket = new WebSocket(`${protocol}//${location.host}/parties/imposter/${room}${query ? `?${query}` : ""}`);

  socket.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    switch (data.type) {
      case "you":
        myId = data.id;
        break;
      case "players":
        players = data.players;
        phase = data.phase;
        minPlayers = data.minPlayers;
        maxPlayers = data.maxPlayers;
        settings = data.settings;
        categories = data.categories;
        roster = data.roster;
        myVote = data.myVote;
        if (phase === "lobby") {
          myWord = null;
          results = null;
        }
        break;
      case "word":
        // A fresh deal (or a reconnect replaying the current one) — start
        // the card face-down with nothing picked.
        myWord = data;
        results = null;
        flipped = false;
        hasLooked = false;
        pickedId = null;
        peeking = false;
        break;
      case "results":
        results = data;
        break;
    }
    render();
  });
}
