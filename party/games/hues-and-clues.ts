import {
  Server,
  type Connection,
  type ConnectionContext,
  type WSMessage,
} from "partyserver";

// Each round: one player (the clue-giver) privately gets 4 random cells on
// the grid, picks one as their secret target, then gives everyone a single
// word as a clue. Guessers take turns, one at a time, placing a guess pin —
// once a cell is claimed, nobody else may place on it. After everyone's had
// one guess, the clue-giver gives a second clue (up to two words, may reuse
// the first), and the same turn order goes around again for a final guess.
// Scoring is based on that final guess. Clue-giving rotates through every
// player once per game. Colors are never sent over the wire — only
// {col, row} — see public/games/hues-and-clues/grid.js, which must stay in
// sync with COLS/ROWS/distance below.

type Phase = "lobby" | "turn" | "guessing" | "clue2" | "reveal" | "final";

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 8;

// Must match grid.js's COLS/ROWS exactly — this is the shared coordinate
// space every client renders the same grid from.
const COLS = 26;
const ROWS = 16;
const CARD_OPTIONS_COUNT = 4;

const TURN_DURATION_MS = 60_000; // time to pick a card + give the first clue
const CLUE2_DURATION_MS = 45_000; // time to give the second clue

// Per-guesser turn timer is host-configurable; `null` means no limit at
// all (the default) — the turn simply waits for that player to act, same
// "no timer" convention as Match the Color/Telestrations' round settings.
const MIN_GUESS_DURATION_MS = 15_000;
const MAX_GUESS_DURATION_MS = 60_000;
const DEFAULT_GUESS_DURATION_MS: number | null = null;

const MAX_CLUE_LENGTH = 24;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type Cell = { col: number; row: number };
type GuessRound = 1 | 2;

