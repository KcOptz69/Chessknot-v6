import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {createInitialGameState,createSafeChess} from '../src/utils/chessLogic.ts';
import {expandFrontier,frontierMoves,monolithPlacementSquare,emptyFrontierSquare,frontierKingSafe,executeLandingMove} from '../src/utils/frontier.ts';
import {allSquares,ranksFor} from '../src/utils/frontierBoard.ts';
import {activeCircle} from '../src/utils/summoning.ts';
function evaluate(file:string,variable:string,values:Record<string,any>){
 const source=readFileSync(new URL(file,import.meta.url),'utf8');const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let expression='';
 function visit(n:ts.Node){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)===variable)expression=n.initializer!.getText(ast);ts.forEachChild(n,visit);}visit(ast);assert.ok(expression);
 const code=ts.transpileModule(`return (${expression});`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const scope=new Proxy({structuredClone,Object,React:{useMemo:(fn:any)=>fn()},monolithPlacementSquare,emptyFrontierSquare,frontierMoves,frontierKingSafe,executeLandingMove,ranksFor,allSquares,activeCircle,createSafeChess,...values},{has:()=>true,get:(t,k)=>k===Symbol.unscopables?undefined:(t as any)[k]});return new Function('scope',`with(scope){${code}}`)(scope);
}
function state(){const s=createInitialGameState({arcaneFrontier:true});s.status='playing';s.fen='4k3/8/8/8/8/8/8/1N2K3 w - - 0 1';expandFrontier(s);s.frontier!.ready=true;s.frontier!.pois={};delete s.frontier!.boss;return s;}
test('Monolith actual highlight path excludes every discovery for card and power-up',()=>{
 for(const power of [false,true]){const s=state();s.frontier!.pois={aW:'key',bW:'bag',cW:'chest',dW:'boss'};s.frontier!.boss={square:'dW',health:2};s.frontier!.golems=[{id:'g',owner:'w',square:'eW'}];
 const targets=evaluate('../src/components/ChessBoard.tsx','validCardTargets',{selectedCard:power?null:{type:'monolith'},isWildPowerUp:false,isMonolithPowerUp:power,fen:s.fen,chess:createSafeChess(s.fen),frontierGame:s,champions:s.champions,monolithSquare:null,restrictedSquares:[]});
 for(const square of ['aW','bW','cW','dW','eW'])assert.ok(!targets.includes(square));assert.ok(targets.includes('fW'));}
});
test('Awakening and Push highlights use expanded-board movement and safety',()=>{
 const s=state();s.grounds=undefined;for(const type of ['awakening_knight','awakening_knight-wild','push']){const wild=type.endsWith('-wild');const card={type:wild?'awakening_knight':type};const targets=evaluate('../src/components/ChessBoard.tsx','validDestinations',{selectedSquare:'b1',selectedCard:card,frontierGame:s,tutorialGuide:undefined,monolithSquare:null,isWildPowerUp:false,awaitingKnightSecondMove:false,awakeningMode:wild?'wild':'skill',isKingInCheck:false});assert.deepEqual(targets,frontierMoves(s,'b1',type==='push'?'q':undefined,type==='push'));}
});
test('trap highlights include only each player central half and omit discoveries and Golems',()=>{
 for(const color of ['w','b']){const s=state();s.frontier!.pois={aW:'key',bY:'chest'};s.frontier!.golems=[{id:'g',owner:'w',square:'cX'}];s.grounds={tiles:{},traps:[]} as any;
 const targets=evaluate('../src/App.tsx','validGroundTargets',{groundMode:'mine',isMyTurn:true,gameState:s,activeColor:color});
 assert.ok(targets.includes(color==='w'?'dX':'dY'));assert.ok(!targets.includes(color==='w'?'dY':'dX'));for(const q of ['aW','bY','cX'])assert.ok(!targets.includes(q));}
});
