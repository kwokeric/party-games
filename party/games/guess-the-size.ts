import {
  Server,
  type Connection,
  type ConnectionContext,
  type WSMessage,
} from "partyserver";
import objects from "../../public/games/guess-the-size/objects.json";

// Max/min allowed size ratio between the two objects in a round. Keeping a
// floor as well as the requested 5x ceiling avoids pairing two objects so
// close in size that there's nothing interesting to guess.
const MAX_RATIO = 5;
const MIN_RATIO = 1.3;

type GameObject = (typeof objects)[number];

type Player = {
  id: string;
  name: string;
  isHost: boolean;
  guess: number | null;
  ready: boolean;
};

type Round = {
  objectA: GameObject;
  objectB: GameObject;
};

type Phase = "lobby" | "guessing" | "reveal";

function pickRound(): Round {
  for (let attempt = 0; attempt < 100; attempt++) {
    const a = objects[Math.floor(Math.random() * objects.length)];
    const b = objects[Math.floor(Math.random() * objects.length)];
    if (a.id === b.id) continue;
    const ratio = Math.max(a.length_m, b.length_m) / Math.min(a.length_m, b.length_m);
    if (ratio >= MIN_RATIO && ratio <= MAX_RATIO) {
      return Math.random() < 0.5 ? { objectA: a, objectB: b } : { objectA: b, objectB: a };
    }
  }
  // Extremely unlikely fallback given the current object set.
  return { objectA: objects[0], objectB: objects[1] };
}

function scoreGuess(guess: number, trueLength: number): number {
  const logRatio = Math.abs(Math.log(guess / trueLength));
  const logCap = Math.log(MAX_RATIO);
  return Math.round(100 * Math.max(0, 1 - logRatio / logCap));
}

export default class GuessTheSize extends Server {
  players = new Map<string, Player>();
  phase: Phase = "lobby";
  round: Round | null = null;

  onConnect(connection: Connection, ctx: ConnectionContext) {
    const url = new URL(ctx.request.url);
    const isHost = url.searchParams.get("host") === "1" && !this.hasHost();
    const requestedName = url.searchParams.get("name")?.trim().slice(0, 20);

    this.players.set(connection.id, {
      id: connection.id,
      name: requestedName || `Player ${this.players.size + 1}`,
      isHost,
      guess: null,
      ready: false,
    });

    connection.send(JSON.stringify({ type: "you", id: connection.id }));
    this.sendStateTo(connection);
    this.broadcastPlayers();
  }

  onClose(connection: Connection) {
    this.players.delete(connection.id);
    this.broadcastPlayers();
  }

  onMessage(connection: Connection, message: WSMessage) {
    if (typeof message !== "string") return;
    let data: { type?: string; length_m?: number };
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

    if (data.type === "start") {
      this.startRound(connection);
    } else if (data.type === "guess" && typeof data.length_m === "number") {
      this.submitGuess(connection, data.length_m);
    } else if (data.type === "force-reveal") {
      const player = this.players.get(connection.id);
      if (player?.isHost && this.phase === "guessing") this.reveal();
    } else if (data.type === "ready") {
      const player = this.players.get(connection.id);
      if (player && !player.isHost && this.phase === "lobby") {
        player.ready = !player.ready;
        this.broadcastPlayers();
      }
    }
  }

  hasHost(): boolean {
    return [...this.players.values()].some((p) => p.isHost);
  }

  startRound(connection: Connection) {
    const player = this.players.get(connection.id);
    if (!player?.isHost) return;
    if (this.phase === "guessing") return;

    this.round = pickRound();
    this.phase = "guessing";
    for (const p of this.players.values()) p.guess = null;

    this.broadcast(
      JSON.stringify({
        type: "round-start",
        objectA: this.round.objectA,
        objectB: {
          id: this.round.objectB.id,
          name: this.round.objectB.name,
          svg: this.round.objectB.svg,
          axis: this.round.objectB.axis,
        },
      })
    );
    this.broadcastPlayers();
  }

  submitGuess(connection: Connection, length_m: number) {
    if (this.phase !== "guessing") return;
    const player = this.players.get(connection.id);
    if (!player) return;

    player.guess = Math.max(0.001, length_m);
    this.broadcastPlayers();

    const allGuessed = [...this.players.values()].every((p) => p.guess !== null);
    if (allGuessed) this.reveal();
  }

  reveal() {
    if (!this.round) return;
    this.phase = "reveal";
    const trueLength = this.round.objectB.length_m;

    const guesses = [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      guess_m: p.guess,
      score: p.guess === null ? 0 : scoreGuess(p.guess, trueLength),
    }));
    guesses.sort((a, b) => b.score - a.score);

    this.broadcast(
      JSON.stringify({
        type: "reveal",
        objectBTrueLength_m: trueLength,
        guesses,
      })
    );
  }

  sendStateTo(connection: Connection) {
    if (this.phase === "lobby" || !this.round) return;
    connection.send(
      JSON.stringify({
        type: "round-start",
        objectA: this.round.objectA,
        objectB: {
          id: this.round.objectB.id,
          name: this.round.objectB.name,
          svg: this.round.objectB.svg,
          axis: this.round.objectB.axis,
        },
      })
    );
    if (this.phase === "reveal") {
      const trueLength = this.round.objectB.length_m;
      const guesses = [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        guess_m: p.guess,
        score: p.guess === null ? 0 : scoreGuess(p.guess, trueLength),
      }));
      guesses.sort((a, b) => b.score - a.score);
      connection.send(
        JSON.stringify({ type: "reveal", objectBTrueLength_m: trueLength, guesses })
      );
    }
  }

  broadcastPlayers() {
    this.broadcast(
      JSON.stringify({
        type: "players",
        phase: this.phase,
        players: [...this.players.values()].map((p) => ({
          id: p.id,
          name: p.name,
          isHost: p.isHost,
          hasGuessed: p.guess !== null,
          ready: p.ready,
        })),
      })
    );
  }
}