type Player = {
  id: string;
  // The connection currently live for this player, or null while they're
  // disconnected. Never used as the player's identity — connections come
  // and go on reconnect, this.players is keyed by the stable id instead.
  connectionId: string | null;
  name: string;
  isHost: boolean;
  connected: boolean;
  ready: boolean;
  score: number;
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

function cellKey(cell: Cell): string {
  return `${cell.col},${cell.row}`;
}

// Same hue math as grid.js's cellColor — hue is the angle around the
// board's center (0° = red at the top, increasing clockwise).
function hueOf(cell: Cell): number {
  const nx = (cell.col - (COLS - 1) / 2) / ((COLS - 1) / 2);
  const ny = (cell.row - (ROWS - 1) / 2) / ((ROWS - 1) / 2);
  return ((Math.atan2(ny, nx) * 180) / Math.PI + 90 + 360) % 360;
}

// One card per equal slice of the color wheel (starting at a random
// angle), keeping clear of each slice's edges, so the clue-giver never
// gets two cards from the same color family (e.g. two reds).
const CARD_HUE_MARGIN = 15;

function pickCardOptions(): Cell[] {
  const sliceSize = 360 / CARD_OPTIONS_COUNT;
  const offset = Math.random() * 360;
  const options: Cell[] = [];
  for (let i = 0; i < CARD_OPTIONS_COUNT; i++) {
    const start = offset + i * sliceSize + CARD_HUE_MARGIN;
    const width = sliceSize - 2 * CARD_HUE_MARGIN;
    let candidate = randomCell();
    for (let attempt = 0; attempt < 500; attempt++) {
      const intoSlice = (hueOf(candidate) - start + 720) % 360;
      if (intoSlice <= width) break;
      candidate = randomCell();
    }
    options.push(candidate);
  }
  // Shuffle so the cards don't always run around the wheel in order.
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return options;
}

// Takes the first `maxWords` whitespace-separated tokens rather than
// rejecting the submission outright — same philosophy as Telestrations'
// text sanitizing, never block the game over a formatting slip.
function sanitizeClue(input: unknown, maxWords: number): string {
  const text = typeof input === "string" ? input.trim() : "";
  const words = text.split(/\s+/).filter(Boolean).slice(0, maxWords);
  return words.join(" ").slice(0, MAX_CLUE_LENGTH) || "(no clue)";
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
  // Maps a live connection id to the stable player id that owns it, so a
  // reconnect (which always arrives as a brand new connection) can be
  // reattached to the same seat in playerOrder/guessOrder instead of being
  // orphaned.
  connIndex = new Map<string, string>();
  phase: Phase = "lobby";

  guessDurationMs: number | null = DEFAULT_GUESS_DURATION_MS;

  // Frozen at game start — turn rotation is keyed off these ids, so this
  // array must never change once a game is running.
  playerOrder: string[] = [];
  turnIndex = 0; // playerOrder[turnIndex] is this round's clue-giver

  cardOptions: Cell[] = [];
  targetCell: Cell | null = null;
  clue1 = "";
  clue2 = "";

  // Turn order for guessing (playerOrder minus the clue-giver), and where
  // we are in it. Re-used for both guess rounds within one turn.
  guessOrder: string[] = [];
  guessTurnIndex = 0;
  guessRound: GuessRound = 1;
  guesses1 = new Map<string, Cell>();
  guesses2 = new Map<string, Cell>();
  // Once any player claims a cell (in either guess round), nobody else may
  // place there for the rest of this turn — "col,row" -> playerId.
  occupiedCells = new Map<string, string>();

  roundEndsAt = 0;

  onConnect(connection: Connection, ctx: ConnectionContext) {
    const url = new URL(ctx.request.url);
    // The client mints and persists this in sessionStorage per room, so a
    // page refresh reconnects as the SAME player instead of a new one —
    // critically, as the SAME seat in playerOrder/guessOrder, so whose turn
    // it is carries over correctly. A connection with no pid (an old cached
    // tab, a non-browser client) falls back to the connection id, same as
    // the old unconditional behavior.
    const pid = url.searchParams.get("pid") || connection.id;
    const requestedName = url.searchParams.get("name")?.trim().slice(0, 20);

    const existing = this.players.get(pid);
    if (existing) {
      existing.connectionId = connection.id;
      existing.connected = true;
    } else {
      const isHost = url.searchParams.get("host") === "1" && !this.hasHost();
      this.players.set(pid, {
        id: pid,
        connectionId: connection.id,
        name: requestedName || `Player ${this.players.size + 1}`,
        isHost,
        connected: true,
        ready: false,
        score: 0,
      });
    }
    this.connIndex.set(connection.id, pid);

    connection.send(JSON.stringify({ type: "you", id: pid }));
    this.sendStateTo(connection);
    this.broadcastPlayers();
  }

  // Finds the player behind whichever connection sent a message — never
  // keyed directly off connection.id, since that changes on every reconnect.
  playerFor(connection: Connection): Player | undefined {
    const pid = this.connIndex.get(connection.id);
    return pid ? this.players.get(pid) : undefined;
  }

  onClose(connection: Connection) {
    const pid = this.connIndex.get(connection.id);
    this.connIndex.delete(connection.id);
    if (!pid) return;
    const player = this.players.get(pid);
    // A reconnect can attach a new connection to this player before the
    // old socket's own close event arrives — ignore a close that's no
    // longer the current connection for this seat.
    if (!player || player.connectionId !== connection.id) return;

    // Once playerOrder is frozen, turn rotation is keyed off these ids
    // forever — deleting the record (like a fresh lobby would) would
    // permanently corrupt whose turn is next. Mark it disconnected instead.
    // isHost is deliberately left untouched: a matching reconnect (same
    // pid) should come back as host if they left as host — hasHost()
    // below is what lets a DIFFERENT player claim the role if the
    // original host never returns. A disconnect mid-guess needs no
    // special handling beyond this — if it's currently their turn, the
    // per-turn alarm skips them like any other stall.
    if (this.phase === "lobby") {
      this.players.delete(pid);
    } else {
      player.connectionId = null;
      player.connected = false;
    }
    this.broadcastPlayers();
  }

  onMessage(connection: Connection, message: WSMessage) {
    if (typeof message !== "string") return;
    let data: {
      type?: string;
      index?: number;
      text?: string;
      col?: number;
      row?: number;
      guessDurationMs?: number | null;
    };
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

    if (data.type === "start") {
      this.startGame(connection);
    } else if (data.type === "settings") {
      this.updateSettings(connection, data.guessDurationMs);
    } else if (data.type === "ready") {
      this.handleReady(connection);
    } else if (data.type === "pick-card" && typeof data.index === "number") {
      this.pickCard(connection, data.index);
    } else if (data.type === "submit-clue") {
      this.submitClue(connection, data.text);
    } else if (data.type === "submit-clue2") {
      this.submitClue2(connection, data.text);
    } else if (data.type === "submit-guess" && typeof data.col === "number" && typeof data.row === "number") {
      this.submitGuess(connection, { col: data.col, row: data.row });
    }
  }

  // A disconnected host can't send anything, so excluding them lets a
  // different player claim host via ?host=1 if the original never returns —
  // while a matching reconnect (same pid) restores the original's own
  // isHost flag untouched, since it's never cleared on disconnect.
  hasHost(): boolean {
    return [...this.players.values()].some((p) => p.isHost && p.connected);
  }

  // Only the host, and only from the lobby — mirrors Match the Color's
  // settings gate, so a change mid-game can't desync a turn already in
  // flight. `null` (no limit) is always accepted as-is; a real duration is
  // clamped into the allowed range.
  updateSettings(connection: Connection, guessDurationMs?: number | null) {
    const player = this.playerFor(connection);
    if (!player?.isHost) return;
    if (this.phase !== "lobby") return;

    if (guessDurationMs === null) {
      this.guessDurationMs = null;
    } else if (typeof guessDurationMs === "number") {
      this.guessDurationMs = clamp(guessDurationMs, MIN_GUESS_DURATION_MS, MAX_GUESS_DURATION_MS);
    }
    this.broadcastPlayers();
  }

  // Only the host, only from the lobby, and only once every other player
  // has readied up — mirrors Secret Hitler's dealRoles gate.
  startGame(connection: Connection) {
    const host = this.playerFor(connection);
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
    this.clue1 = "";
    this.clue2 = "";
    this.guessOrder = this.playerOrder.filter((id) => id !== this.clueGiverId());
    this.guessTurnIndex = 0;
    this.guessRound = 1;
    this.guesses1 = new Map();
    this.guesses2 = new Map();
    this.occupiedCells = new Map();
    this.roundEndsAt = Date.now() + TURN_DURATION_MS;
    await this.ctx.storage.setAlarm(this.roundEndsAt);

    for (const p of this.players.values()) {
      if (!p.connectionId) continue;
      const conn = this.getConnection(p.connectionId);
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
    if (this.playerFor(connection)?.id !== this.clueGiverId()) return;
    if (this.targetCell) return; // already picked this turn
    const cell = this.cardOptions[index];
    if (!cell) return;
    this.targetCell = cell;
  }

  submitClue(connection: Connection, text: unknown) {
    if (this.phase !== "turn") return;
    if (this.playerFor(connection)?.id !== this.clueGiverId()) return;
    if (!this.targetCell) return; // must pick a card first
    this.clue1 = sanitizeClue(text, 1);
    this.beginGuessing(1);
  }

  submitClue2(connection: Connection, text: unknown) {
    if (this.phase !== "clue2") return;
    if (this.playerFor(connection)?.id !== this.clueGiverId()) return;
    this.clue2 = sanitizeClue(text, 2);
    this.beginGuessing(2);
  }

  async beginGuessing(round: GuessRound) {
    this.phase = "guessing";
    this.guessRound = round;
    this.guessTurnIndex = 0;
    await this.startGuesserTurn();
  }

  // Advances to whoever's turn it is now; once the whole guessOrder has
  // gone, either moves on to the second clue or resolves the reveal.
  async startGuesserTurn() {
    if (this.guessTurnIndex >= this.guessOrder.length) {
      if (this.guessRound === 1) {
        await this.beginClue2();
      } else {
        await this.resolveReveal();
      }
      return;
    }
    // No limit (the default) means no alarm at all — the turn simply
    // waits for that player to act, same as this codebase's other
    // "no timer" settings.
    if (this.guessDurationMs) {
      this.roundEndsAt = Date.now() + this.guessDurationMs;
      await this.ctx.storage.setAlarm(this.roundEndsAt);
    } else {
      this.roundEndsAt = 0;
      await this.ctx.storage.deleteAlarm();
    }
    this.broadcastGuessTurn();
    this.broadcastPlayers();
  }

  async beginClue2() {
    this.phase = "clue2";
    this.roundEndsAt = Date.now() + CLUE2_DURATION_MS;
    await this.ctx.storage.setAlarm(this.roundEndsAt);

    for (const p of this.players.values()) {
      if (!p.connectionId) continue;
      const conn = this.getConnection(p.connectionId);
      if (conn) conn.send(JSON.stringify(this.clue2Payload(p.id)));
    }
    this.broadcastPlayers();
  }

  clue2Payload(forPlayerId: string) {
    return {
      type: "clue2-start",
      round: this.turnIndex + 1,
      totalRounds: this.playerOrder.length,
      isClueGiver: forPlayerId === this.clueGiverId(),
      clue1: this.clue1,
      durationMs: CLUE2_DURATION_MS,
      endsAt: this.roundEndsAt,
    };
  }

  pinsForRound(round: GuessRound) {
    const map = round === 1 ? this.guesses1 : this.guesses2;
    return [...map.entries()].map(([id, cell]) => ({
      id,
      name: this.players.get(id)?.name ?? "?",
      col: cell.col,
      row: cell.row,
    }));
  }

  guessTurnPayload() {
    return {
      type: "guess-turn",
      round: this.turnIndex + 1,
      totalRounds: this.playerOrder.length,
      guessRound: this.guessRound,
      order: this.guessOrder.map((id) => ({ id, name: this.players.get(id)?.name ?? "?" })),
      turnIndex: this.guessTurnIndex,
      guesserId: this.guessOrder[this.guessTurnIndex] ?? null,
      clue1: this.clue1,
      clue2: this.clue2,
      round1Pins: this.pinsForRound(1),
      round2Pins: this.guessRound === 2 ? this.pinsForRound(2) : [],
      durationMs: this.guessDurationMs,
      endsAt: this.roundEndsAt || null,
    };
  }

  broadcastGuessTurn() {
    this.broadcast(JSON.stringify(this.guessTurnPayload()));
  }

  // Only the player whose turn it currently is may place a guess, and only
  // on a cell nobody else has already claimed this turn (a player may
  // re-confirm their OWN earlier cell — e.g. keeping the same guess 2 —
  // but never take someone else's).
  submitGuess(connection: Connection, cell: Cell) {
    if (this.phase !== "guessing") return;
    const playerId = this.playerFor(connection)?.id;
    if (!playerId || playerId !== this.guessOrder[this.guessTurnIndex]) return;
    if (!isValidCell(cell)) return;

    const key = cellKey(cell);
    const owner = this.occupiedCells.get(key);
    if (owner && owner !== playerId) return;

    this.occupiedCells.set(key, playerId);
    const map = this.guessRound === 1 ? this.guesses1 : this.guesses2;
    map.set(playerId, cell);

    this.guessTurnIndex += 1;
    this.startGuesserTurn();
  }

  async onAlarm() {
    if (this.phase === "turn") await this.forceResolveTurn();
    else if (this.phase === "clue2") await this.forceResolveClue2();
    else if (this.phase === "guessing") await this.forceSkipGuesser();
  }

  // The clue-giver ran out of time — fall back to a random one of their
  // own card options (or no clue) rather than softlocking the round.
  async forceResolveTurn() {
    if (!this.targetCell) {
      this.targetCell = this.cardOptions[Math.floor(Math.random() * this.cardOptions.length)] ?? randomCell();
    }
    if (!this.clue1) this.clue1 = "(no clue)";
    await this.beginGuessing(1);
  }

  async forceResolveClue2() {
    if (!this.clue2) this.clue2 = "(no clue)";
    await this.beginGuessing(2);
  }

  // Whoever's turn it was just gets skipped — same safety net as every
  // other alarm in this game, just scoped to one player's turn instead of
  // the whole round.
  async forceSkipGuesser() {
    this.guessTurnIndex += 1;
    await this.startGuesserTurn();
  }

  async resolveReveal() {
    await this.ctx.storage.deleteAlarm();
    const target = this.targetCell;
    const clueGiverId = this.clueGiverId();

    const results: {
      id: string;
      name: string;
      col: number | null;
      row: number | null;
      distance: number | null;
      points: number;
      isClueGiver?: boolean;
    }[] = [];
    // The clue-giver earns 1 point per final guess landing within 1 cell
    // of their target, rewarding clues that steer everyone close.
    let clueGiverPoints = 0;
    for (const id of this.guessOrder) {
      const player = this.players.get(id);
      if (!player) continue;
      // Score the final guess; fall back to guess 1 if they never got a
      // second guess in (disconnected, skipped) rather than scoring 0 for
      // what might still have been a perfectly good first guess.
      const finalGuess = this.guesses2.get(id) ?? this.guesses1.get(id) ?? null;
      if (!finalGuess || !target) {
        results.push({ id, name: player.name, col: null, row: null, distance: null, points: 0 });
        continue;
      }
      const distance = chebyshevDistance(finalGuess, target);
      const points = pointsForDistance(distance);
      player.score += points;
      if (distance <= 1) clueGiverPoints += 1;
      results.push({ id, name: player.name, col: finalGuess.col, row: finalGuess.row, distance, points });
    }

    const clueGiver = this.players.get(clueGiverId ?? "");
    if (clueGiver) {
      clueGiver.score += clueGiverPoints;
      results.push({
        id: clueGiver.id,
        name: clueGiver.name,
        col: null,
        row: null,
        distance: null,
        points: clueGiverPoints,
        isClueGiver: true,
      });
    }

    this.phase = "reveal";
    for (const p of this.players.values()) p.ready = false;

    this.broadcast(
      JSON.stringify({
        type: "reveal",
        round: this.turnIndex + 1,
        totalRounds: this.playerOrder.length,
        target,
        clue1: this.clue1,
        clue2: this.clue2,
        clueGiverName: this.players.get(clueGiverId ?? "")?.name ?? "?",
        round1Pins: this.pinsForRound(1),
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
    const player = this.playerFor(connection);
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

  // Only currently-connected players need to confirm "continue" — someone
  // who disconnected and never came back doesn't stall the rest of the
  // table forever.
  checkAllReadyToContinue() {
    const connectedPlayers = [...this.players.values()].filter((p) => p.connected);
    if (connectedPlayers.length === 0) return;
    const allReady = connectedPlayers.every((p) => p.ready);
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
    this.clue1 = "";
    this.clue2 = "";
    this.guessOrder = [];
    this.guessTurnIndex = 0;
    this.guessRound = 1;
    this.guesses1 = new Map();
    this.guesses2 = new Map();
    this.occupiedCells = new Map();
    // Anyone who never came back by the time the table resets doesn't
    // linger in the next lobby.
    for (const [id, p] of this.players) {
      if (!p.connected) this.players.delete(id);
    }
    for (const p of this.players.values()) {
      p.ready = false;
      p.score = 0;
    }
    this.broadcast(JSON.stringify({ type: "lobby" }));
    this.broadcastPlayers();
  }

  sendStateTo(connection: Connection) {
    const player = this.playerFor(connection);
    if (!player) return;

    if (this.phase === "turn") {
      this.sendTurnStateTo(connection, player.id);
    } else if (this.phase === "clue2") {
      connection.send(JSON.stringify(this.clue2Payload(player.id)));
    } else if (this.phase === "guessing") {
      connection.send(JSON.stringify(this.guessTurnPayload()));
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
        settings: { guessDurationMs: this.guessDurationMs },
        clueGiverId: this.phase === "lobby" || this.phase === "final" ? null : this.clueGiverId(),
        players: [...this.players.values()].map((p) => ({
          id: p.id,
          name: p.name,
          isHost: p.isHost,
          connected: p.connected,
          ready: p.ready,
          score: p.score,
        })),
      })
    );
  }
}
