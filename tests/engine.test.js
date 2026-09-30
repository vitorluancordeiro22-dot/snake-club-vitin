import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, SIZE, tickDuration, validateReplay } from '../public/engine.js';
import { normalizeUsername } from '../server/http.js';

test('wraps through all four edges without losing', () => {
 for(const [dir,head,expected] of [
  [0,{x:SIZE-1,y:10},{x:0,y:10}],[2,{x:0,y:10},{x:SIZE-1,y:10}],
  [1,{x:10,y:SIZE-1},{x:10,y:0}],[3,{x:10,y:0},{x:10,y:SIZE-1}]
 ]){
  const game=createGame(1);game.snake=[head];game.direction=dir;game.apple={x:2,y:2};
  step(game);assert.deepEqual(game.snake[0],expected);assert.equal(game.alive,true);
 }
});
test('apple grows the snake, scores ten and respawns outside the body',()=>{
 const game=createGame(8);game.apple={x:9,y:11};const length=game.snake.length;
 const result=step(game);assert.equal(result.ate,true);assert.equal(game.score,10);
 assert.equal(game.apples,1);assert.equal(game.snake.length,length+1);
 assert.ok(!game.snake.some(p=>p.x===game.apple.x&&p.y===game.apple.y));
});
test('reversal is ignored and moving into the vacating tail is legal',()=>{
 const game=createGame(8);step(game,2);assert.equal(game.direction,0);
 game.snake=[{x:5,y:5},{x:5,y:6},{x:4,y:6},{x:4,y:5}];game.direction=3;game.apple={x:0,y:0};
 step(game,2);assert.equal(game.alive,true);assert.deepEqual(game.snake[0],{x:4,y:5});
});
test('collision with the body ends the round',()=>{
 const game=createGame(1);game.snake=[{x:5,y:5},{x:5,y:6},{x:4,y:6},{x:4,y:5},{x:4,y:4}];game.direction=3;game.apple={x:0,y:0};
 assert.equal(step(game,2).died,true);assert.equal(game.alive,false);
});
test('replay is deterministic and rejects incomplete or malformed rounds',()=>{
 assert.deepEqual(createGame(100),createGame(100));
 assert.throws(()=>validateReplay(100,[],3),/não terminou/);
 assert.throws(()=>validateReplay(100,[[0,2]],3),/direção inválida/);
 assert.throws(()=>validateReplay(100,[[0,1],[0,2]],3),/Movimentos/);
 assert.throws(()=>validateReplay(100,[],200000));
});
test('speed increases progressively and has a safe minimum',()=>{
 assert.equal(tickDuration(0),175);assert.equal(tickDuration(4),166);assert.equal(tickDuration(100),72);
});
test('names are normalized and executable markup is rejected',()=>{
 assert.deepEqual(normalizeUsername('  Vítin   22  '),{username:'Vítin 22',nameKey:'vítin 22'});
 assert.throws(()=>normalizeUsername('<img src=x>'));assert.throws(()=>normalizeUsername('a'));
});
