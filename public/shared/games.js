// Registry of playable games. Shared by the home page (to list games)
// and the lobby party (to validate room creation requests).

/** @type {{id: string, title: string, description: string, path: string, badge: string}[]} */
export const GAMES = [
  {
    id: "guess-the-size",
    title: "Guess the Size",
    description:
      "Drag to resize one object until it matches its real-world scale next to another.",
    path: "/games/guess-the-size/",
    badge: "1+ Players",
  },
];
