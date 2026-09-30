import { SIZE, MAX_TICKS, createGame, step, opposite, tickDuration, gameLevel } from './engine.js';

const $ = id => document.getElementById(id);
const canvas = $('board');
const ctx = canvas.getContext('2d');
const panels = ['welcome-panel', 'pause-panel', 'end-panel', 'countdown-panel'];
const storage = {
  get(key, fallback = null) { try { return JSON.parse(localStorage.getItem('snakeclub.' + key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem('snakeclub.' + key, JSON.stringify(value)); } catch {} },
};
let username = storage.get('username', '');
let soundOn = storage.get('sound', false);
let bests = storage.get('bests', {});
let audio;
let state = createGame(44);
let previous = state.snake.map(p => ({ ...p }));
let status = 'idle';
let queue = [];
let moves = [];
let runId = null;
let pendingSave = storage.get('pending', null);
let activeMs = 0;
let accumulator = 0;
let lastFrame = 0;
let lastStepDuration = 175;
let scope = 'all';
let boardData = null;
let rankingRequest = 0;
let saving = false;
let toastTimer;
let size = 0;
let countdownTimer;
let starting = false;
let eatFlash = 0;
let reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// A little snake waits in the background before the first round.
state.snake = [{x:16,y:15},{x:15,y:15},{x:14,y:15},{x:13,y:15},{x:12,y:15},{x:11,y:15},{x:10,y:15},{x:9,y:15},{x:8,y:15},{x:7,y:15},{x:6,y:15},{x:5,y:15},{x:4,y:15},{x:4,y:14},{x:4,y:13},{x:4,y:12},{x:4,y:11}];
state.apple = { x: 17, y: 6 };
previous = state.snake.map(p => ({ ...p }));

function keyName(name) { return name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR'); }
function nameValid(name) { return /^[\p{L}\p{N}_ -]{2,18}$/u.test(name); }
function scoreText(score) { return String(score || 0).padStart(3, '0'); }
function formatTime(ms) { const seconds = Math.floor(ms / 1000); return `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`; }

function showPanel(id) {
  for (const name of panels) $(name).hidden = name !== id;
  $('overlay').hidden = !id;
  $('overlay').classList.toggle('counting', id === 'countdown-panel');
}

function toast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => $('toast').hidden = true, 3500);
}

function beep(type) {
  if (!soundOn) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type === 'die' ? 'triangle' : 'sine';
    const now = audio.currentTime;
    const freq = type === 'eat' ? 740 : type === 'start' ? 440 : 230;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(type === 'die' ? 60 : freq * 1.45, now + .1);
    gain.gain.setValueAtTime(.08, now);
    gain.gain.exponentialRampToValueAtTime(.001, now + (type === 'die' ? .25 : .12));
    osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(now + .3);
  } catch {}
}

function updateSound() {
  $('sound').setAttribute('aria-pressed', String(soundOn));
  $('sound').setAttribute('aria-label', soundOn ? 'Desativar som' : 'Ativar som');
  $('sound').title = soundOn ? 'Desativar som' : 'Ativar som';
  $('sound-waves').setAttribute('d', soundOn ? 'M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14' : 'm16 9 5 6m0-6-5 6');
}

async function api(path, data) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(path, { ...(data ? { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data) } : {}), signal:controller.signal, cache:'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível conectar.');
    return result;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('A conexão demorou. Tente novamente.');
    throw error;
  } finally { clearTimeout(timeout); }
}

function updatePlayer() {
  $('player-avatar').textContent = username ? username.slice(0,2).toUpperCase() : '?';
  $('player-label').textContent = username ? '@' + username : 'Sua vez de jogar';
  $('best').textContent = scoreText(bests[keyName(username)]);
}

