import { Server, type Connection, type ConnectionContext, type WSMessage } from "partyserver";
import words from "../../public/games/imposter/words.json";

// Everyone but the imposter(s) privately gets the same secret word; the
// imposter gets only a loosely related hint (if the host allows it). The
// one-word clues go around the table in person — this party only deals the
// words, collects everyone's vote, and holds the answer until the vote is
// in. Same secrecy rule as Secret Hitler: a player's word is only ever
// sent over their own socket, and nothing broadcast to everyone says who
// the imposter is until results.

type Phase = "lobby" | "reveal" | "voting" | "results";

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 12;

type WordEntry = { word: string; hint: string };
type Category = { id: string; name: string; words: WordEntry[] };

const CATEGORIES = words.categories as Category[];
const CATEGORY_IDS = CATEGORIES.map((c) => c.id);
// What the lobby's category chips need — names only, never the words.
const CATEGORY_LIST = CATEGORIES.map(({ id, name }) => ({ id, name }));

// Roughly one imposter per 3-4 players: 1 for 3-6, 2 for 7-9, 3 for 10-12.
// Must match maxImposters() in the client.
function maxImposters(playerCount: number): number {
  return Math.max(1, Math.floor((playerCount - 1) / 3));
}

type Settings = {
  imposterCount: number;
  imposterHint: boolean;
  showCategory: boolean;
  categories: string[];
};

type Player = {
  id: string;
  // The connection currently live for this player, or null while they're
  // disconnected. Never used as the player's identity — connections come
  // and go on reconnect, this.players is keyed by the stable id instead.
  connectionId: string | null;
  connected: boolean;
  name: string;
  isHost: boolean;
  // Lobby only: non-host players ready up before the host can start.
  ready: boolean;
  seen: boolean;
  vote: string | null;
};

type Results = {
  tally: { id: string; votes: number }[];
  votedOutId: string | null;
  caught: boolean;
  imposterIds: string[];
  word: string;
  hint: string;
  category: string;
};

