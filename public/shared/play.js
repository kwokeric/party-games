// Small DOM builders shared by every game's in-game screens (styled by
// /shared/play.css): avatar tiles, rank badges and the final-screen podium.

import { playerColor, playerTilt } from "./lobby.js";

/**
 * A player's avatar tile. `index` is their place in the player list, so the
 * color matches the lobby; pass -1 for someone who has left (neutral gray).
 */
export function avatarEl(name, index) {
  const span = document.createElement("span");
  span.className = "play-avatar";
  span.textContent = name.trim().charAt(0) || "?";
  span.style.background = index >= 0 ? playerColor(index) : "#9a958c";
  if (index >= 0) span.style.setProperty("--tilt", playerTilt(index));
  return span;
}

export function rankEl(place) {
  const span = document.createElement("span");
  span.className = `play-rank r${place}`;
  span.textContent = String(place);
  return span;
}

/**
 * Top three on steps, laid out 2nd, 1st, 3rd so the winner stands in the
 * middle. With fewer than three players the missing steps are left out.
 *
 * @param {HTMLElement} container
 * @param {{name: string, score: string}[]} entries  best first
 * @param {(entry: object) => HTMLElement} avatarFor  each entry's avatar
 */
export function renderPodium(container, entries, avatarFor) {
  container.innerHTML = "";
  for (const place of [2, 1, 3]) {
    const entry = entries[place - 1];
    if (!entry) continue;
    const slot = document.createElement("div");
    slot.className = `play-podium-slot place-${place}`;

    const name = document.createElement("span");
    name.className = "play-podium-name";
    name.textContent = entry.name;

    const step = document.createElement("div");
    step.className = "play-podium-step";
    const rank = document.createElement("b");
    rank.textContent = String(place);
    const score = document.createElement("span");
    score.textContent = entry.score;
    step.append(rank, score);

    slot.append(avatarFor(entry), name, step);
    container.appendChild(slot);
  }
}
