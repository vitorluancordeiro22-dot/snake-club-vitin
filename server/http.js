export function normalizeUsername(input) {
  if (typeof input !== 'string') throw Object.assign(new Error('Digite seu apelido.'), { status: 400 });
  const username = input.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!/^[\p{L}\p{N}_ -]{2,18}$/u.test(username)) throw Object.assign(new Error('Use 2 a 18 letras, números, espaços, _ ou -.'), { status: 400 });
  return { username, nameKey: username.toLocaleLowerCase('pt-BR') };
}
export function requestUrl(req) { return new URL(req.url, `https://${req.headers.host || 'localhost'}`); }
export function safePost(req) {
  if (req.headers.origin) {
    const origin = new URL(req.headers.origin);
    if (origin.host !== req.headers.host) throw Object.assign(new Error('Origem inválida.'), { status: 403 });
  }
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw Object.assign(new Error('Envie JSON.'), { status: 415 });
}
export async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    if (req.body.length > 220000) throw Object.assign(new Error('Partida muito grande.'), { status: 413 });
    return JSON.parse(req.body);
  }
  let content = '';
  for await (const chunk of req) {
    content += chunk;
    if (content.length > 220000) throw Object.assign(new Error('Partida muito grande.'), { status: 413 });
  }
  try { return JSON.parse(content); } catch { throw Object.assign(new Error('Dados inválidos.'), { status: 400 }); }
}
export function json(res, status, value) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(value));
}
export function failure(res, error) {
  const status = error.status || 500;
  if (status >= 500) console.error('Snake API:', error.message);
  json(res, status, { error: status >= 500 ? 'O ranking está temporariamente indisponível. Tente de novo.' : error.message });
}
