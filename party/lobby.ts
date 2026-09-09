import { Server } from "partyserver";
import { GAMES } from "../public/shared/games.js";

// The lobby is a single global room ("global") that maps room codes to the
// game they belong to, so a player who only knows a code can be routed to
// the right game. Per-game realtime state lives in that game's own party.

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I ambiguity
const CODE_LENGTH = 4;

function randomCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

type RoomEntry = { gameId: string; createdAt: number };

export default class Lobby extends Server {
  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname.endsWith("/create")) {
      const body = (await request.json()) as { gameId?: string };
      const game = GAMES.find((g) => g.id === body.gameId);
      if (!game) {
        return Response.json({ error: "unknown game" }, { status: 400 });
      }

      let code = randomCode();
      while (await this.ctx.storage.get<RoomEntry>(code)) {
        code = randomCode();
      }
      const entry: RoomEntry = { gameId: game.id, createdAt: Date.now() };
      await this.ctx.storage.put(code, entry);

      return Response.json({ code, gameId: game.id });
    }

    if (request.method === "GET" && url.pathname.endsWith("/lookup")) {
      const code = url.searchParams.get("code")?.trim().toUpperCase();
      if (!code) {
        return Response.json({ error: "missing code" }, { status: 400 });
      }
      const entry = await this.ctx.storage.get<RoomEntry>(code);
      if (!entry) {
        return Response.json({ error: "room not found" }, { status: 404 });
      }
      return Response.json(entry);
    }

    return new Response("Not found", { status: 404 });
  }
}
