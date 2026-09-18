## 🎈 party-games

A Jackbox-style games platform: hosts pick a game, create a room, and friends
join with a short room code — no accounts required. Built on
[partyserver](https://github.com/cloudflare/partykit/tree/main/packages/partyserver)
(Cloudflare Durable Objects) for realtime multiplayer, deployed as a single
Cloudflare Worker via [wrangler](https://developers.cloudflare.com/workers/wrangler/).

### Layout

```
party/
  lobby.ts              main party — global room-code registry (create/lookup)
  games/
    guess-the-size.ts   realtime logic for the "Guess the Size" game
    match-the-color.ts  realtime logic for the "Match the Color" game
public/
  index.html, home.js   home page — game picker + join-by-code
  shared/games.js       registry of games, shared by home.js and lobby.ts
  games/guess-the-size/ the "Guess the Size" game's frontend
  games/match-the-color/ the "Match the Color" game's frontend
```

Each game gets its own party file (registered in `partykit.json`'s `parties`
map) and its own folder under `public/games/<id>/`. The lobby party never
knows about game rules — it only maps a room code to a game id so a player
who joins with just a code can be routed to the right game.

### Adding a new game

1. Add an entry to `public/shared/games.js` (`id`, `title`, `description`, `path`)
2. Create `party/games/<Name>.ts` exporting a class extending `Server` from `partyserver`
3. Export that class from `party/index.ts`
4. Add a binding for it in `wrangler.jsonc` (`durable_objects.bindings` and `migrations.new_sqlite_classes`)
5. Run `npm run cf-typegen` to refresh `Env` types
6. Create `public/games/<id>/` (frontend) — connect over WebSocket to `/parties/<kebab-case-class-name>/<room-code>`

### Developing

```
npm install
npm run dev
```

Open http://127.0.0.1:8787. Deploy with `npm run deploy` (requires a free
Cloudflare account — `wrangler` will prompt to log in on first deploy).
