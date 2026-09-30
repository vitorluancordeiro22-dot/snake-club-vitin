import { neon } from '@neondatabase/serverless';
import { createHash } from 'node:crypto';
let sql;
let local;
let initialized;
export const configured = () => !!process.env.DATABASE_URL || process.env.SNAKE_LOCAL_DEV === '1';
async function db() {
  if (process.env.DATABASE_URL) {
    sql ||= neon(process.env.DATABASE_URL);
    return sql;
  }
  if (process.env.SNAKE_LOCAL_DEV === '1') {
    if (!local) {
      const { DatabaseSync } = await import('node:sqlite');
      const { mkdirSync } = await import('node:fs');
      mkdirSync('.data', { recursive: true });
      local = new DatabaseSync(process.env.SNAKE_TEST_DB || '.data/snake.db');
      local.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    }
    return local;
  }
  const error = new Error('O ranking está temporariamente indisponível.');
  error.status = 503;
  throw error;
}
export async function ensureSchema() {
  if (!initialized) initialized = (async () => {
    const connection = await db();
    const schema = `CREATE TABLE IF NOT EXISTS snake_club_runs (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      name_key TEXT NOT NULL,
      seed BIGINT NOT NULL,
      started_at BIGINT NOT NULL,
      finished_at BIGINT,
      score INTEGER,
      apples INTEGER,
      elapsed_ms INTEGER,
      ip_hash TEXT NOT NULL
    )`;
    if (local) {
      local.exec(schema);
      local.exec('CREATE INDEX IF NOT EXISTS snake_club_ranking_idx ON snake_club_runs(score DESC, finished_at);');
      local.exec('CREATE INDEX IF NOT EXISTS snake_club_rate_idx ON snake_club_runs(ip_hash, started_at);');
    } else {
      await connection.query(schema);
      await connection.query('CREATE INDEX IF NOT EXISTS snake_club_ranking_idx ON snake_club_runs(score DESC, finished_at)');
      await connection.query('CREATE INDEX IF NOT EXISTS snake_club_rate_idx ON snake_club_runs(ip_hash, started_at)');
    }
  })().catch(error => { initialized = null; throw error; });
  await initialized;
}
async function query(text, values = []) {
  await ensureSchema();
  const connection = await db();
  if (local) {
    const statement = local.prepare(text.replace(/\$\d+/g, '?'));
    return statement.all(...values);
  }
  return connection.query(text, values);
}
export function hashIp(ip) { return createHash('sha256').update(`snake-club:${ip}`).digest('hex').slice(0, 32); }
export async function createRun(run) {
  const rows = await query(`INSERT INTO snake_club_runs(id, username, name_key, seed, started_at, ip_hash)
    SELECT $1, $2, $3, $4, $5, $6
    WHERE (SELECT COUNT(*) FROM snake_club_runs WHERE ip_hash=$7 AND started_at>$8) < 30
    RETURNING id`, [run.id, run.username, run.nameKey, run.seed, run.startedAt, run.ipHash, run.ipHash, Date.now() - 60000]);
  if (!rows.length) { const error = new Error('Muitas partidas seguidas. Aguarde um minutinho.'); error.status = 429; throw error; }
}
export async function getRun(id) {
  return (await query('SELECT * FROM snake_club_runs WHERE id=$1', [id]))[0];
}
export async function finishRun(id, result) {
  return (await query(`UPDATE snake_club_runs SET score=$1, apples=$2, elapsed_ms=$3, finished_at=$4
    WHERE id=$5 AND finished_at IS NULL RETURNING *`, [result.score, result.apples, result.elapsed, Date.now(), id]))[0];
}
export async function ranking(scope = 'all', nameKey = '') {
  const now = new Date();
  const brazil = new Date(now.getTime() - 3 * 3600000);
  const monday = Date.UTC(brazil.getUTCFullYear(), brazil.getUTCMonth(), brazil.getUTCDate() - (brazil.getUTCDay() + 6) % 7, 3);
  const since = scope === 'week' ? monday : 0;
  const rows = await query(`WITH best AS (
      SELECT username, name_key, score, apples, elapsed_ms, finished_at,
      ROW_NUMBER() OVER (PARTITION BY name_key ORDER BY score DESC, finished_at ASC) AS best_number
      FROM snake_club_runs WHERE finished_at IS NOT NULL AND score>0 AND finished_at>=$1
    ), placed AS (
      SELECT username, name_key, score, apples, elapsed_ms,
      ROW_NUMBER() OVER (ORDER BY score DESC, finished_at ASC, name_key ASC) AS position
      FROM best WHERE best_number=1
    ) SELECT * FROM placed WHERE position<=50 OR name_key=$2 ORDER BY position`, [since, nameKey]);
  return {
    entries: rows.filter(row => Number(row.position) <= 50).map(publicRow),
    me: rows.find(row => row.name_key === nameKey) ? publicRow(rows.find(row => row.name_key === nameKey)) : null,
  };
}
function publicRow(row) {
  return { username: row.username, score: Number(row.score), apples: Number(row.apples), position: Number(row.position) };
}
