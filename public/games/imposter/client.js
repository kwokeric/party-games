import { setupLobby, renderLobbyPlayers } from "/shared/lobby.js";
import { avatarEl as playAvatarEl } from "/shared/play.js";

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

setupLobby("imposter");

const lobbyView = el("lobby-view");
const revealView = el("reveal-view");
const votingView = el("voting-view");
const resultsView = el("results-view");

const lobbySubtitleEl = el("lobby-subtitle");
const copyCodeBtn = el("copy-code-btn");
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
const lobbyPlayerListEl = el("lobby-player-list");
const startBtn = el("start-btn");
const readyBtn = el("ready-btn");
const lobbyHintEl = el("lobby-hint");

const wordCard = el("word-card");
const wordCardBack = el("word-card-back");
const firstUpAvatarEl = el("first-up-avatar");
const firstUpNameEl = el("first-up-name");
const seenStackEl = el("seen-stack");
const seenTextEl = el("seen-text");
const seenNoteEl = el("seen-note");
const seenBtn = el("seen-btn");

const voteSubEl = el("vote-sub");
const voteTableEl = el("vote-table");
const peekBtn = el("peek-btn");
const votedStackEl = el("voted-stack");
const votedTextEl = el("voted-text");
const voteNoteEl = el("vote-note");
const voteWaitEl = el("vote-wait");
const voteBtn = el("vote-btn");

const verdictCardEl = el("verdict-card");
const outcomeEl = el("outcome");
const outcomeTitleEl = el("outcome-title");
const outcomeDetailEl = el("outcome-detail");
const imposterRevealEl = el("imposter-reveal");
const resultFactsEl = el("result-facts");
const resultWordEl = el("result-word");
const resultHintFactEl = el("result-hint-fact");
const resultHintEl = el("result-hint");
const tallyListEl = el("tally-list");
const lastChanceEl = el("last-chance");
const resultsNoteEl = el("results-note");
const resultsWaitEl = el("results-wait");
const playAgainBtn = el("play-again-btn");
const lobbyBtn = el("lobby-btn");

for (const codeEl of document.querySelectorAll(".js-room-code")) {
  codeEl.textContent = room ?? "(none)";
}

const CHECK_SVG =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>';

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

function rosterPlayers() {
  return roster.map(playerById).filter(Boolean);
}

