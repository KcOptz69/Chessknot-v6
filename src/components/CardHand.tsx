import {isFreeActionCard, cardDisplayName} from './CardArtwork.tsx';
import { AWAKENING_DESCRIPTIONS, AWAKENING_WILD_DESCRIPTION } from '../utils/cardDescriptions.ts';
import {V5Piece,V5Power} from './V5Art.tsx';
import { GlassPanel, CardSurface, Modal, Button } from './UI';
import React from 'react';
import { createPortal } from 'react-dom';
import { Card, CardType, ChampionPiece, PlayerColor, StandardPieceType } from '../types.ts';
import { PieceIcon, BeaconCardIcon, StaticCardIcon, ClockCardIcon, ChampionCardIcon } from './PieceIcons.tsx';
import { Sparkles, History, MoveRight, ArrowLeftRight, Ban, Mountain, Zap, RefreshCw, ShieldCheck, Clock, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useTheme } from '../context/ThemeContext.tsx';

interface CardHandProps {
  compact?: boolean;
  suppressJokerSurgePopup?: boolean;
  floatingDetails?: boolean;
  descriptionHost?: HTMLElement|null;
  hand: Card[];
  disabledSoulIds?: string[];
  selectedCardId: string | null;
  onSelectCard: (card: Card | null) => void;
  onPlayRefresh?: (cardId: string) => void;
  onPlayJoker?: (cardId: string) => void;
  onPlayBeacon?: (cardId: string) => void;
  onPlayStatic?: (cardId: string) => void;
  onPlayClock?: (cardId: string) => void;
  onTravel?: ()=>void;
  canTravel?: boolean;
  onOpenDiscardRedraw?: () => void;
  isJokerLocked?: boolean;
  isMyTurn: boolean;
  playerColor: PlayerColor;
  lastMovedPiece: StandardPieceType | null;
  monolithSquare?: string | null;
  activeChampion?: ChampionPiece | null;
  clockBlockReason?: string | null;
  onClockBlocked?: (reason: string) => void;
  awakeningMode?: 'wild' | 'skill' | null;
  onSetAwakeningMode?: (mode: 'wild' | 'skill' | null) => void;
  isKingInCheck?: boolean;
  checkEscapeCardTypes?: Set<CardType>;
}

const PIECE_NAMES: Record<StandardPieceType, string> = {
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King',
};

const CARD_STYLES: Record<
  CardType,
  {
    bg: string;
    border: string;
    badgeBg: string;
    badgeText: string;
    accent: string;
    icon: (isDark?: boolean) => React.ReactNode;
  }
