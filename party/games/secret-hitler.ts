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
  // The connection currently live for this player, or null while they're
  // disconnected. Never used as the player's identity — connections come
  // and go on reconnect, this.players is keyed by the stable id instead.
  connectionId: string | null;
  connected: boolean;
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
  // Maps a live connection id to the stable player id that owns it, so a
  // reconnect (which always arrives as a brand new connection) can be
  // reattached to the same player record instead of creating a new one.
  connIndex = new Map<string, string>();
  phase: Phase = "lobby";
  hitlerKnowsTeam = false;

  onConnect(connection: Connection, ctx: ConnectionContext) {
    const url = new URL(ctx.request.url);
    // The client mints and persists this in sessionStorage per room, so a
    // page refresh reconnects as the SAME player instead of a new one — and
    // crucially, re-fetches their already-dealt role instead of landing
    // back in the lobby with no role at all. A connection with no pid (an
    // old cached tab, a non-browser client) falls back to the connection
    // id, same as the old unconditional behavior.
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
        role: null,
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

  // A disconnected host can't send anything, so excluding them lets a
  // different player claim host via ?host=1 if the original never returns —
  // while a matching reconnect (same pid) restores the original's own
  // isHost flag untouched, since it's never cleared on disconnect.
  hasHost(): boolean {
    return [...this.players.values()].some((p) => p.isHost && p.connected);
  }

  // Only the host deals, only from the lobby, and only with a supported
  // headcount — mirrors the other games' "only the host, only from the
  // lobby" gate on starting.
  dealRoles(connection: Connection) {
    const host = this.playerFor(connection);
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
      if (!p.connectionId) continue;
      const conn = this.getConnection(p.connectionId);
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
    const player = this.playerFor(connection);
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

  // Only currently-connected players need to confirm they've seen their
  // role — someone who disconnected mid-reveal doesn't stall the table
  // forever, and a reconnect (same pid) gets their role replayed via
  // sendStateTo and can still ready up normally.
  checkAllReady() {
    if (this.phase !== "reveal") return;
    const connectedPlayers = [...this.players.values()].filter((p) => p.connected);
    if (connectedPlayers.length === 0) return;
    const allReady = connectedPlayers.every((p) => p.ready);
    if (!allReady) return;

    this.phase = "table";
    this.broadcast(JSON.stringify({ type: "table" }));
    this.broadcastPlayers();
  }

  // Ends the current deal and returns everyone to the lobby so the host can
  // deal again — there's no "game over" state yet since nominations/voting/
  // legislating aren't built, so this is how a table wraps up a round.
  resetToLobby(connection: Connection) {
    const host = this.playerFor(connection);
    if (!host?.isHost) return;

    this.phase = "lobby";
    // Anyone who never came back by the time the table resets doesn't
    // linger in the next lobby.
    for (const [id, p] of this.players) {
      if (!p.connected) this.players.delete(id);
    }
    for (const p of this.players.values()) {
      p.role = null;
      p.ready = false;
    }
    this.broadcast(JSON.stringify({ type: "lobby" }));
    this.broadcastPlayers();
  }

  sendStateTo(connection: Connection) {
    const player = this.playerFor(connection);
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
          connected: p.connected,
          ready: p.ready,
        })),
      })
    );
  }
}
