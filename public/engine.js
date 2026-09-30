// The same deterministic rules run in the browser and on the server.
export const SIZE = 22;
export const POINTS_PER_APPLE = 10;
export const MAX_TICKS = 100000;
export const DIRECTIONS = [
  { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 },
];

function random(state) {
  let x = state.randomState >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.randomState = x >>> 0;
  return (x >>> 0) / 4294967296;
}
export function spawnApple(state) {
  const occupied = new Set(state.snake.map(p => p.y * SIZE + p.x));
  const empty = [];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (!occupied.has(y * SIZE + x)) empty.push({ x, y });
  }
  state.apple = empty.length ? empty[Math.floor(random(state) * empty.length)] : null;
}
export function createGame(seed = 1) {
  const state = {
    snake: [{ x: 8, y: 11 }, { x: 7, y: 11 }, { x: 6, y: 11 }, { x: 5, y: 11 }],
    direction: 0, apple: null, score: 0, apples: 0, ticks: 0,
    alive: true, won: false, randomState: (seed >>> 0) || 1,
  };
  spawnApple(state);
  return state;
}
export function tickDuration(apples) { return Math.max(72, 175 - Math.floor(apples / 4) * 9); }
export function gameLevel(apples) { return 1 + Math.floor(apples / 4); }
export function opposite(a, b) { return (a + 2) % 4 === b; }
export function step(state, direction = state.direction) {
  if (!state.alive) return { ate: false, died: true };
  if (!Number.isInteger(direction) || direction < 0 || direction > 3 || opposite(state.direction, direction)) direction = state.direction;
  state.direction = direction;
  const d = DIRECTIONS[direction];
  const head = { x: (state.snake[0].x + d.x + SIZE) % SIZE, y: (state.snake[0].y + d.y + SIZE) % SIZE };
  const ate = !!state.apple && head.x === state.apple.x && head.y === state.apple.y;
  const body = ate ? state.snake : state.snake.slice(0, -1);
  state.ticks++;
  if (body.some(p => p.x === head.x && p.y === head.y)) {
    state.alive = false;
    return { ate: false, died: true };
  }
  state.snake.unshift(head);
  if (ate) {
    state.apples++;
    state.score += POINTS_PER_APPLE;
    spawnApple(state);
    if (!state.apple) { state.won = true; state.alive = false; }
  } else state.snake.pop();
  return { ate, died: !state.alive };
}
export function validateReplay(seed, moves, finalTick) {
  if (!Number.isInteger(finalTick) || finalTick < 1 || finalTick > MAX_TICKS || !Array.isArray(moves) || moves.length > finalTick) throw new Error('Partida inválida.');
  let last = -1;
  for (const move of moves) {
    if (!Array.isArray(move) || move.length !== 2 || !Number.isInteger(move[0]) || move[0] <= last || move[0] < 0 || move[0] >= finalTick || !Number.isInteger(move[1]) || move[1] < 0 || move[1] > 3) throw new Error('Movimentos inválidos.');
    last = move[0];
  }
  const state = createGame(seed);
  let index = 0;
  let elapsed = 0;
  for (let tick = 0; tick < finalTick; tick++) {
    if (!state.alive) throw new Error('A partida já terminou.');
    elapsed += tickDuration(state.apples);
    let direction = state.direction;
    if (moves[index]?.[0] === tick) {
      direction = moves[index++][1];
      if (opposite(state.direction, direction) || direction === state.direction) throw new Error('Mudança de direção inválida.');
    }
    step(state, direction);
  }
  if (state.alive && finalTick !== MAX_TICKS) throw new Error('A partida ainda não terminou.');
  return { score: state.score, apples: state.apples, ticks: state.ticks, elapsed, won: state.won };
}