> = {
  refresh: {
    bg:'from-blue-50 to-white dark:from-blue-950 dark:to-stone-950',
    border:'border-blue-400',badgeBg:'bg-blue-100',badgeText:'text-blue-900',accent:'blue',
    icon:()=> <V5Power type="refresh" className="w-6 h-6"/>,
  },
  brick: {
    bg:'from-stone-100 to-white dark:from-stone-800 dark:to-stone-950',
    border:'border-stone-400',badgeBg:'bg-stone-200',badgeText:'text-stone-700',accent:'stone',
    icon:()=> <V5Power type="brick" className="w-6 h-6"/>,
  },
  soul_release: {
    bg: 'bg-gradient-to-b from-stone-800 to-black text-stone-100',
    border: 'border-stone-500 hover:border-stone-300',
    badgeBg: 'bg-stone-950 border border-stone-500',
    badgeText: 'text-stone-100',
    accent: 'blue',
    icon: () => <V5Piece type="q" color="b" className="w-6 h-6" />,
  },

  pawn: {
    bg: 'from-blue-50/40 via-white to-stone-50 dark:from-stone-900 dark:via-stone-900/90 dark:to-stone-950',
    border: 'border-stone-200/90 dark:border-stone-800 hover:border-blue-400 dark:hover:border-blue-500/70',
    badgeBg: 'bg-blue-100/80 dark:bg-blue-950/60',
    badgeText: 'text-blue-900 dark:text-blue-300',
    accent: 'amber',
    icon: (isDark) => <PieceIcon type="p" color={isDark ? 'w' : 'b'} className="w-6 h-6" />,
  },
  knight: {
    bg: 'from-blue-50/40 via-white to-stone-50 dark:from-blue-950/30 dark:via-stone-900 dark:to-stone-950',
    border: 'border-stone-200/90 dark:border-stone-800 hover:border-blue-400 dark:hover:border-blue-500/70',
    badgeBg: 'bg-blue-100/80 dark:bg-blue-950/60',
    badgeText: 'text-blue-900 dark:text-blue-300',
    accent: 'blue',
    icon: (isDark) => <PieceIcon type="n" color={isDark ? 'w' : 'b'} className="w-6 h-6" />,
  },
  bishop: {
    bg: 'from-purple-50/40 via-white to-stone-50 dark:from-purple-950/30 dark:via-stone-900 dark:to-stone-950',
    border: 'border-stone-200/90 dark:border-stone-800 hover:border-purple-400 dark:hover:border-purple-500/70',
    badgeBg: 'bg-purple-100/80 dark:bg-purple-950/60',
    badgeText: 'text-purple-900 dark:text-purple-300',
    accent: 'purple',
    icon: (isDark) => <PieceIcon type="b" color={isDark ? 'w' : 'b'} className="w-6 h-6" />,
  },
  rook: {
    bg: 'from-cyan-50/40 via-white to-stone-50 dark:from-cyan-950/30 dark:via-stone-900 dark:to-stone-950',
    border: 'border-stone-200/90 dark:border-stone-800 hover:border-cyan-400 dark:hover:border-cyan-500/70',
    badgeBg: 'bg-cyan-100/80 dark:bg-cyan-950/60',
    badgeText: 'text-cyan-900 dark:text-cyan-300',
    accent: 'cyan',
    icon: (isDark) => <PieceIcon type="r" color={isDark ? 'w' : 'b'} className="w-6 h-6" />,
  },
  queen: {
    bg: 'from-rose-50/40 via-white to-stone-50 dark:from-rose-950/30 dark:via-stone-900 dark:to-stone-950',
    border: 'border-stone-200/90 dark:border-stone-800 hover:border-rose-400 dark:hover:border-rose-500/70',
    badgeBg: 'bg-rose-100/80 dark:bg-rose-950/60',
    badgeText: 'text-rose-900 dark:text-rose-300',
    accent: 'rose',
    icon: (isDark) => <PieceIcon type="q" color={isDark ? 'w' : 'b'} className="w-6 h-6" />,
  },
  wild: {
    bg: 'from-yellow-50/60 via-white to-stone-50 dark:from-yellow-950/30 dark:via-stone-900 dark:to-stone-950',
    border: 'border-yellow-200 dark:border-stone-800 hover:border-yellow-400 dark:hover:border-yellow-500/70',
    badgeBg: 'bg-yellow-100 dark:bg-yellow-950/60',
    badgeText: 'text-blue-900 dark:text-blue-300',
    accent: 'yellow',
    icon: () => <Sparkles className="w-5 h-5 text-blue-500" />,
  },
  joker: {
    bg: 'from-blue-100/60 via-yellow-50 to-white dark:from-blue-950/60 dark:via-yellow-950/30 dark:to-stone-900',
    border: 'border-blue-400 dark:border-blue-500 ring-2 ring-blue-300/50 dark:ring-blue-500/30 shadow-sm',
    badgeBg: 'bg-gradient-to-r from-blue-400 to-yellow-400 text-stone-950 font-black',
    badgeText: 'text-stone-950',
    accent: 'amber',
    icon: () => <Zap className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-pulse" />,
  },
  previous: {
    bg: 'from-indigo-50/40 via-white to-stone-50 dark:from-indigo-950/30 dark:via-stone-900 dark:to-stone-950',
    border: 'border-stone-200/90 dark:border-stone-800 hover:border-indigo-400 dark:hover:border-indigo-500/70',
    badgeBg: 'bg-indigo-100/80 dark:bg-indigo-950/60',
    badgeText: 'text-indigo-900 dark:text-indigo-300',
    accent: 'indigo',
    icon: () => <History className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />,
  },
  push: {
    bg: 'from-emerald-50/40 via-white to-stone-50 dark:from-emerald-950/30 dark:via-stone-900 dark:to-stone-950',
    border: 'border-stone-200/90 dark:border-stone-800 hover:border-emerald-400 dark:hover:border-emerald-500/70',
    badgeBg: 'bg-emerald-100/80 dark:bg-emerald-950/60',
    badgeText: 'text-emerald-900 dark:text-emerald-300',
    accent: 'emerald',
    icon: () => <MoveRight className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />,
  },
  switch: {
    bg: 'from-fuchsia-50/40 via-white to-stone-50 dark:from-fuchsia-950/30 dark:via-stone-900 dark:to-stone-950',
    border: 'border-stone-200/90 dark:border-stone-800 hover:border-fuchsia-400 dark:hover:border-fuchsia-500/70',
    badgeBg: 'bg-fuchsia-100/80 dark:bg-fuchsia-950/60',
    badgeText: 'text-fuchsia-900 dark:text-fuchsia-300',
    accent: 'fuchsia',
    icon: () => <ArrowLeftRight className="w-5 h-5 text-fuchsia-600 dark:text-fuchsia-400" />,
  },
  restrict: {
    bg: 'from-red-50/50 via-white to-stone-50 dark:from-red-950/30 dark:via-stone-900 dark:to-stone-950',
    border: 'border-red-200/80 dark:border-stone-800 hover:border-red-400 dark:hover:border-red-500/70',
    badgeBg: 'bg-red-100/80 dark:bg-red-950/60',
    badgeText: 'text-red-900 dark:text-red-300',
    accent: 'red',
    icon: () => <Ban className="w-5 h-5 text-red-500 dark:text-red-400" />,
  },
  monolith: {
    bg: 'from-sky-50/50 via-white to-stone-50 dark:from-sky-950/30 dark:via-stone-900 dark:to-stone-950',
    border: 'border-sky-200/80 dark:border-stone-800 hover:border-sky-400 dark:hover:border-sky-500/70',
    badgeBg: 'bg-sky-100/80 dark:bg-sky-950/60',
    badgeText: 'text-sky-900 dark:text-sky-300',
    accent: 'sky',
    icon: () => <Mountain className="w-5 h-5 text-sky-600 dark:text-sky-400" />,
  },
  beacon: {
    bg: 'from-yellow-50/70 via-blue-50/40 to-white dark:from-blue-950/40 dark:via-stone-900 dark:to-stone-950',
    border: 'border-yellow-300 dark:border-stone-800 hover:border-yellow-400 dark:hover:border-yellow-500/70',
    badgeBg: 'bg-yellow-100 dark:bg-yellow-950/60',
    badgeText: 'text-blue-900 dark:text-blue-300',
    accent: 'yellow',
    icon: () => <BeaconCardIcon className="w-5 h-5 text-blue-500 dark:text-blue-400" />,
  },
  static: {
    bg: 'from-cyan-50/70 via-blue-50/40 to-white dark:from-cyan-950/40 dark:via-stone-900 dark:to-stone-950',
    border: 'border-cyan-300 dark:border-stone-800 hover:border-cyan-400 dark:hover:border-cyan-500/70',
    badgeBg: 'bg-cyan-100 dark:bg-cyan-950/60',
    badgeText: 'text-cyan-900 dark:text-cyan-300',
    accent: 'cyan',
    icon: () => <StaticCardIcon className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />,
  },
  clock: {
    bg: 'from-blue-50/70 via-orange-50/40 to-white dark:from-orange-950/40 dark:via-stone-900 dark:to-stone-950',
    border: 'border-blue-300 dark:border-stone-800 hover:border-blue-400 dark:hover:border-blue-500/70',
    badgeBg: 'bg-blue-100 dark:bg-blue-950/60',
    badgeText: 'text-blue-900 dark:text-blue-300',
    accent: 'amber',
    icon: () => <ClockCardIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />,
  },
  champion: {
    bg: 'from-purple-50/70 via-indigo-50/40 to-white dark:from-purple-950/40 dark:via-stone-900 dark:to-stone-950',
    border: 'border-purple-300 dark:border-stone-800 hover:border-purple-400 dark:hover:border-purple-500/70',
    badgeBg: 'bg-purple-100 dark:bg-purple-950/60',
    badgeText: 'text-purple-900 dark:text-purple-300',
    accent: 'purple',
    icon: () => <ChampionCardIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />,
  },
  awakening_pawn: {
    bg: 'from-rose-50/70 via-red-50/30 to-white dark:from-red-950/40 dark:via-stone-900 dark:to-stone-950',
    border: 'border-red-400 dark:border-red-600/80 hover:border-red-500 ring-1 ring-red-400/40 shadow-xs',
    badgeBg: 'bg-gradient-to-r from-red-600 to-rose-600 text-white font-black',
    badgeText: 'text-white',
    accent: 'red',
    icon: (isDark) => <PieceIcon type="sp" color={isDark ? 'w' : 'b'} className="w-6 h-6" />,
  },
  awakening_rook: {
    bg: 'from-rose-50/70 via-red-50/30 to-white dark:from-red-950/40 dark:via-stone-900 dark:to-stone-950',
    border: 'border-red-400 dark:border-red-600/80 hover:border-red-500 ring-1 ring-red-400/40 shadow-xs',
    badgeBg: 'bg-gradient-to-r from-red-600 to-rose-600 text-white font-black',
    badgeText: 'text-white',
    accent: 'red',
    icon: (isDark) => <PieceIcon type="r" color={isDark ? 'w' : 'b'} className="w-6 h-6" />,
  },
  awakening_knight: {
    bg: 'from-rose-50/70 via-red-50/30 to-white dark:from-red-950/40 dark:via-stone-900 dark:to-stone-950',
    border: 'border-red-400 dark:border-red-600/80 hover:border-red-500 ring-1 ring-red-400/40 shadow-xs',
    badgeBg: 'bg-gradient-to-r from-red-600 to-rose-600 text-white font-black',
    badgeText: 'text-white',
    accent: 'red',
    icon: (isDark) => <PieceIcon type="sn" color={isDark ? 'w' : 'b'} className="w-6 h-6" />,
  },
  awakening_bishop: {
    bg: 'from-rose-50/70 via-red-50/30 to-white dark:from-red-950/40 dark:via-stone-900 dark:to-stone-950',
    border: 'border-red-400 dark:border-red-600/80 hover:border-red-500 ring-1 ring-red-400/40 shadow-xs',
    badgeBg: 'bg-gradient-to-r from-red-600 to-rose-600 text-white font-black',
    badgeText: 'text-white',
    accent: 'red',
    icon: (isDark) => <PieceIcon type="b" color={isDark ? 'w' : 'b'} className="w-6 h-6" />,
  },
  awakening_queen: {
    bg: 'from-rose-50/70 via-red-50/30 to-white dark:from-red-950/40 dark:via-stone-900 dark:to-stone-950',
    border: 'border-red-400 dark:border-red-600/80 hover:border-red-500 ring-1 ring-red-400/40 shadow-xs',
    badgeBg: 'bg-gradient-to-r from-red-600 to-rose-600 text-white font-black',
    badgeText: 'text-white',
    accent: 'red',
    icon: (isDark) => <PieceIcon type="q" color={isDark ? 'w' : 'b'} className="w-6 h-6" />,
  },
  awakening_king: {
    bg: 'from-rose-50/70 via-red-50/30 to-white dark:from-red-950/40 dark:via-stone-900 dark:to-stone-950',
    border: 'border-red-400 dark:border-red-600/80 hover:border-red-500 ring-1 ring-red-400/40 shadow-xs',
    badgeBg: 'bg-gradient-to-r from-red-600 to-rose-600 text-white font-black',
    badgeText: 'text-white',
    accent: 'red',
    icon: (isDark) => <PieceIcon type="k" color={isDark ? 'w' : 'b'} className="w-6 h-6" />,
  },
};

