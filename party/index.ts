import { routePartykitRequest } from "partyserver";
import Lobby from "./lobby";
import GuessTheSize from "./games/guess-the-size";
import MatchTheColor from "./games/match-the-color";

export { Lobby, GuessTheSize, MatchTheColor };

// Requests for files under public/ are served directly as static assets
// (configured via wrangler.jsonc `assets`) and never reach this handler.
// Everything else — /parties/:server/:room — is routed to the matching
// Durable Object below.
export default {
  async fetch(request, env) {
    return (
      (await routePartykitRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
