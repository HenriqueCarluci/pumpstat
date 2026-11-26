# PumpStat — especificação do MVP

Tracker pessoal de Pump It Up no estilo do ArcadeStat (PumpStat), para **Phoenix 2** com os recordes da **Phoenix**.
É um site com cara de app (PWA), pensado para ser embrulhado num WebView (Capacitor) depois.

## 1. Referência: o que o ArcadeStat faz

| Recurso do ArcadeStat | No MVP |
|---|---|
| Sync dos dados de jogo com um toque | ✅ favorito (bookmarklet) que roda dentro do piugame.com |
| Lista de músicas com busca e filtros | ✅ busca, Single/Double/Co-op, faixa de nível, jogados/não jogados/sem PG, ordenação |
| Detalhe da música com dados do chart e vídeo | ✅ score, grade, plate, dificuldade da comunidade, step artist, notas, skills, link de vídeo, histórico |
| Tier list por nível com clears visualizados | ✅ por modo e nível, agrupado pela dificuldade do PIU Scores, com grade e plate em cada capa |
| Jogadas recentes com alteração de score | ✅ cartões no estilo do site, com julgamentos |
| PUMBILITY e gráficos de desempenho | ✅ valor oficial + estimativa, top 50, distribuição de grades, progresso por nível |
| Comparação Phoenix 2 × Phoenix | ✅ cada chart mostra o recorde da outra versão (mesmo stepchart via id do PIU Scores) |
| Amigos, rankings, votação de tier | ❌ fora do MVP (uso pessoal) |

## 2. Arquitetura

```
piugame.com / phoenix.piugame.com (logado)
   └─ favorito "PumpStat Sync" → carrega /collector.js do PumpStat
        ├─ lê /my_page/pumbility.php        (perfil, PUMBILITY oficial)
        ├─ lê /my_page/my_best_score.php     (todas as páginas, 250 ms entre elas)
        ├─ lê /my_page/recently_played.php   (últimas 50, com julgamentos)
        └─ POST Supabase rpc/ingest(chave, payload)
Supabase (Postgres)
   ├─ tabelas: songs, charts, best_scores, best_score_history, plays, player_snapshots, sync_runs
   ├─ RLS: catálogo (songs, charts) público; scores, jogadas e perfil só para o dono logado
   ├─ escrita só pelas funções SECURITY DEFINER que exigem a chave de sincronização
   └─ RPCs: ingest, import_catalog, set_jackets, fill_jackets, app_data, chart_history, claim_owner, my_ingest_key
Render (static site) → React + Vite, HashRouter, PWA
   ├─ login com e-mail e senha (Supabase Auth); o primeiro usuário vira o dono (claim_owner)
   ├─ a chave de sincronização vem da conta (my_ingest_key) e já sai embutida no favorito
   └─ chama rpc/app_data uma vez por versão e filtra tudo no aparelho (cache local)
```

Por que assim: o navegador não consegue ler o piugame.com a partir de outro domínio (CORS), e o Supabase
não é acessível como proxy sem expor credenciais. Rodando o coletor **dentro** do site oficial, a sessão é a do
próprio usuário, a senha nunca sai do navegador e as requisições saem do IP dele.

## 3. Coleta (seletores verificados em 25/11/2026)

| Dado | Phoenix 2 (piugame.com) | Phoenix (phoenix.piugame.com) |
|---|---|---|
| Linhas de recorde | `.recently_playeList > li` (12 por página) | `.my_best_scoreList > li` |
| Música | `.song_name p` | `.song_name p` |
| Modo | fundo da `.stepBall_in`: `…/stepball/full/{s,d,c}_bg.png` | idem |
| Nível | `.numw img` → `…num_N.png` (um por dígito) | idem |
| Score | `.li_in.ac .tx` | `.etc_con .num` |
| Grade | img `/grade/{sss_p,…,f}.png`; `x_*` = stage break | idem |
| Plate | img `/plate/{pg,ug,eg,sg,mg,tg,fg,rg}.png` | idem |
| Capa | `.in.bgfix` background (`/data/song_img2/…`) | — |
| Data | `.recently_date_tt` (GMT+9) | — |
| Julgamentos (recentes) | `td[data-th=PERFECT…MISS] .tx` | idem |
| Paginação | `.board_paging button[onclick*=page=]` | idem |
| Perfil | `.in_profile .profile_name .t1` (título), `.t2` (nick), `.pumbility_total_wrap` | idem |

Capas: modo "capas" do coletor varre `/leaderboard/over_ranking.php` (131 páginas, imagens oficiais).
Músicas sem chart ≥ 20 recebem a capa do PIU Scores quando o favorito roda em piuscores.arroweclip.se (que também atualiza o catálogo).

## 4. Regras do jogo usadas

* Cortes de grade: Phoenix (A 750k, A+ 825k, AA 900k, AA+ 925k) e Phoenix 2 (A 800k, A+ 900k, AA 920k, AA+ 940k); AAA em diante igual.
* PUMBILITY = soma dos 50 charts mais valiosos (S/D, nível ≥ 10, sem co-op).
  * Phoenix: `(100 + 5·(lv−10)·(lv−9)) × multiplicador do grade`.
  * Phoenix 2 (estimativa do PIU Scores): double `130 + 5·lv + 5·max(0, lv−24)`, single conta como double um nível acima, × (multiplicador do grade + bônus de plate).
  * O app mostra o valor **oficial** lido do site e a estimativa ao lado.
* Tier dentro do nível: `scoring_level − nível` do PIU Scores (≥ +0,6 topo, ≥ +0,2 difícil, ±0,2 médio, ≤ −0,2 fácil, ≤ −0,6 muito fácil); sem esse dado, usa o rótulo de dificuldade.

## 5. Identidade visual

Igual ao site da Phoenix 2: fundo grafite `#1a1b1e`, cartões com a capa da música ao fundo e borda branca de 2 px,
fontes **Pretendard** (texto) e **Oxanium** (números), bolinhas de nível, grades e plates com as imagens oficiais
carregadas de `piugame.com/l_img/p2/…`, acento verde-neon do logo.

## 6. Próximos passos

1. Embrulhar com Capacitor e trocar o bookmarklet por um WebView do piugame.com com script injetado.
2. Votação própria de tier e notas pessoais por chart.
3. Metas (ex.: “SSS em todos os D20”) e notificações quando um recorde melhora.
4. Gráfico da evolução de cada chart usando `best_score_history`.
