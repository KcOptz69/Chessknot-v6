import type { CardType } from '../types.ts';

// Shared copy for cards, their skill selection, and activation notifications.
export const AWAKENING_DESCRIPTIONS: Partial<Record<CardType,string>> = {
 awakening_pawn: 'Move a Pawn and permanently turn it into a Super Pawn, which can capture directly forward as well as diagonally. It keeps this ability until promotion, when it becomes an ordinary promoted piece; using the skill exhausts this card.',
 awakening_knight: 'Awaken a Knight into a Super Knight, with an optional second move in the same turn without another card. Only one capture is allowed across both moves, your King must be safe after each move, and using the second move returns it to normal; Boost and Gravity govern movement while it stands on those tiles.',
 awakening_rook: 'Move your Rook and protect it from every capture method for five turns. It may capture one ordinary target while protected and may still capture the King afterward; protection expires normally and using this skill exhausts the card.',
 awakening_bishop: 'Move your Bishop normally and leave a summoning circle on its starting square; after three subsequent turns of yours, choose a captured standard piece to revive there for free, or decline. Any piece landing on the circle or a Restrict card interrupts it; it is not empty for traps or Monolith placement, and the circle remains independent of the Bishop.',
 awakening_queen: 'Move your Queen normally and capture a standard enemy piece to exhaust this card and receive Soul Release instead of the replacement draw. Soul Release is a move action that summons that piece on an empty unrestricted square within the 5×5 area centered on this exact Queen for five of your subsequent turns; the temporary unit has no army or capture value, though its captures earn points.',
 awakening_king: 'Only while your King is in Check, move and capture along an unobstructed rank, file, or diagonal like a Queen, ending on a safe square. The King keeps its free move, the awakened appearance ends after the opponent moves, and using the skill exhausts this card.',
};
export const AWAKENING_WILD_DESCRIPTION='Use this card as a Wild to move any eligible standard piece with its normal movement, without activating an Awakening skill. It goes to the ordinary discard pile and may be drawn again, rather than being exhausted.';