async function startGame() {
  if (starting || status === 'running' || status === 'countdown') return;
  const name = (status === 'idle' ? $('username').value : username).normalize('NFKC').trim().replace(/\s+/g,' ');
  if (!nameValid(name)) { $('name-error').textContent = 'Use 2 a 18 letras, números, espaços, _ ou -.'; $('username').focus(); return; }
  if (saving || pendingSave) {
    toast('Guarde sua pontuação antes da próxima partida.');
    if (pendingSave && !saving) saveScore();
    return;
  }
  starting = true;
  username = name;
  storage.set('username', username);
  $('username').value = username;
  $('name-error').textContent = '';
  $('play').disabled = true;
  $('again').disabled = true;
  $('play').firstElementChild.textContent = 'Entrando no jogo…';
  updatePlayer();
  beep('start');
  try {
    const round = await api('/api/game?op=start', { username });
    username = round.username;
    runId = round.runId;
    state = createGame(round.seed);
    $('connection-dot').classList.add('online');
    $('connection-dot').title = 'Ranking conectado';
  } catch (error) {
    $('name-error').textContent = error.message;
    toast(error.message);
    starting = false;
    $('play').disabled = false;
    $('again').disabled = false;
    $('play').firstElementChild.textContent = 'Jogar agora';
    // A failed leaderboard connection never silently produces a local-only score.
    return;
  }
  previous = state.snake.map(p => ({...p}));
  queue = []; moves = []; activeMs = 0; accumulator = 0;
  lastStepDuration = tickDuration(0);
  $('score').textContent = '000';$('level').textContent = 'Nível 01';
  $('pause').disabled = true;
  $('board-wrap').classList.remove('dead');
  $('board-wrap').classList.add('playing');
  $('live-announcement').textContent = 'Nova partida. Contagem regressiva.';
  status = 'countdown';
  showPanel('countdown-panel');
  let count = 3;
  $('countdown-number').textContent = count;
  clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    if (document.hidden) return;
    count--;
    if (count <= 0) {
      clearInterval(countdownTimer);
      showPanel(null);status='running';starting=false;
      lastFrame=performance.now();accumulator=0;
      $('pause').disabled=false;
      $('play').disabled=false;$('again').disabled=false;
      $('play').firstElementChild.textContent='Jogar agora';
      canvas.focus({preventScroll:true});beep('start');
    } else { $('countdown-number').textContent=count;beep('start'); }
  },650);
}

function direction(dir) {
  if (status !== 'running' && status !== 'countdown') return;
  const last = queue.length ? queue[queue.length - 1] : state.direction;
  if (dir === last || opposite(last,dir) || queue.length >= 2) return;
  queue.push(dir);
}

function pauseGame() {
  if (status !== 'running') return;
  status = 'paused';showPanel('pause-panel');
  $('pause').setAttribute('aria-label','Continuar partida');
  $('resume').focus({preventScroll:true});
  $('live-announcement').textContent='Partida pausada.';
}
function resumeGame() {
  if (status !== 'paused') return;
  status='running';showPanel(null);lastFrame=performance.now();
  $('pause').setAttribute('aria-label','Pausar partida');
  canvas.focus({preventScroll:true});
}

function onEat() {
  $('score').textContent=scoreText(state.score);
  $('level').textContent='Nível '+String(gameLevel(state.apples)).padStart(2,'0');
  beep('eat');
  if (!reducedMotion) {
    const head=state.snake[0];
    const pop=$('apple-pop');
    pop.style.left=((head.x+.5)/SIZE*100)+'%';pop.style.top=((head.y+.5)/SIZE*100)+'%';
    pop.classList.remove('pop');void pop.offsetWidth;pop.classList.add('pop');
    eatFlash=performance.now();
  }
  if (navigator.vibrate) navigator.vibrate(12);
}

function endGame() {
  if (status === 'ended') return;
  status='ended';$('pause').disabled=true;
  queue=[];beep('die');
  $('board-wrap').classList.remove('playing');$('board-wrap').classList.add('dead');
  $('end-score').textContent=state.score;
  $('end-apples').textContent=state.apples+' '+(state.apples===1?'maçã':'maçãs');
  $('end-time').textContent=formatTime(activeMs);
  const record=state.score>(bests[keyName(username)] || 0);
  $('result-tag').textContent=state.ticks===MAX_TICKS?'PARTIDA LENDÁRIA':state.won?'VOCÊ ZEROU O TABULEIRO':record?'NOVO RECORDE PESSOAL':'FIM DE JOGO';
  $('result-tag').classList.toggle('record',record || state.won);
  $('end-title').textContent=state.ticks===MAX_TICKS?'Mandou bem demais.':state.won?'Pode se aposentar.':record?'Esse foi bonito.':state.score===0?'Acontece com os melhores.':state.score>=100?'Já dá pra provocar.':'Foi por pouco.';
  showPanel('end-panel');
  $('live-announcement').textContent=`Fim de jogo. ${state.score} pontos. ${record?'Novo recorde pessoal.':''}`;
  pendingSave={runId,moves,ticks:state.ticks,username,score:state.score};
  storage.set('pending',pendingSave);
  saveScore();
}

