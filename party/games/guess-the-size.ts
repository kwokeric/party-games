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

// A game is a fixed-length tournament: whoever has the highest average
// score across all rounds wins. Both the round count and the optional
// per-round timer are host-configurable from the lobby (see updateSettings).
const DEFAULT_MAX_ROUNDS = 5;
const MIN_ROUNDS = 3;
const MAX_ROUNDS_LIMIT = 20;

// No timer by default — guessing has always been untimed, and dragging to
// resize takes real thought, so a clock only kicks in if the host turns it
// on. `null` means "no timer, wait for everyone to submit."
const DEFAULT_ROUND_DURATION_MS: number | null = null;
const MIN_ROUND_DURATION_MS = 10_000;
const MAX_ROUND_DURATION_MS = 120_000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

type GameObject = (typeof objects)[number];

type Player = {
  id: string;
  name: string;
  isHost: boolean;
  guess: number | null;
  ready: boolean;
  totalScore: number;
};

type Round = {
  objectA: GameObject;
  objectB: GameObject;
};

type Phase = "lobby" | "guessing" | "reveal" | "final";

function isValidPair(a: GameObject, b: GameObject): boolean {
  if (a.id === b.id) return false;
  const ratio = Math.max(a.length_m, b.length_m) / Math.min(a.length_m, b.length_m);
  return ratio >= MIN_RATIO && ratio <= MAX_RATIO;
}