// Check if a card is a standard piece card with short description
const isPieceCard = (type: CardType) =>
  ['pawn', 'knight', 'bishop', 'rook', 'queen', 'wild'].includes(type);

export const CardHand: React.FC<CardHandProps> = ({
  hand, disabledSoulIds=[], suppressJokerSurgePopup=false, compact=false, floatingDetails=false, descriptionHost,
  selectedCardId,
  onSelectCard,
  onPlayRefresh,
  onPlayJoker,
  onPlayBeacon,
  onPlayStatic,
  onPlayClock,
  onOpenDiscardRedraw,onTravel,canTravel=false,
  isJokerLocked,
  isMyTurn,
  playerColor,
  lastMovedPiece,
  monolithSquare,
  activeChampion,
  clockBlockReason,
  onClockBlocked,
  awakeningMode = 'skill',
  onSetAwakeningMode,
  isKingInCheck,
  checkEscapeCardTypes,
}) => {
  const { isDark } = useTheme();
  const [expandedCardId, setExpandedCardId] = React.useState<string | null>(null);

  const [surgePopup, setSurgePopup] = React.useState(false);
  const surgeWasActive = React.useRef(false);
  React.useEffect(() => {
    if (isJokerLocked && !surgeWasActive.current && !suppressJokerSurgePopup) setSurgePopup(true);
    if (!isJokerLocked || suppressJokerSurgePopup) setSurgePopup(false);
    surgeWasActive.current = Boolean(isJokerLocked);
  }, [isJokerLocked,suppressJokerSurgePopup]);
  const selectedCard = isMyTurn ? hand.find((c) => c.id === (selectedCardId || expandedCardId)) || null : null;
  React.useEffect(() => { if (!isMyTurn) setExpandedCardId(null); }, [isMyTurn]);
  const isClockBlocked = Boolean(clockBlockReason);

  // Sync expanded card with selected card when a card is selected
  React.useEffect(() => {
    if (selectedCardId) {
      setExpandedCardId(selectedCardId);
    }
  }, [selectedCardId]);

  const [wildConfirmation,setWildConfirmation]=React.useState<string|null>(null);
  React.useEffect(()=>{setWildConfirmation(null);},[selectedCard?.id,isMyTurn]);

  const renderCardIcon = (card: Card) => {
    if(card.type==='previous'&&lastMovedPiece)return <V5Piece type={lastMovedPiece} color={playerColor} className="w-full h-full aspect-square"/>;
    if(card.type==='soul_release') {
      const pType = card.soul?.piece?.type || 'q';
      const pColor = card.soul?.piece?.color || (playerColor === 'w' ? 'b' : 'w');
      return <V5Piece type={pType} color={pColor} className="w-full h-full aspect-square"/>;
    }
    const types:Record<string,string>={pawn:'p',knight:'n',bishop:'b',rook:'r',queen:'q',awakening_pawn:'sp',awakening_knight:'sn',awakening_bishop:'b',awakening_rook:'r',awakening_queen:'q',awakening_king:'k'};
    if(types[card.type])return <V5Piece awakened={card.type.startsWith('awakening_')} type={types[card.type]} color={playerColor} className="w-full h-full aspect-square" />;
    if(card.type==='champion')return <V5Piece type={activeChampion?.type||'unknown'} color={playerColor} className="w-full h-full aspect-square" />;
    if(card.type==='monolith')return <V5Piece type="m" className="w-full h-full aspect-square" />;
    const artwork = <V5Power type={card.type} className="w-full h-full aspect-square" />;
    return artwork;
  };

  const briefCardDescriptions: Partial<Record<CardType,string>> = {
    refresh:'Discard your entire hand and draw 5 new cards. Unavailable during Joker Wild Surge.',
    brick:'Unplayable. Remove it by discarding it.',
    pawn:'Move a Pawn.', knight:'Move a Knight.', bishop:'Move a Bishop.', rook:'Move a Rook.', queen:'Move a Queen.',
    wild:'Move any eligible piece.', joker:'Replace your hand with 5 Wilds. Drawing pauses until spent.',
    push:'Move a piece without capturing.', switch:'Swap two eligible pieces.', restrict:'Lock an empty square.',
    monolith:'Place or move the neutral Monolith.', beacon:'Activate protection around Monolith.',
    static:'Charge a stun around Monolith.', clock:'Rewind the previous eligible move.',
    soul_release:'Summon the captured piece near its Queen for 5 own turns.'
  };
  const renderDescription=(node:React.ReactNode)=>descriptionHost?createPortal(node,descriptionHost):node;
  const desktopDescription=selectedCard?.description?.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.slice(0,2).join(" ").trim();
  return (
    <GlassPanel id="player-hand-container" className={`w-full ${!isMyTurn ? 'hand-locked' : ''}`}>
      {surgePopup && !suppressJokerSurgePopup && <Modal><div className="ground-dialog"><h3 className="font-bold">Joker Wild Surge</h3><p>Drawing pauses until all 5 Joker Wilds are spent. Your hand then refills to 5 cards.</p><Button aria-label="Close dialog" onClick={() => setSurgePopup(false)}>Got it</Button></div></Modal>}



      <div className="hand-heading">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-stone-700 dark:text-stone-300 font-bold font-sans">Your Hand</span>{!isMyTurn && <span className="hand-turn-hint">Opponent’s turn</span>}
          <span className="text-xs bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 px-2 py-0.5 rounded-full border border-stone-200 dark:border-stone-700 font-mono font-semibold shadow-xs">
            {hand.length} Cards
          </span>
        </div>

        <div className="hand-header-actions">
        {onTravel&&<button type="button" className="travel-button warp-button" disabled={!canTravel} onClick={onTravel}>Warp (Free)</button>}
        {isMyTurn && onOpenDiscardRedraw && (
          <button
            id="btn-discard-redraw-footer"
            disabled={isJokerLocked}
            type="button"
            onClick={onOpenDiscardRedraw}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 dark:hover:bg-teal-900/60 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800 shadow-xs transition-all cursor-pointer active:scale-95"
            title="Discard up to 5 cards and redraw fresh cards, or pass your turn"
          >
            <RefreshCw className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            <span>Discard & Redraw</span>
          </button>
        )}

        </div>
      </div>

      <div className="hand-grid">
        {hand.map((card) => {
          const isSelected = selectedCardId === card.id;
          const isCheckEscape = Boolean(isKingInCheck && isMyTurn && checkEscapeCardTypes?.has(card.type));
          const style = CARD_STYLES[card.type] || CARD_STYLES.wild;
          const unavailable = card.type === 'brick' || (card.type === 'refresh' && Boolean(isJokerLocked)) || disabledSoulIds.includes(card.id) || !isMyTurn || (card.type === 'previous' && !lastMovedPiece) ||
            ((card.type === 'beacon' || card.type === 'static') && !monolithSquare) ||
            (card.type === 'clock' && Boolean(clockBlockReason));
          return (
            <CardSurface key={card.id} id={`card-${card.id}`} data-card-id={card.id}
              data-card-type={card.type}
              data-joker-wild={card.isJokerWild || undefined}
              data-awakening={card.type.startsWith('awakening_') || undefined}
              data-selected={isSelected || undefined} data-unavailable={unavailable || undefined}
              role="button" tabIndex={isMyTurn ? 0 : -1} aria-disabled={!isMyTurn} aria-pressed={isSelected} aria-label={card.type === 'joker' ? 'JOKER' : cardDisplayName(card)}
              onKeyDown={(event) => { if (isMyTurn && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.currentTarget.click(); } }}
              onClick={() => {
                if (!isMyTurn) return;
                if (expandedCardId === card.id) { onSelectCard(null); setExpandedCardId(null); return; }
                setExpandedCardId(card.id);
                onSelectCard(unavailable && card.type !== 'brick' ? null : card);
              }}
              className={`compact-hand-card ${style.border} ${
                isCheckEscape
                  ? 'ring-3 ring-amber-400 dark:ring-amber-300 shadow-[0_0_18px_rgba(251,191,36,0.8)] animate-pulse border-amber-400!'
                  : ''
              }`}>
              <div className="card-art">{renderCardIcon(card)}{isFreeActionCard(card.type)&&<span className="hand-free-action-badge">FREE</span>}</div>
              {isCheckEscape && (
                <span className="text-[7.5px] font-black uppercase px-1 py-0.5 rounded bg-amber-400 text-stone-950 flex items-center gap-0.5 tracking-tight shadow-xs -mt-1 mb-0.5">
                  <ShieldCheck className="w-2.5 h-2.5 text-stone-950" />
                  <span>Escape</span>
                </span>
              )}
              <span className="compact-card-name">
                {cardDisplayName(card)}
              </span>
            </CardSurface>
          );
        })}
      </div>

      {/* ACTIVE CARD DRAWER: Shows selected card description & large thumb-friendly action buttons */}
      {selectedCard && renderDescription(
        <div className={`card-description-panel ${selectedCard.type === 'soul_release' ? 'soul-release-description' : ''} mt-2 p-2.5 rounded-xl border ${selectedCard.type === 'soul_release' ? 'border-stone-500 bg-gradient-to-b from-stone-800 to-black text-stone-100' : 'border-blue-300 dark:border-blue-600 bg-blue-50/70 dark:bg-blue-950/40'} shadow-xs animate-fade-in space-y-2 block`}>
          {/* Check Escape Notice Banner */}
          {isKingInCheck && checkEscapeCardTypes?.has(selectedCard.type) && (
            <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-950/80 border-2 border-amber-400 dark:border-amber-600 text-amber-950 dark:text-amber-200 text-xs font-bold flex items-center gap-2 shadow-xs">
              <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>🛡️ Check Escape: Playing this card can resolve the check on your King!</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`selected-card-thumb p-1 rounded-md ${selectedCard.type === 'soul_release' ? 'bg-stone-950 border border-stone-500' : 'bg-white dark:bg-stone-800 border border-blue-300 dark:border-blue-700'} shadow-2xs`}>
                {renderCardIcon(selectedCard)}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs font-black ${selectedCard.type === 'soul_release' ? 'text-stone-100' : 'text-blue-950 dark:text-blue-200'} uppercase tracking-wide`}>
                    {cardDisplayName(selectedCard)}
                  </span>
                  <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 border border-stone-200 dark:border-stone-700 shrink-0">
                    {selectedCard.type === 'brick' ? 'UNPLAYABLE' : isFreeActionCard(selectedCard.type) ? 'FREE ACTION' : 'MOVE ACTION'}
                  </span>
                </div>
                <span className="text-[10px] text-stone-500 dark:text-stone-400 block mt-0.5">
                  {selectedCard.type === 'brick' ? 'Discard to remove it from your hand' : isFreeActionCard(selectedCard.type) ? "Does not count as your turn's move!" : 'Counts as your turn move'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { onSelectCard(null); setExpandedCardId(null); }}
              aria-label="Deselect card" title="Close card description" className="card-description-close"
            >
              <X size={15}/>
            </button>
          </div>

          {/* Awakening Card Mode Selector in Drawer */}
          {selectedCard.type.startsWith('awakening_') && isMyTurn && (
            <div className="space-y-2 mt-1">
              <div className="flex items-center gap-2 p-1 rounded-xl bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700">
                <button
                  type="button"
                  onClick={() => onSetAwakeningMode?.('skill')}
                  disabled={selectedCard.type === 'awakening_king' && !isKingInCheck}
                  className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    awakeningMode === 'skill'
                      ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-xs'
                      : selectedCard.type === 'awakening_king' && !isKingInCheck
                      ? 'opacity-40 cursor-not-allowed text-stone-400'
                      : 'text-stone-700 dark:text-stone-300 hover:bg-white dark:hover:bg-stone-700'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{'Awaken · Exhaust'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setWildConfirmation(selectedCard.id)}
                  className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    awakeningMode === 'wild'
                      ? 'bg-gradient-to-r from-blue-500 to-yellow-500 text-stone-950 shadow-xs'
                      : 'text-stone-700 dark:text-stone-300 hover:bg-white dark:hover:bg-stone-700'
                  }`}
                >
                  <span>Wild · Recycle</span>
                </button>
              </div>

              <p className="brief-card-description text-[10px] leading-snug text-stone-700 dark:text-stone-300">
                {awakeningMode==='wild' ? AWAKENING_WILD_DESCRIPTION : AWAKENING_DESCRIPTIONS[selectedCard.type]}
              </p>
              {selectedCard.type === 'awakening_king' && !isKingInCheck && (
                <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-300 dark:border-blue-800 text-[10px] text-blue-900 dark:text-blue-200 leading-snug">
                  Requires Check. Wild is available.
                </div>
              )}


            </div>
          )}

          {!selectedCard.type.startsWith('awakening_') && <p className="brief-card-description text-[11px] text-stone-700 dark:text-stone-300 leading-snug">
            {selectedCard.type === 'previous' && !lastMovedPiece
              ? 'No piece moved last turn yet.'
              : selectedCard.type === 'previous' && lastMovedPiece
              ? `Must move your ${PIECE_NAMES[lastMovedPiece]} (your last moved piece).`
              : selectedCard.type === 'champion' && !activeChampion
              ? 'Deploy your Champion on an empty square on your side.'
              : selectedCard.type === 'champion' && activeChampion
              ? `Cast Ultimate Skill for your active ${activeChampion.type.toUpperCase()}!`
              : selectedCard.type === 'beacon' && !monolithSquare
              ? 'Requires Monolith on the board to activate.'
              : selectedCard.type === 'static' && !monolithSquare
              ? 'Requires Monolith on the board to activate.'
              : ((!compact || descriptionHost) && desktopDescription) || briefCardDescriptions[selectedCard.type] || selectedCard.description}
          </p>}

          {selectedCard.type==='soul_release'&&<p className="text-xs text-stone-100">{disabledSoulIds.includes(selectedCard.id)?'Unavailable: Queen banished or no legal square.':'Choose a highlighted square. Exhausts after summoning.'}</p>}
          {/* Mobile Action Buttons */}
          {selectedCard.type === 'refresh' && onPlayRefresh && isMyTurn && (
            <button disabled={isJokerLocked} onClick={()=>onPlayRefresh(selectedCard.id)}
              className="w-full mt-2 rounded-lg bg-blue-600 text-white font-bold text-xs py-2 disabled:opacity-40">
              REFRESH (FREE)
            </button>
          )}
          {selectedCard.type === 'joker' && onPlayJoker && isMyTurn && (
            <button
              id="mobile-btn-play-joker"
              type="button"
              onClick={() => onPlayJoker(selectedCard.id)}
              className="w-full py-2 px-3 bg-gradient-to-r from-blue-500 to-yellow-400 text-stone-950 font-black text-xs rounded-xl shadow-xs transition-transform active:scale-95 cursor-pointer uppercase tracking-tight flex items-center justify-center gap-1.5 touch-manipulation ring-2 ring-blue-400/50"
            >
              <Zap className="w-4 h-4 fill-current" />
              <span>ACTIVATE JOKER</span>
            </button>
          )}

          {selectedCard.type === 'beacon' && onPlayBeacon && isMyTurn && monolithSquare && (
            <button
              type="button"
              onClick={() => onPlayBeacon(selectedCard.id)}
              className="w-full py-2 px-3 bg-gradient-to-r from-blue-500 to-yellow-400 text-stone-950 font-black text-xs rounded-xl shadow-xs transition-transform active:scale-95 cursor-pointer uppercase tracking-tight flex items-center justify-center gap-1.5 touch-manipulation"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Cast Holy Sanctum</span>
            </button>
          )}

          {selectedCard.type === 'static' && onPlayStatic && isMyTurn && monolithSquare && (
            <button
              type="button"
              onClick={() => onPlayStatic(selectedCard.id)}
              className="w-full py-2 px-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-black text-xs rounded-xl shadow-xs transition-transform active:scale-95 cursor-pointer uppercase tracking-tight flex items-center justify-center gap-1.5 touch-manipulation"
            >
              <Zap className="w-4 h-4" />
              <span>Cast Electric Stun</span>
            </button>
          )}

          {selectedCard.type === 'clock' && isMyTurn && !isClockBlocked && (
            <button
              type="button"
              onClick={() => {
                if (onPlayClock) onPlayClock(selectedCard.id);
              }}
              className="w-full py-2 px-3 bg-gradient-to-r from-blue-500 to-orange-400 text-stone-950 font-black text-xs rounded-xl shadow-xs transition-transform active:scale-95 cursor-pointer uppercase tracking-tight flex items-center justify-center gap-1.5 touch-manipulation"
            >
              <Clock className="w-4 h-4" />
              <span>Revert 2 Turns</span>
            </button>
          )}

          {selectedCard.type === 'clock' && isClockBlocked && clockBlockReason && (
            <div className="p-2 rounded-lg bg-red-100 dark:bg-red-950/70 border border-red-300 dark:border-red-800 text-[11px] text-red-900 dark:text-red-300 leading-snug flex items-center gap-1.5">
              <Ban className="w-4 h-4 text-red-600 shrink-0" />
              <span><strong>Cannot Revert:</strong> {clockBlockReason}</span>
            </div>
          )}
        </div>
      )}

      {wildConfirmation&&selectedCard?.id===wildConfirmation&&<Modal onClick={()=>setWildConfirmation(null)}><section className="ground-dialog" onClick={e=>e.stopPropagation()}><h2>Use AWAKEN as Wild?</h2><p>This move will use ordinary Wild movement instead of the Awakening skill. The card will be discarded normally.</p><div className="flex justify-end gap-2"><button aria-label="Close dialog" onClick={()=>setWildConfirmation(null)}>Cancel</button><button onClick={()=>{onSetAwakeningMode?.('wild');setWildConfirmation(null);}}>Use as Wild</button></div></section></Modal>}
    </GlassPanel>
  );
};
