# PIU Stats

App do clube de Pump It Up da Liberdade (São Paulo): recordes de cada jogador, tier lists e, em breve, fila das máquinas.

Tracker pessoal de **Pump It Up Phoenix 2** (com os recordes da **Phoenix**), no estilo do ArcadeStat.
Site com cara de app (PWA), pronto para virar app com WebView/Capacitor.

- **Frontend:** React + Vite, publicado como static site no Render.
- **Banco:** Supabase (Postgres + RPCs). Migrations em `supabase/migrations`.
- **Coleta:** favorito (bookmarklet) que roda dentro do piugame.com e envia os dados ao Supabase (`web/public/collector.js`).

Especificação completa: [docs/SPEC.md](docs/SPEC.md).

## Rodar localmente

```sh
npm install
npm run dev
```

Variáveis opcionais (`.env`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY` (chave publicável).

## Sincronizar

1. Abra o app → **Ajustes**, cole a chave de sincronização e arraste o favorito **PIU Stats Sync**.
2. Logado em `piugame.com` (Phoenix 2) ou `phoenix.piugame.com` (Phoenix), clique no favorito.
3. Para capas, use o favorito **PIU Stats Capas** no piugame.com. Para atualizar o catálogo, clique no **PIU Stats Sync** em `piuscores.arroweclip.se`.

## Créditos

Catálogo de charts e dificuldades: [PIU Scores](https://piuscores.arroweclip.se).
Imagens do jogo © Andamiro, carregadas direto do piugame.com. Projeto pessoal, sem vínculo com a Andamiro.