function h(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// A player's avatar tile, colored by their place in the player list so it
// matches the lobby.
function avatar(id) {
  return playAvatarEl(nameOf(id), players.findIndex((p) => p.id === id));
}

// "4 of 6 have seen their word": a faded avatar for everyone not done yet.
function renderProgress(stackEl, textEl, isDone, label) {
  const list = rosterPlayers();
  stackEl.replaceChildren(
    ...list.map((p) => {
      const tile = avatar(p.id);
      tile.classList.toggle("is-pending", !isDone(p));
      return tile;
    })
  );
  const count = h("b", "", `${list.filter(isDone).length} of ${list.length}`);
  textEl.replaceChildren(count, ` ${label}`);
}

// The pinned bar's note: a bold first line (optional) and a quieter second.
function setNote(noteEl, strong, text) {
  noteEl.replaceChildren(...(strong ? [h("strong", "", strong)] : []), ...(text ? [h("span", "", text)] : []));
  noteEl.hidden = !strong && !text;
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

  renderLobbyPlayers(lobbyPlayerListEl, players, { myId, maxPlayers, showReady: !spectating });

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

startBtn.addEventListener("click", () => {
  socket?.send(JSON.stringify({ type: "start" }));
});

// --- Word reveal -------------------------------------------------------------

function renderWordCardBack() {
  wordCardBack.innerHTML = "";
  if (!myWord) return;
  if (myWord.isImposter) {
    wordCardBack.append(h("span", "imp-kicker", "You're the"), h("span", "imp-big-word", "Imposter"));
    if (myWord.hint) {
      const hintBox = h("span", "imp-hint-box");
      hintBox.append(h("small", "", "Your hint"), h("b", "", myWord.hint));
      wordCardBack.append(hintBox);
    }
    if (myWord.category) wordCardBack.append(h("span", "imp-cat-chip", `Category · ${myWord.category}`));
    wordCardBack.append(h("span", "imp-card-desc", "Blend in, and work out the word from everyone's clues."));
  } else {
    wordCardBack.append(h("span", "imp-kicker", "Your word"), h("span", "imp-big-word", myWord.word));
    if (myWord.category) wordCardBack.append(h("span", "imp-cat-chip", `Category · ${myWord.category}`));
    wordCardBack.append(
      h("span", "imp-card-desc", "Give a one-word clue that proves you know it, without making it easy for the imposter.")
    );
  }
  wordCardBack.append(h("small", "imp-card-hide", "Tap to hide"));
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
  if (bigWord) fitText(bigWord, 46);
  wordCard.classList.toggle("is-revealed", flipped);

  const firstId = myWord?.firstPlayerId;
  firstUpAvatarEl.replaceChildren(avatar(firstId));
  firstUpNameEl.textContent = firstId === myId ? "You, then clockwise" : `${nameOf(firstId)}, then clockwise`;

  renderProgress(seenStackEl, seenTextEl, (p) => p.seen, "have seen their word");

  const iHaveSeen = me()?.seen ?? false;
  seenBtn.disabled = !hasLooked || iHaveSeen;
  seenBtn.textContent = iHaveSeen ? "Waiting…" : "Got it";
  if (iHaveSeen) setNote(seenNoteEl, "Got it", "Waiting for everyone else…");
  else if (!hasLooked) setNote(seenNoteEl, "", "Look at your word first");
  else setNote(seenNoteEl, "", "");
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

// Everyone sits around a table with you at the bottom, the others going
// clockwise in deal order. Avatars shrink as the table fills up.
function renderTable(locked, chosen) {
  const list = rosterPlayers();
  const n = list.length;
  const mine = Math.max(0, list.findIndex((p) => p.id === myId));
  voteTableEl.classList.toggle("is-locked", locked);
  voteTableEl.classList.toggle("is-crowded", n > 8);
  voteTableEl.style.setProperty("--seat", n <= 6 ? "56px" : n <= 8 ? "48px" : n <= 10 ? "42px" : "38px");

  for (const seat of voteTableEl.querySelectorAll(".imp-seat")) seat.remove();
  list.forEach((p, index) => {
    const angle = Math.PI / 2 + (((index - mine + n) % n) * 2 * Math.PI) / n;
    const isMe = p.id === myId;
    const seat = h("button", "imp-seat" + (isMe ? " is-me" : "") + (p.id === chosen ? " is-picked" : ""));
    seat.type = "button";
    seat.dataset.id = p.id;
    seat.disabled = isMe || locked;
    seat.style.left = `${50 + 38 * Math.cos(angle)}%`;
    seat.style.top = `${50 + 38 * Math.sin(angle)}%`;

    const tile = avatar(p.id);
    if (p.id === chosen) {
      const check = h("span", "imp-seat-check");
      check.innerHTML = CHECK_SVG;
      tile.appendChild(check);
    }
    seat.append(tile, h("span", "imp-seat-name", isMe ? "You" : p.name));
    voteTableEl.appendChild(seat);
  });
}

function renderVoting() {
  const locked = myVote !== null;
  const chosen = myVote ?? pickedId;

  if (locked) voteSubEl.textContent = `You voted for ${nameOf(myVote)}`;
  else if (pickedId) voteSubEl.textContent = `Voting for ${nameOf(pickedId)}`;
  else voteSubEl.textContent = "Tap a player to vote for them";

  // The middle of the table peeks at your word, in case you've forgotten it.
  if (peeking && myWord) {
    peekBtn.replaceChildren(
      h("small", "", myWord.isImposter ? "You're the imposter" : "Your word"),
      h("b", "", myWord.isImposter ? myWord.hint || "No hint" : myWord.word)
    );
  } else {
    peekBtn.replaceChildren(h("span", "", "👁 My word"), h("small", "", "Tap to peek"));
  }
  peekBtn.classList.toggle("is-showing", peeking);
  const peekWord = peeking && peekBtn.querySelector("b");
  if (peekWord) fitText(peekWord, 20, 11);

  renderTable(locked, chosen);
  renderProgress(votedStackEl, votedTextEl, (p) => p.voted, "voted");

  voteBtn.disabled = locked || !pickedId;
  voteBtn.textContent = locked ? "Locked in" : pickedId ? `Vote for ${nameOf(pickedId)}` : "Lock in vote";

  const live = rosterPlayers().filter((p) => p.connected);
  const waiting = live.filter((p) => !p.voted);
  voteWaitEl.textContent =
    waiting.length > 0 && waiting.length <= 2
      ? `Waiting on ${waiting.map((p) => p.name).join(" and ")}`
      : "Waiting for everyone else…";
  voteNoteEl.hidden = !locked;
}

voteTableEl.addEventListener("click", (event) => {
  const seat = event.target.closest(".imp-seat");
  if (!seat || seat.disabled) return;
  pickedId = seat.dataset.id;
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

// The big reveal: each imposter's tile pops in and gets stamped. Rebuilt only
// when the results change, so the animation doesn't replay every time
// someone's connection status updates.
function renderSuspects(imposterIds) {
  const key = imposterIds.join(",");
  if (imposterRevealEl.dataset.key === key) return;
  imposterRevealEl.dataset.key = key;
  imposterRevealEl.classList.toggle("is-many", imposterIds.length > 1);
  imposterRevealEl.replaceChildren(
    ...imposterIds.map((id) => {
      const tile = h("div", "imp-suspect-tile");
      tile.append(avatar(id), h("span", "imp-stamp", "IMPOSTER"));
      const suspect = h("div", "imp-suspect");
      suspect.append(tile, h("span", "imp-suspect-name", nameOf(id)));
      return suspect;
    })
  );
}

function renderResults() {
  const { tally, votedOutId, caught, imposterIds, word, hint } = results;
  const multiple = imposterIds.length > 1;
  const voters = Math.max(1, roster.length);
  const votesFor = (id) => tally.find((t) => t.id === id)?.votes ?? 0;

  verdictCardEl.classList.toggle("is-caught", caught);
  verdictCardEl.classList.toggle("is-escaped", !caught);
  outcomeEl.textContent = caught ? "Caught" : "Escaped";
  renderSuspects(imposterIds);
  outcomeTitleEl.textContent = caught ? "The crew wins!" : multiple ? "The imposters win!" : "The imposter wins!";
  if (votedOutId === null) {
    outcomeDetailEl.textContent = "The vote was a tie, so nobody was voted out.";
  } else if (caught) {
    outcomeDetailEl.textContent = `${nameOf(votedOutId)} got ${votesFor(votedOutId)} of ${voters} votes`;
  } else {
    outcomeDetailEl.textContent = `Most votes went to ${nameOf(votedOutId)}, who was in on the word.`;
  }

  resultWordEl.textContent = word;
  resultHintEl.textContent = hint;
  resultHintFactEl.hidden = !settings.imposterHint;
  resultFactsEl.classList.toggle("is-single", !settings.imposterHint);
  fitText(resultWordEl, 24, 12);
  fitText(resultHintEl, 24, 12);

  // Everyone who got a vote, plus any imposter who didn't — so a clean
  // escape still shows the imposter sitting at zero.
  tallyListEl.innerHTML = "";
  for (const { id, votes } of tally) {
    const isImposter = imposterIds.includes(id);
    if (votes === 0 && !isImposter) continue;
    const li = h("li", isImposter ? "is-imposter" : "");
    const bar = h("span", "imp-tally-bar");
    const fill = h("i");
    fill.style.width = `${(votes / voters) * 100}%`;
    bar.appendChild(fill);
    li.append(
      avatar(id),
      h("span", "imp-tally-name", nameOf(id)),
      bar,
      h("b", "imp-tally-count", `${votes} vote${votes === 1 ? "" : "s"}`)
    );
    tallyListEl.appendChild(li);
  }

  // Only a caught imposter has anything left to play for.
  lastChanceEl.hidden = !caught;
  if (caught) {
    lastChanceEl.replaceChildren(
      "🎯 ",
      h("b", "", "Last chance: "),
      `${nameOf(votedOutId)} can still win by guessing the word out loud.`
    );
  }

  const amHost = isHost();
  const connectedCount = players.filter((p) => p.connected).length;
  playAgainBtn.hidden = !amHost;
  lobbyBtn.hidden = !amHost;
  playAgainBtn.disabled = connectedCount < minPlayers || connectedCount > maxPlayers;
  resultsWaitEl.textContent = `Waiting for ${players.find((p) => p.isHost)?.name ?? "the host"} to start the next round…`;
  resultsNoteEl.hidden = amHost;
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
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>Copied';
    setTimeout(() => (copyCodeBtn.innerHTML = original), 1200);
  } catch {
    // Clipboard access can fail (permissions, insecure context); the code
    // is already visible on screen, so this is a nice-to-have only.
  }
});

// Bricolage is wider than the fallback font, so text fitted before it
// loaded can overflow once it swaps in — fit again once it's ready.
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
        delete imposterRevealEl.dataset.key;
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
