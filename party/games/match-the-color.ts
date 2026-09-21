import {
  Server,
  type Connection,
  type ConnectionContext,
  type WSMessage,
} from "partyserver";
import colors from "../../public/games/match-the-color/colors.json";

// A game is a fixed-length tournament: whoever has the highest average
// score across all rounds wins. Mirrors Guess the Size's structure.
const DEFAULT_MAX_ROUNDS = 5;
// Timed by default (unlike Guess the Size) since blending into a color
// against a clock is the whole game here — but the host can still turn the
// timer off. `null` means "no timer, wait for everyone to lock in."
const DEFAULT_ROUND_DURATION_MS: number | null = 15_000;

const MIN_ROUNDS = 3;
const MAX_ROUNDS_LIMIT = 20;
const MIN_ROUND_DURATION_MS = 5_000;
const MAX_ROUND_DURATION_MS = 30_000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

// Every round starts here — a neutral green chameleon, independent of
// wherever a player left their sliders last round.
const START_COLOR: Hsb = { h: 125, s: 65, b: 70 };

type NamedColor = (typeof colors)[number];
type Hsb = { h: number; s: number; b: number };

type Player = {
  id: string;
  name: string;
  isHost: boolean;
  color: Hsb;
  locked: boolean;
  ready: boolean;
  totalScore: number;
  roundScores: number[];
};

type Phase = "lobby" | "playing" | "reveal" | "final";

function hsbToRgb({ h, s, b }: Hsb): [number, number, number] {
  const sat = s / 100;
  const bri = b / 100;
  const k = (n: number) => (n + h / 60) % 6;
  const f = (n: number) => bri - bri * sat * Math.max(0, Math.min(k(n), 4 - k(n), 1));
  return [Math.round(f(5) * 255), Math.round(f(3) * 255), Math.round(f(1) * 255)];
}

// Euclidean distance in RGB space, normalized against the largest possible
// distance (pure black to pure white) and expressed as a 0-100 match — this
// percentage doubles as the round score, same number the results page shows.
const MAX_RGB_DISTANCE = Math.sqrt(3 * 255 * 255);

function scoreColor(color: Hsb, target: Hsb): number {
  const [r1, g1, b1] = hsbToRgb(color);
  const [r2, g2, b2] = hsbToRgb(target);
  const dist = Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
  return Math.round(100 * Math.max(0, 1 - dist / MAX_RGB_DISTANCE));
}

function pickTarget(): NamedColor {
  return colors[Math.floor(Math.random() * colors.length)];
}

export default class MatchTheColor extends Server {
  players = new Map<string, Player>();
  phase: Phase = "lobby";
  target: NamedColor | null = null;
  roundNumber = 0;
  roundEndsAt = 0;
  maxRounds = DEFAULT_MAX_ROUNDS;
  roundDurationMs = DEFAULT_ROUND_DURATION_MS;

  onConnect(connection: Connection, ctx: ConnectionContext) {
    const url = new URL(ctx.request.url);
    const isHost = url.searchParams.get("host") === "1" && !this.hasHost();
    const requestedName = url.searchParams.get("name")?.trim().slice(0, 20);

    this.players.set(connection.id, {
      id: connection.id,
      name: requestedName || `Player ${this.players.size + 1}`,
      isHost,
      color: { ...START_COLOR },
      locked: false,
      ready: false,
      totalScore: 0,
      roundScores: [],
    });

    connection.send(JSON.stringify({ type: "you", id: connection.id }));
    this.sendStateTo(connection);
    this.broadcastPlayers();
  }

  onClose(connection: Connection) {
    this.players.delete(connection.id);
    this.broadcastPlayers();
    this.checkAllLocked();
    this.checkAllReady();
  }

