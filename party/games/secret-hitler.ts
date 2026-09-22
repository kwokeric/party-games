import { Server, type Connection, type ConnectionContext, type WSMessage } from "partyserver";

// Phase 1: role assignment and the private reveal only — everything after
// that (nominations, voting, the legislative session) still happens
// verbally at the table, same as the physical game. This party's whole job
// is dealing roles fairly and pushing each player ONLY their own role over
// their own socket — the secrecy is the entire point, so nothing here ever
// broadcasts a role to everyone.

type Role = "liberal" | "fascist" | "hitler";
type Phase = "lobby" | "reveal" | "table";

const MIN_PLAYERS = 5;
const MAX_PLAYERS = 10;

// Fascist count here excludes Hitler. hitlerKnowsTeam mirrors the real
// game's rule: in a 5-6 player game there's only one other fascist to hide,
// so Hitler is told the team; in 7+ player games Hitler stays in the dark,
// same as the liberals.
const ROLE_TABLE: Record<number, { liberal: number; fascist: number; hitlerKnowsTeam: boolean }> = {
  5: { liberal: 3, fascist: 1, hitlerKnowsTeam: true },
  6: { liberal: 4, fascist: 1, hitlerKnowsTeam: true },
  7: { liberal: 4, fascist: 2, hitlerKnowsTeam: false },
  8: { liberal: 5, fascist: 2, hitlerKnowsTeam: false },
  9: { liberal: 5, fascist: 3, hitlerKnowsTeam: false },
  10: { liberal: 6, fascist: 3, hitlerKnowsTeam: false },
};

type Player = {
  id: string;
  name: string;
  isHost: boolean;
  ready: boolean;
  role: Role | null;
};

