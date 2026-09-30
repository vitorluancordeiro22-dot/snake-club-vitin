import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function controls() {
  const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const gesture=source.slice(source.indexOf('let touchStart=null;'),source.indexOf("document.addEventListener('visibilitychange'"));
  const directions=[];
  const surfaces=['board-wrap','swipe-pad'].map(()=>({
    events:{},classList:{add(){},remove(){}},setPointerCapture(){},
    addEventListener(type,fn){this.events[type]=fn;}
  }));
  const context={status:'running',size:390,direction:dir=>directions.push(dir),$:id=>surfaces[id==='board-wrap'?0:1]};
  vm.runInNewContext(gesture,context);
  const fire=(type,x,y,{pad=0,id=1,pointerType='touch',interactive=false}={})=>{
    surfaces[pad].events[type]({type,clientX:x,clientY:y,pointerId:id,pointerType,cancelable:true,preventDefault(){},target:{closest:()=>interactive}});
  };
  return {fire,directions,context};
}

test('swipe works on both surfaces and supports continuous intentional turns',()=>{
  for(const pad of [0,1]){
    const {fire,directions}=controls();
    fire('pointerdown',100,100,{pad});
    fire('pointermove',140,100,{pad});
    fire('pointermove',180,100,{pad});
    fire('pointermove',180,140,{pad});
    fire('pointerup',180,140,{pad});
    assert.deepEqual(directions,[0,1]);
  }
});
test('small tremors, ambiguous diagonals and additional fingers are ignored',()=>{
  const {fire,directions}=controls();
  fire('pointerdown',100,100);
  fire('pointermove',110,102);
  fire('pointermove',130,129);
  fire('pointerdown',200,200,{id:2});
  fire('pointermove',250,200,{id:2});
  assert.deepEqual(directions,[]);
  fire('pointermove',140,100);
  assert.deepEqual(directions,[0]);
});
test('short swipes finish on pointerup, cancel resets and buttons retain their behavior',()=>{
  const {fire,directions}=controls();
  fire('pointerdown',100,100);
  fire('pointerup',100,140);
  assert.deepEqual(directions,[1]);
  fire('pointerdown',100,100);
  fire('pointercancel',100,100);
  fire('pointermove',100,50);
  fire('pointerdown',100,100,{interactive:true});
  fire('pointermove',100,50);
  assert.deepEqual(directions,[1]);
});
