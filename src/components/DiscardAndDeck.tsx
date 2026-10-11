import {DrawPileIcon} from './DrawPileIcon.tsx';
import {CardArtwork,cardDisplayName} from './CardArtwork.tsx';
import { Modal } from './UI';
import React from 'react';
import { Card, CardType, GameLogEntry, StandardPieceType } from '../types.ts';
import {
  Layers,
  Eye,
  X,
  Trash2,
  PieChart,
  Sparkles,
  ArrowUpDown,
  Filter,
  Grid,
  List,
  Flame,
} from 'lucide-react';
import { PieceIcon } from './PieceIcons.tsx';

interface DiscardAndDeckProps {
  compact?: boolean;
  hiddenDeckCount?:number;
  openRequest?: {type:'deck'|'discard';id:number}|null;
  deckCards: Card[];
  unseenHandCards?: Card[];
  discardPile: Card[];
  exhaustedCards?: Card[];
  historyLog?: GameLogEntry[];
  isMyTurn: boolean;
}

const CARD_TYPE_LABELS: Record<CardType, { name: string; color: string; badgeBg: string }> = {
  refresh:{name:'Refresh',color:'text-blue-300',badgeBg:'bg-blue-950/70 border-blue-500/40'},
  brick:{name:'Brick',color:'text-stone-300',badgeBg:'bg-stone-950/70 border-stone-500/40'},
  soul_release: {name:"Soul Release",color:"text-stone-200",badgeBg:"bg-stone-950 border-stone-700 text-stone-200"},
  pawn: { name: 'Pawn', color: 'text-blue-300', badgeBg: 'bg-blue-950/70 border-blue-500/40' },
  knight: { name: 'Knight', color: 'text-blue-300', badgeBg: 'bg-blue-950/70 border-blue-500/40' },
  bishop: { name: 'Bishop', color: 'text-purple-300', badgeBg: 'bg-purple-950/70 border-purple-500/40' },
  rook: { name: 'Rook', color: 'text-cyan-300', badgeBg: 'bg-cyan-950/70 border-cyan-500/40' },
  queen: { name: 'Queen', color: 'text-rose-300', badgeBg: 'bg-rose-950/70 border-rose-500/40' },
  wild: { name: 'Wild', color: 'text-yellow-300', badgeBg: 'bg-yellow-950/70 border-yellow-500/40' },
  joker: { name: 'Joker', color: 'text-blue-400', badgeBg: 'bg-blue-950/70 border-blue-400/40' },
  previous: { name: 'Previous', color: 'text-indigo-300', badgeBg: 'bg-indigo-950/70 border-indigo-500/40' },
  push: { name: 'Push', color: 'text-emerald-300', badgeBg: 'bg-emerald-950/70 border-emerald-500/40' },
  switch: { name: 'Switch', color: 'text-fuchsia-300', badgeBg: 'bg-fuchsia-950/70 border-fuchsia-500/40' },
  restrict: { name: 'Restrict', color: 'text-red-300', badgeBg: 'bg-red-950/70 border-red-500/40' },
  monolith: { name: 'Monolith', color: 'text-sky-300', badgeBg: 'bg-sky-950/70 border-sky-500/40' },
  beacon: { name: 'Beacon', color: 'text-yellow-300', badgeBg: 'bg-yellow-950/70 border-yellow-500/40' },
  static: { name: 'Static', color: 'text-cyan-300', badgeBg: 'bg-cyan-950/70 border-cyan-500/40' },
  clock: { name: 'Clock', color: 'text-blue-300', badgeBg: 'bg-blue-950/70 border-blue-500/40' },
  champion: { name: 'Champion', color: 'text-purple-300', badgeBg: 'bg-purple-950/70 border-purple-500/40' },
  awakening_pawn: { name: 'Awakening: Pawn', color: 'text-red-400', badgeBg: 'bg-red-950/70 border-red-500/40' },
  awakening_rook: { name: 'Awakening: Rook', color: 'text-red-400', badgeBg: 'bg-red-950/70 border-red-500/40' },
  awakening_knight: { name: 'Awakening: Knight', color: 'text-red-400', badgeBg: 'bg-red-950/70 border-red-500/40' },
  awakening_bishop: { name: 'Awakening: Bishop', color: 'text-red-400', badgeBg: 'bg-red-950/70 border-red-500/40' },
  awakening_queen: { name: 'Awakening: Queen', color: 'text-red-400', badgeBg: 'bg-red-950/70 border-red-500/40' },
  awakening_king: { name: 'Awakening: King', color: 'text-red-400', badgeBg: 'bg-red-950/70 border-red-500/40' },
};

