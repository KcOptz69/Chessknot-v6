# ChessKnot V5

## Run locally

Install Node.js, then open a terminal in this folder:

```sh
npm install
npm run dev
```

Open http://localhost:3000. Two browser sessions can join the same room for an online playtest.

## Build and publish

```sh
npm run lint
npm test
npm run build
npm start
```

Upload the source, configuration and public assets. Do not upload node_modules or dist; the build recreates dist. The Dockerfile builds the app and starts dist/server.cjs, listening on the platform's PORT.

## This update

- The base draw pool is now 40 cards: the previous 37 plus two Refresh and one Brick. Each starting hand still receives two guaranteed Pawns and three random draws. Start a new match to use the updated deck.
- Refresh is a free action: discard your whole hand, including Refresh, and draw five. It uses the Redraw sound and cannot be used during Joker Wild Surge.
- Brick is unplayable, with no action type. Discard effects can remove it. Joker still works with Brick in hand.
- Both players see and hear Joker activation. Opponent trap placement, Awakening as Wild, Refresh use and Brick discard use brief notices above the player tag. Trap placement never reveals its square.
- Deck reshuffles show a confirmation popup to both players. Exhausted cards remain excluded.
- Mobile/tablet player tags show the shared draw-pile count before army points. Expansion IV enables an Activated Traps log filter for both players' triggered traps.
- Ready turns green; player-tag King art stays centered; the card tooltip close button stays inside its upper-right corner.
- The in-game rulebook includes Refresh and Brick. Soul countdowns stay visible, including when Portal tiles exist; touch-screen counters remain compact.

## Cleanup

Removed old update archives, their extracted copies, duplicate root source/art files, unused old menu/piece assets and superseded update notes. Current source, assets, tests and deployment configuration are retained. Use this folder as a complete replacement rather than merging it into the old folder, so removed duplicates do not remain.

The game retains rooms in server memory. Reconnect works while that server process remains available; this update does not add room persistence across server restarts.
