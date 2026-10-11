import {initialFrontier,frontierMoves,frontierKingSafe,frontierEscape} from './frontier.ts';
import {boardFor,isExtendedFen,adjacent,ranksFor,xy,squareAt} from './frontierBoard.ts';
import { AWAKENING_DESCRIPTIONS } from './cardDescriptions.ts';
import { soulTargets, placeRevived, kingSafe } from './summoning.ts';
import { landGround } from './grounds.ts';
import type {Grounds} from './grounds.ts';
import { groundMoves, initialGrounds } from './grounds.ts';
import { Chess } from 'chess.js';
import type { Square, PieceSymbol, Move } from 'chess.js';
import type {
  Card,
  CardType,
  GameState,
  GameStatus,
  PlayerColor,
  PowerUpsState,
  StandardPieceType,
  GameLogEntry,
  GameExpansionsConfig,
  ChampionPiece,
  ChampionType,
  LastMoveDetails,
  AwakenedRookState,
} from '../types.ts';

export const PIECE_VALUES: Record<StandardPieceType, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

export const CHAMPION_DETAILS: Record<ChampionType, {
  title: string;
  subtitle: string;
  role: string;
  badgeColor: string;
  borderTheme: string;
  accentBg: string;
  standardMove: string;
  ultimateName: string;
  ultimateDesc: string;
}> = {
  berserker: {
    title: 'Berserker',
    subtitle: 'Warrior Champion',
    role: 'Frontline Sweeper',
    badgeColor: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40',
    borderTheme: 'border-red-500/60 dark:border-red-500/70 shadow-red-500/10',
    accentBg: 'bg-red-50 dark:bg-red-950/70',
    standardMove: 'Moves 1 square in any direction (like a King), captures normally. Does NOT require a card to move!',
    ultimateName: 'Berserker Dash',
    ultimateDesc: 'Sweeps like a Queen across ranks, files, and diagonals, capturing any unit in his path!',
  },
  musketeer: {
    title: 'Musketeer',
    subtitle: 'Cavalier Champion',
    role: 'Long-Range Sniper',
    badgeColor: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40',
    borderTheme: 'border-amber-500/60 dark:border-amber-500/70 shadow-amber-500/10',
    accentBg: 'bg-amber-50 dark:bg-amber-950/70',
    standardMove: 'Moves 1 square in any direction (like a King), captures normally. Does NOT require a card to move!',
    ultimateName: 'Long-Range Snipe',
    ultimateDesc: 'Eliminates any enemy unit in direct line of sight up to 3 tiles away without moving!',
  },
  summoner: {
    title: 'Summoner',
    subtitle: 'Archmage Champion',
    role: 'Spatial Controller',
    badgeColor: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/40',
    borderTheme: 'border-indigo-500/60 dark:border-indigo-500/70 shadow-indigo-500/10',
    accentBg: 'bg-indigo-50 dark:bg-indigo-950/70',
    standardMove: 'Moves 1 square in any direction (like a King), captures normally. Does NOT require a card to move!',
    ultimateName: 'Quantum Summoning',
    ultimateDesc: 'Teleports any friendly piece directly adjacent to him (captures if landing on enemy square)!',
  },
  ninja: {
    title: 'Ninja',
    subtitle: 'Shinobi Champion',
    role: 'Infiltration Assassin',
    badgeColor: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40',
    borderTheme: 'border-emerald-500/60 dark:border-emerald-500/70 shadow-emerald-500/10',
    accentBg: 'bg-emerald-50 dark:bg-emerald-950/70',
    standardMove: 'Slides like a Queen across ranks, files, and diagonals, but CANNOT capture during standard move. Does NOT require a card to move!',
    ultimateName: 'Shadow Assassination',
    ultimateDesc: 'Instantly eliminates 1 or 2 surrounding enemy pieces without moving!',
  },
};

export const INITIAL_POWER_UPS: PowerUpsState = {
  draw: 1,
  monolith: 1,
  wild: 1,
  vision: 1,
};

export function getInitialPowerUps(
  hasShiftedParadigm: boolean = true,
  hasChampionsOfTheMonolith: boolean = true
): PowerUpsState {
  return {
    draw: 1,
    monolith: hasShiftedParadigm || hasChampionsOfTheMonolith ? 1 : 0,
    wild: 1,
    vision: 1,
  };
}

export function createCard(type: CardType, index: number): Card {
  const cardDefs: Record<CardType, { name: string; description: string }> = {
    refresh: {name:'Refresh',description:'Free action: discard your entire hand, including Brick, and draw 5 new cards. Cannot be played during Joker Wild Surge.'},
    brick: {name:'Brick',description:'Unplayable. Occupies a hand slot until discarded by Redraw, Exchange, Refresh, or Joker.'},
    soul_release: {name:'Soul Release',description:'Summon a bound captured piece within the 5×5 area around its original Queen. Move action; five subsequent turns; zero army and capture value; exhausts on use.'},
    traverse: {name:'Traverse',description:'Teleport a friendly piece to an empty, unrestricted Mystic Field square. Move action.'},
    pawn: {
      name: 'Pawn',
      description: 'Move any of your pawns according to standard chess rules.',
    },
    knight: {
      name: 'Knight',
      description: 'Move any of your knights according to standard chess rules.',
    },
    bishop: {
      name: 'Bishop',
      description: 'Move any of your bishops according to standard chess rules.',
    },
    rook: {
      name: 'Rook',
      description: 'Move any of your rooks according to standard chess rules.',
    },
    queen: {
      name: 'Queen',
      description: 'Move your queen according to standard chess rules.',
    },
    wild: {
      name: 'Wild',
      description: 'Move any of your pieces on the board.',
    },
    joker: {
      name: 'JOKER',
      description: 'Convert your hand into Wild cards! Does not cost a turn. Wild cards vanish when played. Cannot draw until exhausted, then draw 5 new cards!',
    },
    previous: {
      name: 'Previous',
      description: 'Move the piece type you moved on your last turn.',
    },
    push: {
      name: 'Push',
      description: 'Slide any of your pieces like a queen. Cannot capture or jump over pieces (including Champions).',
    },
    switch: {
      name: 'Switch',
      description: 'Swap the board positions of any two of your pieces (including standard pieces and Champion).',
    },
    restrict: {
      name: 'Restrict',
      description: 'Permanently lock an empty square. No piece can land on it (pieces can still pass through it).',
    },
    monolith: {
      name: 'Monolith',
      description: 'Spawn or move the neutral Monolith obstacle to any empty square. Cannot target the current square, cannot be captured, and cannot be moved on the turn right after being placed/moved.',
    },
    beacon: {
      name: 'Beacon',
      description: 'Grant an invulnerable shield to all units surrounding the Monolith for 6 turns. Only units within the surrounding field are invulnerable; leaving the field or moving the Monolith removes invulnerability. Free action.',
    },
    static: {
      name: 'Static',
      description: 'Charge electrical energy around the Monolith (shows blue highlights while charging). Stun procs on your next turn (the 3rd turn) and lasts through the opponent\'s turn, paralyzing all surrounding units with lightning! Free action.',
    },
    clock: {
      name: 'CLOCK',
      description: 'Reverse two completed turns. Cards stay spent. Blocked after the previous turn used an Awakening skill, but not Awakening as Wild. Interrupted circles resume their remaining count; finished circles stay finished. Soul Release rewinds the summon but its card stays exhausted. Free action.',
    },
    champion: {
      name: 'Champion',
      description: 'Deploy a random Champion (Berserker, Musketeer, Summoner, Ninja) to an empty square on your side. If you already have a champion, triggers their Ultimate Skill!',
    },
    awakening_pawn: {
      name: 'Awakening: Pawn',
      description: 'Permanently upgrades one of your pawns into a Super Pawn! Super Pawns can capture enemy pieces directly in front of them as well as diagonally. (Can also be played as Wild Card).',
    },
    awakening_rook: {
      name: 'Awakening: Rook',
      description: 'Moves your rook with an Invulnerable Shield for 5 turns! While awakened, it can only capture once, but may still capture the King afterward. (Can also be played as Wild Card).',
    },
    awakening_knight: {
      name: 'Awakening: Knight',
      description: 'Changes a knight into a Super Knight. Super Knights can move twice in a turn, but can only capture once across both moves. Using the double move reverts it to normal knight. (Can also be played as Wild Card).',
    },
    awakening_bishop: {
      name: 'Awakening: Bishop',
      description: 'Move action: move your Bishop normally, then place a circle on an empty rank 4 or 5 square. After three subsequent turns of yours, optionally revive a captured standard piece there for free. Moving or losing the Bishop, landing on its circle, or Restrict interrupts the ritual. Existing traps remain dormant until revival; no new traps may be placed on the circle. (Can also be played as Wild Card).',
    },
    awakening_queen: {
      name: 'Awakening: Queen',
      description: 'Move action: move your Queen normally. Capturing an eligible standard piece exhausts this card and gives Soul Release instead of the replacement draw. Soul Release summons that piece temporarily for five subsequent turns around this exact Queen. Other moves play as Wild. (Can also be played as Wild Card).',
    },
    awakening_king: {
      name: 'Awakening: King',
      description: 'Can only be used if your King is in "Check". Allows your King to move and capture across any distance like a Queen! (Can also be played as Wild Card).',
    },
  };

  return {
    id: `${type}_${index}_${Math.random().toString(36).substring(2, 7)}`,
    type,
    name: cardDefs[type].name,
    description: AWAKENING_DESCRIPTIONS[type] || cardDefs[type].description,
  };
}

export function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Deck composition:
 * - 6 Pawns in deck (+ 2 per player starting hand = 10 total)
 * - 6 Knights
 * - 6 Bishops
 * - 6 Rooks
 * - 6 Queens
 * - 4 Wild
 * - 2 Previous
 * - 2 Push
 * - 2 Switch
 * - 2 Restrict
 * - 2 Monolith
 */
export function buildInitialDeckAndHands(expansions?: GameExpansionsConfig): {
  deck: Card[];
  hands: { w: Card[]; b: Card[] };
} {
  const deckPool: Card[] = [];
  let idCounter = 1;
  const hasShiftedParadigm = expansions?.shiftedParadigm !== false;
  const hasChampionsOfTheMonolith = expansions?.championsOfTheMonolith !== false;

  // 6 Pawns in deck (player starting hands get 2 each separately)
  for (let i = 0; i < 6; i++) {
    deckPool.push(createCard('pawn', idCounter++));
  }
  for (let i = 0; i < 6; i++) {
    deckPool.push(createCard('knight', idCounter++));
  }
  for (let i = 0; i < 6; i++) {
    deckPool.push(createCard('bishop', idCounter++));
  }
  for (let i = 0; i < 6; i++) {
    deckPool.push(createCard('rook', idCounter++));
  }
  for (let i = 0; i < 6; i++) {
    deckPool.push(createCard('queen', idCounter++));
  }
  for (let i = 0; i < 4; i++) {
    deckPool.push(createCard('wild', idCounter++));
  }
  // 1 copy of Joker in the deck
  deckPool.push(createCard('joker', idCounter++));

  for (let i = 0; i < 2; i++) {
    deckPool.push(createCard('previous', idCounter++));
  }

  deckPool.push(createCard('refresh', idCounter++), createCard('refresh', idCounter++), createCard('brick', idCounter++));

  // 1st Expansion: "Shifted Paradigm"
  // Adds Monolith, Restrict, Switch, and Push cards (2 copies each)
  if (hasShiftedParadigm) {
    for (let i = 0; i < 2; i++) {
      deckPool.push(createCard('push', idCounter++));
    }
    for (let i = 0; i < 2; i++) {
      deckPool.push(createCard('switch', idCounter++));
    }
    for (let i = 0; i < 2; i++) {
      deckPool.push(createCard('restrict', idCounter++));
    }
    for (let i = 0; i < 2; i++) {
      deckPool.push(createCard('monolith', idCounter++));
    }
  }

  // 2nd Expansion: "Champions of the Monolith"
  // Adds 2 more copies of Monolith (total 4 if Shifted Paradigm is also checked),
  // 1 Beacon, 1 Static, 1 Activate the Clock, 2 Champion Cards
  if (hasChampionsOfTheMonolith) {
    for (let i = 0; i < 2; i++) {
      deckPool.push(createCard('monolith', idCounter++));
    }
    deckPool.push(createCard('beacon', idCounter++));
    deckPool.push(createCard('static', idCounter++));
    deckPool.push(createCard('clock', idCounter++));
    for (let i = 0; i < 2; i++) {
      deckPool.push(createCard('champion', idCounter++));
    }
  }

  // 3rd Expansion: "The Awakening"
  // Adds 1 copy of each Awakening card: Pawn, Rook, Knight, Bishop, Queen, King
  const hasTheAwakening = expansions?.theAwakening !== false;
  if (hasTheAwakening) {
    deckPool.push(createCard('awakening_pawn', idCounter++));
    deckPool.push(createCard('awakening_rook', idCounter++));
    deckPool.push(createCard('awakening_knight', idCounter++));
    deckPool.push(createCard('awakening_bishop', idCounter++));
    deckPool.push(createCard('awakening_queen', idCounter++));
    deckPool.push(createCard('awakening_king', idCounter++));
  }

  const shuffledPool = shuffle(deckPool);

  // Each player gets 2 pawns + 3 random cards from the deck
  const whiteHand: Card[] = [
    {...createCard('pawn', idCounter++), knownStartingPawnFor: 'w' as const},
    {...createCard('pawn', idCounter++), knownStartingPawnFor: 'w' as const},
    shuffledPool.pop()!,
    shuffledPool.pop()!,
    shuffledPool.pop()!,
  ];

  const blackHand: Card[] = [
    {...createCard('pawn', idCounter++), knownStartingPawnFor: 'b' as const},
    {...createCard('pawn', idCounter++), knownStartingPawnFor: 'b' as const},
    shuffledPool.pop()!,
    shuffledPool.pop()!,
    shuffledPool.pop()!,
  ];

  return {
    deck: shuffledPool,
    hands: {
      w: whiteHand,
      b: blackHand,
    },
  };
}

