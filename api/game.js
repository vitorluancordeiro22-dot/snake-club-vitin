import { randomBytes } from 'node:crypto';
import { createRun, getRun, finishRun, ranking, hashIp } from '../server/store.js';
import { validateReplay } from '../public/engine.js';
import { normalizeUsername, requestUrl, safePost, body, json, failure } from '../server/http.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return json(res, 405, { error: 'Método inválido.' }); }
  try {
    safePost(req);
    const data = await body(req);
    const op = requestUrl(req).searchParams.get('op');
    if (op === 'start') {
      const name = normalizeUsername(data.username);
      const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
      const run = { id: randomBytes(32).toString('hex'), ...name, seed: randomBytes(4).readUInt32LE() || 1, startedAt: Date.now(), ipHash: hashIp(ip) };
      await createRun(run);
      return json(res, 200, { runId: run.id, seed: run.seed, username: name.username });
    }
    if (op === 'finish') {
      if (typeof data.runId !== 'string' || !/^[a-f0-9]{64}$/.test(data.runId)) throw Object.assign(new Error('Partida inválida.'), { status: 400 });
      const run = await getRun(data.runId);
      if (!run) throw Object.assign(new Error('Partida não encontrada.'), { status: 404 });
      if (!run.finished_at) {
        if (Date.now() - Number(run.started_at) > 12 * 3600000) throw Object.assign(new Error('A partida expirou.'), { status: 400 });
        let result;
        try { result = validateReplay(Number(run.seed), data.moves, data.ticks); }
        catch (error) { error.status = 400; throw error; }
        if (result.elapsed > Date.now() - Number(run.started_at) + 2500) throw Object.assign(new Error('Tempo de partida inválido.'), { status: 400 });
        await finishRun(run.id, result);
      }
      const saved = await getRun(run.id);
      const board = await ranking('all', run.name_key);
      return json(res, 200, { score: Number(saved.score), ...board });
    }
    return json(res, 400, { error: 'Ação inválida.' });
  } catch (error) { failure(res, error); }
}
