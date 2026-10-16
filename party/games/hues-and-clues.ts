import {
  Server,
  type Connection,
  type ConnectionContext,
  type WSMessage,
} from "partyserver";

// Each round: one player (the clue-giver) privately gets 4 random cells on
// the grid, picks one as their secret target, then gives everyone a single
// word as a clue. Everyone else taps the grid to guess the target's
// location; closer guesses score more. Clue-giving rotates through every
// player once per game. Colors are never sent over the wire — only
// {col, row} — see public/games/hues-and-clues/grid.js, which must stay in
// sync with COLS/ROWS/distance below.

type Phase = "lobby" | "turn" | "guessing" | "reveal" | "final";

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 8;

// Must match grid.js's COLS/ROWS exactly — this is the shared coordinate
// space every client renders the same grid from.
const COLS = 18;
const ROWS = 14;
const CARD_OPTIONS_COUNT = 4;

const TURN_DURATION_MS = 60_000; // time to pick a card + give a clue
const GUESS_DURATION_MS = 45_000; // time to place a guess

const MAX_CLUE_LENGTH = 24;

type Cell = { col: number; row: number };

type Player = {
  id: string;
  name: string;
  isHost: boolean;
  connected: boolean;
  ready: boolean;
  score: number;
  guessed: boolean;
};