export function calculatePiecePoints(
  chess: Chess,
  color: PlayerColor,
  champions?: { w: ChampionPiece | null; b: ChampionPiece | null } | null,
  identityState?: Pick<GameState,'pieceIds'|'soulSummons'|'frontier'>
): number {
  let total = 0;
  const board = chess.board();
  for (const row of board) {
    for (const piece of row) {
      if (piece && piece.color === color && piece.type !== 'k' && !identityState?.soulSummons?.some(t=>t.pieceId===identityState.pieceIds?.[piece.square])) {
        total += PIECE_VALUES[piece.type];
      }
    }
  }
  // Champions Worth 5 Points: Champions are valued at 5 points in army scoring
  if (champions && champions[color] && champions[color]?.square) {
    total += 5;
  }
  total += (identityState?.frontier?.golems.filter(g=>g.owner===color).length||0)*10;
  return total;
}

/**
 * Synchronizes the FEN string with the current active turn and clears any stale en-passant/half-move counters.
 * If chess.js validation fails on an unusual board state, it falls back gracefully.
 */
/**
 * Creates a safe Chess instance that skips standard FEN validation rules
 * (e.g., permits pawns on back ranks without crashing the engine).
 */
export function createSafeChess(fen?: string): Chess {
  if (fen && isExtendedFen(fen)) return boardFor(fen);
  if (!fen) return new Chess();
  fen = sanitizeEnPassantFen(fen);
  try {
    return new Chess(fen, { skipValidation: true });
  } catch {
    try {
      const c = new Chess();
      c.load(fen, { skipValidation: true });
      return c;
    } catch {
      return new Chess();
    }
  }
}

/**
 * Adjusts the active turn in a FEN string while preserving board state and en-passant square.
 */
// A stale en-passant target with the wrong active color can make chess.js
// serialize a phantom pawn while testing and undoing a hypothetical capture.
function sanitizeEnPassantFen(fen: string): string {
 if(isExtendedFen(fen))return fen;
 const parts=fen.split(' '), ep=parts[3];
 if(!ep || ep==='-')return fen;
 const white=parts[1]==='w';
 let valid=/^[a-h][36]$/.test(ep) && ep[1]===(white?'6':'3');
 if(valid){
  const rows=parts[0].split('/').map(row=>[...row].flatMap(char=>/^[1-8]$/.test(char)?Array(Number(char)).fill(''): [char]));
  const file=ep.charCodeAt(0)-97, rank=Number(ep[1]);
  valid=rows[8-rank]?.[file]==='' && rows[8-(rank+(white?-1:1))]?.[file]===(white?'p':'P');
 }
 if(!valid)parts[3]='-';
 return parts.join(' ');
}

export function syncFenTurn(fen: string, nextTurn: PlayerColor, preserveEpSquare: boolean = true): string {
  try {
    const parts = fen.split(' ');
    parts[1] = nextTurn;
    if (!preserveEpSquare) {
      parts[3] = '-'; // clear en-passant square when cards or special actions occurred
    }
    return sanitizeEnPassantFen(parts.join(' '));
  } catch {
    return fen;
  }
}

/**
 * Ensures pawns that reach the opponent's back rank (rank 8 for White, rank 1 for Black)
 * are automatically promoted to Queens.
 * Pawns that go to their own back rank (rank 1 for White, rank 8 for Black) via Switch
 * will NOT be promoted.
 */
export function ensureEdgePawnsPromoted(chess: Chess): boolean {
  let changed = false;
  const board = chess.board();
  for (let r = 0; r < board.length; r++) {
    for (let f = 0; f < 8; f++) {
      const piece = board[r][f];
      if (piece && piece.type === 'p') {
        // Rank 8 is index 0 in board array, Rank 1 is index 7
        // White pawn promotes only on opponent's back rank (Rank 8, r === 0)
        // Black pawn promotes only on opponent's back rank (Rank 1, r === 7)
        const reachesOpponentBackline =
          (piece.color === 'w' && r === 0) || (piece.color === 'b' && r === board.length-1);
        if (reachesOpponentBackline) {
          const fileChar = String.fromCharCode('a'.charCodeAt(0) + f);
          const rankChar = piece.square.slice(1);
          const square = `${fileChar}${rankChar}` as Square;
          chess.remove(square);
          chess.put({ type: 'q', color: piece.color }, square);
          changed = true;
        }
      }
    }
  }
  return changed;
}

/**
 * Creates a Chess instance for rules evaluation (check, legal moves, checkmate)
 * that properly accounts for the neutral Monolith obstacle.
 * Since the Monolith is a physical neutral barrier that blocks lines of sight and piece movement,
 * placing a friendly piece of the defending player's color on monolithSquare:
 * 1) Prevents friendly pieces from checking their own king.
 * 2) Physically terminates all enemy rays (bishops, rooks, queens), blocking threats through that square.
 * 3) Prevents sliding pieces from passing through.
 */
export function createBoardWithMonolith(
  fen: string,
  monolithSquare: string | null,
  defendingColor: PlayerColor = 'w',
  champions?: { w: ChampionPiece | null; b: ChampionPiece | null } | null
): Chess {
  const c = createSafeChess(syncFenTurn(fen, defendingColor));
  const placedSquares: string[] = [];

  if (monolithSquare && !c.get(monolithSquare as Square)) {
    const savedEp = (c as any)._epSquare;
    try {
      c.put({ type: 'q', color: defendingColor }, monolithSquare as Square);
      placedSquares.push(monolithSquare);
      if (savedEp !== undefined && savedEp !== -1) {
        (c as any)._epSquare = savedEp;
      }
    } catch {}
  }

  // Friendly champions terminate enemy sliding lines of sight (bishops, rooks, queens)
  // and prevent friendly pieces from landing on them.
  // Enemy champions must NOT have a placeholder queen put on their square so ANY opponent piece
  // can legally move onto and capture the champion.
  if (champions) {
    const friendlyChamp = champions[defendingColor];
    if (friendlyChamp?.square && !c.get(friendlyChamp.square as Square)) {
      const savedEp = (c as any)._epSquare;
      try {
        c.put({ type: 'q', color: defendingColor }, friendlyChamp.square as Square);
        placedSquares.push(friendlyChamp.square);
        if (savedEp !== undefined && savedEp !== -1) {
          (c as any)._epSquare = savedEp;
        }
      } catch {}
    }
  }

  (c as any)._placeholderSquares = placedSquares;
  return c;
}

/**
 * Determines whether a player's King is in check, taking into account
 * that the neutral Monolith and Champions physically block lines of sight
 * from enemy sliding pieces (bishops, rooks, queens), and active enemy champions
 * can attack adjacent squares.
 */
export function isKingChecked(
  chess: Chess,
  color: PlayerColor,
  monolithSquare: string | null,
  champions?: { w: ChampionPiece | null; b: ChampionPiece | null } | null,
  beaconProtectedSquares?: string[],
  grounds?: Grounds
): boolean {
  if(isExtendedFen(chess.fen()))return !frontierKingSafe(movementState(chess,[],monolithSquare,champions,[],beaconProtectedSquares||[],[],[],[],grounds),color);
  const board = chess.board();
  let kingSquare: Square | null = null;
  for (let r = 0; r < board.length; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (p && p.type === 'k' && p.color === color) {
        const fileChar = String.fromCharCode('a'.charCodeAt(0) + f);
        const rankChar = p.square.slice(1);
        kingSquare = `${fileChar}${rankChar}` as Square;
        break;
      }
    }
    if (kingSquare) break;
  }
  if (!kingSquare) return false;

  // If King is invulnerable on Beacon protected square, it is NOT in check!
  if (beaconProtectedSquares && beaconProtectedSquares.includes(kingSquare)) {
    return false;
  }

  const opponentColor = color === 'w' ? 'b' : 'w';
  const testChess = createSafeChess(chess.fen());

  // If Monolith is on board, place a defending piece on it so enemy sliding rays are blocked
  if (monolithSquare && !testChess.get(monolithSquare as Square)) {
    try {
      testChess.put({ type: 'q', color }, monolithSquare as Square);
    } catch {}
  }

  // If champions are on board and their squares are empty in chess.fen(), place a piece of defending color
  // so enemy sliding rays (bishops, rooks, queens) are physically blocked and cannot pass through.
  // Using the defending color guarantees the dummy blocking piece cannot falsely check the defending king.
  if (champions) {
    for (const side of ['w', 'b'] as PlayerColor[]) {
      const champ = champions[side];
      if (champ?.square && !testChess.get(champ.square as Square)) {
        try {
          testChess.put({ type: 'q', color }, champ.square as Square);
        } catch {}
      }
    }
  }

  // Check standard chess attackers against King square
  try {
    if (testChess.attackers(kingSquare, opponentColor).filter(q=>!['boost','gravity'].includes(grounds?.tiles[q]||'')&&!grounds?.disarm.some(d=>d.square===q)).length > 0) {
      return true;
    }
  } catch {}

  // Check if active enemy champion attacks king (Berserker, Musketeer, Summoner attack 1 square around them)
  const enemyChamp = champions ? champions[opponentColor] : null;
  if (
    enemyChamp &&
    enemyChamp.square &&
    enemyChamp.square !== kingSquare &&
    ['berserker', 'musketeer', 'summoner'].includes(enemyChamp.type) &&
    !['boost','gravity'].includes(grounds?.tiles[enemyChamp.square]||'') && !grounds?.disarm.some(d=>d.square===enemyChamp.square)
  ) {
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const kf = files.indexOf(kingSquare[0]);
    const kr = parseInt(kingSquare[1], 10);
    const ef = files.indexOf(enemyChamp.square[0]);
    const er = parseInt(enemyChamp.square[1], 10);
    if (Math.abs(kf - ef) <= 1 && Math.abs(kr - er) <= 1) {
      return true;
    }
  }

  return false;
}

export function createInitialGameState(
  expansions: GameExpansionsConfig = { shiftedParadigm: true, championsOfTheMonolith: true, theAwakening: true, arcaneFrontier:true }
): GameState {
  const chess = new Chess();
  const hasShiftedParadigm = expansions?.shiftedParadigm !== false;
  const hasChampionsOfTheMonolith = expansions?.championsOfTheMonolith !== false;
  const hasTheAwakening = expansions?.theAwakening !== false;
  const { deck, hands } = buildInitialDeckAndHands({
    shiftedParadigm: hasShiftedParadigm,
    championsOfTheMonolith: hasChampionsOfTheMonolith,
    theAwakening: hasTheAwakening,
  });
  const initPowerUps = getInitialPowerUps(hasShiftedParadigm, hasChampionsOfTheMonolith);

  const whitePoints = calculatePiecePoints(chess, 'w');
  const blackPoints = calculatePiecePoints(chess, 'b');

  const pieceIds:Record<string,string>={};
  for(const row of chess.board())for(const p of row)if(p)pieceIds[p.square]=`${p.color}${p.type}@${p.square}`;
  const grounds=initialGrounds(expansions.treacherousGrounds !== false, Math.random, expansions.treacherousGroundsSelected);
  return {
    grounds,
    frontier: expansions.arcaneFrontier !== false ? initialFrontier() : undefined,
    pieceIds,superPawnIds:[],superKnightIds:[],
    fen: chess.fen(),
    turn: 'w',
    turnNumber: 1,
    deck,
    discard: [],
    exhausted: [],
    hands,
    powerUps: {
      w: { ...initPowerUps },
      b: { ...initPowerUps },
    },
    powerUpProgress: {
      w: 0,
      b: 0,
    },
    expansions: {
      arcaneFrontier: expansions.arcaneFrontier!==false,
      shiftedParadigm: hasShiftedParadigm,
      championsOfTheMonolith: hasChampionsOfTheMonolith,
      theAwakening: hasTheAwakening,
      treacherousGrounds: expansions.treacherousGrounds !== false,
      treacherousGroundsSelected: expansions.treacherousGroundsSelected,
    },
    monolithSquare: null,
    monolithLastMovedTurn: null,
    restrictedSquares: [],
    champions: {
      w: null,
      b: null,
    },
    beaconEffect: null,
    staticEffect: null,
    clockAlert: null,
    passRedrawAlert: null,
    awakeningAlert: null,
    superPawns: [],
    superKnights: [],
    awakenedRooks: [],
    awakenedPieces: [],
    awakenedPieceSquare: null,
    awakenedByPlayer: null,
    awakenedOnTurnNumber: null,
    boardHistory: [
      {
        grounds: structuredClone(grounds),
        pieceIds: {...pieceIds},
        fen: chess.fen(),
        monolithSquare: null,
        restrictedSquares: [],
        champions: {
          w: null,
          b: null,
        },
      },
    ],
    lastMovedPiece: {
      w: null,
      b: null,
    },
    lastMovedSquare: {
      w: null,
      b: null,
    },
    lastMoveDetails: null,
    jokerLocked: {
      w: false,
      b: false,
    },
    clock: {
      enabled: false,
      initialMinutes: 5,
      incrementSeconds: 3,
      w: 300,
      b: 300,
      lastTick: null,
      isRunning: false,
    },
    visionActive: {
      w: false,
      b: false,
    },
    historyLog: [
      {
        id: 'start_game',
        turn: 'w',
        turnNumber: 1,
        actionType: 'pass',
        detail: `Room initialized. Staging lobby ready.${
          hasChampionsOfTheMonolith && hasShiftedParadigm
            ? ' (Expansions 1 & 2 Active)'
            : hasChampionsOfTheMonolith
            ? ' (Expansion 2: Champions of the Monolith)'
            : hasShiftedParadigm
            ? ' (Expansion 1: Shifted Paradigm)'
            : ' (Base Game - No Expansions)'
        }`,
        timestamp: Date.now(),
        whitePoints,
        blackPoints,
      },
    ],
    status: 'lobby',
    winner: null,
    winReason: null,
    whitePoints,
    blackPoints,
  };
}