function shuffle<T>(items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default class Imposter extends Server {
  players = new Map<string, Player>();
  // Maps a live connection id to the stable player id that owns it, so a
  // reconnect (which always arrives as a brand new connection) can be
  // reattached to the same player record instead of creating a new one.
  connIndex = new Map<string, string>();
  phase: Phase = "lobby";

  settings: Settings = {
    imposterCount: 1,
    imposterHint: true,
    showCategory: true,
    categories: [...CATEGORY_IDS],
  };

  // Who was dealt into the current round. Anyone who joins mid-round
  // waits it out and gets dealt in on the next one.
  roster: string[] = [];
  imposterIds = new Set<string>();
  entry: WordEntry | null = null;
  categoryName = "";
  firstPlayerId: string | null = null;
  results: Results | null = null;
  // Words already played in this room, so back-to-back rounds don't repeat
  // until the selected categories run dry.
  usedWords = new Set<string>();

  onConnect(connection: Connection, ctx: ConnectionContext) {
    const url = new URL(ctx.request.url);
    // The client mints and persists this in sessionStorage per room, so a
    // page refresh reconnects as the SAME player and gets their word
    // replayed instead of landing back in the lobby.
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
        connected: true,
        name: requestedName || `Player ${this.players.size + 1}`,
        isHost,
        ready: false,
        seen: false,
        vote: null,
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

    if (this.phase === "lobby") {
      this.players.delete(pid);
    } else {
      player.connectionId = null;
      player.connected = false;
    }
    this.broadcastPlayers();
    // Someone leaving can be the last thing a phase was waiting on.
    this.checkAllSeen();
    this.checkAllVoted();
  }

  onMessage(connection: Connection, message: WSMessage) {
    if (typeof message !== "string") return;
    let data: { type?: string; settings?: Partial<Settings>; targetId?: string };
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

    if (data.type === "settings" && data.settings) {
      this.updateSettings(connection, data.settings);
    } else if (data.type === "ready") {
      this.toggleReady(connection);
    } else if (data.type === "start") {
      this.start(connection);
    } else if (data.type === "seen") {
      this.handleSeen(connection);
    } else if (data.type === "vote" && typeof data.targetId === "string") {
      this.handleVote(connection, data.targetId);
    } else if (data.type === "play-again") {
      this.playAgain(connection);
    } else if (data.type === "reset") {
      this.resetToLobby(connection);
    }
  }

  // A disconnected host can't send anything, so excluding them lets a
  // different player claim host via ?host=1 if the original never returns —
  // while a matching reconnect (same pid) restores the original's own
  // isHost flag untouched, since it's never cleared on disconnect.
  hasHost(): boolean {
    return [...this.players.values()].some((p) => p.isHost && p.connected);
  }

  // Only the host, and only from the lobby. Each field is validated on its
  // own so a partial update never clobbers the rest. imposterCount is only
  // range-checked loosely here — it's clamped to the headcount at deal time,
  // since players can still join or leave after it's set.
  updateSettings(connection: Connection, next: Partial<Settings>) {
    const player = this.playerFor(connection);
    if (!player?.isHost) return;
    if (this.phase !== "lobby") return;

    if (typeof next.imposterCount === "number" && Number.isInteger(next.imposterCount)) {
      this.settings.imposterCount = Math.min(maxImposters(MAX_PLAYERS), Math.max(1, next.imposterCount));
    }
    if (typeof next.imposterHint === "boolean") this.settings.imposterHint = next.imposterHint;
    if (typeof next.showCategory === "boolean") this.settings.showCategory = next.showCategory;
    if (Array.isArray(next.categories)) {
      this.settings.categories = CATEGORY_IDS.filter((id) => next.categories!.includes(id));
    }
    this.broadcastPlayers();
  }

  // Non-host players only — the host's "ready" is pressing Start.
  toggleReady(connection: Connection) {
    const player = this.playerFor(connection);
    if (!player || player.isHost || this.phase !== "lobby") return;
    player.ready = !player.ready;
    this.broadcastPlayers();
  }

  // Only the host, only from the lobby, and only once every other player
  // has readied up — same gate as Secret Hitler and Hues and Clues.
  start(connection: Connection) {
    const host = this.playerFor(connection);
    if (!host?.isHost) return;
    if (this.phase !== "lobby") return;
    const everyoneElseReady = [...this.players.values()].filter((p) => !p.isHost).every((p) => p.ready);
    if (!everyoneElseReady) return;
    this.deal();
  }

  playAgain(connection: Connection) {
    const host = this.playerFor(connection);
    if (!host?.isHost) return;
    if (this.phase !== "results") return;
    this.deal();
  }

  // Deals a fresh round to everyone currently connected — used both from
  // the lobby and straight from results ("Play again"), which keeps the
  // same settings and skips the lobby entirely.
  deal() {
    this.dropDisconnected();
    const ids = [...this.players.keys()];
    if (ids.length < MIN_PLAYERS || ids.length > MAX_PLAYERS) return;
    if (this.settings.categories.length === 0) return;

    const pool = CATEGORIES.filter((c) => this.settings.categories.includes(c.id)).flatMap((c) =>
      c.words.map((w) => ({ ...w, category: c.name }))
    );
    let fresh = pool.filter((w) => !this.usedWords.has(w.word));
    if (fresh.length === 0) {
      for (const w of pool) this.usedWords.delete(w.word);
      fresh = pool;
    }
    const pick = fresh[Math.floor(Math.random() * fresh.length)];
    this.usedWords.add(pick.word);

    this.roster = ids;
    this.entry = { word: pick.word, hint: pick.hint };
    this.categoryName = pick.category;
    const count = Math.min(this.settings.imposterCount, maxImposters(ids.length));
    this.imposterIds = new Set(shuffle(ids).slice(0, count));
    // Picked independently of the imposters, so going first says nothing
    // about who the imposter is.
    this.firstPlayerId = ids[Math.floor(Math.random() * ids.length)];
    this.results = null;
    for (const p of this.players.values()) {
      p.ready = false;
      p.seen = false;
      p.vote = null;
    }
    this.phase = "reveal";

    for (const p of this.players.values()) {
      if (!p.connectionId) continue;
      const conn = this.getConnection(p.connectionId);
      if (conn) this.sendWordTo(conn, p);
    }
    this.broadcastPlayers();
  }

  sendWordTo(connection: Connection, player: Player) {
    if (!this.entry || !this.roster.includes(player.id)) return;
    const isImposter = this.imposterIds.has(player.id);
    connection.send(
      JSON.stringify({
        type: "word",
        isImposter,
        word: isImposter ? null : this.entry.word,
        hint: isImposter && this.settings.imposterHint ? this.entry.hint : null,
        category: this.settings.showCategory ? this.categoryName : null,
        firstPlayerId: this.firstPlayerId,
      })
    );
  }

  handleSeen(connection: Connection) {
    const player = this.playerFor(connection);
    if (!player || this.phase !== "reveal" || !this.roster.includes(player.id)) return;
    if (player.seen) return;
    player.seen = true;
    this.broadcastPlayers();
    this.checkAllSeen();
  }

  // Only connected players hold things up, so someone who drops mid-round
  // doesn't stall the table — a reconnect still gets their word replayed
  // and can vote if voting is still open.
  connectedRoster(): Player[] {
    return this.roster.map((id) => this.players.get(id)).filter((p): p is Player => Boolean(p?.connected));
  }

  checkAllSeen() {
    if (this.phase !== "reveal") return;
    const live = this.connectedRoster();
    if (live.length === 0 || !live.every((p) => p.seen)) return;
    this.phase = "voting";
    this.broadcastPlayers();
  }

  // One vote per player, final once cast, and never for yourself.
  handleVote(connection: Connection, targetId: string) {
    const voter = this.playerFor(connection);
    if (!voter || this.phase !== "voting") return;
    if (!this.roster.includes(voter.id) || !this.roster.includes(targetId)) return;
    if (targetId === voter.id || voter.vote) return;
    voter.vote = targetId;
    this.broadcastPlayers();
    this.checkAllVoted();
  }

  checkAllVoted() {
    if (this.phase !== "voting") return;
    const live = this.connectedRoster();
    if (live.length === 0 || !live.every((p) => p.vote)) return;

    const counts = new Map<string, number>(this.roster.map((id) => [id, 0]));
    for (const id of this.roster) {
      const vote = this.players.get(id)?.vote;
      if (vote) counts.set(vote, (counts.get(vote) ?? 0) + 1);
    }
    const tally = [...counts]
      .map(([id, votes]) => ({ id, votes }))
      .sort((a, b) => b.votes - a.votes);
    const top = tally[0]?.votes ?? 0;
    const leaders = tally.filter((t) => t.votes === top);
    // A tie for the most votes means nobody is voted out — the imposter
    // slips away.
    const votedOutId = top > 0 && leaders.length === 1 ? leaders[0].id : null;

    this.results = {
      tally,
      votedOutId,
      caught: votedOutId !== null && this.imposterIds.has(votedOutId),
      imposterIds: [...this.imposterIds],
      word: this.entry?.word ?? "",
      hint: this.entry?.hint ?? "",
      category: this.categoryName,
    };
    this.phase = "results";
    this.broadcast(JSON.stringify({ type: "results", ...this.results }));
    this.broadcastPlayers();
  }

  resetToLobby(connection: Connection) {
    const host = this.playerFor(connection);
    if (!host?.isHost) return;
    if (this.phase === "lobby") return;

    this.phase = "lobby";
    this.dropDisconnected();
    this.roster = [];
    this.imposterIds = new Set();
    this.entry = null;
    this.results = null;
    for (const p of this.players.values()) {
      p.ready = false;
      p.seen = false;
      p.vote = null;
    }
    this.broadcastPlayers();
  }

  // Anyone who never came back by the next deal doesn't linger into it.
  dropDisconnected() {
    for (const [id, p] of this.players) {
      if (!p.connected) this.players.delete(id);
    }
  }

  sendStateTo(connection: Connection) {
    const player = this.playerFor(connection);
    if (!player) return;
    if (this.phase === "reveal" || this.phase === "voting") {
      this.sendWordTo(connection, player);
    } else if (this.phase === "results" && this.results) {
      this.sendWordTo(connection, player);
      connection.send(JSON.stringify({ type: "results", ...this.results }));
    }
  }

  // Votes are broadcast only as "has voted", never who for — results are
  // the first time anyone sees the tally.
  broadcastPlayers() {
    for (const conn of this.getConnections()) {
      const pid = this.connIndex.get(conn.id);
      const me = pid ? this.players.get(pid) : undefined;
      conn.send(
        JSON.stringify({
          type: "players",
          phase: this.phase,
          minPlayers: MIN_PLAYERS,
          maxPlayers: MAX_PLAYERS,
          settings: this.settings,
          categories: CATEGORY_LIST,
          roster: this.roster,
          myVote: me?.vote ?? null,
          players: [...this.players.values()].map((p) => ({
            id: p.id,
            name: p.name,
            isHost: p.isHost,
            connected: p.connected,
            ready: p.ready,
            seen: p.seen,
            voted: Boolean(p.vote),
          })),
        })
      );
    }
  }
}
