import {
  Server,
  type Connection,
  type ConnectionContext,
  type WSMessage,
} from "partyserver";
import prompts from "../../public/games/telestrations/prompts.json";

// Phase 1: the full chain-rotation engine (rotation math, private per-turn
// delivery, alarm-forced placeholders, host-paced reveal, voting), played
// with plain text standing in for drawings. The canvas itself — and
// swapping these text entries for drawn ones — lands in a later phase; the
// message shapes here are already close to what that will need.

type Phase = "lobby" | "playing" | "reveal" | "results";

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 8;
const ROUND_DURATION_MS = 60_000;

type Entry = { text: string };
type Chain = { entries: Entry[] };

type Player = {
  id: string;
  name: string;
  isHost: boolean;
  connected: boolean;
  ready: boolean;
  submitted: boolean;
};

function pickPrompt(): string {
  const i = Math.floor(Math.random() * prompts.length);
  let j = Math.floor(Math.random() * prompts.length);
  while (j === i) j = Math.floor(Math.random() * prompts.length);
  return `${prompts[i]} ${prompts[j]}`;
}

export default class Telestrations extends Server {
  players = new Map<string, Player>();
  phase: Phase = "lobby";

  // Frozen at game start — the whole rotation formula below is keyed off
  // these ids, so this array must never change once a game is running.
  playerOrder: string[] = [];
  chains: Chain[] = [];
  round = 0; // 1..N-1 while playing
  roundEndsAt = 0;
  submittedIds = new Set<string>();

