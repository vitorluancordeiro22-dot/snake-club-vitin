# Snake Club

Jogo da cobrinha para disputar recordes entre amigos. O jogador escolhe seu apelido e joga; o melhor resultado de cada apelido aparece no ranking geral e no semanal.

## Regras

- Tabuleiro de 22 × 22 casas.
- A cobra atravessa as bordas e aparece no lado oposto.
- Cada maçã vale 10 pontos e aumenta a cobra em uma casa.
- Bater no próprio corpo encerra a partida.
- A velocidade aumenta a cada quatro maçãs.
- Setas/WASD no computador; botões ou gestos no celular.
- Espaço/Esc pausa. Ao sair da aba, o jogo pausa automaticamente.
- Preencher todo o tabuleiro vence o jogo. Partidas excepcionalmente longas são concluídas aos 100.000 movimentos.

## Rodar no computador

Requer Node.js 24.

```bash
npm install
npm run dev
```

Abra http://localhost:3000. No desenvolvimento, o ranking usa SQLite persistente em .data/snake.db, compartilhado pelos navegadores conectados ao mesmo servidor.

```bash
npm test
npm run build
```

## Importar na Vercel

1. Em New Project, importe este repositório.
2. Use o nome **snake-club-vitin**.
3. Root Directory: raiz do repositório.
4. Framework Preset: Other.
5. Build Command: npm run build.
6. Output Directory: public.
7. Install Command: npm install.
8. Node.js: 24.x.

A configuração do repositório também já define o build e as Vercel Functions.

## Conectar o ranking online

O ranking de produção precisa de um banco Neon Postgres conectado ao projeto pela área Storage/Marketplace da Vercel. Escolha o plano gratuito e vincule o banco ao projeto snake-club-vitin.

A variável **DATABASE_URL** deve existir no ambiente Production. Depois de conectar o banco, faça um **Redeploy**. As tabelas snake_club_runs e os índices são criados de forma idempotente no primeiro acesso à API.

Não configure SNAKE_LOCAL_DEV na Vercel. O SQLite é usado apenas no desenvolvimento local; o ranking de produção exige um banco persistente.

Alternativa pela CLI:

```bash
npx vercel login
npx vercel link --yes --project snake-club-vitin
npx vercel install neon --name snake-club-ranking --plan free -e production -e preview
npx vercel env pull .env.local --yes
npm run db:setup
npx vercel deploy --prod
```

## Pontuações

O servidor cria uma partida com um identificador aleatório e uma semente para sortear maçãs. Ao finalizar, ele reproduz os movimentos, confere o tempo e calcula os pontos. O número informado pelo navegador não é utilizado. Reenvios da mesma partida são idempotentes.

Apelidos têm 2–18 letras, números, espaços, _ ou -. Maiúsculas e minúsculas representam o mesmo apelido. Em empate, vence quem alcançou o recorde primeiro. A semana começa segunda-feira às 00:00, no horário de Brasília.

É uma disputa casual sem senha nem confirmação da identidade do apelido. Apelido, som e recordes pessoais ficam salvos no aparelho. Um envio interrompido pode ser tentado de novo ao reconectar ou reabrir o jogo.

## Código

- public/: interface, controles, sons e motor do jogo.
- api/: iniciar/finalizar partidas e consultar o ranking.
- server/: armazenamento e servidor local.
- tests/: regras e integração das APIs.

A versão inicial foi verificada localmente com nove testes e uma partida concluída no navegador, persistida e consultada em outro navegador. O funcionamento do deploy e da conexão com Neon precisa ser verificado depois da publicação.