async function saveScore() {
  if (!pendingSave || saving) return;
  saving=true;
  const pending=pendingSave;
  $('save-status').textContent='Salvando sua partida…';$('save-status').className='save-status';
  $('retry-save').hidden=true;$('again').disabled=true;$('change-name').disabled=true;
  try {
    const result=await api('/api/game?op=finish',pending);
    const nameKey=keyName(pending.username);
    bests[nameKey]=Math.max(bests[nameKey] || 0,result.score,result.me?.score || 0);
    storage.set('bests',bests);
    pendingSave=null;storage.set('pending',null);
    const me=result.me;
    $('save-status').textContent=result.score===0?'Próxima maçã, próxima chance.':me?`Salvo no ranking. Você é #${me.position} no geral.`:'Pontuação salva no ranking.';
    $('save-status').classList.add('success');
    updatePlayer();
    if(scope==='all'){rankingRequest++;boardData=result;renderRanking();$('refresh-ranking').disabled=false;}else await loadRanking();
    $('again').focus({preventScroll:true});
  } catch(error) {
    $('save-status').textContent=error.message;
    $('save-status').classList.add('error');$('retry-save').hidden=false;
  } finally {
    saving=false;$('again').disabled=!!pendingSave;$('change-name').disabled=!!pendingSave;
  }
}

function avatarStyle(name) {
  let hash=0;for(const char of name) hash=(hash*31+char.codePointAt(0))>>>0;
  const palettes=[['#e9e0f8','#7558a6'],['#e6efdb','#667f49'],['#f6e4da','#a37054'],['#dfeaf2','#597e97'],['#f2e4ef','#975d8a']];
  return palettes[hash%palettes.length];
}

function renderRanking() {
  const list=$('ranking-list');list.replaceChildren();
  const entries=boardData?.entries || [];
  $('ranking-status').hidden=entries.length>0;
  if(!entries.length){
    $('ranking-status').replaceChildren();
    const icon=document.createElement('span');icon.className='empty-ranking-icon';icon.textContent='↗';
    const title=document.createElement('strong');title.textContent='O primeiro lugar tá livre.';
    const subtitle=document.createElement('span');subtitle.textContent=scope==='week'?'Seja o primeiro a pontuar nesta semana.':'Coma sua primeira maçã e abra a disputa.';
    $('ranking-status').append(icon,title,subtitle);
  }
  for(const entry of entries){
    const li=document.createElement('li');
    const isMe=keyName(entry.username)===keyName(username);li.classList.toggle('is-me',isMe);
    const place=document.createElement('span');place.className='rank-number'+(entry.position===1?' first':'');place.textContent=entry.position===1?'♛':String(entry.position).padStart(2,'0');place.setAttribute('aria-label','Posição '+entry.position);
    const avatar=document.createElement('span');avatar.className='rank-avatar';avatar.textContent=entry.username.slice(0,2).toUpperCase();
    const [background,color]=avatarStyle(entry.username);avatar.style.background=background;avatar.style.color=color;
    const name=document.createElement('span');name.className='rank-name';name.textContent=entry.username;
    if(isMe){const you=document.createElement('span');you.className='you-tag';you.textContent='VOCÊ';name.append(you);}
    const score=document.createElement('span');score.className='rank-score';score.textContent=entry.score.toLocaleString('pt-BR');const pts=document.createElement('small');pts.textContent='pts';score.append(pts);
    li.append(place,avatar,name,score);list.append(li);
  }
  $('my-position').hidden=!boardData?.me;
  if(boardData?.me){
    $('my-position').replaceChildren();
    const name=document.createElement('span');name.textContent=`Você está em #${boardData.me.position}`;
    const score=document.createElement('strong');score.textContent=boardData.me.score+' pts';
    $('my-position').append(name,score);
  }
}