const ALL_CARD_TYPES: CardType[] = [
  'pawn',
  'knight',
  'bishop',
  'rook',
  'queen',
  'switch',
  'restrict',
  'push',
  'monolith',
  'previous',
  'wild',
  'joker',
  'refresh',
  'brick',
  'beacon',
  'static',
  'clock',
  'champion',
  'awakening_pawn',
  'awakening_rook',
  'awakening_knight',
  'awakening_bishop',
  'awakening_queen',
  'awakening_king',
  'soul_release',
];

export const DiscardAndDeck: React.FC<DiscardAndDeckProps> = ({
  compact = false, openRequest,hiddenDeckCount,
  deckCards, unseenHandCards = [],
  discardPile,
  exhaustedCards = [],
  isMyTurn, historyLog = [],
}) => {
  const [isDeckModalOpen, setIsDeckModalOpen] = React.useState(false);
  const [isDiscardModalOpen, setIsDiscardModalOpen] = React.useState(false);
  const [isExhaustedModalOpen, setIsExhaustedModalOpen] = React.useState(false);
  const [discardSortMode, setDiscardSortMode] = React.useState<
    'newest' | 'oldest' | 'grouped' | 'type_az' | 'count_desc'
  >('grouped');
  const [inspectedDiscardType,setInspectedDiscardType]=React.useState<CardType|null>(null);

  React.useEffect(()=>{if(!isDiscardModalOpen)setInspectedDiscardType(null);},[isDiscardModalOpen]);
  React.useEffect(()=>{if(openRequest){setIsDeckModalOpen(openRequest.type==='deck');setIsDiscardModalOpen(openRequest.type==='discard');setIsExhaustedModalOpen(false);}},[openRequest]);
  const deckCount = hiddenDeckCount??deckCards.length;
  const unseenCount=deckCount+unseenHandCards.length;
  const deckCategory = (type:string) => type.startsWith('awakening_') ? 'Awakening Cards' : ['pawn','knight','bishop','rook','queen'].includes(type) ? 'Standard Pieces' : 'Power Cards';

  const topDiscard = discardPile.length > 0 ? discardPile[discardPile.length - 1] : null;

  // Aggregate cards remaining by type for draw pile inspection
  const deckTypeCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const card of [...deckCards,...unseenHandCards]) {
      counts[card.type] = (counts[card.type] || 0) + 1;
    }
    return counts;
  }, [deckCards,unseenHandCards]);

  // Count discarded cards by card type
  const discardTypeCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const card of discardPile) {
      counts[card.type] = (counts[card.type] || 0) + 1;
    }
    return counts;
  }, [discardPile]);

  // Filtered & sorted discard pile items
  const processedDiscardCards = React.useMemo(() => {
    let items = discardPile.map((card, originalIdx) => ({
      card,
      originalIndex: originalIdx + 1,
    }));


    if (discardSortMode === 'newest') {
      return [...items].reverse();
    } else if (discardSortMode === 'oldest') {
      return items;
    } else if (discardSortMode === 'type_az') {
      return [...items].sort((a, b) =>
        a.card.type.localeCompare(b.card.type) || b.originalIndex - a.originalIndex
      );
    } else if (discardSortMode === 'count_desc') {
      return [...items].sort((a, b) => {
        const countA = discardTypeCounts[a.card.type] || 0;
        const countB = discardTypeCounts[b.card.type] || 0;
        if (countB !== countA) return countB - countA;
        return a.card.type.localeCompare(b.card.type);
      });
    }

    // Default: newest
    return [...items].reverse();
  }, [discardPile, discardSortMode, discardTypeCounts]);

  // Grouped by type for the 'grouped' view
  const groupedDiscard = React.useMemo(() => {
    const groups: Record<CardType, { card: Card; originalIndex: number }[]> = {} as any;
    for (const t of ALL_CARD_TYPES) {
      groups[t] = [];
    }

    discardPile.forEach((card, idx) => {
      if (groups[card.type]) {
        groups[card.type].push({ card, originalIndex: idx + 1 });
      } else {
        groups[card.type] = [{ card, originalIndex: idx + 1 }];
      }
    });

    // Convert to sorted array of groups
    const result = ALL_CARD_TYPES.map((type) => ({
      type,
      count: groups[type]?.length || 0,
      cards: groups[type] || [],
    })).filter(group => group.count > 0);


    // Sort types: show types with played cards first (descending count), then 0-count types
    return result.sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  }, [discardPile]);

  const deckSummaryString = React.useMemo(() => {
    const entries = Object.entries(deckTypeCounts).map(
      ([type, count]) => `${CARD_TYPE_LABELS[type as CardType]?.name || type}: ${count}`
    );
    return entries.slice(0, 4).join(', ') + (entries.length > 4 ? '...' : '');
  }, [deckTypeCounts]);

  return (
    <>
      <div
        style={compact?{display:'none'}:undefined}
        id="deck-discard-area"
        className="flex items-center justify-between gap-2 sm:gap-3 bg-white dark:bg-stone-900 border border-stone-200/90 dark:border-stone-800 rounded-2xl p-2.5 sm:p-3 shadow-xs"
      >
        {/* Shared Draw Pile with Hover & Click Inspector */}
        <div
          id="btn-inspect-draw-pile" role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.currentTarget.click(); } }}
          onClick={() => setIsDeckModalOpen(true)}
          className="group flex items-center gap-2 sm:gap-2.5 p-1 -m-1 rounded-xl hover:bg-stone-50 dark:hover:bg-stone-800/60 cursor-pointer transition-colors relative min-w-0"
          title="View unseen cards in the deck and hidden opponent hand"
        >
          <div className="pile-illustration draw-pile-illustration"><DrawPileIcon className="draw-pile-art"/><span className="pile-count-badge">{deckCount}</span></div>

          <div className="min-w-0">
            <div className="text-xs font-bold text-stone-800 dark:text-stone-200 flex items-center gap-1 group-hover:text-blue-800 dark:group-hover:text-blue-400">
              <span className="truncate">Draw Pile</span>
              <span className="text-[9px] sm:text-[10px] text-blue-800 dark:text-blue-300 font-bold bg-blue-50 dark:bg-blue-950/60 px-1 sm:px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800 shrink-0">
                VIEW
              </span>
            </div>
            <div className="text-[10px] sm:text-[11px] text-stone-500 dark:text-stone-400 font-medium truncate">
              {deckCount === 0 ? (
                <span className="text-blue-600 dark:text-blue-400 animate-pulse font-bold">Reshuffle next</span>
              ) : (
                <span>{deckCount} left</span>
              )}
            </div>
          </div>
        </div>

        {/* Discard Pile with Hover & Click Inspector */}
        <div
          id="btn-inspect-discard-pile" role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.currentTarget.click(); } }}
          onClick={() => setIsDiscardModalOpen(true)}
          className="group flex items-center gap-2 sm:gap-2.5 p-1 -m-1 rounded-xl hover:bg-stone-50 dark:hover:bg-stone-800/60 cursor-pointer transition-colors min-w-0"
          title="Click to view played cards in discard pile"
        >
          <div className="pile-illustration discard-pile-illustration"><DrawPileIcon discard className="draw-pile-art"/>{topDiscard&&<div className="pile-last-card" aria-label={`Latest discard: ${topDiscard.name}`}><CardArtwork card={topDiscard}/></div>}<span className="pile-count-badge">{discardPile.length}</span></div>

          <div className="min-w-0">
            <div className="text-xs font-bold text-stone-800 dark:text-stone-200 flex items-center gap-1 group-hover:text-blue-800 dark:group-hover:text-blue-400">
              <span className="truncate">Discard Pile</span>
              <span className="text-[9px] sm:text-[10px] text-stone-600 dark:text-stone-300 font-bold bg-stone-100 dark:bg-stone-800 px-1 sm:px-1.5 py-0.5 rounded border border-stone-200 dark:border-stone-700 shrink-0">
                LOG
              </span>
            </div>
            <div className="text-[10px] sm:text-[11px] text-stone-500 dark:text-stone-400 font-medium truncate">
              {discardPile.length} {discardPile.length === 1 ? 'played' : 'played'}
            </div>
          </div>
        </div>

      </div>

      {/* --- DRAW PILE MODAL --- */}
      {isDeckModalOpen && (
        <Modal className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 dark:bg-stone-950/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 max-w-lg w-full shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800 mb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 shadow-xs">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-900 dark:text-stone-100 font-sans">
                    Unseen Card Pool
                  </h3>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    {deckCount} in the draw pile · {unseenHandCards.length} unknown cards in the opponent hand
                  </p>
                </div>
              </div>
              <button aria-label="Close dialog"
                onClick={() => setIsDeckModalOpen(false)}
                className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {hiddenDeckCount!==undefined?<p className="py-6 text-center">{deckCount} cards remain in the draw pile. Its composition is hidden while viewing.</p>:unseenCount === 0 ? (
              <div className="py-8 text-center text-stone-500 dark:text-stone-400">
                <Layers className="w-10 h-10 mx-auto text-stone-400 mb-2" />
                <p className="font-semibold text-sm text-stone-800 dark:text-stone-200">No unseen cards remain</p>
                <p className="text-xs mt-1">
                  The discard pile will automatically reshuffle into a fresh draw deck on the next card draw.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                <div className="text-xs font-semibold text-blue-800 dark:text-blue-300 flex items-center justify-between">
                  <span>Unseen cards by type</span>
                  <span className="text-stone-500 dark:text-stone-400 font-mono text-[11px]">Total: {unseenCount} cards</span>
                </div>

                <p className="text-xs text-stone-600 dark:text-stone-300">The two guaranteed starting Pawns are excluded while still known in the opponent hand. Counts combine the draw pile and unknown opponent cards; they do not tell you which cards are in either location or guarantee your next draw.</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {Object.entries(deckTypeCounts).sort(([a],[b])=>{
                    const group=(type:string)=>type.startsWith('awakening_')?2:['pawn','knight','bishop','rook','queen'].includes(type)?0:1;
                    return group(a)-group(b) || ALL_CARD_TYPES.indexOf(a as CardType)-ALL_CARD_TYPES.indexOf(b as CardType);
                  }).map(([type, count],index,entries) => {
                    const info = CARD_TYPE_LABELS[type as CardType] || { name: type, color: 'text-stone-700' };
                    const percentage = Math.round((count / unseenCount) * 100);

                    return (
                      <React.Fragment key={type}>
                      {(index===0||deckCategory(type)!==deckCategory(entries[index-1][0])) && <h4 className="col-span-full text-xs font-extrabold text-blue-700 dark:text-blue-300 mt-2">{deckCategory(type)}</h4>}
                      <div
                        key={type}
                        className="unseen-card-tile p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200/90 dark:border-stone-700 flex flex-col justify-between shadow-xs"
                      >
                        <div className="inspection-card-art"><CardArtwork card={{id:`type-${type}`,type:type as CardType,name:info.name,description:''}}/></div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-stone-800 dark:text-stone-200">{info.name.toUpperCase()}</span>
                          <span className="text-xs font-mono font-bold text-stone-800 dark:text-stone-200 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-600 px-1.5 py-0.5 rounded shadow-xs">
                            x{count}
                          </span>
                        </div>
                        <div className="w-full bg-stone-200/80 dark:bg-stone-700 h-1.5 rounded-full overflow-hidden mt-1.5">
                          <div
                            className="bg-blue-500 h-full rounded-full transition-all duration-300"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between mt-1 text-[10px] text-stone-500 dark:text-stone-400">
                          <span>Unseen share</span>
                          <span className="font-mono text-stone-700 dark:text-stone-300 font-bold">{percentage}%</span>
                        </div>
                      </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-stone-100 dark:border-stone-800 mt-4 flex justify-end">
              <button
                onClick={() => setIsDeckModalOpen(false)}
                className="px-4 py-2 bg-stone-800 dark:bg-stone-700 hover:bg-stone-700 dark:hover:bg-stone-600 text-white font-bold rounded-xl text-xs cursor-pointer shadow-xs"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* --- DISCARD PILE INSPECTOR MODAL --- */}
      {isDiscardModalOpen && (
        <Modal className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 dark:bg-stone-950/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 max-w-xl w-full shadow-2xl flex flex-col max-h-[88vh]">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800 mb-2.5">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 shadow-xs">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-900 dark:text-stone-100 font-sans">
                    Discard Pile History & Breakdown
                  </h3>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    {discardPile.length} cards played/discarded • Reshuffles when draw deck empties
                  </p>
                </div>
              </div>
              <button aria-label="Close dialog"
                onClick={() => setIsDiscardModalOpen(false)}
                className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <button id="btn-inspect-exhausted-pile" type="button"
              onClick={() => { setIsDiscardModalOpen(false); setIsExhaustedModalOpen(true); }}
              className="mb-3 p-2 rounded-lg border border-red-400 text-red-600 text-sm">
              Exhausted Awakening cards ({exhaustedCards.length}) — never reshuffled
            </button>
            {/* View & Sort Mode Bar */}
            <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-stone-100 dark:border-stone-800 text-xs">
              {/* View Segmented Control */}
              <div className="flex items-center bg-stone-100 dark:bg-stone-800 p-0.5 rounded-lg border border-stone-200 dark:border-stone-700">
                <button
                  onClick={() => setDiscardSortMode('grouped')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                    discardSortMode === 'grouped'
                      ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-xs'
                      : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                  }`}
                >
                  <Grid className="w-3 h-3" />
                  <span>Cards</span>
                </button>
                <button
                  onClick={() => setDiscardSortMode('newest')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                    discardSortMode === 'newest'
                      ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-xs'
                      : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                  }`}
                >
                  <List className="w-3 h-3" />
                  <span>Order Played</span>
                </button>
              </div>

            </div>

            {/* Content Display */}
            {discardPile.length === 0 ? (
              <div className="py-12 text-center text-stone-500 dark:text-stone-400 flex-1 flex flex-col items-center justify-center">
                <Trash2 className="w-10 h-10 text-stone-400 mb-2" />
                <p className="font-semibold text-sm text-stone-800 dark:text-stone-200">Discard Pile is Empty</p>
                <p className="text-xs mt-1">No cards have been played or discarded yet.</p>
              </div>
            ) : discardSortMode === 'grouped' ? (
              <div className="flex-1 min-h-0 overflow-y-auto pr-1 custom-scrollbar">
                {!inspectedDiscardType&&<div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {[...groupedDiscard].sort((a,b)=>{
                    const rank=(type:string)=>type.startsWith('awakening_')?2:['pawn','knight','bishop','rook','queen'].includes(type)?0:1;
                    return rank(a.type)-rank(b.type)||ALL_CARD_TYPES.indexOf(a.type)-ALL_CARD_TYPES.indexOf(b.type);
                  }).map((group,index,entries)=><React.Fragment key={group.type}>
                    {(index===0||deckCategory(group.type)!==deckCategory(entries[index-1].type))&&<h4 className="col-span-full text-xs font-extrabold text-blue-700 dark:text-blue-300 mt-2">{deckCategory(group.type)}</h4>}
                    <button type="button" aria-pressed={inspectedDiscardType===group.type} onClick={()=>setInspectedDiscardType(inspectedDiscardType===group.type?null:group.type)} className={`discard-type-card unseen-card-tile p-2.5 rounded-xl border text-left ${inspectedDiscardType===group.type?'border-blue-500 bg-blue-50 dark:bg-blue-950/60 ring-1 ring-blue-400':'bg-stone-50 dark:bg-stone-800/60 border-stone-200 dark:border-stone-700'}`}>
                      <div className="inspection-card-art"><CardArtwork card={group.cards[0].card}/></div>
                      <div className="flex items-center justify-between gap-2 text-xs"><strong>{(CARD_TYPE_LABELS[group.type]?.name||group.cards[0].card.name).toUpperCase()}</strong><span className="font-mono font-bold">×{group.count}</span></div>
                      <small className="block mt-1 text-stone-500 dark:text-stone-400">View play log</small>
                    </button>
                  </React.Fragment>)}
                </div>}
                {inspectedDiscardType&&(()=>{
                  const group=groupedDiscard.find(g=>g.type===inspectedDiscardType);
                  if(!group)return null;
                  const normalize=(name:string)=>name.toLowerCase().replace(/\(played as wild\)/g,'').replace(/activate|activated|\bthe\b|\bcards?\b/g,'').replace(/[^a-z0-9]/g,'');
                  const names=new Set(group.cards.map(item=>normalize(item.card.name)));
                  names.add(normalize(CARD_TYPE_LABELS[group.type]?.name||''));
                  const logs=historyLog.filter(entry=>{
                    if(group.type==='champion')return ['champion_deploy','champion_ultimate'].includes(entry.actionType);
                    if(!entry.cardName||/power.?up/i.test(entry.cardName))return false;
                    return names.has(normalize(entry.cardName));
                  });
                  return <section className="discard-card-log mt-3 rounded-xl border border-blue-300 dark:border-blue-700 p-3" aria-label="Selected card play log"><div className="flex items-center justify-between gap-2"><h4 className="font-bold text-sm">{CARD_TYPE_LABELS[group.type]?.name} · Play log</h4><button aria-label="Close card play log" onClick={()=>setInspectedDiscardType(null)}><X size={16}/></button></div><p className="text-xs text-stone-500 dark:text-stone-400 my-2">Current pile order: {group.cards.map(item=>`#${item.originalIndex}`).join(', ')}. Logs below include this card type’s plays during the match.</p>{logs.length?logs.map(entry=><div key={entry.id} className="py-2 border-t border-stone-200 dark:border-stone-700"><strong className="text-xs">Turn {entry.turnNumber} · {entry.turn==='w'?'White':'Black'}</strong><p className="text-xs mt-1">{entry.detail}</p></div>):<p className="text-xs">No play entry was recorded for this card type; it may have been discarded without being played.</p>}</section>;
                })()}
              </div>
            ) : (
              /* --- CHRONOLOGICAL / SORTED LIST VIEW --- */
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {processedDiscardCards.map((item, idx) => {
                  const isTop = idx === 0 && discardSortMode === 'newest';
                  const info = CARD_TYPE_LABELS[item.card.type];

                  return (
                    <div
                      key={`${item.card.id}-${idx}`}
                      className={`p-2.5 rounded-xl border flex items-center justify-between ${
                        isTop
                          ? 'bg-blue-50/60 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700 ring-1 ring-blue-200 dark:ring-blue-800'
                          : 'bg-white dark:bg-stone-800/80 border-stone-200 dark:border-stone-700 shadow-xs'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="inspection-list-art"><CardArtwork card={item.card}/></div>
                        <span className="text-xs font-mono font-bold text-stone-400 w-7">
                          #{item.originalIndex}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-stone-900 dark:text-stone-100">{item.card.name}</span>
                            {isTop && (
                              <span className="text-[9px] font-black uppercase bg-blue-500 text-white px-1.5 py-0.5 rounded shadow-xs">
                                LATEST
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-stone-500 dark:text-stone-400 leading-snug">{item.card.description}</p>
                        </div>
                      </div>
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded border bg-stone-50 dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300">
                        {info.name.toUpperCase()}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Footer */}
            <div className="pt-3 border-t border-stone-100 dark:border-stone-800 mt-3 flex items-center justify-between text-xs">
              <span className="text-stone-500 dark:text-stone-400">
                Total played: <strong className="text-blue-700 dark:text-blue-400">{discardPile.length}</strong> cards
              </span>
              <button
                onClick={() => setIsDiscardModalOpen(false)}
                className="px-4 py-2 bg-stone-800 dark:bg-stone-700 hover:bg-stone-700 dark:hover:bg-stone-600 text-white font-bold rounded-xl text-xs cursor-pointer shadow-xs"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* --- EXHAUSTED PILE MODAL --- */}
      {isExhaustedModalOpen && (
        <Modal className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 dark:bg-stone-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-stone-900 border-2 border-red-500/60 dark:border-red-600/60 rounded-2xl p-5 max-w-lg w-full shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800 mb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 shadow-xs">
                  <Flame className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-red-700 dark:text-red-400 font-sans">
                    Exhausted Awakening Cards
                  </h3>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    Permanently banished from the game — will NOT reshuffle when deck runs empty
                  </p>
                </div>
              </div>
              <button aria-label="Close dialog"
                onClick={() => { setIsExhaustedModalOpen(false); setIsDiscardModalOpen(true); }}
                className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {exhaustedCards.length === 0 ? (
                <div className="text-center py-8 text-stone-400 text-xs">
                  No cards have been exhausted yet.
                </div>
              ) : (
                exhaustedCards.map((card, idx) => {
                  const info = CARD_TYPE_LABELS[card.type] || {
                    name: card.name,
                    color: 'text-red-400',
                    badgeBg: 'bg-red-950/70 border-red-500/40',
                  };
                  return (
                    <div
                      key={card.id || idx}
                      className="p-3 rounded-xl bg-red-50/50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/60 flex items-start justify-between gap-3 shadow-xs"
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="inspection-list-art"><CardArtwork card={card}/></div>
                        <span className="font-mono text-xs font-bold text-red-600 dark:text-red-400 mt-0.5">
                          #{idx + 1}
                        </span>
                        <div>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-xs font-bold text-stone-900 dark:text-stone-100">
                              {cardDisplayName(card)}
                            </span>
                            <span className="text-[9px] font-black uppercase bg-red-600 text-white px-1.5 py-0.5 rounded shadow-xs">
                              EXHAUSTED
                            </span>
                          </div>
                          <p className="text-[11px] text-stone-600 dark:text-stone-300 leading-snug">
                            {card.description}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded border bg-red-100 dark:bg-red-900/60 border-red-300 dark:border-red-700 text-red-800 dark:text-red-200 shrink-0">
                        {info.name.toUpperCase()}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-3 border-t border-stone-100 dark:border-stone-800 mt-3 flex items-center justify-between text-xs">
              <span className="text-stone-500 dark:text-stone-400">
                Total exhausted: <strong className="text-red-600 dark:text-red-400">{exhaustedCards.length}</strong> card(s)
              </span>
              <button
                onClick={() => { setIsExhaustedModalOpen(false); setIsDiscardModalOpen(true); }}
                className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white font-bold rounded-xl text-xs cursor-pointer shadow-xs"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};
