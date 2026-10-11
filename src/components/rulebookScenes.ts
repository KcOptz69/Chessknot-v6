// Coordinates are [column, row] on a five-by-five illustrative board.
// Explicit square positions stay correct when the board shrinks on phones.
export type DemoUnit={id:string;type:string;color:'w'|'b';x:number;y:number;awakened?:boolean;ghost?:boolean;poison?:boolean;selected?:boolean;blocked?:boolean;protected?:boolean;stunned?:boolean;wind?:boolean};
export type DemoTile={type:string;x:number;y:number;occupied?:boolean;count?:number};
export type DemoScene={caption:string;units:DemoUnit[];tiles?:DemoTile[];targets?:number[][];effect?:{type:string;x:number;y:number};beam?:{from:number[];to:number[];blocked?:boolean};hand?:string[];gold?:boolean;discard?:boolean};
const u=(id:string,type:string,x:number,y:number,color:'w'|'b'='w',extra:Partial<DemoUnit>={}):DemoUnit=>({id,type,x,y,color,...extra});
const scene=(caption:string,units:DemoUnit[],extra:Partial<DemoScene>={}):DemoScene=>({caption,units,...extra});
const hand=['pawn','knight','bishop','rook','queen'];
export function ruleScenes(type:string):DemoScene[] {
 if(type==='refresh')return [scene('Your current five-card hand',[],{hand}),scene('Discard all five cards',[],{hand,discard:true}),scene('Draw five new cards',[],{hand:['rook','wild','pawn','bishop','pawn']})];
 if(type==='joker')return [scene('Your current hand',[],{hand}),scene('Activate Joker · free action',[],{hand,discard:true}),scene('Five temporary gold Wilds',[],{hand:Array(5).fill('wild'),gold:true})];
 if(type==='wild')return ['p','n','b','r','q'].map((p,index)=>scene('Select any standard piece', ['p','n','b','r','q'].map((t,x)=>u(t,t,x,4,'w',{selected:x===index})),{targets:[[[0,3],[2,2],[4,2],[3,1],[4,1]][index]]}));
 if(type==='previous')return [scene('Turn 1 · play a Knight card',[u('n','n',0,4)],{targets:[[1,2]]}),scene('First Knight move',[u('n','n',1,2)],{targets:[[3,1]]}),scene('Turn 2 · play Previous',[u('n','n',3,1)])];
 if(type==='monolith')return [scene('The rook checks your King',[u('k','k',2,4),u('r','r',2,0,'b'),u('m','m',0,2)],{beam:{from:[2,0],to:[2,4]}}),scene('Move the Monolith into the attack line',[u('k','k',2,4),u('r','r',2,0,'b'),u('m','m',2,2)],{beam:{from:[2,0],to:[2,2],blocked:true}}),scene('The Monolith blocks the check',[u('k','k',2,4),u('r','r',2,0,'b'),u('m','m',2,2)])];
 if(type==='restrict')return [scene('This Knight jump would give check',[u('k','k',3,4),u('n','n',1,0,'b')],{targets:[[2,2]]}),scene('Restrict the checking destination',[u('k','k',3,4),u('n','n',1,0,'b')],{tiles:[{type:'restrict',x:2,y:2}]}),scene('Landing is blocked · sliders may pass through',[u('k','k',3,4),u('n','n',1,0,'b',{blocked:true})],{tiles:[{type:'restrict',x:2,y:2}],effect:{type:'blocked',x:2,y:2}})];
 if(type==='push')return [scene('Play Push on your Pawn',[u('p','p',0,4),u('enemy','p',4,4,'b')],{targets:[[3,1]]}),scene('Slide like a Queen · no capture',[u('p','p',3,1,'w',{wind:true}),u('enemy','p',4,4,'b')])];
 if(type==='switch')return [scene('Choose two friendly pieces',[u('p','p',0,4),u('n','n',4,0)]),scene('Swap their positions',[u('p','p',4,0),u('n','n',0,4)])];
 if(type==='awakening_pawn')return [scene('Super Pawn can capture forward',[u('p','p',2,4,'w',{awakened:true}),u('enemy','p',2,3,'b')],{targets:[[2,3]]}),scene('Capture the piece directly in front',[u('p','p',2,3,'w',{awakened:true})])];
 if(type==='awakening_rook')return [scene('An awakened Rook may capture',[u('r','r',1,4,'w',{awakened:true}),u('enemy','p',1,1,'b'),u('attacker','r',4,1,'b')]),scene('Capture · protection stays active',[u('r','r',1,1,'w',{awakened:true}),u('attacker','r',4,1,'b')]),scene('Enemy Rook cannot capture it',[u('r','r',1,1,'w',{awakened:true}),u('attacker','r',4,1,'b',{blocked:true})],{beam:{from:[4,1],to:[1,1],blocked:true},effect:{type:'blocked',x:1,y:1}})];
 if(type==='awakening_knight')return [scene('First L-shaped jump',[u('n','n',0,4,'w',{awakened:true}),u('enemy','p',3,1,'b')],{targets:[[1,2]]}),scene('Optional second L-shaped jump',[u('n','n',1,2,'w',{awakened:true}),u('enemy','p',3,1,'b')],{targets:[[3,1]]}),scene('Capture on jump two · return to normal',[u('n','n',3,1)])];
 if(type==='awakening_bishop')return [scene('Move the Bishop normally',[u('b','b',1,4)],{targets:[[3,2]]}),...[3,2,1].map(count=>scene(`Summoning circle · ${count} own turns remain`,[u('b','b',3,2,'w',{awakened:true})],{tiles:[{type:'circle',x:1,y:4,count}]})),scene('Choose to revive your captured Queen',[u('b','b',3,2),u('revived','q',1,4)],{effect:{type:'revive',x:1,y:4}})];
 if(type==='awakening_queen')return [scene('Capture a standard enemy Queen',[u('q','q',0,4,'w',{awakened:true}),u('enemy','q',3,1,'b')]),scene('Capture grants Soul Release',[u('q','q',3,1,'w',{awakened:true})]),scene('Use Soul Release · summon a temporary Queen',[u('q','q',3,1),u('soul','q',4,2,'w',{ghost:true})],{effect:{type:'soul',x:4,y:2}})];
 if(['mine','poison','banish','disarm'].includes(type)) {
  const tile={type,x:2,y:3};
  const start=scene('An opponent’s Rook approaches',[u('enemy','r',2,0,'b')],{tiles:[tile]});
  const land=scene('The Rook lands on the trap square',[u('enemy','r',2,3,'b')],{tiles:[tile]});
  const trigger=scene('The trap triggers after landing',[u('enemy','r',2,3,'b',{poison:type==='poison'})],{effect:{type,x:2,y:3}});
  if(type==='mine')return [start,land,trigger,scene('The mine removes the Rook',[])];
  if(type==='banish')return [start,land,trigger,scene('Banished · return after ten turns',[],{tiles:[{type:'banished',x:2,y:3,count:10}]})];
  if(type==='disarm')return [start,land,trigger,scene('The Rook remains · captures are disabled',[u('enemy','r',2,3,'b')],{effect:{type:'disarmed',x:2,y:3}})];
  return [start,land,trigger,...[3,2,1].map(count=>scene(`${count} subsequent owner turns remain`,[u('enemy','r',2,3,'b',{poison:true})],{tiles:[{type:'poison-count',x:2,y:3,count}]})),scene('Poison removes the Rook',[])];
 }
 if(type==='boost'||type==='gravity')return [scene('Land on the powered tile',[u('n','n',0,4)],{tiles:[{type,x:1,y:2}],targets:[[1,2]]}),scene('Tile governs the next move',[u('n','n',1,2)],{tiles:[{type,x:1,y:2,occupied:true}],targets:type==='boost'?[[4,2]]:[[2,1]]}),scene(type==='boost'?'Move like a Queen · no capture':'Move like a King · no capture',[u('n','n',...(type==='boost'?[4,2]:[2,1]) as [number,number])],{tiles:[{type,x:1,y:2}]})];
 if(type==='defense')return [scene('Bishop approaches Defense',[u('b','b',1,4),u('r','r',3,0,'b')],{tiles:[{type,x:3,y:2}]}),scene('The occupant is protected',[u('b','b',3,2),u('r','r',3,0,'b')],{tiles:[{type,x:3,y:2,occupied:true}]}),scene('Enemy Rook cannot capture the Bishop',[u('b','b',3,2),u('r','r',3,0,'b',{blocked:true})],{tiles:[{type,x:3,y:2,occupied:true}],beam:{from:[3,0],to:[3,2],blocked:true},effect:{type:'blocked',x:3,y:2}})];
 if(type==='portal')return [scene('Bishop lands on a portal',[u('b','b',0,4)],{tiles:[{type,x:2,y:2},{type,x:4,y:0}]}),scene('Both linked portals glow',[u('b','b',2,2)],{tiles:[{type,x:2,y:2,occupied:true},{type,x:4,y:0,occupied:true}]}),scene('Travel (Free) · teleport to the other portal',[u('b','b',4,0)],{tiles:[{type,x:2,y:2,occupied:true},{type,x:4,y:0,occupied:true}],effect:{type:'portal-arrival',x:4,y:0}})];
 if(type==='beacon') {
  const units=[u('m','m',2,2),u('p','p',1,3,'w',{protected:true}),u('enemy','r',1,0,'b')];
  return [scene('Cast Holy Sanctum · six turns',units,{effect:{type,x:2,y:2}}),scene('Enemy Rook attempts to capture the protected Pawn',units.map(p=>p.id==='enemy'?{...p,blocked:true}:p),{effect:{type,x:2,y:2},beam:{from:[1,0],to:[1,3],blocked:true}}),scene('Invulnerability prevents capture · Pawn survives',units,{effect:{type,x:2,y:2}})];
 }
 if(type==='static') {
  const units=[u('m','m',2,2),u('p','p',1,3),u('enemy','r',1,1,'b')];
  const stunned=units.map(p=>p.id==='enemy'?{...p,stunned:true}:p);
  return [scene('Charge Static around the Monolith',units,{effect:{type,x:2,y:2}}),scene('On your next turn · nearby enemy Rook is stunned',stunned,{effect:{type,x:2,y:2}}),scene('Stunned Rook cannot capture · Pawn survives',stunned.map(p=>p.id==='enemy'?{...p,blocked:true}:p),{effect:{type,x:2,y:2},beam:{from:[1,1],to:[1,3],blocked:true}})];
 }
 if(type==='clock')return [scene('Your Knight before the enemy capture',[u('n','n',1,3),u('enemy','r',1,0,'b')]),scene('Enemy Rook captures your Knight',[u('enemy','r',1,3,'b')]),scene('Activate Clock · rewind the capture',[u('n','n',1,3),u('enemy','r',1,0,'b')],{effect:{type:'clock',x:3,y:2}}),scene('Your Knight is alive again · Rook returns',[u('n','n',1,3),u('enemy','r',1,0,'b')])];
 if(type==='berserker')return [
  scene('Movement · one square like a King',[u('c',type,0,4),u('enemy','r',1,0,'b')],{targets:[[1,3]]}),
  scene('Movement · Berserker steps diagonally',[u('c',type,1,3),u('enemy','r',1,0,'b')]),
  scene('Ultimate · Queen-like move to the first enemy',[u('c',type,1,3),u('enemy','r',1,0,'b')],{targets:[[1,0]]}),
  scene('Ultimate · capture one enemy on the destination',[u('c',type,1,0)])];
 if(type==='musketeer')return [
  scene('Movement · one square like a King',[u('c',type,0,4),u('enemy','r',1,0,'b')],{targets:[[1,3]]}),
  scene('Movement · Musketeer steps diagonally',[u('c',type,1,3),u('enemy','r',1,0,'b')]),
  scene('Ultimate · aim at the first enemy within three squares',[u('c',type,1,3),u('enemy','r',1,0,'b')],{beam:{from:[1,3],to:[1,0]}}),
  scene('Ultimate · shoot without moving',[u('c',type,1,3)],{beam:{from:[1,3],to:[1,0]}})];
 if(type==='summoner')return [
  scene('Movement · one square like a King',[u('c',type,0,4),u('ally','n',4,4),u('enemy','r',2,2,'b')],{targets:[[1,3]]}),
  scene('Movement · Summoner steps diagonally',[u('c',type,1,3),u('ally','n',4,4),u('enemy','r',2,2,'b')]),
  scene('Ultimate · teleport your Knight beside the Summoner',[u('c',type,1,3),u('ally','n',2,2)],{effect:{type:'portal-arrival',x:2,y:2}})];
 if(type==='ninja')return [
  scene('Movement · Queen-like slide without capturing',[u('c',type,0,4),u('e1','p',3,1,'b'),u('e2','r',2,1,'b')],{targets:[[2,2]]}),
  scene('Movement · Ninja reaches two adjacent enemies',[u('c',type,2,2),u('e1','p',3,1,'b'),u('e2','r',2,1,'b')]),
  scene('Ultimate · assassinate both adjacent enemies',[u('c',type,2,2)])];
 if(type==='champion')return [scene('Choose a legal deployment square',[],{targets:[[2,3]]}),scene('A random Champion is deployed',[u('champion','berserker',2,3)],{effect:{type:'revive',x:2,y:3}})];
 if(type==='awakening_king')return [scene('King in Check · play Awaken',[u('k','k',2,4),u('enemy','r',2,0,'b')],{beam:{from:[2,0],to:[2,4]}}),scene('Queen-like escape to a safe square',[u('k','k',4,2,'w',{awakened:true}),u('enemy','r',2,0,'b')])];
 const piece=({pawn:'p',knight:'n',bishop:'b',rook:'r',queen:'q',berserker:'berserker',musketeer:'musketeer',summoner:'summoner',ninja:'ninja'} as Record<string,string>)[type]||'p';
 const from=type==='pawn'?[2,4]:type==='knight'?[0,4]:[1,4];
 const to=type==='pawn'?[3,3]:type==='knight'?[1,2]:type==='bishop'||type==='queen'||type==='ninja'?[3,2]:type==='rook'?[1,1]:[2,3];
 // Ninja standard movement cannot capture; its information panel explains the ultimate.
 if(type==='ninja')return [scene('Queen-like movement · no standard capture',[u('piece',piece,from[0],from[1])],{targets:[to]}),scene('Reposition the Ninja',[u('piece',piece,to[0],to[1])])];
 return [scene('Select the piece and legal capture',[u('piece',piece,from[0],from[1]),u('enemy','p',to[0],to[1],'b')],{targets:[to]}),scene('Move onto the enemy’s square to capture',[u('piece',piece,to[0],to[1])])];
}