  revealIndex = 0;
  votesByChain: number[] = [];
  votedForCurrent = new Set<string>();

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
        submitted: false,
      });
    }

    connection.send(JSON.stringify({ type: "you", id: connection.id }));
    this.sendStateTo(connection);
    this.broadcastPlayers();
  }

  onClose(connection: Connection) {
    const player = this.players.get(connection.id);
    if (!player) return;

    // Once playerOrder is frozen, the rotation math is keyed off these ids
    // forever — deleting the record on close (like the other games do)
    // would permanently orphan that seat. Mark it disconnected instead,
    // and drop isHost so a reloading host can reclaim the role through
    // the normal onConnect check rather than being locked out.
    if (this.phase === "lobby") {
      this.players.delete(connection.id);
    } else {
      player.connected = false;
      player.isHost = false;
    }
    this.broadcastPlayers();
    this.checkAllSubmitted();
  }

  onMessage(connection: Connection, message: WSMessage) {
    if (typeof message !== "string") return;
    let data: { type?: string; text?: string };
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

    if (data.type === "start") {
      this.startGame(connection);
    } else if (data.type === "ready") {
      this.handleReady(connection);
    } else if (data.type === "submit" && typeof data.text === "string") {
      this.submitEntry(connection, data.text);
    } else if (data.type === "vote") {
      this.castVote(connection);
    } else if (data.type === "next-chain") {
      this.nextChain(connection);
    } else if (data.type === "reset") {
      this.resetToLobby(connection);
    }
  }

  hasHost(): boolean {
    return [...this.players.values()].some((p) => p.isHost);
  }

  startGame(connection: Connection) {
    const host = this.players.get(connection.id);
    if (!host?.isHost) return;
    if (this.phase !== "lobby") return;
    if (this.players.size < MIN_PLAYERS || this.players.size > MAX_PLAYERS) return;

    this.playerOrder = [...this.players.keys()];
    this.chains = this.playerOrder.map(() => ({ entries: [{ text: pickPrompt() }] }));
    for (const p of this.players.values()) p.ready = false;
    this.beginRound(1);
  }

  async beginRound(round: number) {
    this.round = round;
    this.phase = "playing";
    this.submittedIds = new Set();
    for (const p of this.players.values()) p.submitted = false;
    this.roundEndsAt = Date.now() + ROUND_DURATION_MS;
    await this.ctx.storage.setAlarm(this.roundEndsAt);

    for (const p of this.players.values()) {
      const conn = this.getConnection(p.id);
      if (conn) this.sendRoundTo(conn, p.id);
    }
    this.broadcastPlayers();
  }

  // Round r asks playerOrder[i] to respond to chains[(i - r) mod N]'s entry
  // at index r-1, and their response becomes that chain's entry r. This is
  // a bijection every round: every chain gets exactly one player, every
  // player gets exactly one chain.
  chainIndexFor(playerId: string, round: number): number | null {
    const i = this.playerOrder.indexOf(playerId);
    if (i === -1) return null;
    const n = this.playerOrder.length;
    return (((i - round) % n) + n) % n;
  }

  // Content differs for every player every round, so (unlike the broadcast-
  // heavy games) this has to go out as individual private sends.
  sendRoundTo(connection: Connection, playerId: string) {
    const chainIndex = this.chainIndexFor(playerId, this.round);
    if (chainIndex === null) return;
    const chain = this.chains[chainIndex];
    const promptText = chain.entries[this.round - 1]?.text ?? "";
    const kind = this.round % 2 === 1 ? "draw" : "guess";
    const totalRounds = this.playerOrder.length - 1;

    connection.send(
      JSON.stringify({
        type: "round-start",
        round: this.round,
        totalRounds,
        kind,
        promptText,
        durationMs: ROUND_DURATION_MS,
        endsAt: this.roundEndsAt,
      })
    );
  }

  submitEntry(connection: Connection, text: string) {
    if (this.phase !== "playing") return;
    const player = this.players.get(connection.id);
    if (!player || this.submittedIds.has(player.id)) return;
    const chainIndex = this.chainIndexFor(player.id, this.round);
    if (chainIndex === null) return;

    this.chains[chainIndex].entries[this.round] = {
      text: text.trim().slice(0, 140) || "(blank)",
    };
    this.submittedIds.add(player.id);
    player.submitted = true;
    this.broadcastPlayers();
    this.checkAllSubmitted();
  }

  // Checked against the frozen seat list, not however many players are
  // currently connected — a disconnected seat still owes a submission, and
  // the alarm (not this check) is what fills it in with a placeholder.
  checkAllSubmitted() {
    if (this.phase !== "playing") return;
    if (this.playerOrder.length === 0) return;
    const allSubmitted = this.playerOrder.every((id) => this.submittedIds.has(id));
    if (allSubmitted) this.resolveRound();
  }

  async onAlarm() {
    if (this.phase === "playing") await this.resolveRound();
  }

  async resolveRound() {
    await this.ctx.storage.deleteAlarm();

    // Anyone who never submitted (AFK, disconnected, or just too slow) gets
    // a placeholder so one stalled seat can't softlock every chain.
    for (const id of this.playerOrder) {
      if (this.submittedIds.has(id)) continue;
      const chainIndex = this.chainIndexFor(id, this.round);
      if (chainIndex === null) continue;
      this.chains[chainIndex].entries[this.round] = { text: "(no answer)" };
    }

    const totalRounds = this.playerOrder.length - 1;
    if (this.round >= totalRounds) {
      this.beginReveal();
    } else {
      await this.beginRound(this.round + 1);
    }
  }

  beginReveal() {
    this.phase = "reveal";
    this.revealIndex = 0;
    this.votesByChain = this.chains.map(() => 0);
    this.votedForCurrent = new Set();
    this.broadcastRevealChain();
    this.broadcastPlayers();
  }

  chainEntriesForReveal(chainIndex: number) {
    const chain = this.chains[chainIndex];
    const n = this.playerOrder.length;
    return chain.entries.map((entry, idx) => {
      const authorId = this.playerOrder[(chainIndex + idx) % n];
      return { text: entry.text, authorName: this.players.get(authorId)?.name ?? "?" };
    });
  }

  broadcastRevealChain() {
    if (!this.chains[this.revealIndex]) return;
    this.broadcast(
      JSON.stringify({
        type: "reveal-chain",
        chainIndex: this.revealIndex,
        totalChains: this.chains.length,
        entries: this.chainEntriesForReveal(this.revealIndex),
      })
    );
  }

  castVote(connection: Connection) {
    if (this.phase !== "reveal") return;
    const player = this.players.get(connection.id);
    if (!player || this.votedForCurrent.has(player.id)) return;
    this.votedForCurrent.add(player.id);
    this.votesByChain[this.revealIndex] = (this.votesByChain[this.revealIndex] ?? 0) + 1;
    this.broadcast(
      JSON.stringify({
        type: "vote-progress",
        votedCount: this.votedForCurrent.size,
        total: this.players.size,
      })
    );
  }

  nextChain(connection: Connection) {
    const host = this.players.get(connection.id);
    if (!host?.isHost) return;
    if (this.phase !== "reveal") return;

    if (this.revealIndex >= this.chains.length - 1) {
      this.beginResults();
    } else {
      this.revealIndex += 1;
      this.votedForCurrent = new Set();
      this.broadcastRevealChain();
    }
  }

  rankedChains() {
    return this.chains
      .map((_, chainIndex) => ({
        chainIndex,
        votes: this.votesByChain[chainIndex] ?? 0,
        entries: this.chainEntriesForReveal(chainIndex),
      }))
      .sort((a, b) => b.votes - a.votes);
  }

  beginResults() {
    this.phase = "results";
    this.broadcast(JSON.stringify({ type: "results", chains: this.rankedChains() }));
    this.broadcastPlayers();
  }

  // Lobby-only toggle, same as the other games' optional "I'm paying
  // attention" signal — the host can still start regardless.
  handleReady(connection: Connection) {
    if (this.phase !== "lobby") return;
    const player = this.players.get(connection.id);
    if (!player || player.isHost) return;
    player.ready = !player.ready;
    this.broadcastPlayers();
  }

  resetToLobby(connection: Connection) {
    const host = this.players.get(connection.id);
    if (!host?.isHost) return;

    this.phase = "lobby";
    this.playerOrder = [];
    this.chains = [];
    this.round = 0;
    this.revealIndex = 0;
    this.votesByChain = [];
    this.votedForCurrent = new Set();
    this.submittedIds = new Set();
    for (const p of this.players.values()) {
      p.ready = false;
      p.submitted = false;
    }
    this.broadcast(JSON.stringify({ type: "lobby" }));
    this.broadcastPlayers();
  }

  sendStateTo(connection: Connection) {
    const player = this.players.get(connection.id);
    if (!player) return;

    if (this.phase === "playing") {
      this.sendRoundTo(connection, player.id);
    } else if (this.phase === "reveal" && this.chains[this.revealIndex]) {
      connection.send(
        JSON.stringify({
          type: "reveal-chain",
          chainIndex: this.revealIndex,
          totalChains: this.chains.length,
          entries: this.chainEntriesForReveal(this.revealIndex),
        })
      );
    } else if (this.phase === "results") {
      connection.send(JSON.stringify({ type: "results", chains: this.rankedChains() }));
    }
  }

  broadcastPlayers() {
    this.broadcast(
      JSON.stringify({
        type: "players",
        phase: this.phase,
        minPlayers: MIN_PLAYERS,
        maxPlayers: MAX_PLAYERS,
        players: [...this.players.values()].map((p) => ({
          id: p.id,
          name: p.name,
          isHost: p.isHost,
          connected: p.connected,
          ready: p.ready,
          submitted: p.submitted,
        })),
      })
    );
  }
}
