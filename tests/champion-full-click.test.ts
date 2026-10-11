import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const source=readFileSync(new URL('../src/components/ChessBoard.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('ChessBoard.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let handler: ts.ArrowFunction | undefined;
function visit(node:ts.Node) {
  if(ts.isVariableDeclaration(node) && node.name.getText(ast)==='handleSquareClick') handler=node.initializer as ts.ArrowFunction;
  ts.forEachChild(node,visit);
}
visit(ast); assert.ok(handler);
const code=ts.transpileModule(`const click = ${handler.getText(ast)};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function click(overrides:any={}) {
  const calls:any[]=[];
  const values:any={
    bishopMoveAllowed:{current:true},summoningCircles:[],pieceIds:{},frontierGame:undefined,
    Boolean, Math, Number, playCaptureSound:()=>{},playMoveSound:()=>{},
    champions:{w:{square:'a1',color:'w'},b:{square:'d5',color:'b'}},
    myChampion:{square:'a1',color:'w'}, enemyChampion:{square:'d5',color:'b'},
    isMyTurn:true,turn:'w',selectedSquare:'d1',validDestinations:['d5'],
    selectedCard:{id:'card',type:'rook'}, awakeningMode:'skill',
    superKnights:[],chess:{get:()=>undefined},
    setSelectedSquare:()=>{},setInspectedChampionSquare:(square:any)=>{if(square) calls.push(['inspect']);},
    onMove:(...args:any[])=>calls.push(['move',...args]),
    onChampionMove:(...args:any[])=>calls.push(['champion',...args]),
    onPlayAwakeningRook:(...args:any[])=>calls.push(['awakening',...args]),
    setKnightMovePrompt:(...args:any[])=>calls.push(['knightPrompt',...args]),
    ...overrides,
  };
  const scope=new Proxy(values,{has:()=>true,get:(target,key)=>key===Symbol.unscopables?undefined:target[key]});
  new Function('scope',`with(scope) { ${code} click('d5'); }`)(scope);
  return calls;
}
for(const type of ['rook','bishop','queen','pawn','wild']) {
  test(`${type}: complete handler dispatches highlighted Champion capture`,()=>{
    assert.deepEqual(click({selectedCard:{type}}),[['move','d1','d5']]);
  });
}
test('King dispatches without a card',()=>assert.deepEqual(click({selectedCard:null}),[['move','d1','d5']]));
test('Awakening Rook dispatches Champion capture',()=>assert.deepEqual(click({selectedCard:{type:'awakening_rook'}}),[['awakening','d1','d5']]));
test('Super Knight Champion target reaches its decision prompt',()=>assert.equal(click({superKnights:['d1'],selectedCard:{type:'knight'}})[0][0],'knightPrompt'));
test('friendly Champion can capture enemy Champion',()=>assert.deepEqual(click({selectedSquare:'a1'}),[['champion','a1','d5']]));
test('illegal Champion target opens no piece tooltip and dispatches no move',()=>assert.deepEqual(click({validDestinations:[]}),[]));
test('spectator/out-of-turn Champion tap opens no piece tooltip',()=>assert.deepEqual(click({isMyTurn:false}),[]));
for(const type of ['wild','awakening_knight','previous','push','switch']) {
 test(`piece tap does not automatically select ${type}`,()=>{
  let selected:any=null;
  click({champions:{w:null,b:null},myChampion:null,enemyChampion:null,selectedSquare:null,selectedCard:null,validDestinations:[],
   chess:{get:()=>({type:'n',color:'w'})},hand:[{id:'power',type}],onSelectCard:(c:any)=>{selected=c},
   preserveSelectionRef:{current:false},monolithSquare:null,setCooldownWarning:()=>{},PIECE_NAMES:{n:'Knight'}});
  assert.equal(selected,null);
 });
}
test('piece tap prefers its standard card even when Wild is first in hand',()=>{
 let selected:any=null;
 click({champions:{w:null,b:null},myChampion:null,enemyChampion:null,selectedSquare:null,selectedCard:null,validDestinations:[],
  chess:{get:()=>({type:'n',color:'w'})},hand:[{id:'power',type:'wild'},{id:'normal',type:'knight'}],onSelectCard:(c:any)=>{selected=c},preserveSelectionRef:{current:false},monolithSquare:null,setCooldownWarning:()=>{},PIECE_NAMES:{n:'Knight'}});
 assert.equal(selected?.id,'normal');
});
