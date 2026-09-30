import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, opposite } from '../public/engine.js';
import gameHandler from '../api/game.js';
import rankingHandler from '../api/ranking.js';
process.env.SNAKE_LOCAL_DEV='1';process.env.SNAKE_TEST_DB=':memory:';
async function call(handler,url,body,method=body?'POST':'GET'){
 let data,status;
 const req={url,method,headers:{host:'localhost','content-type':'application/json','x-forwarded-for':'127.0.0.1'},body};
 const res={set statusCode(value){status=value;},setHeader(){},end(value){data=JSON.parse(value);}};
 await handler(req,res);return {status,data};
}
function completeRound(seed){
 const game=createGame(seed),moves=[];
 function pathToApple(){
  const body=new Set(game.snake.slice(0,-1).map(p=>p.x+','+p.y)),head=game.snake[0];
  const queue=[{x:head.x,y:head.y,dir:game.direction,path:[]}],seen=new Set();
  while(queue.length){
   const p=queue.shift();
   for(let d=0;d<4;d++){
    if(opposite(p.dir,d))continue;
    const vectors=[[1,0],[0,1],[-1,0],[0,-1]],v=vectors[d],x=(p.x+v[0]+22)%22,y=(p.y+v[1]+22)%22,key=x+','+y+','+d;
    if(seen.has(key)||body.has(x+','+y))continue;
    const path=[...p.path,d];if(x===game.apple.x&&y===game.apple.y)return path;
    seen.add(key);queue.push({x,y,dir:d,path});
   }
  }
  throw new Error('Apple path not found');
 }
 function move(d){if(d!==game.direction)moves.push([game.ticks,d]);step(game,d);}
 for(const d of pathToApple())move(d);
 for(let i=0;i<3&&game.alive;i++)move((game.direction+1)%4);
 assert.equal(game.alive,false);
 return {moves,ticks:game.ticks,score:game.score};
}
async function allowDuration(replay){await new Promise(resolve=>setTimeout(resolve,Math.max(0,replay.ticks*175-2400)));}
test('clients share a ranking, retries are idempotent and each normalized name keeps its best',async()=>{
 const one=await call(gameHandler,'/api/game?op=start',{username:'Vitin'});assert.equal(one.status,200);
 const replay=completeRound(one.data.seed);await allowDuration(replay);
 const saved=await call(gameHandler,'/api/game?op=finish',{runId:one.data.runId,...replay});
 assert.equal(saved.status,200);assert.equal(saved.data.score,replay.score);assert.ok(saved.data.score>=10);assert.equal(saved.data.me.username,'Vitin');
 const again=await call(gameHandler,'/api/game?op=finish',{runId:one.data.runId,...replay});
 assert.equal(again.status,200);assert.equal(again.data.entries.length,1);
 const other=await call(rankingHandler,'/api/ranking?username=Vitin');
 assert.equal(other.data.entries[0].score,replay.score);assert.equal(other.data.me.position,1);
 const second=await call(gameHandler,'/api/game?op=start',{username:'vitin'});
 const lower=completeRound(second.data.seed);await allowDuration(lower);
 const sameName=await call(gameHandler,'/api/game?op=finish',{runId:second.data.runId,...lower});
 assert.equal(sameName.status,200);assert.equal(sameName.data.entries.length,1);
 assert.equal(sameName.data.me.score,Math.max(replay.score,lower.score));
 const week=await call(rankingHandler,'/api/ranking?scope=week');assert.equal(week.data.entries.length,1);
});
test('made-up scores, wrong methods and invalid names cannot enter the ranking',async()=>{
 const name=await call(gameHandler,'/api/game?op=start',{username:'<script>'});assert.equal(name.status,400);
 const fake=await call(gameHandler,'/api/game?op=finish',{runId:'a'.repeat(64),score:999999,moves:[],ticks:1});assert.equal(fake.status,404);
 const wrong=await call(gameHandler,'/api/game?op=start',undefined,'GET');assert.equal(wrong.status,405);
 const start=await call(gameHandler,'/api/game?op=start',{username:'Amigo'});
 const unfinished=await call(gameHandler,'/api/game?op=finish',{runId:start.data.runId,score:10000,moves:[],ticks:1});
 assert.equal(unfinished.status,400);
});
