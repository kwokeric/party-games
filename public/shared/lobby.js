// Shared lobby chrome for every game: the banner's game tile, the
// Preview / How to play tabs and the player list (with the
// ready count shown in the start bar). Each game's client.js still owns
// its own settings and start/ready logic.

import { GAMES } from "./games.js";

// Stable fallback avatar colors for games that don't assign players one.
const AVATAR_COLORS = ["#1f6feb", "#e07a5f", "#4fae8f", "#8c6fd1", "#e8a73a", "#d35d8a", "#3b9ab2", "#7a8b3c"];
const AVATAR_TILTS = ["-6deg", "5deg", "-3deg", "7deg", "-5deg", "4deg", "-7deg", "3deg"];

const CHECK_SVG =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>';

/** Fills in the banner's game tile and player range, and wires the intro tabs. */
export function setupLobby(gameId) {
  const game = GAMES.find((g) => g.id === gameId);
  const tileEl = document.getElementById("lobby-game-tile");
  if (game && tileEl) {
    tileEl.innerHTML = game.icon;
    tileEl.style.background = game.tile.tint;
    tileEl.style.transform = `rotate(${game.tile.tilt})`;
  }
  const rangeEl = document.getElementById("lobby-game-range");
  if (game && rangeEl) rangeEl.textContent = game.badge.replace("Players", "players");

  const tabsEl = document.getElementById("lobby-intro-tabs");
  tabsEl?.addEventListener("click", (event) => {
    const tab = event.target.closest("button[data-pane]");
    if (!tab) return;
    for (const btn of tabsEl.querySelectorAll("button")) {
      btn.classList.toggle("is-active", btn === tab);
      btn.setAttribute("aria-selected", String(btn === tab));
    }
    for (const pane of document.querySelectorAll(".lobby-intro-pane")) {
      pane.classList.toggle("is-active", pane.dataset.pane === tab.dataset.pane);
    }
  });
}

/**
 * Renders the lobby player list, plus the "6 / 8" count in the players
 * header and the "4 of 6 ready" line in the start bar. The host counts as
 * ready, since they're the one who starts the game.
 *
 * @param {HTMLElement} listEl
 * @param {{id: string, name: string, isHost?: boolean, ready?: boolean, connected?: boolean}[]} players
 * @param {{myId?: string, colorOf?: (p: object) => string | undefined, maxPlayers?: number, showReady?: boolean}} [options]
 */
export function renderLobbyPlayers(listEl, players, { myId, colorOf, maxPlayers, showReady = true } = {}) {
  listEl.innerHTML = "";
  players.forEach((p, i) => {
    const isReady = showReady && (p.isHost || p.ready);
    const li = document.createElement("li");
    li.className = "lobby-player-row" + (isReady ? " is-ready" : "") + (p.connected === false ? " is-left" : "");

    const avatar = document.createElement("span");
    avatar.className = "lobby-avatar";
    avatar.textContent = p.name.trim().charAt(0) || "?";
    avatar.style.background = colorOf?.(p) ?? AVATAR_COLORS[i % AVATAR_COLORS.length];
    avatar.style.setProperty("--tilt", AVATAR_TILTS[i % AVATAR_TILTS.length]);

    const nameEl = document.createElement("span");
    nameEl.className = "lobby-player-name";
    nameEl.textContent = p.name;
    if (p.id === myId || p.connected === false) {
      const note = document.createElement("span");
      note.className = "lobby-player-note";
      note.textContent = p.connected === false ? " (left)" : " (you)";
      nameEl.appendChild(note);
    }

    li.append(avatar, nameEl);

    if (p.isHost) {
      const badge = document.createElement("span");
      badge.className = "lobby-host-badge";
      badge.textContent = "HOST";
      li.append(badge);
    }

    if (showReady) {
      const status = document.createElement("span");
      status.className = "lobby-player-status";
      if (isReady) {
        status.innerHTML = CHECK_SVG;
        status.append("Ready");
      } else {
        status.textContent = "Waiting";
      }
      li.append(status);
    }

    listEl.appendChild(li);
  });

  const countEl = document.getElementById("lobby-player-count");
  if (countEl) countEl.textContent = maxPlayers ? `${players.length} / ${maxPlayers}` : `${players.length} joined`;

  const readyCountEl = document.getElementById("lobby-ready-count");
  if (readyCountEl) {
    const readyCount = players.filter((p) => p.isHost || p.ready).length;
    readyCountEl.hidden = !showReady || players.length === 0;
    readyCountEl.textContent = `${readyCount} of ${players.length} ready`;
  }
}
