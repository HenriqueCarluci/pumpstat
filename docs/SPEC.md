# StepClub — especificação do MVP

> Nome do app: **StepClub** (antes PumpStat). Também será o app do clube de Pump It Up que o Henrique vai abrir na Liberdade (SP).

Tracker pessoal de Pump It Up no estilo do ArcadeStat (StepClub), para **Phoenix 2** com os recordes da **Phoenix**.
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
   └─ favorito "StepClub Sync" → carrega /collector.js do StepClub
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

## 6. Backlog

1. Embrulhar com Capacitor e trocar o bookmarklet por um WebView do piugame.com com script injetado.
2. Votação própria de tier e notas pessoais por chart.
3. Metas (ex.: “SSS em todos os D20”) e notificações quando um recorde melhora.
4. Gráfico da evolução de cada chart usando `best_score_history`.
5. **Fila do fliperama** — ✅ primeira versão no ar (`#/fila/liberdade`, modo TV em `#/fila/liberdade/tv`).

### 6.1 Fila do fliperama

Referência: [Fila Pump](https://fila-pump.pages.dev/#/patio-paulista), app da comunidade para organizar a vez na máquina.

**Como a referência funciona (analisado em 25/11/2026)**
- Tela inicial escolhe a cidade (Natal, Fortaleza, São Paulo, Porto Alegre, Recife) e depois o fliperama (ex.: Pátio Paulista).
- Na fila: lista de quem está esperando, campo "seu nome" + botão **Entrar na fila**, botão **Passar a vez** e contador "N na fila".
- Regras: respeitar a ordem; marcar **Ausente** ao sair (a caminho, banheiro); ausente e fora do local por 1 h sai da fila;
  fila parada por 2 h é zerada (só aquela fila); quem não está no local e não marcou ausente recebe aviso.
- Sem login: qualquer um digita um nome.

**Como fica no StepClub**

| Item | Proposta |
|---|---|
| Locais | Tabelas `arcades` (cidade, nome, nº de máquinas/cabines, coordenadas) e lista por cidade, com favorito do fliperama habitual |
| Entrar na fila | Logado: entra com o nick e o avatar do piugame já sincronizados; sem login: só nome (igual à referência) |
| Estados | `esperando`, `jogando`, `ausente` (com horário), `saiu`; tabela `queue_entries` + `queue_events` para histórico |
| Passar a vez | Quem está jogando vai para o fim ou sai; o próximo vira `jogando` e recebe notificação ("é a sua vez") |
| Tempo real | Supabase Realtime na tabela da fila: todo mundo no fliperama vê a mesma lista ao vivo |
| Regras automáticas | `pg_cron` a cada 5 min: remove ausentes há mais de 1 h e zera filas sem movimento há 2 h |
| Presença | Opcional: geolocalização para avisar quem entrou na fila mas não está no local |
| Estimativa de espera | Posição × tempo médio por crédito (calculado pelos registros de `passar a vez` daquele local) |
| Integração com scores | Ao sair de `jogando`, o app sugere sincronizar e mostra os recordes da sessão |
| Moderação | Dono do local (ou admin) pode remover alguém, reordenar e zerar a fila; limite de entradas por pessoa |
| Segurança | RLS: leitura pública da fila; escrita via RPCs (`join_queue`, `pass_turn`, `set_away`, `leave_queue`) com limite de frequência por aparelho/usuário |

## Amigos (privacidade das notas)
- Outros jogadores só são encontrados pela busca de nickname (`search_players`), que devolve nick, título e avatar, sem notas.
- Ver notas exige amizade aprovada: `send_friend_request` → `respond_friend_request`. Se os dois pedirem, aceita automaticamente.
- `players`, `compare_player`, `chart_ranking` e `user_titles` filtram por `are_friends(auth.uid(), outro)`.
- O antigo "perfil público" foi removido da tela de Ajustes.

## Notificações
- Sino no topo com contador; tela `#/notificacoes` com filtros (Tudo, Amigos, Músicas novas).
- Fontes (RPC `my_notifications`): recordes novos dos amigos (`user_score_history`, ignorando a 1ª sincronização), músicas novas no catálogo (criadas depois de `catalog_baseline`, últimos 30 dias), pedidos de amizade recebidos e aceitos.
- Lidas: `mark_notifications_seen` ao sair da tela. O app consulta a cada 2 min com a aba aberta e pode mostrar aviso do sistema (Notification API) se o usuário permitir.
- Catálogo: a API (`/api/catalog/tick`, chamada ao abrir o app, e a cada 6 h) reimporta o export do PIU Scores no máximo 1x a cada 20 h (`catalog_refresh_due`).
- Backlog: push com o app fechado (Web Push/VAPID ou FCM no app Capacitor) e sincronização automática dos amigos com a sessão salva.

## Recomendações (`#/recomendacoes`)
- "Para jogar": charts ainda não jogados, nível até o máximo já passado + 1. Nota esperada = média da melhor metade das notas do jogador no mesmo modo/nível (±1 com ajuste), corrigida pela dificuldade do PIU Scores e limitada ao melhor do nível + 10 mil. Ganho = valor no PUMBILITY − piso do top 50.
- "Melhorar recorde": próximo grade a até 30 mil pontos, ordenado por ganho/esforço.

## Estilo do chart
- `chart_styles` (por música + modo + nível): % das notas em twist, drill, corrida, bracket, pulo, jack, doublestep e footswitch, calculado das anotações de pé esquerdo/direito do piucenter.com (`scripts/chart-style.js`), mais NPS, ritmo e as 3 skills de destaque.
- Cobertura: ~99% dos charts da Phoenix e ~81% da Phoenix 2 (charts novos da P2 ainda não estão no piucenter).
- Link do YouTube na música e em cada chart (busca "pump it up <música> <S/D nível>").

## Avaliação da comunidade
- Botão "Avaliar" em cada chart. Só quem passou o chart (recorde sem stage break) pode avaliar: voto de tier (muito fácil → topo do nível), tags de estilo (twist, drill, corrida, bracket, pulo, jack, doublestep, footswitch, gimmick, stamina, hold, técnico) e comentário de até 500 caracteres.
- O tier mostrado no app mistura o PIU Scores (peso de 3 votos) com a média dos votos (`community_charts`). As tags mais marcadas aparecem no card do chart.
- Comentários são visíveis para todos os usuários logados; a nota de quem comentou só aparece para amigos.

## Idiomas
- Português, English, Español, 한국어, 日本語, Français e Italiano. Escolha em Ajustes ou na tela de login; na primeira vez segue o idioma do aparelho.
- `t('texto em português')` com dicionários em `web/src/lib/locales/*.json`, gerados por `scripts/i18n-build.py` a partir de `scripts/i18n/part*.txt`. Erros do servidor (em português) são traduzidos na tela quando conhecidos.
- Datas e números seguem o idioma escolhido. Nomes de músicas, títulos do jogo e termos como PERFECT/GREAT ficam como no jogo.

## Online agora (`#/online`)
- Com o app aberto, cada usuário manda um "heartbeat" a cada 30 s (`heartbeat`); online = visto nos últimos 3 min. Quem abriu a fila de um fliperama nas últimas 3 h aparece como "no mesmo fliperama".
- Lista (`online_players`): nick, avatar, título, PUMBILITY (Phoenix 2) e maior single/double passado (sem stage break), para todos. Sugestão de x1 por PUMBILITY parecido (±500 = bom x1, ±1500 = nível parecido), sem revelar o número.
- Convite (`send_invite`) com mensagem rápida ou texto (até 140 caracteres). Limites: 1 convite por pessoa a cada 10 min e 10 por hora. O convidado vê um aviso na hora (e notificação do sistema se permitido) e responde "Bora!" ou "Agora não"; quem chamou recebe a resposta.
- Visibilidade: todos, só amigos ou ninguém (`set_presence_mode`).

## Minichat entre amigos
- Na página do amigo (`#/jogador/:id`): conversa (`chat_with`, atualiza a cada 5 s), status online e botão "Chamar para x1".
- Mensagens só entre amigos, até 140 caracteres; lidas ganham ✓✓. Chegam como aviso em qualquer tela (Responder / OK); valem 7 dias para quem estiver offline. Convite de x1 para amigo offline vale 2 h.

## Fila
- Entrar e voltar de "ausente" sempre pedem a localização, inclusive para administradores. O raio só é conferido onde o local tem coordenadas.

## Ajuda e feedback (Ajustes)
- Formulário com tipo (dúvida, problema, sugestão, outro), mensagem, e-mail para resposta e, opcionalmente, dados do aparelho e da tela.
- Sempre salva na tabela `feedback` (`submit_feedback`, até 5 por hora). A API (`POST /api/feedback`) manda o e-mail pelo FormSubmit para o endereço configurado em `FEEDBACK_WEBHOOK` no Render (`https://formsubmit.co/ajax/<destino>`); sem a variável, fica só no banco. No primeiro envio o FormSubmit manda um e-mail de ativação para o destino.

## Administração (`#/admin`, só para `app_admins`)
- Dono: conta CARLUCI (Henrique), com StepClub+ vitalício.
- Resumo: usuários, novos e ativos em 7 dias, online, com conta da Pump, assinantes, suporte em aberto e bloqueados (`admin_stats`).
- Usuários (`admin_users`): busca por e-mail ou nick; liberar StepClub+ como cortesia (30 dias, 3 meses, 1 ano ou vitalício, com motivo), remover plano, bloquear/desbloquear conta (`auth.users.banned_until`, derruba as sessões) e dar/tirar acesso de admin.
- Suporte (`admin_feedback`): mensagens do formulário, responder por e-mail e marcar como resolvida.
- Planos: tabela `subscriptions` (fonte `store`, `comp` ou `lifetime`); `my_plan()` diz o plano e se o usuário é admin. Assinaturas da loja entram com `source = 'store'` quando o pagamento for ligado.

## Planos (Grátis / Plus / Pro) — em desenvolvimento
- Configuração em `app_settings.plans` (editada em Administração → Planos): `show_plans` (tela de planos visível para todos; admin sempre vê a prévia), `enforce` (aplica limites e recursos pagos; desligado = tudo liberado), plano mínimo de cada recurso, limites por plano (amigos, recomendações, meses de histórico) e preços por região (BR, US, EU, WORLD).
- Padrão: Plus R$ 6,90 / US$ 4,99 (EUA e Europa) / US$ 2,99 (outros); Pro R$ 12,90 / US$ 9,99 / US$ 5,99; anual com ~33% de desconto. Amigos: grátis 15, Plus 50, Pro sem limite.
- Já aplicado quando `enforce` ligar: limite de amigos (servidor), recomendações visíveis, meses de histórico e estilo do chart completo. Sincronização automática respeita o plano mínimo do recurso `auto_sync`.
- Cortesia no admin: Plus ou Pro por 30 dias, 3 meses, 1 ano ou vitalício.

## Moderação e requisitos das lojas
- Bloquear e denunciar usuários (perfil do amigo, comentários de charts, lista de online). Bloqueio desfaz a amizade e impede convites, mensagens, busca e online entre os dois. Denúncias aparecem em Administração → Denúncias, com opção de bloquear a conta.
- Excluir a própria conta em Ajustes (digitando EXCLUIR); apaga a conta e todos os dados ligados.
- Política de privacidade pública em `#/privacidade` (PT e EN), com link no login e em Ajustes.

## Tier do clube
- Admin define o tier de um chart (em "Avaliar"), que vale acima dos votos e do PIU Scores (`chart_tier_overrides`).

## Sincronização automática
- A API sincroniza, a cada 15 min (e quando o app é aberto), até 4 contas com sessão salva, ativas nos últimos 21 dias e sem sincronizar há 6 h (`auto_sync_candidates`, `ingest_auto`, `auto_sync_done` com a chave do servidor). Sessão expirada é apagada e a pessoa entra com a senha de novo. O usuário liga/desliga em Ajustes.
- No plano gratuito do Render a API dorme; para rodar o dia todo, a API precisa do plano Starter.

## Idiomas
- Cada dicionário é baixado só quando o idioma é escolhido (import dinâmico).

## Progresso (evolução, pontos fracos, dicas e plano de treino)
- Tela `/progresso` (atalho "Progresso" no início), por modo (Single/Double). Dados: RPC `my_progress(versão)` com histórico de recordes, todas as jogadas registradas e o estilo dos charts.
- Cada tentativa vem das jogadas registradas (o piugame só mostra as 50 últimas; o auto-sync ajuda a não perder) e dos recordes: recorde quebrado = nunca passou; recorde que já esteve quebrado = houve quebra antes do pass.
- Nível: maior passado, conforto (último nível com ≥70% dos charts tentados passados) e alvo.
- Pontos fracos: para cada padrão (twist, drill, corrida, bracket, pulo, jack, doublestep, footswitch, velocidade, resistência), compara os charts com ≥20% do padrão com o resto, perto do nível, descontando a taxa de quebra esperada pelo nível e a nota média do nível. Usa as duas versões (padrão é habilidade do jogador) e as tags da comunidade quando o chart não tem estilo do piucenter (músicas novas da Phoenix 2).
- Dicas: muro de nível, charts travados (2+ quebras sem passar), ponto fraco/forte com charts para treinar, precisão (misses/greats), tendência das últimas 2 semanas e aviso de pouco histórico.
- Plano de treino semanal (muda toda segunda, determinístico): 3 sessões com aquecimento, ponto fraco, consolidar, desafio e nota; metas com progresso calculado das jogadas da semana.
- Recursos no admin: `evolution_chart`, `weakness`, `tips`, `training_plan`.
