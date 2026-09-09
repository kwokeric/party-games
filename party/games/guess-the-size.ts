import { Server, type Connection } from "partyserver";

// Realtime state for one "Guess the Size" room. This is a connectivity
// skeleton (track players, echo the roster) — round/guess/reveal logic
// gets built on top of this next.

type Player = { id: string; name: string };

export default class GuessTheSize extends Server {
  players = new Map<string, Player>();

  onConnect(connection: Connection) {
    this.players.set(connection.id, {
      id: connection.id,
      name: `Player ${this.players.size + 1}`,
    });
    this.broadcastPlayers();
  }

  onClose(connection: Connection) {
    this.players.delete(connection.id);
    this.broadcastPlayers();
  }

  broadcastPlayers() {
    this.broadcast(
      JSON.stringify({ type: "players", players: [...this.players.values()] })
    );
  }
}
