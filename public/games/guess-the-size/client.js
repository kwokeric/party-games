const params = new URLSearchParams(location.search);
const room = params.get("room");

const roomCodeEl = document.getElementById("room-code");
const statusEl = document.getElementById("connection-status");
const playerListEl = document.getElementById("player-list");

roomCodeEl.textContent = room ?? "(none)";

if (!room) {
  statusEl.textContent = "No room code provided.";
} else {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(
    `${protocol}//${location.host}/parties/guess-the-size/${room}`
  );

  socket.addEventListener("open", () => {
    statusEl.textContent = "Connected.";
  });

  socket.addEventListener("close", () => {
    statusEl.textContent = "Disconnected.";
  });

  socket.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "players") {
      playerListEl.innerHTML = "";
      for (const player of data.players) {
        const li = document.createElement("li");
        li.textContent = player.name;
        playerListEl.appendChild(li);
      }
    }
  });
}