/**
 * Handle drawing a card for a player.
 * If the deck is depleted, reshuffles the discard pile and resets active powerups!
 */
export function drawCard(state: GameState): {
  drawnCard: Card | null;
  newDeck: Card[];
  newDiscard: Card[];
  powerUps: { w: PowerUpsState; b: PowerUpsState };
  reshuffled: boolean;
} {
  let deck = [...state.deck];
  let discard = [...state.discard];
  let powerUps = {
    w: { ...state.powerUps.w },
    b: { ...state.powerUps.b },
  };
  let reshuffled = false;

  if (deck.length === 0) {
    if (discard.length > 0) {
      deck = shuffle(discard);
      discard = [];
      reshuffled = true;
      // Capture-Based Tactical Power-Up Refresh:
      // Power-ups no longer reset on deck reshuffle. Instead, capturing enemy pieces refreshes stacks!
    } else {
      return { drawnCard: null, newDeck: deck, newDiscard: discard, powerUps, reshuffled: false };
    }
  }

  const drawnCard = deck.pop() || null;
  return {
    drawnCard,
    newDeck: deck,
    newDiscard: discard,
    powerUps,
    reshuffled,
  };
}

/**
 * Helper to check if a square is restricted or has the monolith
 */
export function isSquareBlocked(
  square: string,
  restrictedSquares: string[],
  monolithSquare: string | null
): boolean {
  return restrictedSquares.includes(square) || monolithSquare === square;
}

/**
 * Custom raycasting for sliding moves (Rook, Bishop, Queen, or Push)
 * accounting for monolith piece and restricted squares.
 */
export function getSlideSquares(
  from: string,
  directions: [number, number][],
  chess: Chess,
  restrictedSquares: string[],
  monolithSquare: string | null,
  isPush: boolean = false,
  champions?: { w: ChampionPiece | null; b: ChampionPiece | null } | null
): string[] {
  const rankOrder=ranksFor(chess.fen());
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const fromFile = files.indexOf(from[0]);
  const fromRank = rankOrder.indexOf(from[1])+1;
  const currentPiece =
    chess.get(from as Square) ||
    (champions?.w?.square === from
      ? { type: 'k', color: 'w' }
      : champions?.b?.square === from
      ? { type: 'k', color: 'b' }
      : null);
  const moves: string[] = [];

  for (const [df, dr] of directions) {
    let f = fromFile + df;
    let r = fromRank + dr;

    while (f >= 0 && f < 8 && r >= 1 && r <= rankOrder.length) {
      const sq = `${files[f]}${rankOrder[r-1]}`;

      // Restricted squares cannot be landed on, but pieces can still pass through
      if (restrictedSquares.includes(sq)) {
        f += df;
        r += dr;
        continue;
      }

      // Check for Monolith: cannot be captured, blocks line of sight
      if (monolithSquare === sq) {
        break;
      }

      // Check for Champion: considered an actual piece, pieces must NOT pass through it
      const champOnSq =
        champions?.w?.square === sq ? champions.w : champions?.b?.square === sq ? champions.b : null;
      if (champOnSq) {
        if (!isPush && currentPiece && champOnSq.color !== currentPiece.color) {
          // Standard piece capture (Push CANNOT capture)
          moves.push(sq);
        }
        // Champion blocks line of sight and movement (cannot jump or pass through)
        break;
      }

      const pieceOnSquare = chess.get(sq as Square);
      if (pieceOnSquare) {
        if (!isPush && currentPiece && pieceOnSquare.color !== currentPiece.color) {
          // Standard capture (Push CANNOT capture)
          moves.push(sq);
        }
        // Piece blocks path
        break;
      } else {
        // Empty square
        moves.push(sq);
      }

      f += df;
      r += dr;
    }
  }

  return moves;
}

/**
 * Compute valid Push moves for any friendly piece.
 * "allows any piece of yours to move like a queen, but cannot be used to capture pieces and jump to another piece like what knight does."
 * Champion piece is considered an actual piece so pieces must not pass through it when push card is used.
 */
export function getPushMoves(
  from: string,
  chess: Chess,
  restrictedSquares: string[],
  monolithSquare: string | null,
  champions?: { w: ChampionPiece | null; b: ChampionPiece | null } | null
): string[] {
  const directions: [number, number][] = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];

  return getSlideSquares(from, directions, chess, restrictedSquares, monolithSquare, true, champions);
}

/**
 * Helper to determine if a move is a castling move and whether either the King or the Rook
 * lands on a restricted square.
 * Rules: It must be impossible to castle if either the rook or the king lands on the restricted tile.
 * - White Kingside (O-O): King moves e1 -> g1, Rook moves h1 -> f1. Blocked if g1 or f1 is restricted.
 * - White Queenside (O-O-O): King moves e1 -> c1, Rook moves a1 -> d1. Blocked if c1 or d1 is restricted.
 * - Black Kingside (O-O): King moves e8 -> g8, Rook moves h8 -> f8. Blocked if g8 or f8 is restricted.
 * - Black Queenside (O-O-O): King moves e8 -> c8, Rook moves a8 -> d8. Blocked if c8 or d8 is restricted.
 */
export function isCastlingBlockedByRestrictedSquares(
  from: string,
  to: string,
  restrictedSquares: string[]
): boolean {
  if (!restrictedSquares || restrictedSquares.length === 0) return false;

  // White King castling:
  if (from === 'e1') {
    if (to === 'g1') {
      // Kingside: King lands on g1, Rook lands on f1
      return restrictedSquares.includes('g1') || restrictedSquares.includes('f1');
    }
    if (to === 'c1') {
      // Queenside: King lands on c1, Rook lands on d1
      return restrictedSquares.includes('c1') || restrictedSquares.includes('d1');
    }
  }

  // Black King castling:
  if (from === 'e8') {
    if (to === 'g8') {
      // Kingside: King lands on g8, Rook lands on f8
      return restrictedSquares.includes('g8') || restrictedSquares.includes('f8');
    }
    if (to === 'c8') {
      // Queenside: King lands on c8, Rook lands on d8
      return restrictedSquares.includes('c8') || restrictedSquares.includes('d8');
    }
  }

  return false;
}

/**
 * Valid standard legal moves for a given piece on the board,
 * filtered by restricted squares and monolith interactions.
 */
export function getLegalMovesForPiece(
  square: Square,
  chess: Chess,
  restrictedSquares: string[],
  monolithSquare: string | null,
  staticStunnedSquares: string[] = [],
  beaconProtectedSquares: string[] = [],
  friendlyChampionSquare: string | null = null,
  enemyChampion: ChampionPiece | null = null,
  champions?: { w: ChampionPiece | null; b: ChampionPiece | null } | null,
  awakenedRooks: AwakenedRookState[] = [],
  superPawns: string[] = [],
  superKnights: string[] = [],
  awakenedPieces: string[] = [],
  grounds?: Grounds
): string[] {
  if(isExtendedFen(chess.fen()))return frontierMoves(movementState(chess,restrictedSquares,monolithSquare,champions||{w:friendlyChampionSquare?{square:friendlyChampionSquare,color:'w',type:'berserker'}:null,b:enemyChampion},staticStunnedSquares,beaconProtectedSquares,awakenedRooks,superPawns,superKnights,grounds),square);
  const piece = chess.get(square);
  if (!piece) return [];
  if (square === monolithSquare) return [];
  if (staticStunnedSquares.includes(square)) return []; // Stunned pieces cannot move!

  const powered=grounds?groundMoves({fen:chess.fen(),grounds,champions:champions||{w:null,b:null},restrictedSquares,monolithSquare} as any,square):undefined;
  if(powered)return powered.filter(to=>{const b=createSafeChess(chess.fen());b.remove(square);b.put(piece,to as Square);return !isKingChecked(b,piece.color,monolithSquare,champions,beaconProtectedSquares,grounds);});
  const champMap = champions || {
    [piece.color]: friendlyChampionSquare ? ({ square: friendlyChampionSquare } as any) : null,
    [piece.color === 'w' ? 'b' : 'w']: enemyChampion,
  };
  const opponentColor = piece.color === 'w' ? 'b' : 'w';

  // If this piece is an Awakened Rook with turnsRemaining > 0 and hasCaptured === true, it CANNOT capture again!
  const currentAwakenedRook = piece.type === 'r'
    ? awakenedRooks.find((ar) => ar.square === square && ar.turnsRemaining > 0)
    : null;
  const cannotCaptureAsAwakenedRook = Boolean(currentAwakenedRook && currentAwakenedRook.hasCaptured);

  // Account for Monolith and Champions blocking lines of sight so check and pins calculate accurately
  const boardWithMonolith = createBoardWithMonolith(chess.fen(), monolithSquare, piece.color, champMap as any);
  const alteredThreats=!!grounds&&(grounds.disarm.length>0||Object.values(grounds.tiles).some(t=>t==='boost'||t==='gravity'));
  const algebraic=(n:number)=>String.fromCharCode(97+(n&15))+(8-(n>>4));
  const rawMoves = alteredThreats ? (boardWithMonolith as any)._moves({square,legal:false}).map((m:any)=>({...m,to:algebraic(m.to),from:algebraic(m.from),flags:m.flags&8?'e':'',internal:m})) : boardWithMonolith.moves({ square, verbose: true }) as Move[];
  const validSquares: string[] = [];

  for (const m of rawMoves) {
    const to = m.to;
    // Cannot land on restricted squares (can pass through, but cannot land on them)
    if (restrictedSquares.includes(to)) {
      continue;
    }

    // Castling check: Impossible to castle if either the rook or the king lands on the restricted tile
    if (piece.type === 'k' && isCastlingBlockedByRestrictedSquares(square, to, restrictedSquares)) {
      continue;
    }

    // Monolith cannot be landed on or captured
    if (to === monolithSquare) {
      continue;
    }

    // Cannot land on friendly champion
    if (friendlyChampionSquare === to) {
      continue;
    }

    // Cannot capture piece on beacon-protected square (including en-passant captured pawn)
    const isEnPassant = m.flags.includes('e');
    const capturedSquare = isEnPassant ? `${to[0]}${square[1]}` : to;
    if (beaconProtectedSquares.includes(capturedSquare) && (m.captured || !!chess.get(capturedSquare as Square))) {
      continue;
    }

    // Cannot capture piece that is an Awakened Rook
    const destPiece = chess.get(capturedSquare as Square);
    const isTargetAwakenedRook =
      (destPiece?.type === 'r' && (
        awakenedPieces.includes(capturedSquare) ||
        awakenedRooks.some((ar) => ar.square === capturedSquare && ar.color !== piece.color && (ar.turnsRemaining === undefined || ar.turnsRemaining > 0))
      )) ||
      awakenedRooks.some((ar) => ar.square === capturedSquare && ar.color !== piece.color && (ar.turnsRemaining === undefined || ar.turnsRemaining > 0));
    if (isTargetAwakenedRook && (m.captured || !!destPiece)) {
      continue;
    }

    // If destination is enemy champion and beacon protected, cannot capture
    if (enemyChampion && enemyChampion.square === to && beaconProtectedSquares.includes(to)) {
      continue;
    }

    // A normal pawn CANNOT move straight forward onto an enemy champion (pawns only capture diagonally unless Super Pawn)
    if (piece.type === 'p' && !superPawns.includes(square) && to[0] === square[0] && enemyChampion && enemyChampion.square === to) {
      continue;
    }

    // If current piece is an Awakened Rook that already captured, it CANNOT capture again!
    if (cannotCaptureAsAwakenedRook) {
      if (chess.get(to as Square)?.type !== 'k' && (m.captured || !!chess.get(to as Square) || (enemyChampion && enemyChampion.square === to))) {
        continue;
      }
    }

    // Sliding pieces (r, b, q) cannot pass through Monolith or Champions
    if (['r', 'b', 'q'].includes(piece.type)) {
      if (monolithSquare && isPathBlockedBySquare(square, to, monolithSquare)) {
        continue;
      }
      if (friendlyChampionSquare && isPathBlockedBySquare(square, to, friendlyChampionSquare)) {
        continue;
      }
      if (enemyChampion && isPathBlockedBySquare(square, to, enemyChampion.square)) {
        continue;
      }
    }

    // If capturing enemy champion, verify move doesn't leave King in check (with champion removed)
    if (enemyChampion && enemyChampion.square === to) {
      const testChess = createSafeChess(chess.fen());
      testChess.remove(square);
      testChess.put(piece, to as Square);
      const remainingChamps = champMap ? { ...champMap, [opponentColor]: null } : null;
      if (isKingChecked(testChess, piece.color, monolithSquare, remainingChamps as any, undefined, grounds)) {
        continue;
      }
    }

    if(alteredThreats){const preview=createBoardWithMonolith(chess.fen(),monolithSquare,piece.color,champMap as any);(preview as any)._makeMove((m as any).internal);for(const q of (preview as any)._placeholderSquares||[])if(q!==to)preview.remove(q);const remaining=enemyChampion?.square===to?{...champMap,[opponentColor]:null}:champMap;if(isKingChecked(preview,piece.color,monolithSquare,remaining as any,beaconProtectedSquares,grounds))continue;}
    validSquares.push(to);
  }

  // Champion can be captured by pawns (pawns can attack diagonally forward to capture enemy champion like standard pieces)
  if (piece.type === 'p' && enemyChampion) {
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const f = files.indexOf(square[0]);
    const r = parseInt(square[1], 10);
    const forward = piece.color === 'w' ? 1 : -1;
    const targetRank = r + forward;
    for (const df of [-1, 1]) {
      const targetFile = f + df;
      if (targetFile >= 0 && targetFile < 8 && targetRank >= 1 && targetRank <= 8) {
        const diagSq = `${files[targetFile]}${targetRank}`;
        if (diagSq === enemyChampion.square) {
          if (
            !restrictedSquares.includes(diagSq) &&
            monolithSquare !== diagSq &&
            !beaconProtectedSquares.includes(diagSq)
          ) {
            const testChess = createSafeChess(chess.fen());
            testChess.remove(square);
            testChess.put(piece, diagSq as Square);
            const remainingChamps = champMap ? { ...champMap, [opponentColor]: null } : null;
            if (!isKingChecked(testChess, piece.color, monolithSquare, remainingChamps as any, undefined, grounds)) {
              if (!validSquares.includes(diagSq)) {
                validSquares.push(diagSq);
              }
            }
          }
        }
      }
    }
  }

  // Super Pawn Ability: Can capture pieces directly in front of them!
  if (piece.type === 'p' && superPawns.includes(square)) {
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const f = files.indexOf(square[0]);
    const r = parseInt(square[1], 10);
    const forward = piece.color === 'w' ? 1 : -1;
    const frontRank = r + forward;
    if (frontRank >= 1 && frontRank <= 8) {
      const frontSq = `${files[f]}${frontRank}`;
      const pieceInFront = chess.get(frontSq as Square);
      const isEnemyChampInFront = enemyChampion && enemyChampion.square === frontSq;
      const isEnemyInFront = (pieceInFront && pieceInFront.color !== piece.color) || isEnemyChampInFront;
      const isFrontProtectedRook =
        (pieceInFront?.type === 'r' && (awakenedPieces.includes(frontSq) || awakenedRooks.some((ar) => ar.square === frontSq && ar.color !== piece.color))) ||
        awakenedRooks.some((ar) => ar.square === frontSq && ar.color !== piece.color);
      const isFrontInvulnerable =
        beaconProtectedSquares.includes(frontSq) || isFrontProtectedRook;

      if (
        isEnemyInFront &&
        !isFrontInvulnerable &&
        !restrictedSquares.includes(frontSq) &&
        monolithSquare !== frontSq
      ) {
        const testChess = createSafeChess(chess.fen());
        testChess.remove(square);
        testChess.put(piece, frontSq as Square);
        const remainingChamps = champMap ? { ...champMap, [opponentColor]: null } : null;
        if (!isKingChecked(testChess, piece.color, monolithSquare, remainingChamps as any, undefined, grounds)) {
          if (!validSquares.includes(frontSq)) {
            validSquares.push(frontSq);
          }
        }
      }
    }
  }

  // Super Knight Movement Logic (or custom knight types):
  // Ensure all 8 L-shaped jumps are available and can capture enemy pieces or champions
  if (piece.type === 'n' || superKnights.includes(square)) {
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const f = files.indexOf(square[0]);
    const r = parseInt(square[1], 10);
    const knightOffsets: [number, number][] = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1]
    ];
    for (const [df, dr] of knightOffsets) {
      const nf = f + df;
      const nr = r + dr;
      if (nf >= 0 && nf < 8 && nr >= 1 && nr <= 8) {
        const targetSq = `${files[nf]}${nr}`;
        if (
          restrictedSquares.includes(targetSq) ||
          monolithSquare === targetSq ||
          friendlyChampionSquare === targetSq
        ) {
          continue;
        }

        const destPiece = chess.get(targetSq as Square);
        if (destPiece && destPiece.color === piece.color) {
          continue;
        }

        const isEnemyChamp = Boolean(enemyChampion && enemyChampion.square === targetSq);
        const isEnemyPiece = Boolean(destPiece && destPiece.color !== piece.color);
        const isCapture = isEnemyPiece || isEnemyChamp;

        // Cannot capture piece on beacon protected square
        if (beaconProtectedSquares.includes(targetSq) && isCapture) {
          continue;
        }

        // Awakened rook cannot capture again if it already captured
        if (cannotCaptureAsAwakenedRook && isCapture && destPiece?.type !== 'k') {
          continue;
        }

        // Cannot capture piece that is an Awakened Rook
        if (
          destPiece &&
          ((destPiece.type === 'r' && (
            awakenedPieces.includes(targetSq) ||
            awakenedRooks.some((ar) => ar.square === targetSq && ar.color !== piece.color && (ar.turnsRemaining === undefined || ar.turnsRemaining > 0))
          )) ||
          awakenedRooks.some((ar) => ar.square === targetSq && ar.color !== piece.color && (ar.turnsRemaining === undefined || ar.turnsRemaining > 0)))
        ) {
          continue;
        }

        const testChess = createSafeChess(chess.fen());
        testChess.remove(square);
        testChess.put(piece, targetSq as Square);
        const remainingChamps = isEnemyChamp ? (champMap ? { ...champMap, [opponentColor]: null } : null) : champMap;
        if (!isKingChecked(testChess, piece.color, monolithSquare, remainingChamps as any, undefined, grounds)) {
          if (!validSquares.includes(targetSq)) {
            validSquares.push(targetSq);
          }
        }
      }
    }
  }

  return validSquares.filter(to=>{
    const victim=chess.get(to as Square);const ep=piece.type==='p'&&to[0]!==square[0]&&!victim;
    const capturedSq=ep?to[0]+square[1]:to;const target=chess.get(capturedSq as Square);
    const captures=!!target&&target.color!==piece.color||enemyChampion?.square===to;
    if(captures&&grounds?.disarm.some(d=>d.square===square))return false;
    return !(captures&&grounds?.tiles[capturedSq]==='defense'&&target?.type!=='k');
  });
}