async function loadRanking() {
  const request=++rankingRequest;
  $('refresh-ranking').disabled=true;
  try{
    const result=await api(`/api/ranking?scope=${scope}&username=${encodeURIComponent(username)}`);
    if(request!==rankingRequest)return;
    boardData=result;renderRanking();
    $('connection-dot').classList.add('online');$('connection-dot').title='Ranking conectado';
    $('ranking-footnote').textContent=scope==='week'?'Semana começa na segunda · horário de Brasília':'Melhor partida de cada apelido';
    if(result.me && scope==='all'){
      bests[keyName(username)]=Math.max(bests[keyName(username)] || 0,result.me.score);
      storage.set('bests',bests);updatePlayer();
    }
  }catch(error){
    if(request!==rankingRequest)return;
    $('connection-dot').classList.remove('online');$('connection-dot').title='Ranking desconectado';
    $('ranking-footnote').textContent='Sem conexão · toque em ↻ para tentar';
    if(!boardData){$('ranking-status').hidden=false;$('ranking-status').textContent='O ranking não conectou. Toque em ↻ para tentar de novo.';}
  }finally{if(request===rankingRequest)$('refresh-ranking').disabled=false;}
}

function setScope(next) {
  if(next===scope)return;
  scope=next;boardData=null;$('ranking-list').replaceChildren();$('my-position').hidden=true;
  $('ranking-status').hidden=false;$('ranking-status').textContent='Buscando os recordes…';
  for(const [id,value] of [['tab-all','all'],['tab-week','week']]){$(id).classList.toggle('selected',scope===value);$(id).setAttribute('aria-pressed',String(scope===value));}
  loadRanking();
}