function pickRound(): Round {
  // With animals making up nearly a third of the library, pure random pairing
  // skews heavily toward animal-vs-animal. Biasing toward different
  // categories first (falling back to same-category if that can't be
  // satisfied) keeps rounds varied — a car next to an animal, a landmark next
  // to a snack, etc. — without ever blocking a round from starting.
  for (let attempt = 0; attempt < 150; attempt++) {
    const a = objects[Math.floor(Math.random() * objects.length)];
    const b = objects[Math.floor(Math.random() * objects.length)];
    if (a.category === b.category) continue;
    if (isValidPair(a, b)) {
      return Math.random() < 0.5 ? { objectA: a, objectB: b } : { objectA: b, objectB: a };
    }
  }
  for (let attempt = 0; attempt < 100; attempt++) {
    const a = objects[Math.floor(Math.random() * objects.length)];
    const b = objects[Math.floor(Math.random() * objects.length)];
    if (isValidPair(a, b)) {
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
  roundNumber = 0;
  roundEndsAt = 0;
  maxRounds = DEFAULT_MAX_ROUNDS;
  roundDurationMs: number | null = DEFAULT_ROUND_DURATION_MS;

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
      totalScore: 0,
    });

    connection.send(JSON.stringify({ type: "you", id: connection.id }));
    this.sendStateTo(connection);
    this.broadcastPlayers();
  }

  onClose(connection: Connection) {
    this.players.delete(connection.id);
    this.broadcastPlayers();
    // Someone might have been the last player the group was waiting on.
    this.checkAllReady();
  }

  onMessage(connection: Connection, message: WSMessage) {
    if (typeof message !== "string") return;
    let data: {
      type?: string;
      length_m?: number;
      maxRounds?: number;
      roundDurationMs?: number | null;
    };
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

    if (data.type === "start") {
      this.startGame(connection);
    } else if (data.type === "settings") {
      this.updateSettings(connection, data.maxRounds, data.roundDurationMs);
    } else if (data.type === "guess" && typeof data.length_m === "number") {
      this.submitGuess(connection, data.length_m);
    } else if (data.type === "force-reveal") {
      const player = this.players.get(connection.id);
      if (player?.isHost && this.phase === "guessing") this.reveal();
    } else if (data.type === "ready") {
      this.handleReady(connection);
    }
  }

  hasHost(): boolean {
    return [...this.players.values()].some((p) => p.isHost);
  }

  // Only the host can tune the format, and only before anything's started —
  // once the tournament is running, mid-game changes would desync scores
  // that are already averaged against the old round count.
  updateSettings(connection: Connection, maxRounds?: number, roundDurationMs?: number | null) {
    const player = this.players.get(connection.id);
    if (!player?.isHost) return;
    if (this.phase !== "lobby") return;

    if (typeof maxRounds === "number") {
      this.maxRounds = clamp(maxRounds, MIN_ROUNDS, MAX_ROUNDS_LIMIT);
    }
    if (roundDurationMs === null) {
      this.roundDurationMs = null;
    } else if (typeof roundDurationMs === "number") {
      this.roundDurationMs = clamp(roundDurationMs, MIN_ROUND_DURATION_MS, MAX_ROUND_DURATION_MS);
    }
    this.broadcastPlayers();
  }

  // Starts a brand new tournament (round 1 of this.maxRounds). Only the host
  // can do this, and only from the lobby — mid-game round advancement and the
  // eventual rematch are driven by everyone readying up, not a host action.
  startGame(connection: Connection) {
    const player = this.players.get(connection.id);
    if (!player?.isHost) return;
    if (this.phase !== "lobby") return;

    for (const p of this.players.values()) {
      p.totalScore = 0;
      p.ready = false;
    }
    this.roundNumber = 0;
    this.beginRound();
  }

  async beginRound() {
    this.roundNumber += 1;
    this.round = pickRound();
    this.phase = "guessing";
    this.roundEndsAt = this.roundDurationMs ? Date.now() + this.roundDurationMs : 0;
    for (const p of this.players.values()) {
      p.guess = null;
      p.ready = false;
    }

    // With no timer this just clears any stale alarm from a previous round's
    // settings; with one set, the alarm — not the client — is what actually
    // ends the round once time's up.
    if (this.roundEndsAt) {
      await this.ctx.storage.setAlarm(this.roundEndsAt);
    } else {
      await this.ctx.storage.deleteAlarm();
    }

    this.broadcastRoundStart();
    this.broadcastPlayers();
  }

  broadcastRoundStart() {
    if (!this.round) return;
    this.broadcast(
      JSON.stringify({
        type: "round-start",
        roundNumber: this.roundNumber,
        maxRounds: this.maxRounds,
        objectA: this.round.objectA,
        objectB: {
          id: this.round.objectB.id,
          name: this.round.objectB.name,
          svg: this.round.objectB.svg,
          axis: this.round.objectB.axis,
        },
        durationMs: this.roundDurationMs,
        endsAt: this.roundEndsAt || null,
      })
    );
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

  async onAlarm() {
    if (this.phase === "guessing") this.reveal();
  }

  async reveal() {
    if (!this.round) return;
    this.phase = "reveal";
    await this.ctx.storage.deleteAlarm();
    const trueLength = this.round.objectB.length_m;

    const guesses = [...this.players.values()].map((p) => {
      const score = p.guess === null ? 0 : scoreGuess(p.guess, trueLength);
      p.totalScore += score;
      return { id: p.id, name: p.name, guess_m: p.guess, score };
    });
    guesses.sort((a, b) => b.score - a.score);

    // Everyone needs to ready up again before the next round (or the final
    // results, on the last round) can begin.
    for (const p of this.players.values()) p.ready = false;

    this.broadcast(
      JSON.stringify({
        type: "reveal",
        roundNumber: this.roundNumber,
        maxRounds: this.maxRounds,
        objectBTrueLength_m: trueLength,
        guesses,
      })
    );
    this.broadcastPlayers();
  }

  // A single "ready" message means different things depending on what
  // everyone's currently waiting on: readying up to start round 1 from the
  // lobby, readying up for the next round after a reveal, or voting for a
  // rematch once final results are in.
  handleReady(connection: Connection) {
    const player = this.players.get(connection.id);
    if (!player) return;

    if (this.phase === "lobby") {
      if (player.isHost) return;
      player.ready = !player.ready;
      this.broadcastPlayers();
      return;
    }

    if (this.phase === "reveal" || this.phase === "final") {
      if (player.ready) return;
      player.ready = true;
      this.broadcastPlayers();
      this.checkAllReady();
    }
  }

  // Called whenever a player readies up or disconnects — either can be the
  // event that completes a unanimous ready check.
  checkAllReady() {
    if (this.players.size === 0) return;
    const allReady = [...this.players.values()].every((p) => p.ready);
    if (!allReady) return;

    if (this.phase === "reveal") {
      if (this.roundNumber >= this.maxRounds) this.finishGame();
      else this.beginRound();
    } else if (this.phase === "final") {
      for (const p of this.players.values()) {
        p.totalScore = 0;
        p.ready = false;
      }
      this.roundNumber = 0;
      this.beginRound();
    }
  }

  finishGame() {
    this.phase = "final";
    for (const p of this.players.values()) p.ready = false;
    this.broadcast(
      JSON.stringify({ type: "final", maxRounds: this.maxRounds, standings: this.computeStandings() })
    );
    this.broadcastPlayers();
  }

  computeStandings() {
    return [...this.players.values()]
      .map((p) => ({
        id: p.id,
        name: p.name,
        avgScore: Math.round((p.totalScore / this.maxRounds) * 10) / 10,
      }))
      .sort((a, b) => b.avgScore - a.avgScore);
  }

  sendStateTo(connection: Connection) {
    if (this.phase === "lobby" || !this.round) return;

    if (this.phase === "guessing" || this.phase === "reveal") {
      connection.send(
        JSON.stringify({
          type: "round-start",
          roundNumber: this.roundNumber,
          maxRounds: this.maxRounds,
          objectA: this.round.objectA,
          objectB: {
            id: this.round.objectB.id,
            name: this.round.objectB.name,
            svg: this.round.objectB.svg,
            axis: this.round.objectB.axis,
          },
          durationMs: this.roundDurationMs,
          endsAt: this.roundEndsAt || null,
        })
      );
    }

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
        JSON.stringify({
          type: "reveal",
          roundNumber: this.roundNumber,
          maxRounds: this.maxRounds,
          objectBTrueLength_m: trueLength,
          guesses,
        })
      );
    }

    if (this.phase === "final") {
      connection.send(
        JSON.stringify({ type: "final", maxRounds: this.maxRounds, standings: this.computeStandings() })
      );
    }
  }

  broadcastPlayers() {
    this.broadcast(
      JSON.stringify({
        type: "players",
        phase: this.phase,
        settings: { maxRounds: this.maxRounds, roundDurationMs: this.roundDurationMs },
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