/**
 * Super Knight & Custom Piece Movement Validation:
 * Movement rule logic for Super Knight and any custom piece type.
 * Returns valid target squares so players can move and select pieces on the board.
 */
export function getValidMoves(
  square: Square,
  chess: Chess,
  restrictedSquares: string[] = [],
  monolithSquare: string | null = null,
  staticStunnedSquares: string[] = [],
  beaconProtectedSquares: string[] = [],
  friendlyChampionSquare: string | null = null,
  enemyChampion: ChampionPiece | null = null,
  champions?: { w: ChampionPiece | null; b: ChampionPiece | null } | null,
  awakenedRooks: AwakenedRookState[] = [],
  superPawns: string[] = [],
  superKnights: string[] = []
): string[] {
  return getLegalMovesForPiece(
    square,
    chess,
    restrictedSquares,
    monolithSquare,
    staticStunnedSquares,
    beaconProtectedSquares,
    friendlyChampionSquare,
    enemyChampion,
    champions,
    awakenedRooks,
    superPawns,
    superKnights, undefined, undefined
  );
}

/**
 * Checks if a specific move is valid for any standard or custom piece (including Super Knight).
 */
export function isValidMove(
  from: Square,
  to: Square,
  chess: Chess,
  restrictedSquares: string[] = [],
  monolithSquare: string | null = null,
  staticStunnedSquares: string[] = [],
  beaconProtectedSquares: string[] = [],
  friendlyChampionSquare: string | null = null,
  enemyChampion: ChampionPiece | null = null,
  champions?: { w: ChampionPiece | null; b: ChampionPiece | null } | null,
  awakenedRooks: AwakenedRookState[] = [],
  superPawns: string[] = [],
  superKnights: string[] = []
): boolean {
  const valid = getValidMoves(
    from,
    chess,
    restrictedSquares,
    monolithSquare,
    staticStunnedSquares,
    beaconProtectedSquares,
    friendlyChampionSquare,
    enemyChampion,
    champions,
    awakenedRooks,
    superPawns,
    superKnights
  );
  return valid.includes(to);
}

/**
 * Ensures that when a pawn changes color or transforms, both piece.color AND its FEN state are fully updated.
 * This prevents the pawn from resetting back to its original color on the next turn.
 */
export function convertPieceColor(chess: Chess, square: Square, newColor: PlayerColor): boolean {
  const p = chess.get(square);
  if (!p) return false;
  chess.remove(square);
  chess.put({ type: p.type, color: newColor }, square);
  return true;
}

/**
 * Piece Capture Points:
 * Pawns: 1, Knights/Bishops: 3, Rooks: 5, Queens: 9, Champions: 5
 */
export function getPieceCapturePoints(pieceType: string, isChampion: boolean = false): number {
  if (isChampion) return 5;
  switch (pieceType.toLowerCase()) {
    case 'p':
      return 1;
    case 'n':
      return 3;
    case 'b':
      return 3;
    case 'r':
      return 5;
    case 'q':
      return 9;
    default:
      return 0;
  }
}

export const POWERUP_NAMES: Record<keyof PowerUpsState, string> = {
  draw: 'Exchange',
  wild: 'Wild Move',
  vision: 'Vision Peek',
  monolith: 'Stone (Monolith)',
};

/**
 * Capture-Based Tactical Power-Up Refresh:
 * Capturing every 5 points of enemy pieces refreshes 1 stack of an available power-up from your pool
 * (Draw, Wild, Vision, and Stone if Expansion 1 or 2 is active).
 * Multiple thresholds reached in a single capture grant multiple refreshed stacks and roll over remainder points.
 */
export function awardCaptureRefresh(
  state: GameState,
  player: PlayerColor,
  capturePoints: number
): {
  refreshed: Array<{ type: keyof PowerUpsState; name: string; newCount: number }>;
  oldProgress: number;
  newProgress: number;
  stacksEarned: number;
} {
  if (capturePoints <= 0) {
    const curProg = (state.powerUpProgress && state.powerUpProgress[player]) || 0;
    return { refreshed: [], oldProgress: curProg, newProgress: curProg, stacksEarned: 0 };
  }

  if (!state.powerUpProgress) {
    state.powerUpProgress = { w: 0, b: 0 };
  }
  if (!state.powerUps) {
    state.powerUps = {
      w: { draw: 1, monolith: 1, wild: 1, vision: 1 },
      b: { draw: 1, monolith: 1, wild: 1, vision: 1 },
    };
  }

  const oldProgress = state.powerUpProgress[player] || 0;
  const total = oldProgress + capturePoints;
  const stacksEarned = Math.floor(total / 5);
  const newProgress = total % 5;
  state.powerUpProgress[player] = newProgress;

  const playerPowerUps = state.powerUps[player];
  const hasStone =
    state.expansions?.shiftedParadigm !== false ||
    state.expansions?.championsOfTheMonolith !== false;
  const pool: Array<keyof PowerUpsState> = ['draw', 'wild', 'vision'];
  if (hasStone) {
    pool.push('monolith');
  }

  const refreshed: Array<{ type: keyof PowerUpsState; name: string; newCount: number }> = [];

  for (let i = 0; i < stacksEarned; i++) {
    // Pick the power-up in pool with lowest stack count (prioritizing 0/spent stacks)
    let minVal = Infinity;
    for (const p of pool) {
      const val = playerPowerUps[p] ?? 0;
      if (val < minVal) {
        minVal = val;
      }
    }
    const candidates = pool.filter((p) => (playerPowerUps[p] ?? 0) === minVal);
    const chosen = candidates[0] || 'draw';
    playerPowerUps[chosen] = (playerPowerUps[chosen] ?? 0) + 1;
    refreshed.push({
      type: chosen,
      name: POWERUP_NAMES[chosen],
      newCount: playerPowerUps[chosen],
    });
  }

  return { refreshed, oldProgress, newProgress, stacksEarned };
}

/**
 * Calculates queen-like movement rays for King when Awakening: King is activated
 */
export function getQueenMovesForKing(
  square: Square,
  chess: Chess,
  restrictedSquares: string[] = [],
  monolithSquare: string | null = null,
  champions?: { w: ChampionPiece | null; b: ChampionPiece | null } | null,
  beaconProtectedSquares: string[] = [],
  awakenedRooks: AwakenedRookState[] = []
): string[] {
  const rankOrder=ranksFor(chess.fen());
  const piece = chess.get(square);
  if (!piece || piece.type !== 'k') return [];
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const f = files.indexOf(square[0]);
  const r = rankOrder.indexOf(square[1])+1;

  const directions = [
    [1, 0], [-1, 0], [0, 1], [0, -1], // Orthogonal (Rook)
    [1, 1], [1, -1], [-1, 1], [-1, -1], // Diagonal (Bishop)
  ];

  const enemyChamp = piece.color === 'w' ? champions?.b : champions?.w;
  const friendlyChamp = piece.color === 'w' ? champions?.w : champions?.b;
  const validSquares: string[] = [];

  for (const [df, dr] of directions) {
    let currF = f + df;
    let currR = r + dr;

    while (currF >= 0 && currF < 8 && currR >= 1 && currR <= rankOrder.length) {
      const targetSq = `${files[currF]}${rankOrder[currR-1]}`;

      if (targetSq === monolithSquare) break;
      if (friendlyChamp && friendlyChamp.square === targetSq) break;

      const pieceOnSquare = chess.get(targetSq as Square);

      if (pieceOnSquare) {
        if (pieceOnSquare.color === piece.color) {
          // Blocked by friendly piece
          break;
        } else {
          // Enemy piece! Can capture if not invulnerable
          const isInvulnerable =
            beaconProtectedSquares.includes(targetSq) ||
            awakenedRooks.some((ar) => ar.square === targetSq && ar.turnsRemaining > 0);
          if (!isInvulnerable && !restrictedSquares.includes(targetSq)) {
            validSquares.push(targetSq);
          }
          break; // Ray stops upon encountering enemy piece
        }
      }

      if (enemyChamp && enemyChamp.square === targetSq) {
        const isInvulnerable =
          beaconProtectedSquares.includes(targetSq) ||
          awakenedRooks.some((ar) => ar.square === targetSq && ar.turnsRemaining > 0);
        if (!isInvulnerable && !restrictedSquares.includes(targetSq)) {
          validSquares.push(targetSq);
        }
        break;
      }

      // Empty square
      if (!restrictedSquares.includes(targetSq)) {
        validSquares.push(targetSq);
      }

      currF += df;
      currR += dr;
    }
  }

  return validSquares;
}

