// Registry of playable games. Shared by the home page (to list games)
// and the lobby party (to validate room creation requests).

const RULER_ICON = `
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#067bc2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="9" width="18" height="6" rx="1.5"></rect>
    <line x1="7" y1="9" x2="7" y2="12"></line>
    <line x1="11" y1="9" x2="11" y2="13"></line>
    <line x1="15" y1="9" x2="15" y2="12"></line>
  </svg>
`;

const DROPLET_ICON = `
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#067bc2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 3c4 4.6 6.5 8.2 6.5 11.2a6.5 6.5 0 1 1-13 0C5.5 11.2 8 7.6 12 3z"></path>
  </svg>
`;

const MASK_ICON = `
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#067bc2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 10c0-3.5 3.5-6 8-6s8 2.5 8 6c0 5-3 10-8 10s-8-5-8-10z"></path>
    <path d="M4 10c0 2 2 3 4 2M20 10c0 2-2 3-4 2"></path>
  </svg>
`;

/** @type {{id: string, title: string, description: string, path: string, badge: string, icon: string}[]} */
export const GAMES = [
  {
    id: "guess-the-size",
    title: "Guess the Size",
    description:
      "Drag to resize one object until it matches its real-world scale next to another.",
    path: "/games/guess-the-size/",
    badge: "1+ Players",
    icon: RULER_ICON,
  },
  {
    id: "match-the-color",
    title: "Match the Color",
    description:
      "Blend your chameleon into the background before the timer runs out. Closest match wins.",
    path: "/games/match-the-color/",
    badge: "1+ Players",
    icon: DROPLET_ICON,
  },
  {
    id: "secret-hitler",
    title: "Secret Hitler",
    description:
      "A hidden-role game of secret identities and political betrayal. Everyone's phone privately shows their role — the rest happens out loud at the table.",
    path: "/games/secret-hitler/",
    badge: "5-10 Players",
    icon: MASK_ICON,
  },
];