function shuffle<T>(items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default class SecretHitler extends Server {
  players = new Map<string, Player>();
  phase: Phase = "lobby";
  hitlerKnowsTeam = false;

  onConnect(connection: Connection, ctx: ConnectionContext) {
    const url = new URL(ctx.request.url);
    const isHost = url.searchParams.get("host") === "1" && !this.hasHost();
    const requestedName = url.searchParams.get("name")?.trim().slice(0, 20);

    this.players.set(connection.id, {
      id: connection.id,
      name: requestedName || `Player ${this.players.size + 1}`,
      isHost,
      ready: false,
      role: null,
    });

    connection.send(JSON.stringify({ type: "you", id: connection.id }));
    this.sendStateTo(connection);
    this.broadcastPlayers();
  }

  onClose(connection: Connection) {
    this.players.delete(connection.id);
    this.broadcastPlayers();
    this.checkAllReady();
  }

  onMessage(connection: Connection, message: WSMessage) {
    if (typeof message !== "string") return;
    let data: { type?: string; chancellorId?: string };
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

    if (data.type === "deal") {
      this.dealRoles(connection);
    } else if (data.type === "ready") {
      this.handleReady(connection);
    } else if (data.type === "reset") {
      this.resetToLobby(connection);
    } else if (data.type === "check-hitler" && typeof data.chancellorId === "string") {
      this.checkHitler(connection, data.chancellorId);
    }
  }

  // The board/nomination/voting mockup runs entirely on the asking
  // player's own device — it never learns anyone's role except its own.
  // This is the one place it needs a real answer instead of a guess: once
  // 3+ Fascist policies are in, electing Hitler as Chancellor ends the
  // game outright, and only the server (which actually dealt the roles)
  // can say for sure. Answering true/false rather than the full role
  // keeps this from doubling as a general "what's their role" query.
  checkHitler(connection: Connection, chancellorId: string) {
    const chancellor = this.players.get(chancellorId);
    connection.send(
      JSON.stringify({
        type: "hitler-check-result",
        chancellorId,
        isHitler: chancellor?.role === "hitler",
      })
    );
  }

  hasHost(): boolean {
    return [...this.players.values()].some((p) => p.isHost);
  }

  // Only the host deals, only from the lobby, and only with a supported
  // headcount — mirrors the other games' "only the host, only from the
  // lobby" gate on starting.
  dealRoles(connection: Connection) {
    const host = this.players.get(connection.id);
    if (!host?.isHost) return;
    if (this.phase !== "lobby") return;

    const table = ROLE_TABLE[this.players.size];
    if (!table) return;

    const everyoneElseReady = [...this.players.values()].filter((p) => !p.isHost).every((p) => p.ready);
    if (!everyoneElseReady) return;

    const order = shuffle([...this.players.keys()]);
    const roleById = new Map<string, Role>();
    let idx = 0;
    roleById.set(order[idx++], "hitler");
    for (let i = 0; i < table.fascist; i++) roleById.set(order[idx++], "fascist");
    for (let i = 0; i < table.liberal; i++) roleById.set(order[idx++], "liberal");

    this.hitlerKnowsTeam = table.hitlerKnowsTeam;
    for (const p of this.players.values()) {
      p.role = roleById.get(p.id) ?? null;
      p.ready = false;
    }
    this.phase = "reveal";

    for (const p of this.players.values()) {
      const conn = this.getConnection(p.id);
      if (conn) this.sendRoleTo(conn, p);
    }
    this.broadcastPlayers();
  }

  fascistTeammates(excludeId: string): { name: string; role: Role }[] {
    return [...this.players.values()]
      .filter((p) => p.id !== excludeId && (p.role === "fascist" || p.role === "hitler"))
      .map((p) => ({ name: p.name, role: p.role as Role }));
  }

  sendRoleTo(connection: Connection, player: Player) {
    if (!player.role) return;
    const teammates =
      player.role === "fascist" || (player.role === "hitler" && this.hitlerKnowsTeam)
        ? this.fascistTeammates(player.id)
        : [];
    const hidden = player.role === "hitler" && !this.hitlerKnowsTeam;

    connection.send(JSON.stringify({ type: "role", role: player.role, teammates, hidden }));
  }

  // In the lobby this is an optional "I'm paying attention" toggle for
  // non-host players (the host can deal regardless, same as other games'
  // host-gated start). During the reveal it's one-way: once everyone has
  // confirmed they've seen their role, the table moves on to playing it out
  // in person.
  handleReady(connection: Connection) {
    const player = this.players.get(connection.id);
    if (!player) return;

    if (this.phase === "lobby") {
      if (player.isHost) return;
      player.ready = !player.ready;
      this.broadcastPlayers();
      return;
    }

    if (this.phase === "reveal") {
      if (player.ready) return;
      player.ready = true;
      this.broadcastPlayers();
      this.checkAllReady();
    }
  }

  checkAllReady() {
    if (this.phase !== "reveal") return;
    if (this.players.size === 0) return;
    const allReady = [...this.players.values()].every((p) => p.ready);
    if (!allReady) return;

    this.phase = "table";
    this.broadcast(JSON.stringify({ type: "table" }));
    this.broadcastPlayers();
  }

  // Ends the current deal and returns everyone to the lobby so the host can
  // deal again — there's no "game over" state yet since nominations/voting/
  // legislating aren't built, so this is how a table wraps up a round.
  resetToLobby(connection: Connection) {
    const host = this.players.get(connection.id);
    if (!host?.isHost) return;

    this.phase = "lobby";
    for (const p of this.players.values()) {
      p.role = null;
      p.ready = false;
    }
    this.broadcast(JSON.stringify({ type: "lobby" }));
    this.broadcastPlayers();
  }

  sendStateTo(connection: Connection) {
    const player = this.players.get(connection.id);
    if (!player) return;

    if (this.phase === "reveal" && player.role) {
      this.sendRoleTo(connection, player);
    } else if (this.phase === "table") {
      connection.send(JSON.stringify({ type: "table" }));
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
          ready: p.ready,
        })),
      })
    );
  }
}
