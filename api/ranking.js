import { configured, ranking } from '../server/store.js';
import { normalizeUsername, requestUrl, json, failure } from '../server/http.js';
export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return json(res, 405, { error: 'Método inválido.' }); }
  try {
    if (!configured()) return json(res, 503, { error: 'O ranking está temporariamente indisponível.' });
    const url = requestUrl(req);
    const scope = url.searchParams.get('scope') === 'week' ? 'week' : 'all';
    const input = url.searchParams.get('username');
    const nameKey = input ? normalizeUsername(input).nameKey : '';
    return json(res, 200, { available: true, ...await ranking(scope, nameKey) });
  } catch (error) { failure(res, error); }
}
