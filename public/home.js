import { GAMES } from "./shared/games.js";

const gamesEl = document.getElementById("games");
const nameInput = document.getElementById("join-name");
const codeInput = document.getElementById("join-code");
const joinBtn = document.getElementById("join-btn");
const joinError = document.getElementById("join-error");

const rulerIcon = `
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#067bc2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="9" width="18" height="6" rx="1.5"></rect>
    <line x1="7" y1="9" x2="7" y2="12"></line>
    <line x1="11" y1="9" x2="11" y2="13"></line>
    <line x1="15" y1="9" x2="15" y2="12"></line>
  </svg>
`;

for (const game of GAMES) {
  const card = document.createElement("div");
  card.className = "game-card";
  card.innerHTML = `
    <div class="game-badge">${game.badge}</div>
    <div class="game-icon">${rulerIcon}</div>
    <h3>${game.title}</h3>
    <p>${game.description}</p>
    <button class="home-btn host-btn" data-game="${game.id}">Host a Room</button>
  `;
  gamesEl.appendChild(card);
}

gamesEl.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-game]");
  if (!button) return;

  const gameId = button.dataset.game;
  const name = nameInput.value.trim();
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
    const nameParam = name ? `&name=${encodeURIComponent(name)}` : "";
    location.href = `${game.path}?room=${code}&host=1${nameParam}`;
  } catch (err) {
    button.disabled = false;
    button.textContent = "Host a Room";
    alert("Couldn't create a room. Please try again.");
  }
});

async function joinRoom() {
  joinError.textContent = "";

  const name = nameInput.value.trim();
  const code = codeInput.value.trim().toUpperCase();
  if (!code) {
    joinError.textContent = "Enter a room code.";
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

joinBtn.addEventListener("click", joinRoom);
for (const input of [nameInput, codeInput]) {
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") joinRoom();
  });
}
