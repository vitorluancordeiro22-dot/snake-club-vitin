import { access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
for (const file of ['public/index.html', 'public/styles.css', 'public/app.js', 'public/engine.js', 'api/game.js', 'api/ranking.js']) await access(file);
for (const file of ['public/app.js', 'public/engine.js', 'api/game.js', 'api/ranking.js', 'server/store.js', 'server/http.js']) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
console.log('Snake Club pronto para publicar.');