/**
 * Calculates pieces of a player's color that have been captured by the opponent,
 * based on standard initial army of 8 pawns, 2 knights, 2 bishops, 2 rooks, 1 queen.
 */
export function getCapturedPieces(chess: Chess, color: PlayerColor): StandardPieceType[] {
  const initialCounts: Record<StandardPieceType, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 0 };
  const currentCounts: Record<StandardPieceType, number> = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };

  const board = chess.board();
  for (const row of board) {
    for (const sq of row) {
      if (sq && sq.color === color && sq.type in currentCounts) {
        currentCounts[sq.type as StandardPieceType]++;
      }
    }
  }

  const captured: StandardPieceType[] = [];
  const order: StandardPieceType[] = ['q', 'r', 'b', 'n', 'p'];
  for (const type of order) {
    const diff = Math.max(0, (initialCounts[type] || 0) - (currentCounts[type] || 0));
    for (let i = 0; i < diff; i++) {
      captured.push(type);
    }
  }
  return captured;
}

export function isPathBlockedBySquare(from: string, to: string, obstacle: string | null): boolean {
  if (!obstacle || obstacle.length !== 2) return false;
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const f1 = files.indexOf(from[0]);
  const r1 = parseInt(from[1], 10);
  const f2 = files.indexOf(to[0]);
  const r2 = parseInt(to[1], 10);
  const fo = files.indexOf(obstacle[0]);
  const ro = parseInt(obstacle[1], 10);

  if (f1 === -1 || f2 === -1 || fo === -1 || isNaN(r1) || isNaN(r2) || isNaN(ro)) return false;

  const df = Math.sign(f2 - f1);
  const dr = Math.sign(r2 - r1);

  // Check if to is along the same ray
  const isStraight = f1 === f2 || r1 === r2;
  const isDiagonal = Math.abs(f2 - f1) === Math.abs(r2 - r1);
  if (!isStraight && !isDiagonal) return false;

  let currF = f1 + df;
  let currR = r1 + dr;

  while (currF !== f2 || currR !== r2) {
    if (currF === fo && currR === ro) {
      return true; // Obstacle is strictly between from and to
    }
    currF += df;
    currR += dr;
  }

  return false;
}

function isPathBlockedByMonolith(from: string, to: string, monolith: string): boolean {
  return isPathBlockedBySquare(from, to, monolith);
}

function canPieceAttackSquare(
  from: string,
  to: string,
  pieceType: StandardPieceType,
  color: PlayerColor,
  chess: Chess,
  restrictedSquares: string[]
): boolean {
  const rankOrder=ranksFor(chess.fen());
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const f1 = files.indexOf(from[0]);
  const r1 = rankOrder.indexOf(from[1])+1;
  const f2 = files.indexOf(to[0]);
  const r2 = rankOrder.indexOf(to[1])+1;
  const df = f2 - f1;
  const dr = r2 - r1;

  if (restrictedSquares.includes(to)) return false;

  switch (pieceType) {
    case 'p': {
      // Pawn attacks diagonally 1 step forward
      const forward = color === 'w' ? 1 : -1;
      return dr === forward && Math.abs(df) === 1;
    }
    case 'n': {
      // Knight L-shape
      return (Math.abs(df) === 1 && Math.abs(dr) === 2) || (Math.abs(df) === 2 && Math.abs(dr) === 1);
    }
    case 'b': {
      // Bishop diagonal line of sight
      if (Math.abs(df) !== Math.abs(dr)) return false;
      return hasClearPath(from, to, chess, restrictedSquares);
    }
    case 'r': {
      // Rook orthogonal line of sight
      if (df !== 0 && dr !== 0) return false;
      return hasClearPath(from, to, chess, restrictedSquares);
    }
    case 'q': {
      // Queen diagonal or orthogonal
      const isDiag = Math.abs(df) === Math.abs(dr);
      const isOrth = df === 0 || dr === 0;
      if (!isDiag && !isOrth) return false;
      return hasClearPath(from, to, chess, restrictedSquares);
    }
    case 'k': {
      // King 1 step any direction
      return Math.abs(df) <= 1 && Math.abs(dr) <= 1;
    }
  }
}

function hasClearPath(
  from: string,
  to: string,
  chess: Chess,
  restrictedSquares: string[]
): boolean {
  const rankOrder=ranksFor(chess.fen());
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const f1 = files.indexOf(from[0]);
  const r1 = rankOrder.indexOf(from[1])+1;
  const f2 = files.indexOf(to[0]);
  const r2 = rankOrder.indexOf(to[1])+1;

  const df = Math.sign(f2 - f1);
  const dr = Math.sign(r2 - r1);

  let currF = f1 + df;
  let currR = r1 + dr;

  while (currF !== f2 || currR !== r2) {
    const sq = `${files[currF]}${rankOrder[currR-1]}`;
    if (restrictedSquares.includes(sq) || chess.get(sq as Square)) {
      return false;
    }
    currF += df;
    currR += dr;
  }

  return true;
}

/**
 * Checks if a card permits moving a specific piece.
 */
export function isCardPermittedForPiece(
  card: Card,
  pieceType: StandardPieceType,
  lastMovedPiece: StandardPieceType | null,
  asWild?: boolean
): boolean {
  if (card.type === 'brick' || card.type === 'refresh') return false;
  if (asWild || card.isJokerWild || card.type === 'wild') return true;
  switch (card.type) {
    case 'pawn':
    case 'awakening_pawn':
      return pieceType === 'p';
    case 'knight':
    case 'awakening_knight':
      return pieceType === 'n';
    case 'bishop':
    case 'awakening_bishop':
      return pieceType === 'b';
    case 'rook':
    case 'awakening_rook':
      return pieceType === 'r';
    case 'queen':
    case 'awakening_queen':
      return pieceType === 'q';
    case 'awakening_king':
      return pieceType === 'k';
    case 'previous':
      return lastMovedPiece !== null && pieceType === lastMovedPiece;
    case 'push':
      return true;
    default:
      return false;
  }
}

/**
 * Determines whether a player whose King is in check has any legal means
 * to escape check on their current turn:
 * 1. Stepping the King to an unattacked, unrestricted, non-monolith square.
 * 2. Moving an active Champion to block or capture the checking piece.
 * 3. Moving a standard piece (Pawn, Knight, Bishop, Rook, Queen) to block/capture,
 *    provided the player holds a valid card in hand (or Tactical Wild power-up) for that piece!
 * 4. Playing a Champion Ultimate skill that eliminates the checking piece or blocks.
 * 5. Playing a Push card to push a piece out of check or block the attack.
 * 6. Playing a Switch card to swap pieces and relieve check.
 * 7. Placing a Monolith (via card or power-up) to block a sliding checking line of sight.
 * 8. Playing a Clock card to revert the previous turn (if unblocked).
 * 9. Playing a Joker card (which provides 5 Wild cards for any piece move).
 */
