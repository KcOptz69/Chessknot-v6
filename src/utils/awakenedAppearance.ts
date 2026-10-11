import type {Card, PlayerColor, SummoningCircle} from '../types.ts';
// Appearance follows stable identities and live effect lifetime, never a dismissed popup.
export function awakenedAppearance(type:string,color:PlayerColor,id:string|undefined,turnNumber:number,circles:SummoningCircle[],hands:Record<PlayerColor,Card[]>|undefined,history:Array<{actionType?:string;cardName?:string;turn:PlayerColor;turnNumber:number}>){
 if(type==='b')return Boolean(id&&circles.some(c=>c.bishopId===id&&!c.finished&&!c.interrupted));
 if(type==='q')return Boolean(id&&hands?.[color]?.some(c=>c.type==='soul_release'&&c.soul?.queenId===id));
 if(type==='k'){const event=history.find(e=>e.actionType==='awakening'&&e.cardName==='Awakening: King'&&e.turn===color);return Boolean(event&&turnNumber===event.turnNumber+1);}
 return false;
}