  onMessage(connection: Connection, message: WSMessage) {
    if (typeof message !== "string") return;
    let data: {
      type?: string;
      h?: number;
      s?: number;
      b?: number;
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
    } else if (
      data.type === "color" &&
      typeof data.h === "number" &&
      typeof data.s === "number" &&
      typeof data.b === "number"
    ) {
      this.updateColor(connection, { h: data.h, s: data.s, b: data.b });
    } else if (data.type === "lock") {
      this.lockIn(connection);
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
  // can do this, and only from the lobby.
  startGame(connection: Connection) {
    const player = this.players.get(connection.id);
    if (!player?.isHost) return;
    if (this.phase !== "lobby") return;

    for (const p of this.players.values()) {
      p.totalScore = 0;
      p.roundScores = [];
      p.ready = false;
    }
    this.roundNumber = 0;
    this.beginRound();
  }

  async beginRound() {
    this.roundNumber += 1;
    this.target = pickTarget();
    this.phase = "playing";
    this.roundEndsAt = this.roundDurationMs ? Date.now() + this.roundDurationMs : 0;
    for (const p of this.players.values()) {
      p.color = { ...START_COLOR };
      p.locked = false;
      p.ready = false;
    }

    // With no timer this just clears any stale alarm from a previous round's
    // settings, and the round only ends once everyone locks in; with one
    // set, the alarm — not the client — is what actually ends the round:
    // whatever color a player has when it fires becomes their score, even
    // if their tab is slow, backgrounded, or never sends another message.
    if (this.roundEndsAt) {
      await this.ctx.storage.setAlarm(this.roundEndsAt);
    } else {
      await this.ctx.storage.deleteAlarm();
    }

    this.broadcastRoundStart();
    this.broadcastPlayers();
  }

  broadcastRoundStart() {
    if (!this.target) return;
    this.broadcast(
      JSON.stringify({
        type: "round-start",
        roundNumber: this.roundNumber,
        maxRounds: this.maxRounds,
        target: this.target,
        durationMs: this.roundDurationMs,
        endsAt: this.roundEndsAt || null,
      })
    );
  }

  updateColor(connection: Connection, color: Hsb) {
    if (this.phase !== "playing") return;
    const player = this.players.get(connection.id);
    if (!player || player.locked) return;
    player.color = color;
  }

  lockIn(connection: Connection) {
    if (this.phase !== "playing") return;
    const player = this.players.get(connection.id);
    if (!player || player.locked) return;
    player.locked = true;
    this.broadcastPlayers();
    this.checkAllLocked();
  }

  // Locking in early is optional (the alarm is the real deadline), but if
  // everyone's already locked there's no reason to keep waiting on the timer.
  checkAllLocked() {
    if (this.phase !== "playing") return;
    if (this.players.size === 0) return;
    const allLocked = [...this.players.values()].every((p) => p.locked);
    if (allLocked) this.reveal();
  }

  async onAlarm() {
    if (this.phase === "playing") await this.reveal();
  }

  async reveal() {
    if (!this.target) return;
    this.phase = "reveal";
    await this.ctx.storage.deleteAlarm();

    const target = this.target;
    const results = [...this.players.values()].map((p) => {
      const score = scoreColor(p.color, target);
      p.totalScore += score;
      p.roundScores.push(score);
      return { id: p.id, name: p.name, h: p.color.h, s: p.color.s, b: p.color.b, score };
    });
    results.sort((a, b) => b.score - a.score);

    // Everyone needs to ready up again before the next round (or the final
    // results, on the last round) can begin.
    for (const p of this.players.values()) p.ready = false;

    this.broadcast(
      JSON.stringify({
        type: "reveal",
        roundNumber: this.roundNumber,
        maxRounds: this.maxRounds,
        target,
        results,
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
        p.roundScores = [];
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
        roundScores: p.roundScores,
      }))
      .sort((a, b) => b.avgScore - a.avgScore);
  }

  sendStateTo(connection: Connection) {
    if (this.phase === "lobby" || !this.target) return;
    const target = this.target;

    if (this.phase === "playing") {
      connection.send(
        JSON.stringify({
          type: "round-start",
          roundNumber: this.roundNumber,
          maxRounds: this.maxRounds,
          target,
          durationMs: this.roundDurationMs,
          endsAt: this.roundEndsAt || null,
        })
      );
    }

    if (this.phase === "reveal") {
      const results = [...this.players.values()]
        .map((p) => ({
          id: p.id,
          name: p.name,
          h: p.color.h,
          s: p.color.s,
          b: p.color.b,
          score: scoreColor(p.color, target),
        }))
        .sort((a, b) => b.score - a.score);
      connection.send(
        JSON.stringify({
          type: "reveal",
          roundNumber: this.roundNumber,
          maxRounds: this.maxRounds,
          target,
          results,
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
          locked: p.locked,
          ready: p.ready,
        })),
      })
    );
  }
}