export function canPlayerEscapeCheck(
  chess: Chess,
  state: GameState,
  defendingColor: PlayerColor,
  allowRefresh = true
): boolean {
  const protectedSquares = state.beaconEffect?.active && state.monolithSquare ? getSurroundingSquares(state.monolithSquare,state.fen) : [];

  if(isExtendedFen(state.fen))return frontierKingSafe(state,defendingColor)||frontierEscape(state,defendingColor);
  // If King is not in check, no need to escape
  if (!isKingChecked(chess, defendingColor, state.monolithSquare, state.champions, protectedSquares, state.grounds)) {
    return true;
  }

  // Find King square
  let kingSquare: Square | null = null;
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (p && p.type === 'k' && p.color === defendingColor) {
        const fileChar = String.fromCharCode('a'.charCodeAt(0) + f);
        const rankChar = (8 - r).toString();
        kingSquare = `${fileChar}${rankChar}` as Square;
        break;
      }
    }
    if (kingSquare) break;
  }
  if (!kingSquare) return false;

  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const kf = files.indexOf(kingSquare[0]);
  const kr = parseInt(kingSquare[1], 10);
  const friendlyChamp = state.champions ? state.champions[defendingColor] : null;
  const enemyChamp = state.champions ? state.champions[defendingColor === 'w' ? 'b' : 'w'] : null;
  const restrictedSquares = state.restrictedSquares || [];
  const monolithSquare = state.monolithSquare;

  // --- MEANS 1: King moves (does not require a card) ---
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (df === 0 && dr === 0) continue;
      const nf = kf + df;
      const nr = kr + dr;
      if (nf < 0 || nf > 7 || nr < 1 || nr > 8) continue;
      const targetSq = `${files[nf]}${nr}` as Square;

      if (targetSq === monolithSquare) continue;
      if (restrictedSquares.includes(targetSq)) continue;
      if (friendlyChamp && friendlyChamp.square === targetSq) continue;

      const destPiece = chess.get(targetSq);
      if (destPiece && destPiece.color === defendingColor) continue;
      if (destPiece && protectedSquares.includes(targetSq)) continue;
      if (enemyChamp && enemyChamp.square === targetSq && protectedSquares.includes(targetSq)) continue;

      // Simulate King stepping to targetSq
      const testChess = createSafeChess(chess.fen());
      testChess.remove(kingSquare);
      if (destPiece) testChess.remove(targetSq);
      testChess.put({ type: 'k', color: defendingColor }, targetSq);

      const remainingChamps = state.champions ? { ...state.champions } : null;
      if (remainingChamps && enemyChamp && enemyChamp.square === targetSq) {
        const enemyColor = defendingColor === 'w' ? 'b' : 'w';
        remainingChamps[enemyColor] = null;
      }

      if (!isKingChecked(testChess, defendingColor, monolithSquare, remainingChamps, protectedSquares, state.grounds)) {
        return true; // King can safely step away
      }
    }
  }

  // --- MEANS 2: Champion Normal Move (does not require a card) ---
  if (friendlyChamp && friendlyChamp.square) {
    const champMoves = getChampionNormalMoves(
      friendlyChamp,
      chess,
      restrictedSquares,
      monolithSquare,
      enemyChamp,
      state.staticEffect?.stunnedSquares || [],
      protectedSquares,
      state.awakenedRooks || [], undefined, state.grounds
    );
    for (const toSq of champMoves) {
      const testChess = createSafeChess(chess.fen());
      const captured = testChess.get(toSq as Square);
      if (captured) testChess.remove(toSq as Square);

      const enemyColor = defendingColor === 'w' ? 'b' : 'w';
      const updatedChamps = state.champions
        ? {
            ...state.champions,
            [defendingColor]: { ...friendlyChamp, square: toSq },
            [enemyColor]: enemyChamp && enemyChamp.square === toSq ? null : state.champions[enemyColor],
          }
        : null;

      if (!isKingChecked(testChess, defendingColor, monolithSquare, updatedChamps, protectedSquares, state.grounds)) {
        return true; // Champion move blocks/captures and saves King
      }
    }
  }

  // --- MEANS 3: Hand Analysis for Standard Piece Moves ---
  const hand = state.hands[defendingColor] || [];
  for(const card of hand)if(card.type==='soul_release'&&card.soul)for(const q of soulTargets(state,card,defendingColor)){
    const preview=structuredClone(state);placeRevived(preview,q,card.soul.piece,defendingColor,'escape_preview');landGround(preview,q);
    if(kingSafe(preview,defendingColor))return true;
  }

  const lastMoved = state.lastMovedPiece ? state.lastMovedPiece[defendingColor] : null;
  const hasTacticalWild = Boolean(state.powerUps && state.powerUps[defendingColor]?.wild);

  // If player has a Joker card, playing it gives 5 Wild cards on this turn
  if (allowRefresh && !state.jokerLocked?.[defendingColor] && hand.some(c=>c.type==='refresh')) {
    const available=[...state.deck,...state.discard,...hand].filter(c=>c.type!=='refresh'&&c.type!=='brick');
    const preview={...state,hands:{...state.hands,[defendingColor]:available}};
    if(canPlayerEscapeCheck(chess,preview,defendingColor,false))return true;
  }
  const hasJoker = hand.some((c) => c.type === 'joker');

  // Determine which piece types the player has the card/power-up means to play
  const playablePieceTypes = new Set<StandardPieceType>();
  if (hasTacticalWild || hasJoker || hand.some((c) => c.type === 'wild' || c.isJokerWild)) {
    playablePieceTypes.add('p');
    playablePieceTypes.add('n');
    playablePieceTypes.add('b');
    playablePieceTypes.add('r');
    playablePieceTypes.add('q');
  } else {
    for (const c of hand) {
      if (c.type === 'pawn') playablePieceTypes.add('p');
      else if (c.type === 'knight') playablePieceTypes.add('n');
      else if (c.type === 'bishop') playablePieceTypes.add('b');
      else if (c.type === 'rook') playablePieceTypes.add('r');
      else if (c.type === 'queen') playablePieceTypes.add('q');
      else if (c.type === 'previous' && lastMoved) {
        playablePieceTypes.add(lastMoved);
      }
    }
  }

  // If player can play at least one standard piece type, test if any of those pieces has an escape move
  if (playablePieceTypes.size > 0) {
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const p = board[r][f];
        if (p && p.color === defendingColor && p.type !== 'k') {
          if (!playablePieceTypes.has(p.type)) continue;

          const fromSq = `${files[f]}${8 - r}` as Square;
          if (state.staticEffect?.stunnedSquares?.includes(fromSq)) continue;

          const candidateMoves = getLegalMovesForPiece(
            fromSq,
            chess,
            restrictedSquares,
            monolithSquare,
            state.staticEffect?.stunnedSquares || [],
            protectedSquares,
            friendlyChamp?.square || null,
            enemyChamp,
            state.champions,
            state.awakenedRooks || [],
            state.superPawns || [],
            state.superKnights || [], undefined, state.grounds
          );

          for (const toSq of candidateMoves) {
            const testChess = createSafeChess(chess.fen());
            const movingPiece = testChess.get(fromSq);
            if (!movingPiece) continue;
            testChess.remove(fromSq);
            const captured = testChess.get(toSq as Square);
            if (captured) testChess.remove(toSq as Square);

            const isPromo =
              movingPiece.type === 'p' &&
              ((defendingColor === 'w' && toSq[1] === '8') ||
                (defendingColor === 'b' && toSq[1] === '1'));
            testChess.put(
              { type: isPromo ? 'q' : movingPiece.type, color: defendingColor },
              toSq as Square
            );

            const remainingChamps = state.champions ? { ...state.champions } : null;
            if (remainingChamps && enemyChamp && enemyChamp.square === toSq) {
              const enemyColor = defendingColor === 'w' ? 'b' : 'w';
              remainingChamps[enemyColor] = null;
            }

            if (!isKingChecked(testChess, defendingColor, monolithSquare, remainingChamps, protectedSquares, state.grounds)) {
              return true; // Playing this piece card escapes check!
            }
          }
        }
      }
    }
  }

  // --- MEANS 4: Push Card in hand (All friendly pieces can be pushed) ---
  if (hand.some((c) => c.type === 'push')) {
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const fromSq = `${files[f]}${8 - r}`;
        const pieceToPush = chess.get(fromSq as Square);
        const isMyChamp = friendlyChamp?.square === fromSq;
        if ((!pieceToPush || pieceToPush.color !== defendingColor) && !isMyChamp) continue;

        const pushDests = getPushMoves(
          fromSq,
          chess,
          restrictedSquares,
          monolithSquare,
          state.champions
        );
        for (const destSq of pushDests) {
          const testChess = createSafeChess(chess.fen());
          if (pieceToPush) {
            testChess.remove(fromSq as Square);
            testChess.put(pieceToPush, destSq as Square);
          }
          const testChamps = state.champions ? {
            w: defendingColor === 'w' && isMyChamp ? { ...state.champions.w!, square: destSq } : state.champions.w,
            b: defendingColor === 'b' && isMyChamp ? { ...state.champions.b!, square: destSq } : state.champions.b,
          } : null;
          if (!isKingChecked(testChess, defendingColor, monolithSquare, testChamps, protectedSquares, state.grounds)) {
            return true; // Push escapes check!
          }
        }
      }
    }
  }

  // --- MEANS 5: Switch Card in hand ---
  if (hand.some((c) => c.type === 'switch')) {
    const friendlyUnits: { square: string; isChamp: boolean; piece?: any }[] = [];
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const sq = `${files[f]}${8 - r}`;
        const p = chess.get(sq as Square);
        if (p && p.color === defendingColor) {
          friendlyUnits.push({ square: sq, isChamp: false, piece: p });
        }
      }
    }
    if (friendlyChamp?.square) {
      friendlyUnits.push({ square: friendlyChamp.square, isChamp: true });
    }

    for (let i = 0; i < friendlyUnits.length; i++) {
      for (let j = i + 1; j < friendlyUnits.length; j++) {
        const u1 = friendlyUnits[i];
        const u2 = friendlyUnits[j];
        const testChess = createSafeChess(chess.fen());
        let testChamps = state.champions ? { ...state.champions } : null;

        if (u1.isChamp && !u2.isChamp) {
          testChess.remove(u2.square as Square);
          testChess.put(u2.piece, u1.square as Square);
          if (testChamps) testChamps[defendingColor] = { ...friendlyChamp!, square: u2.square };
        } else if (!u1.isChamp && u2.isChamp) {
          testChess.remove(u1.square as Square);
          testChess.put(u1.piece, u2.square as Square);
          if (testChamps) testChamps[defendingColor] = { ...friendlyChamp!, square: u1.square };
        } else if (!u1.isChamp && !u2.isChamp) {
          testChess.remove(u1.square as Square);
          testChess.remove(u2.square as Square);
          testChess.put(u2.piece, u1.square as Square);
          testChess.put(u1.piece, u2.square as Square);
        }

        if (!isKingChecked(testChess, defendingColor, monolithSquare, testChamps, protectedSquares, state.grounds)) {
          return true; // Switch escapes check!
        }
      }
    }
  }

  // --- MEANS 6: Monolith (Card or Power-Up) to block line of sight ---
  const hasMonolithCard = hand.some((c) => c.type === 'monolith');
  const hasMonolithPowerUp = Boolean(state.powerUps && state.powerUps[defendingColor]?.monolith);
  if (hasMonolithCard || hasMonolithPowerUp) {
    for (let r = 1; r <= 8; r++) {
      for (let f = 0; f < 8; f++) {
        const emptySq = `${files[f]}${r}`;
        if (
          !chess.get(emptySq as Square) &&
          emptySq !== monolithSquare &&
          !restrictedSquares.includes(emptySq) &&
          !(friendlyChamp && friendlyChamp.square === emptySq) &&
          !(enemyChamp && enemyChamp.square === emptySq)
        ) {
          if (!isKingChecked(chess, defendingColor, emptySq, state.champions, undefined, state.grounds)) {
            return true; // Placing Monolith blocks checking line of sight!
          }
        }
      }
    }
  }

  // --- MEANS 7: Clock Card (Turn Rewind) ---
  if (hand.some((c) => c.type === 'clock')) {
    const clockReason = getClockBlockReason(state, defendingColor);
    if (!clockReason) {
      return true; // Can rewind before the checking move!
    }
  }

  // --- MEANS 8: Champion Ultimate Skill ---
  if (hand.some((c) => c.type === 'champion') && friendlyChamp && friendlyChamp.square) {
    if (friendlyChamp.type === 'berserker') {
      const bMoves = getBerserkerUltimateMoves(
        friendlyChamp,
        chess,
        restrictedSquares,
        monolithSquare,
        enemyChamp,
        protectedSquares,
        state.awakenedRooks || []
      );
      for (const toSq of bMoves) {
        const testChess = createSafeChess(chess.fen());
        const captured = testChess.get(toSq as Square);
        if (captured) testChess.remove(toSq as Square);
        const updatedChamps = state.champions
          ? {
              ...state.champions,
              [defendingColor]: { ...friendlyChamp, square: toSq },
            }
          : null;
        if (!isKingChecked(testChess, defendingColor, monolithSquare, updatedChamps, protectedSquares, state.grounds)) {
          return true;
        }
      }
    } else if (friendlyChamp.type === 'musketeer') {
      const snipeTargets = getMusketeerSnipeTargets(
        friendlyChamp,
        chess,
        monolithSquare,
        enemyChamp,
        protectedSquares,
        state.awakenedRooks || []
      );
      for (const toSq of snipeTargets) {
        const testChess = createSafeChess(chess.fen());
        testChess.remove(toSq as Square);
        const remainingChamps = state.champions ? { ...state.champions } : null;
        if (remainingChamps && enemyChamp && enemyChamp.square === toSq) {
          const enemyColor = defendingColor === 'w' ? 'b' : 'w';
          remainingChamps[enemyColor] = null;
        }
        if (!isKingChecked(testChess, defendingColor, monolithSquare, remainingChamps, protectedSquares, state.grounds)) {
          return true; // Sniping checking piece removes check!
        }
      }
    } else if (friendlyChamp.type === 'summoner') {
      const placements = getSummonerPlacementSquares(
        friendlyChamp.square,
        defendingColor,
        chess,
        restrictedSquares,
        monolithSquare,
        enemyChamp,
        protectedSquares,
        state.awakenedRooks || []
      );
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          const sq = `${files[f]}${8 - r}` as Square;
          const fp = chess.get(sq);
          if (fp && fp.color === defendingColor && fp.type !== 'k') {
            for (const toSq of placements) {
              const testChess = createSafeChess(chess.fen());
              testChess.remove(sq);
              testChess.put(fp, toSq as Square);
              if (!isKingChecked(testChess, defendingColor, monolithSquare, state.champions, protectedSquares, state.grounds)) {
                return true;
              }
            }
          }
        }
      }
    } else if (friendlyChamp.type === 'ninja') {
      const targets = getNinjaAdjacentEnemyPieces(
        friendlyChamp.square,
        defendingColor,
        chess,
        enemyChamp,
        protectedSquares,
        state.awakenedRooks || []
      );
      for (const t of targets) {
        const testChess = createSafeChess(chess.fen());
        testChess.remove(t as Square);
        const remainingChamps = state.champions ? { ...state.champions } : null;
        if (remainingChamps && enemyChamp && enemyChamp.square === t) {
          const enemyColor = defendingColor === 'w' ? 'b' : 'w';
          remainingChamps[enemyColor] = null;
        }
        if (!isKingChecked(testChess, defendingColor, monolithSquare, remainingChamps, protectedSquares, state.grounds)) {
          return true;
        }
      }
    }
  }

  // All escape avenues exhausted: player is in checkmate!
  return false;
}

/**
 * Returns which card types in the defending player's hand can be used to escape check:
 * 'monolith' | 'switch' | 'push' | 'clock'
 * Used to make these cards glow and highlight in the player's hand during check!
 */
export function getCheckEscapeCardTypes(
  chess: Chess,
  state: GameState,
  defendingColor: PlayerColor
): Set<CardType> {
  const escapeTypes = new Set<CardType>();
  if(isExtendedFen(state.fen)){for(const card of state.hands[defendingColor]){if(!['push','switch','monolith','clock','traverse'].includes(card.type)||card.id===state.frontier?.bind?.cardId)continue;const draft=structuredClone(state);draft.hands[defendingColor]=[card];if(frontierEscape(draft,defendingColor))escapeTypes.add(card.type);}return escapeTypes;}
  const protectedSquares = state.beaconEffect?.active && state.monolithSquare ? getSurroundingSquares(state.monolithSquare,state.fen) : [];

  if (!isKingChecked(chess, defendingColor, state.monolithSquare, state.champions, protectedSquares, state.grounds)) {
    return escapeTypes;
  }

  const hand = state.hands[defendingColor] || [];
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const restrictedSquares = state.restrictedSquares || [];
  const monolithSquare = state.monolithSquare;
  const friendlyChamp = state.champions ? state.champions[defendingColor] : null;
  const enemyChamp = state.champions ? state.champions[defendingColor === 'w' ? 'b' : 'w'] : null;

  // 1. Monolith (Card or Power-Up)
  const hasMonolithCard = hand.some((c) => c.type === 'monolith');
  const hasMonolithPowerUp = Boolean(state.powerUps && state.powerUps[defendingColor]?.monolith);
  if (hasMonolithCard || hasMonolithPowerUp) {
    let canEscapeWithMonolith = false;
    for (let r = 1; r <= 8 && !canEscapeWithMonolith; r++) {
      for (let f = 0; f < 8 && !canEscapeWithMonolith; f++) {
        const emptySq = `${files[f]}${r}`;
        if (
          !chess.get(emptySq as Square) &&
          emptySq !== monolithSquare &&
          !restrictedSquares.includes(emptySq) &&
          !(friendlyChamp && friendlyChamp.square === emptySq) &&
          !(enemyChamp && enemyChamp.square === emptySq)
        ) {
          if (!isKingChecked(chess, defendingColor, emptySq, state.champions, protectedSquares, state.grounds)) {
            canEscapeWithMonolith = true;
          }
        }
      }
    }
    if (canEscapeWithMonolith) {
      escapeTypes.add('monolith');
    }
  }

  // 2. Switch
  if (hand.some((c) => c.type === 'switch')) {
    const friendlyUnits: { square: string; isChamp: boolean; piece?: any }[] = [];
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const sq = `${files[f]}${8 - r}`;
        const p = chess.get(sq as Square);
        if (p && p.color === defendingColor) {
          friendlyUnits.push({ square: sq, isChamp: false, piece: p });
        }
      }
    }
    if (friendlyChamp?.square) {
      friendlyUnits.push({ square: friendlyChamp.square, isChamp: true });
    }

    let canEscapeWithSwitch = false;
    for (let i = 0; i < friendlyUnits.length && !canEscapeWithSwitch; i++) {
      for (let j = i + 1; j < friendlyUnits.length && !canEscapeWithSwitch; j++) {
        const u1 = friendlyUnits[i];
        const u2 = friendlyUnits[j];
        const testChess = createSafeChess(chess.fen());
        let testChamps = state.champions ? { ...state.champions } : null;

        if (u1.isChamp && !u2.isChamp) {
          testChess.remove(u2.square as Square);
          testChess.put(u2.piece, u1.square as Square);
          if (testChamps) testChamps[defendingColor] = { ...friendlyChamp!, square: u2.square };
        } else if (!u1.isChamp && u2.isChamp) {
          testChess.remove(u1.square as Square);
          testChess.put(u1.piece, u2.square as Square);
          if (testChamps) testChamps[defendingColor] = { ...friendlyChamp!, square: u1.square };
        } else if (!u1.isChamp && !u2.isChamp) {
          testChess.remove(u1.square as Square);
          testChess.remove(u2.square as Square);
          testChess.put(u2.piece, u1.square as Square);
          testChess.put(u1.piece, u2.square as Square);
        }

        if (!isKingChecked(testChess, defendingColor, monolithSquare, testChamps, protectedSquares, state.grounds)) {
          canEscapeWithSwitch = true;
        }
      }
    }
    if (canEscapeWithSwitch) {
      escapeTypes.add('switch');
    }
  }

  // 3. Push (Only defending player's friendly pieces or champion)
  if (hand.some((c) => c.type === 'push')) {
    let canEscapeWithPush = false;
    for (let r = 0; r < 8 && !canEscapeWithPush; r++) {
      for (let f = 0; f < 8 && !canEscapeWithPush; f++) {
        const fromSq = `${files[f]}${8 - r}`;
        const pieceToPush = chess.get(fromSq as Square);
        const isMyChamp = state.champions?.[defendingColor]?.square === fromSq;
        if ((!pieceToPush || pieceToPush.color !== defendingColor) && !isMyChamp) continue;

        const pushDests = getPushMoves(
          fromSq,
          chess,
          restrictedSquares,
          monolithSquare,
          state.champions
        );
        for (const destSq of pushDests) {
          const testChess = createSafeChess(chess.fen());
          if (pieceToPush) {
            testChess.remove(fromSq as Square);
            testChess.put(pieceToPush, destSq as Square);
          }
          const testChamps = state.champions ? {
            w: defendingColor === 'w' && isMyChamp ? { ...state.champions.w!, square: destSq } : state.champions.w,
            b: defendingColor === 'b' && isMyChamp ? { ...state.champions.b!, square: destSq } : state.champions.b,
          } : null;
          if (!isKingChecked(testChess, defendingColor, monolithSquare, testChamps, protectedSquares, state.grounds)) {
            canEscapeWithPush = true;
            break;
          }
        }
      }
    }
    if (canEscapeWithPush) {
      escapeTypes.add('push');
    }
  }

  // 4. Clock
  if (hand.some((c) => c.type === 'clock')) {
    const clockReason = getClockBlockReason(state, defendingColor);
    if (!clockReason) {
      escapeTypes.add('clock');
    }
  }

  return escapeTypes;
}