function chebyshevDistance(a: Cell, b: Cell): number {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

function pointsForDistance(distance: number): number {
  if (distance === 0) return 3;
  if (distance === 1) return 2;
  if (distance === 2) return 1;
  return 0;
}

function randomCell(): Cell {
  return { col: Math.floor(Math.random() * COLS), row: Math.floor(Math.random() * ROWS) };
}

function sameCell(a: Cell, b: Cell): boolean {
  return a.col === b.col && a.row === b.row;
}

function pickCardOptions(): Cell[] {
  const options: Cell[] = [];
  while (options.length < CARD_OPTIONS_COUNT) {
    const candidate = randomCell();
    if (!options.some((c) => sameCell(c, candidate))) options.push(candidate);
  }
  return options;
}

// One word only: take the first whitespace-separated token rather than
// rejecting the submission outright, same philosophy as Telestrations'
// text sanitizing — never block the game over a formatting slip.
function sanitizeClue(input: unknown): string {
  const text = typeof input === "string" ? input.trim() : "";
  const firstWord = text.split(/\s+/)[0] ?? "";
  return firstWord.slice(0, MAX_CLUE_LENGTH) || "(no clue)";
}

function isValidCell(value: unknown): value is Cell {
  if (!value || typeof value !== "object") return false;
  const c = value as { col?: unknown; row?: unknown };
  return (
    typeof c.col === "number" &&
    typeof c.row === "number" &&
    Number.isInteger(c.col) &&
    Number.isInteger(c.row) &&
    c.col >= 0 &&
    c.col < COLS &&
    c.row >= 0 &&
    c.row < ROWS
  );
}

export default class HuesAndClues extends Server {
  players = new Map<string, Player>();
  phase: Phase = "lobby";

  // Frozen at game start — turn rotation is keyed off these ids, so this
  // array must never change once a game is running.
  playerOrder: string[] = [];
  turnIndex = 0; // playerOrder[turnIndex] is this round's clue-giver

  cardOptions: Cell[] = [];
  targetCell: Cell | null = null;
  clue = "";
  guesses = new Map<string, Cell>();

  roundEndsAt = 0;

  onConnect(connection: Connection, ctx: ConnectionContext) {
    const url = new URL(ctx.request.url);
    const isHost = url.searchParams.get("host") === "1" && !this.hasHost();
    const requestedName = url.searchParams.get("name")?.trim().slice(0, 20);

    if (!this.players.has(connection.id)) {
      this.players.set(connection.id, {
        id: connection.id,
        name: requestedName || `Player ${this.players.size + 1}`,
        isHost,
        connected: true,
        ready: false,
        score: 0,
        guessed: false,
      });
    }

    connection.send(JSON.stringify({ type: "you", id: connection.id }));
    this.sendStateTo(connection);
    this.broadcastPlayers();
  }

  onClose(connection: Connection) {
    const player = this.players.get(connection.id);
    if (!player) return;

    // Once playerOrder is frozen, turn rotation is keyed off these ids
    // forever — deleting the record (like a fresh lobby would) would
    // permanently corrupt whose turn is next. Mark it disconnected instead,
    // and drop isHost so a reloading host can reclaim the role through the
    // normal onConnect check rather than being locked out.
    if (this.phase === "lobby") {
      this.players.delete(connection.id);
    } else {
      player.connected = false;
      player.isHost = false;
    }
    this.broadcastPlayers();
    this.checkAllGuessed();
  }

  onMessage(connection: Connection, message: WSMessage) {
    if (typeof message !== "string") return;
    let data: { type?: string; index?: number; text?: string; col?: number; row?: number };
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

    if (data.type === "start") {
      this.startGame(connection);
    } else if (data.type === "ready") {
      this.handleReady(connection);
    } else if (data.type === "pick-card" && typeof data.index === "number") {
      this.pickCard(connection, data.index);
    } else if (data.type === "submit-clue") {
      this.submitClue(connection, data.text);
    } else if (data.type === "submit-guess" && typeof data.col === "number" && typeof data.row === "number") {
      this.submitGuess(connection, { col: data.col, row: data.row });
    }
  }

  hasHost(): boolean {
    return [...this.players.values()].some((p) => p.isHost);
  }

  // Only the host, only from the lobby, and only once every other player
  // has readied up — mirrors Secret Hitler's dealRoles gate.
  startGame(connection: Connection) {
    const host = this.players.get(connection.id);
    if (!host?.isHost) return;
    if (this.phase !== "lobby") return;
    if (this.players.size < MIN_PLAYERS || this.players.size > MAX_PLAYERS) return;

    const everyoneElseReady = [...this.players.values()].filter((p) => !p.isHost).every((p) => p.ready);
    if (!everyoneElseReady) return;

    this.playerOrder = [...this.players.keys()];
    this.turnIndex = 0;
    for (const p of this.players.values()) {
      p.score = 0;
      p.ready = false;
    }
    this.beginTurn();
  }

  clueGiverId(): string | null {
    return this.playerOrder[this.turnIndex] ?? null;
  }

  async beginTurn() {
    this.phase = "turn";
    this.cardOptions = pickCardOptions();
    this.targetCell = null;
    this.clue = "";
    this.guesses = new Map();
    for (const p of this.players.values()) p.guessed = false;
    this.roundEndsAt = Date.now() + TURN_DURATION_MS;
    await this.ctx.storage.setAlarm(this.roundEndsAt);

    for (const p of this.players.values()) {
      const conn = this.getConnection(p.id);
      if (conn) this.sendTurnStateTo(conn, p.id);
    }
    this.broadcastPlayers();
  }

  sendTurnStateTo(connection: Connection, playerId: string) {
    const clueGiverId = this.clueGiverId();
    const isClueGiver = playerId === clueGiverId;
    connection.send(
      JSON.stringify({
        type: "turn-start",
        round: this.turnIndex + 1,
        totalRounds: this.playerOrder.length,
        clueGiverName: this.players.get(clueGiverId ?? "")?.name ?? "?",
        isClueGiver,
        cardOptions: isClueGiver ? this.cardOptions : undefined,
        durationMs: TURN_DURATION_MS,
        endsAt: this.roundEndsAt,
      })
    );
  }

  pickCard(connection: Connection, index: number) {
    if (this.phase !== "turn") return;
    if (connection.id !== this.clueGiverId()) return;
    if (this.targetCell) return; // already picked this turn
    const cell = this.cardOptions[index];
    if (!cell) return;
    this.targetCell = cell;
  }

  submitClue(connection: Connection, text: unknown) {
    if (this.phase !== "turn") return;
    if (connection.id !== this.clueGiverId()) return;
    if (!this.targetCell) return; // must pick a card first
    this.clue = sanitizeClue(text);
    this.beginGuessing();
  }

  async beginGuessing() {
    this.phase = "guessing";
    const clueGiverId = this.clueGiverId();
    for (const p of this.players.values()) p.guessed = p.id === clueGiverId;
    this.roundEndsAt = Date.now() + GUESS_DURATION_MS;
    await this.ctx.storage.setAlarm(this.roundEndsAt);

    this.broadcast(
      JSON.stringify({
        type: "guessing-start",
        round: this.turnIndex + 1,
        totalRounds: this.playerOrder.length,
        clueGiverName: this.players.get(clueGiverId ?? "")?.name ?? "?",
        clue: this.clue,
        durationMs: GUESS_DURATION_MS,
        endsAt: this.roundEndsAt,
      })
    );
    this.broadcastPlayers();
  }

  submitGuess(connection: Connection, cell: Cell) {
    if (this.phase !== "guessing") return;
    if (connection.id === this.clueGiverId()) return;
    const player = this.players.get(connection.id);
    if (!player || player.guessed) return;
    if (!isValidCell(cell)) return;

    this.guesses.set(player.id, cell);
    player.guessed = true;
    this.broadcastPlayers();
    this.checkAllGuessed();
  }

  // Checked against the frozen seat list, not however many players are
  // currently connected — a disconnected seat still owes a guess, and the
  // alarm (not this check) is what resolves the round without them.
  checkAllGuessed() {
    if (this.phase !== "guessing") return;
    if (this.playerOrder.length === 0) return;
    const allGuessed = this.playerOrder.every((id) => this.players.get(id)?.guessed);
    if (allGuessed) this.resolveGuessing();
  }

  async onAlarm() {
    if (this.phase === "turn") await this.forceResolveTurn();
    else if (this.phase === "guessing") await this.resolveGuessing();
  }

  // The clue-giver ran out of time — fall back to a random one of their
  // own card options (or no clue) rather than softlocking the round.
  async forceResolveTurn() {
    if (!this.targetCell) {
      this.targetCell = this.cardOptions[Math.floor(Math.random() * this.cardOptions.length)] ?? randomCell();
    }
    if (!this.clue) this.clue = "(no clue)";
    await this.beginGuessing();
  }

  async resolveGuessing() {
    await this.ctx.storage.deleteAlarm();
    const target = this.targetCell;
    const clueGiverId = this.clueGiverId();

    const results: { id: string; name: string; col: number | null; row: number | null; distance: number | null; points: number }[] = [];
    for (const id of this.playerOrder) {
      if (id === clueGiverId) continue;
      const player = this.players.get(id);
      if (!player) continue;
      const guess = this.guesses.get(id);
      if (!guess || !target) {
        results.push({ id, name: player.name, col: null, row: null, distance: null, points: 0 });
        continue;
      }
      const distance = chebyshevDistance(guess, target);
      const points = pointsForDistance(distance);
      player.score += points;
      results.push({ id, name: player.name, col: guess.col, row: guess.row, distance, points });
    }

    this.phase = "reveal";
    for (const p of this.players.values()) p.ready = false;

    this.broadcast(
      JSON.stringify({
        type: "reveal",
        round: this.turnIndex + 1,
        totalRounds: this.playerOrder.length,
        target,
        clue: this.clue,
        clueGiverName: this.players.get(clueGiverId ?? "")?.name ?? "?",
        results,
      })
    );
    this.broadcastPlayers();
  }

  // A single "ready" message means different things depending on phase:
  // toggling the optional lobby signal, confirming "continue" after a
  // round's reveal, or confirming "play again" at the end — all one-way
  // (can't undo) outside the lobby, and symmetric (no host exemption)
  // outside it, mirroring Match the Color's round-reveal/rematch flow.
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
      this.checkAllReadyToContinue();
    }
  }

  checkAllReadyToContinue() {
    if (this.players.size === 0) return;
    const allReady = [...this.players.values()].every((p) => p.ready);
    if (!allReady) return;

    if (this.phase === "reveal") {
      if (this.turnIndex + 1 < this.playerOrder.length) {
        this.turnIndex += 1;
        this.beginTurn();
      } else {
        this.finishGame();
      }
    } else if (this.phase === "final") {
      this.resetToLobby();
    }
  }

  finishGame() {
    this.phase = "final";
    for (const p of this.players.values()) p.ready = false;
    this.broadcast(JSON.stringify({ type: "final", standings: this.computeStandings() }));
    this.broadcastPlayers();
  }

  computeStandings() {
    return [...this.players.values()]
      .map((p) => ({ id: p.id, name: p.name, score: p.score }))
      .sort((a, b) => b.score - a.score);
  }

  resetToLobby() {
    this.phase = "lobby";
    this.playerOrder = [];
    this.turnIndex = 0;
    this.cardOptions = [];
    this.targetCell = null;
    this.clue = "";
    this.guesses = new Map();
    for (const p of this.players.values()) {
      p.ready = false;
      p.score = 0;
      p.guessed = false;
    }
    this.broadcast(JSON.stringify({ type: "lobby" }));
    this.broadcastPlayers();
  }

  sendStateTo(connection: Connection) {
    const player = this.players.get(connection.id);
    if (!player) return;

    if (this.phase === "turn") {
      this.sendTurnStateTo(connection, player.id);
    } else if (this.phase === "guessing") {
      connection.send(
        JSON.stringify({
          type: "guessing-start",
          round: this.turnIndex + 1,
          totalRounds: this.playerOrder.length,
          clueGiverName: this.players.get(this.clueGiverId() ?? "")?.name ?? "?",
          clue: this.clue,
          durationMs: GUESS_DURATION_MS,
          endsAt: this.roundEndsAt,
        })
      );
    } else if (this.phase === "final") {
      connection.send(JSON.stringify({ type: "final", standings: this.computeStandings() }));
    }
    // "reveal" has no reconnect replay — a refreshed client just waits for
    // the next broadcast, same accepted limitation as the rest of this
    // codebase around reconnect identity.
  }

  broadcastPlayers() {
    this.broadcast(
      JSON.stringify({
        type: "players",
        phase: this.phase,
        minPlayers: MIN_PLAYERS,
        maxPlayers: MAX_PLAYERS,
        clueGiverId: this.phase === "lobby" || this.phase === "final" ? null : this.clueGiverId(),
        players: [...this.players.values()].map((p) => ({
          id: p.id,
          name: p.name,
          isHost: p.isHost,
          connected: p.connected,
          ready: p.ready,
          score: p.score,
          guessed: p.guessed,
        })),
      })
    );
  }
}