function resize() {
  const rect=canvas.getBoundingClientRect();
  size=rect.width;
  const dpr=Math.min(window.devicePixelRatio || 1,2);
  canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
new ResizeObserver(resize).observe(canvas);

function apple(x,y,cell) {
  const cx=(x+.5)*cell,cy=(y+.5)*cell;
  ctx.save();ctx.translate(cx,cy);
  ctx.shadowBlur=cell*.6;ctx.shadowColor='#ed867530';
  ctx.fillStyle='#f18978';ctx.beginPath();
  ctx.moveTo(0,-cell*.2);
  ctx.bezierCurveTo(cell*.35,-cell*.44,cell*.47,-cell*.01,cell*.3,cell*.25);
  ctx.bezierCurveTo(cell*.1,cell*.48,cell*.12,cell*.31,0,cell*.32);
  ctx.bezierCurveTo(-cell*.14,cell*.31,-cell*.1,cell*.48,-cell*.3,cell*.25);
  ctx.bezierCurveTo(-cell*.47,-cell*.01,-cell*.35,-cell*.44,0,-cell*.2);ctx.fill();
  ctx.shadowBlur=0;ctx.strokeStyle='#bdb294';ctx.lineWidth=cell*.07;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(0,-cell*.2);ctx.lineTo(cell*.02,-cell*.4);ctx.stroke();
  ctx.fillStyle='#b5cc75';ctx.beginPath();ctx.ellipse(cell*.15,-cell*.35,cell*.13,cell*.06,-.5,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#ffd2c6';ctx.lineWidth=cell*.045;ctx.beginPath();ctx.moveTo(-cell*.2,-cell*.08);ctx.quadraticCurveTo(-cell*.25,0,-cell*.2,cell*.12);ctx.stroke();ctx.restore();
}

function draw(now) {
  if(!size)return;
  const width=canvas.getBoundingClientRect().width,height=canvas.getBoundingClientRect().height;
  const cell=width/SIZE,cellY=height/SIZE;
  ctx.fillStyle='#191c21';ctx.fillRect(0,0,width,height);
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
    if((x+y)%2===0){ctx.fillStyle='#1e2126';ctx.fillRect(x*cell,y*cellY,cell,cellY);}
  }
  ctx.fillStyle='#394047';
  for(let y=1;y<SIZE;y++)for(let x=1;x<SIZE;x++){ctx.beginPath();ctx.arc(x*cell,y*cellY,.6,0,Math.PI*2);ctx.fill();}
  if(state.apple) apple(state.apple.x,state.apple.y,cell);
  // Movement stays interpolated even when the OS requests reduced motion.
  // That preference still disables flashes/pops, but snapping the snake from
  // cell to cell makes the core game look and feel like a low-FPS animation.
  const smooth=status==='running';
  const progress=smooth?Math.min(Math.max(accumulator/Math.max(lastStepDuration,1),0),1):1;
  const positions=state.snake.map((point,i)=>{
    const from=previous[i] || previous[previous.length-1] || point;
    let dx=point.x-from.x,dy=point.y-from.y;
    if(Math.abs(dx)>SIZE/2)dx-=Math.sign(dx)*SIZE;
    if(Math.abs(dy)>SIZE/2)dy-=Math.sign(dy)*SIZE;
    return {x:(from.x+dx*progress+.5)*cell,y:(from.y+dy*progress+.5)*cellY};
  });
  ctx.lineCap='round';ctx.lineJoin='round';
  // Wrapped body parts are disconnected at the edge, never drawn across the board.
  for(let i=positions.length-1;i>=0;i--){
    const p=positions[i];const ratio=1-i/Math.max(positions.length,1);
    ctx.strokeStyle=ctx.fillStyle=i===0?'#d0ff8b':`hsl(84 ${42+ratio*18}% ${49+ratio*20}%)`;
    const radius=cell*(i===positions.length-1?.28:.36);
    if(i<positions.length-1){const next=positions[i+1];if(Math.abs(p.x-next.x)<cell*1.6&&Math.abs(p.y-next.y)<cellY*1.6){ctx.lineWidth=radius*2;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(next.x,next.y);ctx.stroke();}}
    for(const offset of [-width,0,width]){
      if(p.x+offset<-cell||p.x+offset>width+cell)continue;
      for(const offsetY of [-height,0,height]){
        if(p.y+offsetY<-cell||p.y+offsetY>height+cell)continue;
        ctx.beginPath();ctx.arc(p.x+offset,p.y+offsetY,radius,0,Math.PI*2);ctx.fill();
      }
    }
  }
  const head=positions[0];if(head){
    const angle=state.direction*Math.PI/2;
    for(const ox of [-width,0,width])for(const oy of [-height,0,height]){
      if(head.x+ox<-cell||head.x+ox>width+cell||head.y+oy<-cell||head.y+oy>height+cell)continue;
      ctx.save();ctx.translate(head.x+ox,head.y+oy);ctx.rotate(angle);
      for(const eye of [-1,1]){ctx.fillStyle='#fffce9';ctx.beginPath();ctx.arc(cell*.1,eye*cell*.15,cell*.08,0,Math.PI*2);ctx.fill();ctx.fillStyle='#2b3821';ctx.beginPath();ctx.arc(cell*.13,eye*cell*.15,cell*.04,0,Math.PI*2);ctx.fill();}
      ctx.restore();
    }
  }
  if(now-eatFlash<260&&eatFlash){ctx.fillStyle=`rgba(195,244,120,${.05*(1-(now-eatFlash)/260)})`;ctx.fillRect(0,0,width,height);}
}

function frame(now) {
  const delta=lastFrame?now-lastFrame:0;lastFrame=now;
  if(status==='running'){
    if(delta>900){pauseGame();}else{
      accumulator+=delta;
      let count=0;
      while(status==='running' && accumulator>=tickDuration(state.apples) && count<8){
        lastStepDuration=tickDuration(state.apples);accumulator-=lastStepDuration;activeMs+=lastStepDuration;
        previous=state.snake.map(p=>({...p}));
        const dir=queue.length?queue.shift():state.direction;
        if(dir!==state.direction&&!opposite(state.direction,dir))moves.push([state.ticks,dir]);
        const result=step(state,dir);count++;
        if(result.ate)onEat();
        if(result.died)endGame();
        if(state.ticks>=MAX_TICKS && state.alive)endGame();
      }
    }
  }
  draw(now);requestAnimationFrame(frame);
}

$('player-form').addEventListener('submit',event=>{event.preventDefault();startGame();});
$('username').value=username;
$('username').addEventListener('input',()=>{$('name-error').textContent='';});
$('random-name').addEventListener('click',()=>{
  const words=['cobra','maca','nokia','ligeiro','veneno','pixel','rei'];
  $('username').value=words[Math.floor(Math.random()*words.length)]+'_'+Math.floor(10+Math.random()*90);
  $('name-error').textContent='';$('username').focus();
});
$('again').addEventListener('click',startGame);
$('retry-save').addEventListener('click',saveScore);
$('change-name').addEventListener('click',()=>{
  if(pendingSave){toast('Salve sua partida antes de trocar o apelido.');return;}
  status='idle';showPanel('welcome-panel');$('username').focus();
});
$('pause').addEventListener('click',()=>status==='paused'?resumeGame():pauseGame());
$('resume').addEventListener('click',resumeGame);
$('sound').addEventListener('click',()=>{soundOn=!soundOn;storage.set('sound',soundOn);updateSound();if(soundOn)beep('start');});
$('tab-all').addEventListener('click',()=>setScope('all'));
$('tab-week').addEventListener('click',()=>setScope('week'));
$('refresh-ranking').addEventListener('click',loadRanking);
$('share').addEventListener('click',async()=>{
  if(status==='running')pauseGame();
  const url=location.origin;
  try{
    if(navigator.share){await navigator.share({title:'Snake Club',text:'Bora disputar na cobrinha? Quero ver bater meu recorde kkkkk',url});}
    else {await navigator.clipboard.writeText(url);toast('Link copiado. Manda pra galera!');}
  }catch(error){if(error.name!=='AbortError')toast('Copie o endereço do site e mande pra galera.');}
});
for(const button of document.querySelectorAll('[data-direction]')){
  button.addEventListener('pointerdown',event=>{event.preventDefault();direction(Number(button.dataset.direction));});
  button.addEventListener('click',event=>{if(event.detail===0)direction(Number(button.dataset.direction));});
}
const keys={ArrowRight:0,ArrowDown:1,ArrowLeft:2,ArrowUp:3,d:0,s:1,a:2,w:3,D:0,S:1,A:2,W:3};
document.addEventListener('keydown',event=>{
  if(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.ctrlKey || event.metaKey || event.altKey)return;
  if(event.key in keys && ['running','countdown','paused'].includes(status)){event.preventDefault();direction(keys[event.key]);}
  if((event.code==='Space' || event.key==='Escape') && ['running','paused'].includes(status)){
    // Space on a focused button retains its normal click behavior.
    if(event.code==='Space' && event.target instanceof HTMLButtonElement)return;
    event.preventDefault();if(!event.repeat){status==='paused'?resumeGame():pauseGame();}
  }
});
let touchStart=null;
const swipeSurfaces=[$('board-wrap'),$('swipe-pad')];
function swipeMove(event) {
  if(!touchStart || event.pointerId!==touchStart.id)return;
  if(status!=='running' && status!=='countdown'){touchStart=null;return;}
  if(event.cancelable)event.preventDefault();
  const dx=event.clientX-touchStart.x,dy=event.clientY-touchStart.y;
  const ax=Math.abs(dx),ay=Math.abs(dy);
  if(Math.max(ax,ay)<touchStart.threshold)return;
  // Require a clear axis: diagonal jitter must not queue two accidental turns.
  if(Math.max(ax,ay)<Math.min(ax,ay)*1.35)return;
  const dir=ax>ay?(dx>0?0:2):(dy>0?1:3);
  if(dir!==touchStart.lastDirection){direction(dir);touchStart.lastDirection=dir;}
  touchStart.x=event.clientX;touchStart.y=event.clientY;
}
for(const surface of swipeSurfaces){
  surface.addEventListener('pointerdown',event=>{
    if((status!=='running' && status!=='countdown') || event.pointerType==='mouse' || touchStart)return;
    if(event.target.closest('button,input,a'))return;
    if(event.cancelable)event.preventDefault();
    touchStart={x:event.clientX,y:event.clientY,id:event.pointerId,lastDirection:null,threshold:Math.max(18,Math.min(28,size*.055))};
    surface.setPointerCapture(event.pointerId);
    surface.classList.add('swiping');
  });
  surface.addEventListener('pointermove',swipeMove);
  const release=event=>{
    if(!touchStart || event.pointerId!==touchStart.id)return;
    if(event.type==='pointerup')swipeMove(event);
    touchStart=null;surface.classList.remove('swiping');
  };
  surface.addEventListener('pointerup',release);
  surface.addEventListener('pointercancel',release);
  surface.addEventListener('lostpointercapture',release);
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseGame();else loadRanking();});
window.addEventListener('blur',pauseGame);
window.addEventListener('online',()=>{loadRanking();if(pendingSave)saveScore();});
setInterval(()=>{if(!document.hidden && status!=='running')loadRanking();},30000);
updatePlayer();updateSound();loadRanking();requestAnimationFrame(frame);
if(pendingSave){
  username=pendingSave.username;status='ended';showPanel('end-panel');updatePlayer();
  $('end-score').textContent=pendingSave.score || 0;
  $('end-title').textContent='Falta guardar essa.';
  $('end-apples').textContent='Partida recuperada';$('end-time').textContent='';
  saveScore();
}