/**
 * Check game end conditions:
 * 1. Opponent piece points on board <= 9 => instant win!
 * 2. Accurate Checkmate (evaluating King check & whether defending hand/board has means to escape)
 * 3. Stalemate / Draw
 * 4. King missing
 */
export function evaluateGameEnd(
  chess: Chess,
  state: GameState
): {
  status: GameStatus;
  winner: PlayerColor | 'draw' | null;
  winReason: string | null;
  whitePoints: number;
  blackPoints: number;
} {
  const whitePoints = calculatePiecePoints(chess, 'w', state.champions, state) + (state.grounds?.banished.filter(x=>x.piece.color==='w'&&!state.soulSummons?.some(t=>t.pieceId===x.pieceId)).reduce((n,x)=>n+(({p:1,sp:1,n:3,sn:3,b:3,r:5,q:9} as any)[x.piece.type]||5),0)||0);
  const blackPoints = calculatePiecePoints(chess, 'b', state.champions, state) + (state.grounds?.banished.filter(x=>x.piece.color==='b'&&!state.soulSummons?.some(t=>t.pieceId===x.pieceId)).reduce((n,x)=>n+(({p:1,sp:1,n:3,sn:3,b:3,r:5,q:9} as any)[x.piece.type]||5),0)||0);

  // Check if a king was somehow captured
  const board = chess.board();
  let hasWhiteKing = false;
  let hasBlackKing = false;
  for (const row of board) {
    for (const p of row) {
      if (p && p.type === 'k') {
        if (p.color === 'w') hasWhiteKing = true;
        if (p.color === 'b') hasBlackKing = true;
      }
    }
  }

  if (!hasWhiteKing) {
    return {
      status: 'checkmate',
      winner: 'b',
      winReason: 'White King was eliminated. Black wins!',
      whitePoints,
      blackPoints,
    };
  }
  if (!hasBlackKing) {
    return {
      status: 'checkmate',
      winner: 'w',
      winReason: 'Black King was eliminated. White wins!',
      whitePoints,
      blackPoints,
    };
  }

  // 9 OR LOWER POINT WIN CONDITION:
  // "Add an additional win condition where if your opponent's total piece points left in the board is 9 or lower, you win the game."
  if (blackPoints <= 9) {
    return {
      status: 'points_win',
      winner: 'w',
      winReason: `Black's army depleted to ${blackPoints} pts (<= 9). White achieves Tactical Victory!`,
      whitePoints,
      blackPoints,
    };
  }
  if (whitePoints <= 9) {
    return {
      status: 'points_win',
      winner: 'b',
      winReason: `White's army depleted to ${whitePoints} pts (<= 9). Black achieves Tactical Victory!`,
      whitePoints,
      blackPoints,
    };
  }

  // CHECKMATE EVALUATION:
  // Check the player whose turn it now is (the defending player)
  const currentTurn = chess.turn();
  const beaconSquares = state.beaconEffect?.active && state.monolithSquare ? getSurroundingSquares(state.monolithSquare) : [];
  const inCheck = isExtendedFen(state.fen)?!frontierKingSafe(state,currentTurn):isKingChecked(chess, currentTurn, state.monolithSquare, state.champions, beaconSquares, state.grounds);

  if (inCheck) {
    const canEscape = isExtendedFen(state.fen)?frontierEscape(state,currentTurn):canPlayerEscapeCheck(chess, state, currentTurn);
    if (!canEscape) {
      const winner = currentTurn === 'w' ? 'b' : 'w';
      const winnerName = winner === 'w' ? 'White' : 'Black';
      const loserName = currentTurn === 'w' ? 'White' : 'Black';
      return {
        status: 'checkmate',
        winner,
        winReason: `Checkmate! ${winnerName} delivers checkmate against ${loserName}!`,
        whitePoints,
        blackPoints,
      };
    }
  }

  // DRAW / STALEMATE (Insufficient material or threefold repetition)
  if (chess.isDraw() || chess.isThreefoldRepetition() || chess.isInsufficientMaterial()) {
    return {
      status: 'draw',
      winner: 'draw',
      winReason: chess.isInsufficientMaterial() ? 'Draw by Insufficient Material' : 'Draw',
      whitePoints,
      blackPoints,
    };
  }

  return {
    status: 'playing',
    winner: null,
    winReason: null,
    whitePoints,
    blackPoints,
  };
}

/**
 * Returns all squares in the 3x3 surrounding region of a center square (e.g. around the Monolith).
 */
export function getSurroundingSquares(centerSquare: string | null,fen?:string): string[] {
  if(fen&&isExtendedFen(fen))return centerSquare?adjacent(centerSquare,fen,true):[];
  if (!centerSquare || centerSquare.length !== 2) return [];
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const f = files.indexOf(centerSquare[0]);
  const r = parseInt(centerSquare[1], 10);
  if (f === -1 || isNaN(r)) return [];

  const squares: string[] = [];
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      const nf = f + df;
      const nr = r + dr;
      if (nf >= 0 && nf < 8 && nr >= 1 && nr <= 8) {
        squares.push(`${files[nf]}${nr}`);
      }
    }
  }
  return squares;
}

/**
 * Valid squares to deploy a champion: empty square on player's side of the board.
 * White side: Ranks 1 to 4. Black side: Ranks 5 to 8.
 */
export function getChampionDeploySquares(
  color: PlayerColor,
  chess: Chess,
  restrictedSquares: string[],
  monolithSquare: string | null,
  otherChampion: ChampionPiece | null
): string[] {
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const minRank = color === 'w' ? 1 : 5;
  const maxRank = color === 'w' ? 4 : 8;

  const validSquares: string[] = [];
  for (const f of files) {
    for (let r = minRank; r <= maxRank; r++) {
      const sq = `${f}${r}`;
      if (restrictedSquares.includes(sq)) continue;
      if (monolithSquare === sq) continue;
      if (chess.get(sq as Square)) continue;
      if (otherChampion && otherChampion.square === sq) continue;
      validSquares.push(sq);
    }
  }
  return validSquares;
}

/**
 * Valid standard moves for an active Champion piece (no card required to move it):
 * - Berserker, Musketeer, Summoner: Move & capture like a King (1 square in all 8 directions).
 * - Ninja: Moves like a Queen, but CANNOT capture.
 */
export function getChampionNormalMoves(
  champion: ChampionPiece,
  chess: Chess,
  restrictedSquares: string[],
  monolithSquare: string | null,
  enemyChampion: ChampionPiece | null,
  staticStunnedSquares: string[] = [],
  beaconProtectedSquares: string[] = [],
  awakenedRooks: AwakenedRookState[] = [],
  awakenedPieces: string[] = [],
  grounds?: Grounds
): string[] {
  const rankOrder=ranksFor(chess.fen());
  if (staticStunnedSquares.includes(champion.square)) {
    return [];
  }

  if(isExtendedFen(chess.fen()))return frontierMoves(movementState(chess,restrictedSquares,monolithSquare,{[champion.color]:champion,[champion.color==='w'?'b':'w']:enemyChampion},staticStunnedSquares,beaconProtectedSquares,awakenedRooks,[],[],grounds),champion.square);
  const powered=grounds?groundMoves({fen:chess.fen(),grounds,champions:{[champion.color]:champion,[champion.color==='w'?'b':'w']:enemyChampion},restrictedSquares,monolithSquare} as any,champion.square):undefined;
  if(powered)return powered;
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const f = files.indexOf(champion.square[0]);
  const r = rankOrder.indexOf(champion.square[1])+1;
  if (f === -1 || isNaN(r)) return [];

  const moves: string[] = [];

  // Berserker, Musketeer, Summoner: Move & capture like a King
  if (champion.type === 'berserker' || champion.type === 'musketeer' || champion.type === 'summoner') {
    for (let df = -1; df <= 1; df++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (df === 0 && dr === 0) continue;
        const nf = f + df;
        const nr = r + dr;
        if (nf < 0 || nf >= 8 || nr < 1 || nr > rankOrder.length) continue;
        const sq = `${files[nf]}${rankOrder[nr-1]}`;

        if (restrictedSquares.includes(sq)) continue;
        if (monolithSquare === sq) continue;

        const pieceOnSq = chess.get(sq as Square);
        if (pieceOnSq) {
          if (pieceOnSq.color === champion.color) continue;
          if (beaconProtectedSquares.includes(sq)) continue;
          const isProtectedRook =
            (pieceOnSq.type === 'r' && (
              awakenedPieces.includes(sq) ||
              awakenedRooks.some((ar) => ar.square === sq && ar.color !== champion.color && (ar.turnsRemaining === undefined || ar.turnsRemaining > 0))
            )) ||
            awakenedRooks.some((ar) => ar.square === sq && ar.color !== champion.color && (ar.turnsRemaining === undefined || ar.turnsRemaining > 0));
          if (isProtectedRook) continue;
          moves.push(sq);
        } else if (enemyChampion && enemyChampion.square === sq) {
          if (beaconProtectedSquares.includes(sq)) continue;
          moves.push(sq);
        } else {
          moves.push(sq);
        }
      }
    }
    return moves.filter(to=>{const victim=chess.get(to as Square);const capture=!!victim&&victim.color!==champion.color||enemyChampion?.square===to;return !(capture&&(grounds?.disarm.some(d=>d.square===champion.square)||(grounds?.tiles[to]==='defense'&&victim?.type!=='k')));});
  }

  // Ninja: Moves like a Queen, but CANNOT capture
  if (champion.type === 'ninja') {
    const directions: [number, number][] = [
      [0, 1], [0, -1], [1, 0], [-1, 0],
      [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];

    for (const [df, dr] of directions) {
      let nf = f + df;
      let nr = r + dr;
      while (nf >= 0 && nf < 8 && nr >= 1 && nr <= rankOrder.length) {
        const sq = `${files[nf]}${rankOrder[nr-1]}`;
        if (restrictedSquares.includes(sq)) {
          nf += df;
          nr += dr;
          continue;
        }
        if (monolithSquare === sq) break;
        if (chess.get(sq as Square) || (enemyChampion && enemyChampion.square === sq)) {
          // Blocked: Ninja CANNOT capture!
          break;
        }
        moves.push(sq);
        nf += df;
        nr += dr;
      }
    }
    return moves.filter(to=>{const victim=chess.get(to as Square);const capture=!!victim&&victim.color!==champion.color||enemyChampion?.square===to;return !(capture&&(grounds?.disarm.some(d=>d.square===champion.square)||(grounds?.tiles[to]==='defense'&&victim?.type!=='k')));});
  }

  return [];
}

/**
 * Berserker Ultimate: Moves and captures like a Queen!
 */
export function getBerserkerUltimateMoves(
  champion: ChampionPiece,
  chess: Chess,
  restrictedSquares: string[],
  monolithSquare: string | null,
  enemyChampion: ChampionPiece | null,
  beaconProtectedSquares: string[] = [],
  awakenedRooks: AwakenedRookState[] = [],
  awakenedPieces: string[] = [],
  grounds?: Grounds
): string[] {
  const rankOrder=ranksFor(chess.fen());
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const f = files.indexOf(champion.square[0]);
  const r = rankOrder.indexOf(champion.square[1])+1;
  if (f === -1 || isNaN(r)) return [];

  const directions: [number, number][] = [
    [0, 1], [0, -1], [1, 0], [-1, 0],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];
  const moves: string[] = [];

  for (const [df, dr] of directions) {
    let nf = f + df;
    let nr = r + dr;
    while (nf >= 0 && nf < 8 && nr >= 1 && nr <= rankOrder.length) {
      const sq = `${files[nf]}${rankOrder[nr-1]}`;
      if (restrictedSquares.includes(sq)) {
        nf += df;
        nr += dr;
        continue;
      }
      if (monolithSquare === sq) break;

      const pieceOnSq = chess.get(sq as Square);
      if (pieceOnSq) {
        const isProtectedRook =
          (pieceOnSq.type === 'r' && (
            awakenedPieces.includes(sq) ||
            awakenedRooks.some((ar) => ar.square === sq && ar.color !== champion.color && (ar.turnsRemaining === undefined || ar.turnsRemaining > 0))
          )) ||
          awakenedRooks.some((ar) => ar.square === sq && ar.color !== champion.color && (ar.turnsRemaining === undefined || ar.turnsRemaining > 0));
        if (pieceOnSq.color !== champion.color && !beaconProtectedSquares.includes(sq) && !isProtectedRook) {
          moves.push(sq); // capture
        }
        break; // ray terminates
      } else if (enemyChampion && enemyChampion.square === sq) {
        if (!beaconProtectedSquares.includes(sq)) {
          moves.push(sq); // capture enemy champion
        }
        break;
      } else {
        moves.push(sq);
      }
      nf += df;
      nr += dr;
    }
  }
  return moves;
}

