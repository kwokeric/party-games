import { GAMES } from "./shared/games.js";

const gamesEl = document.getElementById("games-grid");
const nameInput = document.getElementById("join-name");
const codeBoxes = [...document.querySelectorAll(".code-box")];
const joinForm = document.getElementById("join-form");
const joinBtn = document.getElementById("join-btn");
const joinError = document.getElementById("join-error");

const ARROW_ICON =
  '<svg class="host-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>';

for (const game of GAMES) {
  const { tile } = game;
  const card = document.createElement("article");
  card.className = "game-card";
  card.innerHTML = `
    <div class="game-tile" style="background: ${tile.tint}; transform: rotate(${tile.tilt})">${game.icon}</div>
    <div class="game-info">
      <h3>${game.title}</h3>
      <span class="game-players">${game.badge.replace("Players", "players")}</span>
      <p>${game.description}</p>
    </div>
    <button class="host-btn" type="button" data-game="${game.id}" aria-label="Host ${game.title}">
      ${ARROW_ICON}<span class="host-spinner" aria-hidden="true"></span>
    </button>
  `;
  gamesEl.appendChild(card);
}

function resetHostButton(button) {
  button.disabled = false;
  button.classList.remove("is-loading");
  button.removeAttribute("aria-busy");
}

gamesEl.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-game]");
  if (!button) return;

  const gameId = button.dataset.game;
  const name = nameInput.value.trim().toUpperCase();
  button.disabled = true;
  button.classList.add("is-loading");
  button.setAttribute("aria-busy", "true");

  try {
    const res = await fetch("/parties/lobby/global/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId }),
    });
    if (!res.ok) throw new Error("failed to create room");
    const { code } = await res.json();
    const game = GAMES.find((g) => g.id === gameId);
    const nameParam = name ? `&name=${encodeURIComponent(name)}` : "";
    location.href = `${game.path}?room=${code}&host=1${nameParam}`;
  } catch (err) {
    resetHostButton(button);
    alert("Couldn't create a room. Please try again.");
  }
});

// ---- room code: four single-letter boxes ----
// Room codes are letters only (see CODE_CHARS in party/lobby.ts). Typing a
// letter fills the box and moves on; backspace on an empty box steps back;
// pasting (or a phone keyboard dumping several letters at once) spreads
// the letters across the boxes from the current one.

function lettersOnly(text) {
  return text.toUpperCase().replace(/[^A-Z]/g, "");
}

function setBox(box, letter) {
  box.value = letter;
  box.classList.toggle("is-filled", letter !== "");
}

function fillFrom(index, letters) {
  let i = index;
  for (const letter of letters) {
    if (i >= codeBoxes.length) break;
    setBox(codeBoxes[i], letter);
    i++;
  }
  codeBoxes[Math.min(i, codeBoxes.length - 1)].focus();
}

function readCode() {
  return codeBoxes.map((box) => box.value).join("");
}

codeBoxes.forEach((box, i) => {
  // Selecting on focus means typing over a filled box replaces its letter
  // instead of appending a second one.
  box.addEventListener("focus", () => box.select());

  box.addEventListener("input", () => {
    const letters = lettersOnly(box.value);
    if (letters.length === 0) {
      setBox(box, "");
      return;
    }
    fillFrom(i, letters);
  });

  box.addEventListener("keydown", (event) => {
    if (event.key === "Backspace" && box.value === "" && i > 0) {
      event.preventDefault();
      setBox(codeBoxes[i - 1], "");
      codeBoxes[i - 1].focus();
    } else if (event.key === "ArrowLeft" && i > 0) {
      event.preventDefault();
      codeBoxes[i - 1].focus();
    } else if (event.key === "ArrowRight" && i < codeBoxes.length - 1) {
      event.preventDefault();
      codeBoxes[i + 1].focus();
    }
  });

  box.addEventListener("paste", (event) => {
    event.preventDefault();
    const letters = lettersOnly(event.clipboardData?.getData("text") ?? "");
    if (letters) fillFrom(i, letters);
  });
});

async function joinRoom() {
  joinError.textContent = "";

  const name = nameInput.value.trim().toUpperCase();
  const code = readCode();
  if (code.length < codeBoxes.length) {
    joinError.textContent = "Enter all four letters of the room code.";
    codeBoxes[code.length]?.focus();
    return;
  }

  joinBtn.disabled = true;
  try {
    const res = await fetch(`/parties/lobby/global/lookup?code=${encodeURIComponent(code)}`);
    if (!res.ok) {
      joinError.textContent = "Room not found.";
      return;
    }
    const { gameId } = await res.json();
    const game = GAMES.find((g) => g.id === gameId);
    if (!game) {
      joinError.textContent = "That game no longer exists.";
      return;
    }
    const nameParam = name ? `&name=${encodeURIComponent(name)}` : "";
    location.href = `${game.path}?room=${code}${nameParam}`;
  } catch (err) {
    joinError.textContent = "Couldn't reach the server. Please try again.";
  } finally {
    joinBtn.disabled = false;
  }
}

// A real <form> submit, so Enter in any field (name or a code box) joins.
joinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  joinRoom();
});

// Browsers restore this page from bfcache on back-navigation with whatever
// DOM state it had when we navigated away (e.g. mid room creation), so
// reset anything stateful when that happens.
window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  for (const button of gamesEl.querySelectorAll("button[data-game]")) resetHostButton(button);
  joinBtn.disabled = false;
});
