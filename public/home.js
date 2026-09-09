import { GAMES } from "./shared/games.js";

const gamesEl = document.getElementById("games");

for (const game of GAMES) {
  const card = document.createElement("div");
  card.className = "game-card";
  card.innerHTML = `
    <h2>${game.title}</h2>
    <p>${game.description}</p>
    <button data-game="${game.id}">Host a room</button>
  `;
  gamesEl.appendChild(card);
}

gamesEl.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-game]");
  if (!button) return;

  const gameId = button.dataset.game;
  button.disabled = true;
  button.textContent = "Creating room...";

  try {
    const res = await fetch("/parties/lobby/global/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId }),
    });
    if (!res.ok) throw new Error("failed to create room");
    const { code } = await res.json();
    const game = GAMES.find((g) => g.id === gameId);
    location.href = `${game.path}?room=${code}&host=1`;
  } catch (err) {
    button.disabled = false;
    button.textContent = "Host a room";
    alert("Couldn't create a room. Please try again.");
  }
});

const joinForm = document.getElementById("join-form");
const joinError = document.getElementById("join-error");

joinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  joinError.textContent = "";

  const code = document.getElementById("join-code").value.trim().toUpperCase();
  if (!code) return;

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
    location.href = `${game.path}?room=${code}`;
  } catch (err) {
    joinError.textContent = "Couldn't reach the server. Please try again.";
  }
});
