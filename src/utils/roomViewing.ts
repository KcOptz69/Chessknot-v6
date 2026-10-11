import type {GameState,RoomPlayer} from '../types.ts';
import {visibleGrounds} from './grounds.ts';

export function isArbiter(player:RoomPlayer|undefined){return player?.color==='spectator'&&player.role==='arbiter';}

/** Return a private snapshot for one connection; never change the authoritative room. */
export function viewingGameState(state:GameState,player:RoomPlayer|undefined,dismissed:Record<string,string>={}) :GameState {
 const arbiter=isArbiter(player),spectator=!player||player.color==='spectator';
 const publicFrontier=(frontier:GameState['frontier'])=>{if(!frontier)return;const copy=structuredClone(frontier);delete copy.chestRoll;if(copy.boss)delete copy.boss.drop;return copy;};
 const result:GameState={...state,
  frontier:publicFrontier(state.frontier),
  handCounts:{w:state.hands.w.length,b:state.hands.b.length},
  grounds:arbiter?structuredClone(state.grounds):visibleGrounds(state.grounds,player?.color||'spectator'),
  boardHistory:state.boardHistory?.map(snapshot=>({...snapshot,frontier:publicFrontier(snapshot.frontier),grounds:arbiter?structuredClone(snapshot.grounds):visibleGrounds(snapshot.grounds,player?.color||'spectator')})),
 };
 if(spectator){
  result.hands=arbiter?state.hands:{w:[],b:[]};
  result.deck=[];result.hiddenDeckCount=state.deck.length;
  result.pendingSwapDiscard=null;result.pendingSummon=null;result.pendingPortal=null;
  if(!arbiter)result.visionActive={w:false,b:false};
 }
 for(const key of ['clockAlert','passRedrawAlert','awakeningAlert'] as const){if(dismissed[key]===JSON.stringify(state[key]))(result as any)[key]=null;}
 return result;
}