/**
 * Musketeer Ultimate: Captures at range up to 3 tiles in all 8 directions without moving.
 * Only targets the first piece it sees (cannot shoot through pieces).
 */
export function getMusketeerSnipeTargets(
  champion: ChampionPiece,
  chess: Chess,
  monolithSquare: string | null,
  enemyChampion: ChampionPiece | null,
  beaconProtectedSquares: string[] = [],
  awakenedRooks: AwakenedRookState[] = [],
  awakenedPieces: string[] = [],
  grounds?: Grounds
): string[] {
  const rankOrder=ranksFor(chess.fen());
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const f = files.indexOf(champion.square[0]);
  const r = rankOrder.indexOf(champion.square[1])+1;
  if (f === -1 || isNaN(r)) return [];

  const directions: [number, number][] = [
    [0, 1], [0, -1], [1, 0], [-1, 0],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];
  const targets: string[] = [];

  for (const [df, dr] of directions) {
    for (let step = 1; step <= 3; step++) {
      const nf = f + df * step;
      const nr = r + dr * step;
      if (nf < 0 || nf >= 8 || nr < 1 || nr > rankOrder.length) break;
      const sq = `${files[nf]}${rankOrder[nr-1]}`;

      if (monolithSquare === sq) break; // Cannot shoot through monolith

      const piece = chess.get(sq as Square);
      if (piece) {
        const isProtectedRook =
          (piece.type === 'r' && (
            awakenedPieces.includes(sq) ||
            awakenedRooks.some((ar) => ar.square === sq && ar.color !== champion.color && (ar.turnsRemaining === undefined || ar.turnsRemaining > 0))
          )) ||
          awakenedRooks.some((ar) => ar.square === sq && ar.color !== champion.color && (ar.turnsRemaining === undefined || ar.turnsRemaining > 0));
        if (piece.color !== champion.color && !beaconProtectedSquares.includes(sq) && !isProtectedRook) {
          targets.push(sq);
        }
        break; // Cannot shoot behind a piece!
      } else if (enemyChampion && enemyChampion.square === sq) {
        if (!beaconProtectedSquares.includes(sq)) {
          targets.push(sq);
        }
        break;
      }
    }
  }
  return targets;
}

/**
 * Summoner Ultimate: Valid teleport destination squares surrounding the Summoner (within 1 tile).
 * Can be an empty square, or an opponent's piece square (capturing it on arrival).
 */
export function getSummonerPlacementSquares(
  summonerSquare: string,
  summonerColor: PlayerColor,
  chess: Chess,
  restrictedSquares: string[],
  monolithSquare: string | null,
  enemyChampion: ChampionPiece | null,
  beaconProtectedSquares: string[] = [],
  awakenedRooks: AwakenedRookState[] = [],
  awakenedPieces: string[] = [],
  grounds?: Grounds
): string[] {
  const rankOrder=ranksFor(chess.fen());
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const f = files.indexOf(summonerSquare[0]);
  const r = rankOrder.indexOf(summonerSquare[1])+1;
  if (f === -1 || isNaN(r)) return [];

  const placementSquares: string[] = [];
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (df === 0 && dr === 0) continue;
      const nf = f + df;
      const nr = r + dr;
      if (nf < 0 || nf >= 8 || nr < 1 || nr > rankOrder.length) continue;
      const sq = `${files[nf]}${rankOrder[nr-1]}`;

      if (monolithSquare === sq) continue;
      if (restrictedSquares.includes(sq)) continue;

      const piece = chess.get(sq as Square);
      if (piece) {
        if (piece.color === summonerColor) continue; // cannot teleport onto friendly piece
        if (beaconProtectedSquares.includes(sq)) continue; // cannot capture protected piece
        const isProtectedRook =
          (piece.type === 'r' && (
            awakenedPieces.includes(sq) ||
            awakenedRooks.some((ar) => ar.square === sq && ar.color !== summonerColor && (ar.turnsRemaining === undefined || ar.turnsRemaining > 0))
          )) ||
          awakenedRooks.some((ar) => ar.square === sq && ar.color !== summonerColor && (ar.turnsRemaining === undefined || ar.turnsRemaining > 0));
        if (isProtectedRook) continue; // cannot capture invulnerable Awakened Rook!
        placementSquares.push(sq); // capture teleport!
      } else if (enemyChampion && enemyChampion.square === sq) {
        if (beaconProtectedSquares.includes(sq)) continue;
        placementSquares.push(sq);
      } else {
        placementSquares.push(sq); // empty square
      }
    }
  }
  return placementSquares;
}

/**
 * Ninja Ultimate: Captures 1 or 2 opponent pieces surrounding the Ninja without moving.
 * Returns all adjacent enemy piece squares (and enemy champion).
 */
export function getNinjaAdjacentEnemyPieces(
  ninjaSquare: string,
  ninjaColor: PlayerColor,
  chess: Chess,
  enemyChampion: ChampionPiece | null,
  beaconProtectedSquares: string[] = [],
  awakenedRooks: AwakenedRookState[] = [],
  awakenedPieces: string[] = [],
  grounds?: Grounds
): string[] {
  const rankOrder=ranksFor(chess.fen());
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const f = files.indexOf(ninjaSquare[0]);
  const r = rankOrder.indexOf(ninjaSquare[1])+1;
  if (f === -1 || isNaN(r)) return [];

  const targets: string[] = [];
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (df === 0 && dr === 0) continue;
      const nf = f + df;
      const nr = r + dr;
      if (nf < 0 || nf >= 8 || nr < 1 || nr > rankOrder.length) continue;
      const sq = `${files[nf]}${rankOrder[nr-1]}`;

      if (beaconProtectedSquares.includes(sq)) continue;

      const piece = chess.get(sq as Square);
      if (piece && piece.color !== ninjaColor) {
        const isProtectedRook =
          (piece.type === 'r' && (
            awakenedPieces.includes(sq) ||
            awakenedRooks.some((ar) => ar.square === sq && ar.color !== ninjaColor && (ar.turnsRemaining === undefined || ar.turnsRemaining > 0))
          )) ||
          awakenedRooks.some((ar) => ar.square === sq && ar.color !== ninjaColor && (ar.turnsRemaining === undefined || ar.turnsRemaining > 0));
        if (isProtectedRook) continue; // cannot assassinate invulnerable Awakened Rook!
        targets.push(sq);
      } else if (enemyChampion && enemyChampion.square === sq) {
        targets.push(sq);
      }
    }
  }
  return targets;
}

/**
 * Helper to update Beacon protected squares when the Monolith changes position.
 * "only surrounding the monolith receives the invulnerability buff, so if pieces leave the field or the monolith changed position, they will not be invulnerable anymore."
 */
export function updateBeaconMonolithSquare(
  beaconEffect: { active: boolean; protectedSquares: string[] } | null | undefined,
  newMonolithSquare: string | null
): void {
  if (!beaconEffect || !beaconEffect.active) return;
  beaconEffect.protectedSquares = newMonolithSquare ? getSurroundingSquares(newMonolithSquare) : [];
}

/**
 * Checks whether a square is currently invulnerable due to Beacon Holy Sanctum.
 * Only squares surrounding the Monolith receive the invulnerability buff.
 */
export function isSquareBeaconProtected(
  square: string,
  beaconEffect: { active: boolean; protectedSquares?: string[] } | null | undefined,
  monolithSquare: string | null | undefined
): boolean {
  if (!beaconEffect || !beaconEffect.active || !monolithSquare) return false;
  return getSurroundingSquares(monolithSquare).includes(square);
}

/**
 * Legacy stub for pieces moving/swapping: Invulnerability is tied strictly to the Monolith's surrounding field.
 * Leaving the field removes invulnerability automatically.
 */
export function updateBeaconPieceSquare(
  _beaconEffect?: any,
  _from?: any,
  _to?: any
): void {}

export function swapBeaconPieceSquares(
  _beaconEffect?: any,
  _sq1?: any,
  _sq2?: any
): void {}

/**
 * Determines whether the "Activate the Clock" card is blocked from being cast.
 * Rules:
 * - Must revert 2 turns (your opponent's previous move and your previous move).
 *   Requires at least 2 completed turns to rewind.
 * - Cannot be cast when a Champion Card or Champion's Ultimate was played in the last 2 turns.
 * - Cannot be cast when the Monolith was placed or moved in the last 2 turns.
 * - Cannot be cast when the Joker was activated.
 * Returns the exact user-facing reason string if blocked, or null if permitted.
 */
export function getClockBlockReason(
  state: {
    frontier?: import('./frontier.ts').FrontierState;
    turnNumber: number;
    lastMoveDetails?: LastMoveDetails | null;
    historyLog?: GameLogEntry[];
    monolithLastMovedTurn?: number | null;
    jokerLocked?: { w: boolean; b: boolean };
    boardHistory?: any[];
  },
  currentTurn?: PlayerColor
): string | null {
  if(state.frontier?.expanded&&state.boardHistory?.slice(-2).some(x=>x.frontierLocked))return 'Clock cannot undo Golem summon/control or a Champion ultimate.';

  if (state.boardHistory?.slice(-2).some(snap => snap.grounds?.placementTurns?.includes(snap.grounds.completedTurns))) return 'Tile power-up placements cannot be rewound.';
  if(state.boardHistory?.at(-1)?.awakeningSkill ?? state.historyLog?.some(e=>e.actionType==='awakening'&&e.turnNumber===state.turnNumber-1))return 'An Awakening skill was played on the previous turn and cannot be rewound.';
  // 1. Must have at least 2 completed turns to revert (your previous move and opponent's previous move)
  if (state.turnNumber <= 2 || !state.boardHistory || state.boardHistory.length < 3) {
    return "Activate the Clock requires at least 2 completed turns (your previous move and opponent's previous move) to rewind.";
  }

  // 2. Joker was activated (wild surge active or Joker played recently)
  if (state.jokerLocked?.w || state.jokerLocked?.b) {
    return 'The Joker was activated (Joker Wild Surge chaos cannot be reversed by the Clock).';
  }
  if (state.lastMoveDetails?.actionType === 'joker') {
    return 'The Joker was activated and its chaotic warp cannot be rewound.';
  }
  if (state.historyLog && state.historyLog.length > 0) {
    const recentJoker = state.historyLog.find(
      (entry) =>
        entry.actionType === 'joker' &&
        entry.turnNumber >= state.turnNumber - 2
    );
    if (recentJoker) {
      return 'The Joker was activated within the last 2 turns and cannot be rewound by the Clock.';
    }
  }

  // 3. Monolith placed or moved within the last 2 turns
  if (
    state.monolithLastMovedTurn !== null &&
    state.monolithLastMovedTurn !== undefined &&
    state.monolithLastMovedTurn >= state.turnNumber - 2
  ) {
    return 'The Monolith was placed or moved within the last 2 turns and cannot be rewound.';
  }
  if (state.historyLog && state.historyLog.length > 0) {
    const recentMonolith = state.historyLog.find(
      (entry) =>
        entry.actionType === 'monolith' &&
        entry.turnNumber >= state.turnNumber - 2
    );
    if (recentMonolith) {
      return 'The Monolith was placed or moved within the last 2 turns and cannot be rewound.';
    }
  }

  // 4. Champion Card / Champion's Ultimate deployed or unleashed within the last 2 turns
  if (state.historyLog && state.historyLog.length > 0) {
    const recentChampion = state.historyLog.find(
      (entry) =>
        (entry.actionType === 'champion_deploy' || entry.actionType === 'champion_ultimate') &&
        entry.turnNumber >= state.turnNumber - 2
    );
    if (recentChampion) {
      if (recentChampion.actionType === 'champion_deploy') {
        return 'A Champion Card was deployed within the last 2 turns and cannot be rewound.';
      }
      return "A Champion's Ultimate was unleashed within the last 2 turns and cannot be rewound.";
    }
  }

  // 6. Board snapshot check: need target snapshot at length - 3
  if (state.boardHistory.length < 3) {
    return "Not enough history to revert 2 turns.";
  }

  return null;
}

export function movementState(chess:Chess, restrictedSquares:string[],monolithSquare:string|null, champions:any={w:null,b:null}, staticStunnedSquares:string[]=[],beaconProtectedSquares:string[]=[],awakenedRooks:AwakenedRookState[]=[],superPawns:string[]=[],superKnights:string[]=[],grounds?:Grounds):GameState {
 return {fen:chess.fen(),turnNumber:1,historyLog:[],captures:{w:[],b:[]},pieceIds:{},powerUps:{w:{draw:0,wild:0,vision:0,monolith:0},b:{draw:0,wild:0,vision:0,monolith:0}},turn:chess.turn(),status:'playing',champions:champions||{w:null,b:null},restrictedSquares,monolithSquare,staticEffect:{active:staticStunnedSquares.length>0,stunnedSquares:staticStunnedSquares},beaconEffect:{active:beaconProtectedSquares.length>0,protectedSquares:beaconProtectedSquares},awakenedRooks,superPawns,superKnights,grounds,frontier:{...initialFrontier(),expanded:true,ready:true}} as unknown as GameState;
}
