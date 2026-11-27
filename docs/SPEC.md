# PIU Stats — especificação do MVP

> Nome do app: **PIU Stats** (antes PumpStat). Também será o app do clube de Pump It Up que o Henrique vai abrir na Liberdade (SP).

Tracker pessoal de Pump It Up no estilo do ArcadeStat (PIU Stats), para **Phoenix 2** com os recordes da **Phoenix**.
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
   └─ favorito "PIU Stats Sync" → carrega /collector.js do PIU Stats
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
6. **Competições no perfil (CBPIU e LBPIU)** — ver 6.2.
7. **Liberação de recursos por usuário** — o admin dá (ou tira) um recurso de uma pessoa sem mudar o plano dela, com prazo e motivo. Ver 6.3.
8. **Seguidores** — seguir o perfil de um jogador que deixou o perfil público. Ver 6.4.

### 6.2 Competições no perfil (CBPIU e LBPIU)

Pedido em 27/11/2026: mostrar no perfil as etapas do CBPIU (últimas etapas jogadas, scores) e os campeonatos da LBPIU (títulos e medalhas), achando o jogador pelo nick da conta ou por um nome/link informado por ele.

**Fonte (analisada em 27/11/2026)**
- O CBPIU e os campeonatos da LBPIU (BRPF, NEtão, Semana Santa, B1G ONE, Ostrão, Gauchones, Speed Super Stars etc.) estão todos no scoreboard da LBPIU: `scoreboard.lbpiu.com.br` (o endereço antigo `lbpiu.com.br/scoreboard/...` redireciona).
- Cada jogador tem perfil público: `scoreboard.lbpiu.com.br/perfil/<nick>-<código>` (ex.: `kyuubi-1uabu2`). O começo do código é o nick, então dá para sugerir o perfil pelo nick da conta e confirmar com o jogador.
- O site carrega arquivos públicos (Firebase Storage do projeto `scoreboard-1b28f`):
  - `dados/indice.json` (~520 KB): `Jogou` (código do jogador → lista de campeonatos), `Players` (campeonato → inscritos e categorias), `Destaques`, `Em` (data da última geração).
  - `dados/campeonato/<id>.json`: um registro por tabela com `Path` (ex.: `Etapa4/1/Single` no CBPIU, `Masculino/Final` ou `Inter/Final/GoldMatch` nos campeonatos), `Parametros.List` (músicas e níveis), `Parametros.Medals`, e `Tabela` já na ordem de classificação: `Player` (códigos), `Scores` (`Score`, `DG` = perfect-great-good-bad-miss-combo, `Pass`).
  - Só existe arquivo dos campeonatos encerrados. O CBPIU em andamento (ex.: `cbpiu26`) dá 404: fica no Realtime Database, que não deve ser usado (o acesso foi bloqueado como não autorizado).
- Nome dos campeonatos, cidade e Instagram do jogador não estão nesses arquivos. Os nomes teriam que vir de um mapa nosso pelo prefixo do código (`cbpiu`, `brpf`, `bigone`, `netao`, `ss`, `sss`, `ostrao`, `gauchones`, `liga`, `final`, `especialxx`, `playx4`, `pumpbh`, `paulissteps`…) + ano, editável no admin.

**Antes de construir:** pedir autorização à LBPIU (lbpiuscoreboard@gmail.com) para usar os dados no app e perguntar se existe um jeito oficial (API ou exportação). Dar crédito com link para o scoreboard.

**Como ficaria**
| Item | Proposta |
|---|---|
| Vincular | Em Ajustes: sugestão pelo nick da conta, busca por nick ou colar o link do perfil do scoreboard |
| Coleta | Função `sync-lbpiu` (Supabase Edge) 1×/dia: baixa o `indice.json` e só os arquivos dos campeonatos que cada jogador vinculado jogou; guarda um resumo por jogador (`lbpiu_links.data`). Nada de chamar o site a cada visita |
| Perfil | Seção "Competições": títulos e medalhas (1º–3º na final; GoldMatch/BronzeMatch), campeonatos jogados com categoria e fase alcançada, CBPIU por temporada (etapa, divisão, modo, colocação, músicas e scores), link para o perfil no scoreboard |
| Admin | Recurso `competitions` com liberação "Pelo plano / Só usuários liberados / Desligado" (começa em "Só usuários liberados"), status da última coleta, botão "Coletar agora" e edição dos nomes dos campeonatos |

### 6.3 Liberação de recursos por usuário

| Item | Proposta |
|---|---|
| Dados | `user_feature_grants(user_id, feature, mode 'grant'/'block', expires_at, note, granted_by)` |
| Regra | Admin (sem prévia) tem tudo → recurso desligado no geral → bloqueado para a pessoa → liberado para a pessoa → "só usuários liberados" → regra do plano. Vale mesmo com a cobrança desligada |
| Servidor | `plan_can` segue a mesma regra; `my_plan()` devolve `grants` |
| Admin | No usuário: "Recursos liberados" (recurso, liberar/bloquear, 30 dias / 3 meses / 1 ano / sem prazo, motivo). Em Planos: coluna "Liberação" por recurso e lista de quem tem cada recurso liberado |

### 6.4 Seguidores

Pedido em 27/11/2026: poder seguir o perfil de um jogador dentro da plataforma, se ele deixar o perfil público. Adiado para depois (a migração do banco não chegou a ser aplicada).

| Item | Proposta |
|---|---|
| Perfil público | Opção em Ajustes → Privacidade, desligada por padrão (`user_settings.public_profile`). Ligada: qualquer jogador pode ver as notas e seguir, sem aprovação. "Ocultar minhas estatísticas" continua valendo por cima |
| Seguir | Um lado só (`follows(follower, followee)`), botão Seguir/Seguindo no perfil e na busca; o dono pode tirar um seguidor; bloqueio desfaz tudo |
| O que quem segue ganha | Ver as notas como um amigo (`can_view` = amigo ou perfil público), aparecer nos rankings dos charts e nas notas da música, e receber passes, recordes, PUMBILITY e lives (live só se as redes estiverem abertas para todos). Chat, convites e rival continuam só entre amigos |
| Telas | Contadores de seguidores e seguindo no perfil; aba "Seguindo" em Jogadores com as duas listas; notificação "{nick} começou a te seguir" |
| Admin | Chave geral `followers` em Administração → Recursos |

O SQL pronto (ainda não aplicado) está em `supabase/backlog/followers.sql`. Antes de aplicar: renumerar como migração, revisar contra as funções que mudaram desde então (`my_notifications`, `twitch_live_report`, `compare_player`, `chart_ranking`, `song_friend_scores`, `search_players`) e fazer a parte do app.

### 6.1 Fila do fliperama

Referência: [Fila Pump](https://fila-pump.pages.dev/#/patio-paulista), app da comunidade para organizar a vez na máquina.

**Como a referência funciona (analisado em 25/11/2026)**
- Tela inicial escolhe a cidade (Natal, Fortaleza, São Paulo, Porto Alegre, Recife) e depois o fliperama (ex.: Pátio Paulista).
- Na fila: lista de quem está esperando, campo "seu nome" + botão **Entrar na fila**, botão **Passar a vez** e contador "N na fila".
- Regras: respeitar a ordem; marcar **Ausente** ao sair (a caminho, banheiro); ausente e fora do local por 1 h sai da fila;
  fila parada por 2 h é zerada (só aquela fila); quem não está no local e não marcou ausente recebe aviso.
- Sem login: qualquer um digita um nome.

**Como fica no PIU Stats**

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
- Lista (`online_players`): nick, avatar, título, PUMBILITY (Phoenix 2) e maior single/double passado (sem stage break), para todos. Sugestão de x1 por PUMBILITY e maior nível passado próximos (padrão: bom x1 = até 3% ou 200 pts e 1 nível; nível parecido = até 7% ou 500 pts e 2 níveis; editável em Admin → Recursos), sem revelar o número.
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
- Dono: conta CARLUCI (Henrique), com PIU Stats+ vitalício.
- Resumo: usuários, novos e ativos em 7 dias, online, com conta da Pump, assinantes, suporte em aberto e bloqueados (`admin_stats`).
- Usuários (`admin_users`): busca por e-mail ou nick; liberar PIU Stats+ como cortesia (30 dias, 3 meses, 1 ano ou vitalício, com motivo), remover plano, bloquear/desbloquear conta (`auth.users.banned_until`, derruba as sessões) e dar/tirar acesso de admin.
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

## Release de novembro (notificações, times, fliperamas, votação de tier)
- Notificações guardadas em `notifications` (gatilhos em amizades e convites/mensagens; pedidos e resultados de fliperama, time e votação), mais as calculadas (recordes dos amigos e músicas novas). Apagar uma (`dismiss_notification`) ou limpar todas (`clear_notifications`).
- Amigos jogando agora: `friends_in_queue()` na tela de amigos (fliperama, máquina, posição), atualiza a cada 30 s.
- Atualização rápida em Recentes: `POST /api/piu/sync` com `partial: true` lê só perfil e jogadas recentes; no banco, uma jogada passada acima do recorde vira o recorde (`ingest_for` com `partial`).
- Cadastro de fliperamas pelos membros (`request_venue`), aprovado no admin (`admin_review_venue`, cria o fliperama e as máquinas).
- Times: membro escolhe um time aprovado ou pede um novo (`request_team`); admin aprova (`admin_review_team`) e quem pediu entra no time. Sigla do time aparece em amigos, online e perfil (`teams_of`).
- Votação de tier: quem passou o chart propõe (`propose_tier`); só quem passou vota (`vote_tier`); depois de X horas (admin: `community.tier_vote_hours`, padrão 48) aprova se houver mais votos a favor e o mínimo (`community.tier_vote_min`, padrão 3); aprovado vira o tier do clube. Página `/votacoes`.
- Estilo das músicas novas da Phoenix 2: padrões do PIU Scores (`charts.skills`) e tags da comunidade entram nos pontos fracos e no plano de treino.
- Planos: cada pessoa vê só o preço da sua região (pelo fuso do aparelho; idioma como reserva); o admin pode conferir as outras.
- Página da música: notas dos amigos em cada chart, com a diferença para a sua; vindo do Tier, o chart clicado fica em destaque.
- Progresso → Pontos fracos: gráficos de setor de passes e quebras pelo padrão principal de cada chart (cor fixa por padrão).
- Progresso → Rival (Phoenix 2): um amigo escolhido (`set_my_rival`/`my_rival`); PUMBILITY, maior S/D, charts passados, confronto direto (setor), clears por nível lado a lado e listas "onde ele está na frente", "só ele passou" e "onde você está na frente".
- Times: logo (`logo_url`, servido de /teams/) e Instagram; Team L'Aqua (São Paulo) pré-cadastrado pelo admin.
- R!SE: o leitor do site oficial entende o Half-Double (`hd`) como modo `HD` e ignora tipos desconhecidos em vez de gravar como Co-op. Charts HD aparecem em grupo próprio (azul, selo R!SE) e não entram em PUMBILITY nem no Progresso. `songs.rise` marca músicas que só abrem com a conta Steam ligada (admin marca na página da música); filtro "R!SE" em Músicas.
- Aviso de amigo online (estilo MSN): o `heartbeat` devolve os amigos online; o app mostra um cartão no canto quando um amigo aparece entre um batimento e outro (desligável em Configurações).
- Teste grátis: trigger `on_signup_trial` em `auth.users` dá `trial_plan` (Plus) por `trial_days` (15) dias em `subscriptions` (source `trial`); depois `plan_of` volta a `free` sozinho. `trial_claims` guarda o hash do e-mail para o teste valer uma vez só (contas antigas já marcadas). Admin ajusta em Administração → Planos.
- Gamificação semanal (Início): missões da semana (`lib/missions.js`, calculadas do histórico do Progresso: jogar em 2 dias, passar charts novos do nível-alvo e do anterior, melhorar 3 notas, jogar o padrão fraco), sequência de semanas com jogo e resumo da semana passada (`my_week`: semanas jogadas no horário de SP, PUMBILITY seu e do rival). O resumo some quando fechado e volta na semana seguinte.
- Liga/desliga geral (Administração → Recursos): `app_config().toggles` (ausente = ligado); `feature_on()` no banco e `isOn()` no app. Cobre missões, sequência, resumo, desafios, rival, aviso de amigo online, online/convites, times, votação de tier e cadastro de fliperama pelos membros.
- Desafios do mês (`challenges`, `challenge_entries`, `challenge_winners`): o admin cadastra (modelos prontos) com meta de esforço — dias com jogo, jogadas, charts novos passados, recordes pessoais batidos, música do mês em qualquer dificuldade ou nota mínima em qualquer nível — e prêmio por sorteio entre quem completou, para todos que completaram ou para os N primeiros. Progresso automático pelo sync (`challenge_progress`), quadro de participantes, notificação de desafio novo e de ganhador, controle de entrega do prêmio. Página /desafios e destaque no Início.
- Status (estilo MSN): botão no topo com Online, Ausente, Ocupado e Aparecer offline (`set_presence_status`; aparecer offline = modo 'off', e a visibilidade anterior volta em `vis_mode`). O status aparece na lista Online; quem está ocupado não recebe convite para jogar (o servidor recusa) e não vê avisos pulando na tela.

## Assinatura (planos mensal e anual)
- Tudo controlado no Admin → Planos: "Mostrar a tela de planos" (Planos, Minha assinatura e o cartão de plano em Ajustes só aparecem com isso ligado; admin sempre vê a prévia), "Cobrança ativa" (aplica limites) e "Venda de assinaturas ligada" (botão Assinar; desligado = "Em breve").
- Google Play: uma assinatura por plano (`piustats_plus`, `piustats_pro`) com dois planos básicos (`mensal`, `anual`); IDs editáveis no admin.
- `/assinatura`: plano atual, origem (teste, Google Play, cortesia, vitalício), validade/renovação, gerenciar/cancelar na Google Play, restaurar compras e dúvidas.
- `lib/billing.js`: estado da venda (off/web/pending/ready), compra e restauração via `window.PIUStatsBilling` (plugin de cobrança a integrar), links da Play.
- Matriz: Grátis (fila, amigos até 15, chat, Tier, votações, desafios, missões, Mais jogadas, sync manual, 5 recomendações, 3 meses de histórico); Plus (sem anúncios, 50 amigos, recomendações, histórico e estilo completos, evolução, dicas, rival); Pro (Plus + sync automática, pontos fortes e fracos, plano de treino, amigos sem limite, push).
- Cobrança: RevenueCat + Google Play. O app configura o SDK com a chave pública (`sales.rc_key`, admin) e o id da conta (appUserID = id do Supabase); compra `produto:plano_básico` (ex.: `piustats_pro:anual`) e troca de plano com `googleProductChangeInfo`. O RevenueCat chama `POST /api/billing/revenuecat` (cabeçalho Authorization = `REVENUECAT_WEBHOOK_AUTH`), que grava via `billing_event` (046): compra/renovação/troca → `subscriptions` (source store, product, will_renew); cancelamento → will_renew false; expiração → expira agora. Eventos ficam em `billing_events` (idempotente por id).

## Meu treino
- `/treino` (atalho na Início; liga/desliga em Admin → Recursos → "Meu treino"). Botão "Treinar" em cada chart na página da música. Lista na conta (`training_charts`, 047, até 60), `my_training()` / `training_set(chart, on)`.
- Análise (`lib/training.js` → `analyzeTraining`, recurso `training_analysis` no plano): chance de passar = taxa de clear do jogador no nível (com a distância do nível de conforto) + tier do chart + padrões do chart × pontos fortes/fracos + gimmick + quebras no chart. Mostra os motivos, "o que treinar antes" (charts 1–2 níveis abaixo com o padrão fraco, ou os mais fáceis do nível de baixo), resumo (mais perto, mais longe, foco de treino) e, para os já passados, quanto falta para a próxima nota.

## Charts especiais (gimmick e fora da curva)
- Fonte: `chart_flags` (048), marcado pelo admin em cada chart (tipos: velocidade, paradas, setas falsas, warp, visual, outro; "fora da curva"; observação), e votos da comunidade nas avaliações (tags `gimmick`, `g_speed`, `g_stop`, `g_fake`, `g_warp`, `g_visual`, `offcurve`). Com `community.special_min` votos (padrão 2) o chart entra. `community_charts` devolve o 6º campo `{g, gimmick, off, note, admin}` → `c.special`.
- Tier: seção "Especiais" no fim do nível (fora do ranking normal), selo no canto da capa. Música: selos "Gimmick: tipos" e "Fora da curva". Lista de músicas: filtro Especiais / Com gimmick / Sem especiais.
- Gimmick vira dimensão em pontos fortes e fracos (`DIMENSIONS`), entra no plano de treino e no Meu treino. A aba do Progresso passou a se chamar "Pontos fortes e fracos".

## Redes sociais no perfil
- Ajustes → "Redes sociais": Instagram, Twitch, YouTube, TikTok, X e Discord (só o nome de usuário; aceita colar o link). "Quem pode ver": só amigos (padrão), todos ou ninguém.
- `user_socials` (050), `my_socials()`, `set_socials(p)` (normaliza e valida o nome), `socials_of(user)` (respeita visibilidade, amizade e bloqueio).
- No perfil do jogador (/jogador/:id) aparecem como botões que abrem a rede; Discord copia o usuário.

## País (bandeira no perfil)
- Ajustes → "País" (opcional; sugere pelo idioma do aparelho). `user_settings.country` (051), `set_my_country`, `my_country`, `countries_of(ids)`.
- Bandeira ao lado do nick em Amigos, perfil/comparação, Online e placar dos Desafios (`lib/country.jsx`: busca em lote com cache, como os times).
- SVGs em `web/public/flags` do pacote flag-icons (MIT, licença junto).

## Meu Time
- `/time` (atalho na Início, liga com o recurso "Times"). `my_team(version)` (052): time, participantes com nick, título, avatar, PUMBILITY, maior nível passado em S e D, clears, online (respeita a visibilidade), e a semana do time (jogadas, passes, quantos jogaram — só o total).
- Tela: cabeçalho do time, quadros (maior Double, maior Single, maior e média de PUMBILITY, semana), ranking ordenável (PUMBILITY, maior Double, maior Single, clears); amigos abrem a comparação.

## Tutorial guiado
- No primeiro acesso (por aparelho) pergunta se quer o tour; em Ajustes → "Ver tutorial". `lib/tour.js` (passos; os de recursos desligados são pulados) e `components/Tour.jsx` (cartão acima da barra de baixo, navega pelas telas).
- Relatório do time (Meu Time): `team_report(version, period day|week|month, offset)` (054), com navegação para períodos anteriores. Totais (jogadas, passes, taxa, clears novos, jogando, músicas, nível médio, maior passe) com variação contra o período anterior de mesmo tamanho, atividade (passou x quebrou por hora/dia), músicas mais jogadas pelo time e tabela por participante (só contagens, nunca notas).
- Assinatura no fim de Ajustes: "PIU Stats · Desenvolvido por Carluci".
- Pedido de time como formulário (055): logo (o app recorta o centro em 256 px e envia para o bucket público `team-logos/<conta>/`), nome, sigla, cidade, Instagram, outras redes (TikTok, YouTube, Twitch, X, convite do Discord), sobre o time e contato. `request_team_form` grava; a API (`POST /api/team-request`) lê `team_request_mail` (uma vez, só de quem pediu) e manda o e-mail ao admin pelo mesmo webhook do suporte, com o link do logo. No painel, a aprovação mostra logo, redes, sobre e contato, e o admin pode tirar o logo (`admin_set_team_media`). As redes aparecem em Meu Time e em Ajustes.
- Administradores de time (099): `team_members.role` (member|admin). Quem pediu o cadastro vira admin ao ser aprovado. Em time com admin, `set_my_team` vira pedido (`team_join_requests`, notifica os admins com `team_join_request`; o jogador continua no time atual até ser aceito); sem admin, a entrada é direta. Em Meu Time o admin vê os pedidos (`team_review_request` aceita/recusa e notifica `team_join_approved`/`team_join_rejected`) e, em Gerenciar participantes, dá/tira admin (`team_set_admin`, sempre fica um) e tira participantes (`team_remove_member`). No painel (Aprovações → Administradores dos times) o admin do site vê os participantes (`admin_team_members`) e define admins pelo nick ou pela lista (`admin_set_team_admin`, notifica `team_admin`). Em Ajustes o jogador vê o pedido em aberto e pode cancelar (`cancel_team_request`).
- Conta AM.PASS com mais de um ID de jogo (100): o servidor lê a janela "Switch Account" de /my_page/play_data.php (`server/piu-accounts.js`: cartões com nick, título, avatar e qual está ativo). Na sincronização com senha, se houver mais de um ID e o app não mandou `account`, o job fica em `choose` com a lista; o app mostra os cartões e manda o nick em `POST /api/piu/jobs/:id/choose`. O servidor repete o clique do cartão (link, formulário ou a função do onclick achada nos scripts da página), confere o nick no perfil e guarda o ID escolhido na sessão criptografada (sincronização rápida e automática usam o mesmo). O app lembra o ID por login (localStorage). Como o HTML real da janela ainda não foi visto, o servidor guarda o trecho da janela em `piu_samples` (só admin lê) quando encontra mais de um ID ou quando a troca falha, para ajustarmos a leitura.
- Regras do vínculo (101): a conta do app é a dona de tudo (amigos, time, notas); o AM.PASS é a fonte das notas. Antes de gravar, o servidor chama `piu_link_check` (chave do servidor): `taken` = o ID de jogo (nick normalizado, `norm_game_id`) já está em outra conta do app; `changed` = esta conta tem notas de outro ID. Na sincronização com senha o job fica em `confirm` e o app pergunta: mesmo jogador (mudou o nick; segue) ou outro jogador (apaga notas, jogadas, histórico, perfis e títulos desta conta com `wipe_game_data`), e se traz o vínculo da outra conta (ela perde as notas e a sessão e recebe `piu_link_moved`). `POST /api/piu/jobs/:id/confirm`; `piu_link_resolve` aplica. Sem decisão nada é gravado. Sincronização rápida/automática não pergunta: para com aviso pedindo a senha. Painel (Aprovações → Vínculos AM.PASS): `admin_piu_link_issues` lista IDs em mais de uma conta e contas com mais de um nick; `admin_unlink_piu` desvincula e apaga as notas importadas.
- Segurança (102): `is_valid_key` (importar catálogo/capas) aceita só a chave do servidor ou a chave de sincronização de admin com a permissão `charts`; `queue_pass(p_machine, p_token)` exige estar na fila daquela máquina (conta ou aparelho) ou ser admin do local; `admin_role`, `are_friends`, `is_blocked`, `has_admin_perm` e `is_app_admin` não são mais chamáveis direto pela API (a política de `user_titles` usa a tabela de amizades).
- Verificação em duas etapas (TOTP do Supabase Auth, mesmo modelo do Fênix): opcional; convite único depois do questionário e do tutorial (`MfaInvite`; "Deixar para depois" grava `user_metadata.mfa_invite_done` e avisa que dá para ativar em Ajustes → Segurança), em Ajustes → Segurança (`components/TwoFactor.jsx`, `lib/mfa.js`, REST do /auth/v1/factors). Com fator verificado, o app só abre depois do código (`MfaGate` no App; sessão `aal2`); a API do servidor responde 403 `mfa_required` para sessão `aal1`; no banco, `check_request` (104) recusa chamadas de sessão `aal1` de quem tem fator verificado (hint `mfa_required` faz o app pedir o código).
- Dia de jogo (`/dia` e `/dia/AAAA-MM-DD`, 056): o dia vai das 5h às 5h (horário de São Paulo). `my_day_report` traz por chart tentativas, passes, melhor score do dia e o melhor de antes (jogadas, histórico e recorde salvo), as jogadas do dia, o dia de jogo anterior e a lista de dias. A tela mostra jogadas, passes e taxa, quebras, primeiros passes, recordes, maior D/S, nível médio e acerto, com setas contra o dia anterior; primeiros passes, recordes batidos (antes → agora, grade/plate que subiu), o que ainda não passou (com "Treinar"), barras por nível e todas as jogadas. Botão "Sincronizar o dia" faz a atualização rápida. "Gerar imagem para postar" desenha no canvas um card 1080 × 1350 com os números e os recordes do dia (ou os melhores passes) e compartilha pela folha do Android (@capacitor/share + filesystem) ou Web Share/download. Atalho no início e em cada dia de Recentes. Recurso grátis, com chave `day_report` no admin.
- Planos (revisão de 26/11): recurso pago novo `team_report` (relatório do time por dia/semana/mês, base Plus) com chave no admin; a lista "Grátis para todos" (ALWAYS_FREE) agora aparece também na tela de planos e inclui perfil com redes e bandeira, Meu Time e cadastro de time, Tier com Especiais e New Tunes, relatório do dia com imagem e a lista do Meu treino com tentativas. Chaves no admin: `day_report` e `team_report`.

## Novidades (`#/novidades`)
- Notas de lançamento e próximos lançamentos dentro do app (`release_notes`, texto por idioma com o português como base). Cartão em Ajustes, aviso no início para quem ainda não viu (marca em `localStorage`; conta nova não recebe aviso das antigas) e página com abas Lançados/Próximos.
- Admin → Novidades (permissão `config`): criar, editar, rascunho, ordem dos próximos e apagar.

## Modo de teste do admin
- O admin simula Grátis, Plus ou Pro por 30 min a 24 h (`admin_set_preview`, tabela `admin_plan_preview`). Vale no app (cadeados, limites, anúncios) e no servidor (`plan_can`/`plan_limit`), sem mudar a assinatura nem o perfil de administração. Expira sozinho; faixa no topo para trocar de plano ou sair. Fica em Admin e em Ajustes.

## Modo visitante (sem login)
- Ligado pelo admin em Recursos → Visitante (`app_config().guest.enabled`, começa desligado). Botão "Ver o tier sem conta" na tela de login.
- O visitante vê só o Tier e a página do chart (tier, 3 skills, tags, detalhes), pela função `guest_data` (catálogo sem notas de ninguém). Faixa no topo leva ao login.
- Anúncio em tela cheia ao abrir e a cada 60 min (configurável em Recursos → Visitante), fecha depois de 5 s. Sem anúncio próprio ativo, mostra o convite para criar conta.

## Liberação de recursos por usuário
- Admin → Usuários → "Recursos liberados": recurso + prazo (30 dias, 3 meses, 1 ano, sem prazo) + motivo, sem mudar o plano (`user_feature_grants`). Vale no app (`my_plan().grants`) e no servidor (`plan_can`), com ou sem a cobrança ligada.

## Ver como usuário (só leitura)
- Dono e admin geral: Admin → Usuários → "Ver como esta pessoa" (30 min). O gancho `check_request` (PostgREST `db_pre_request`) troca o `auth.uid()` dos pedidos do admin pelo da pessoa e só deixa passar leituras (GET nas tabelas e funções STABLE). Conversas (`chat_with`) e notificações ficam bloqueadas. Não dá para ver como o dono.
- Faixa vermelha no topo com o tempo que falta e "Sair" (`admin_stop_view_as`, que roda como o admin). Cada acesso vai para `admin_view_as_log` e aparece para o dono em Admin → Equipe → "Registro do ver como usuário" (`admin_view_as_history`). Política de privacidade atualizada.

## Perfil privado
- Ajustes → Privacidade → "Ocultar minhas estatísticas, até dos amigos" (`user_settings.private_stats`).
- Esconde dos outros o que o app gera: notas e recordes, jogadas, top 50, notas e placas, passes por nível, estilo, comparação, rival, pontos e selos e os avisos de recorde. As funções sociais leem as views `visible_scores`, `visible_score_history`, `visible_plays` e `visible_profiles` (que só filtram quem é privado; os próprios dados continuam).
- Continua público o que o jogo mostra: nick, foto, título e PUMBILITY (com a faixa), além de bandeira, time e redes (com a visibilidade delas).

## Questionário do jogador
- No primeiro acesso (antes do convite do tutorial) o app pede 5 perguntas: tempo de jogo, frequência, objetivo, modo e até 3 coisas para melhorar. Dá para pular ("Depois"); fica em Ajustes → Seu perfil → "Seu jeito de jogar" para responder ou refazer (`save_quiz`, `skip_quiz`, `my_quiz`; `user_settings.quiz`).
- Calibração: missões pesam a categoria do objetivo (`quizMul`), metas mais leves para iniciantes e um pouco mais puxadas para veteranos frequentes (`quizAdj`), dias de jogo pela frequência quando não há histórico e modo preferido quando o histórico é pequeno. Recomendadas abrem na aba do objetivo, no modo preferido, e mostram primeiro os charts com as skills escolhidas.

## Permissões por pessoa (equipe)
- Admin → Equipe → "Permissões por pessoa" (só o dono, permissão `roles`): matriz pessoa × permissão. Cada célula parte do padrão do perfil; tocar dá ou tira só para aquela pessoa (`admin_perm_overrides`), tocar de novo volta ao padrão; "Padrão" limpa os ajustes da pessoa.
- `effective_perms` = permissões do perfil + ajustes; `has_admin_perm`, `my_plan().perms` e o alerta de conta nova usam ela. Não vale para donos, e gerenciar a equipe (`roles`) não pode ser dado por ajuste.

## Matriz de planos (27/11/2026)
- Grátis: histórico, recordes, Tier, PUMBILITY; 5 amigos, 2 missões; sync com anúncio; comparar com amigo resumido.
- Plus ("ver tudo sobre você"): sem anúncios, estatísticas do jogador, Dia de jogo, resumo da semana, todas as skills, comparar completo, Meu treino (lista), evolução dos últimos 90 dias (`evolution_days`), recomendações e Como subir (10 por aba, `rec_limit`); 10 amigos, 4 missões, 1 troca.
- Pro ("treinar para evoluir"): tudo do Plus + evolução completa, recomendações todas com prioridade nas skills do questionário (`recommendations_skills`), Dicas, análise do Meu treino, plano de treino, pontos fortes e fracos, Rival, relatório do time, foco nas missões, sync automático, selo; amigos ilimitados, 5 missões, 2 trocas.

## Notificações em pop-up, PUMBILITY e lives (nov/2026)
- **Pop-up** (`components/NotifToast.jsx`): notificação nova (não lida e mais nova que a última vista neste aparelho) desce no topo da tela por 7 s (live: 14 s), até 3 por vez; o último mostra "+N notificações novas". Na primeira vez no aparelho só marca o ponto de partida. Não aparece na tela de Notificações, no "ver como usuário" nem para convites/mensagens/contas novas (têm aviso próprio). Preferência do usuário em Ajustes (`prefs.notifPopup`) e chave geral `notif_popup`.
- **PUMBILITY dos amigos** (`friend_pumbility`): calculada em `my_notifications` a partir das fotos de perfil (`visible_profiles`) quando a parte inteira sobe. Chave `friend_pumbility`.
- **Passe novo de amigo**: `friend_score` sem score anterior agora diz "passou … pela primeira vez".
- **Lives da Twitch** (`friend_live`): quem preencheu a Twitch nas redes (visibilidade diferente de "Ninguém") é checado a cada 10 min (pg_cron → `twitch_tick` → função `twitch-live` → API Helix `streams`). Live nova (começou há até 2 h) gera notificação para os amigos; a notificação mostra "AO VIVO" enquanto a live está no ar e abre a Twitch. Tabelas `twitch_lives` e `twitch_check`. Precisa dos segredos `TWITCH_CLIENT_ID` e `TWITCH_CLIENT_SECRET` nas Edge Functions; sem eles a função não faz nada. Chave `twitch_live`.
- **Jogada sem score** (migração 092): o site da Pump às vezes manda jogada sem score e sem marca de quebra. Se o melhor score do chart foi feito nessa jogada, o score é recuperado (backfill + trigger `play_fill_score`); o que continuar sem score não conta como passe (dia de jogo e progresso).
- **Selo AO VIVO**: `lives_now()` devolve as lives em andamento que eu posso ver (a minha, a de amigos e a de quem deixou as redes para todos; some se a live ficar 25 min sem ser vista). Aparece na tela Online, na lista de jogadores e no perfil (com o título da live), e abre a Twitch. Hook `lib/lives.js` (uma busca compartilhada, renovada a cada 5 min).
- **Online agora** (UX nov/2026): visibilidade numa linha compacta; sugestões de x1 no topo e quem já está nelas não se repete na lista de baixo; filtros Todos / Amigos / No meu fliperama; cartão com PUMBILITY e maior nível na mesma linha, selos (AO VIVO, x1, amigo, time, ausente, fliperama) em uma faixa e botão Chamar compacto.

## Treino em casa (StepP1 / XSanity) — nov/2026, desligado
- **Liga/desliga:** chave `home_import` em Administração → Recursos, que **começa desligada** (única com padrão desligado: `DEFAULT_OFF` em `lib/plans.js`; no banco `home_import_on()` também é falso sem a chave). Desligada, nada aparece e as funções recusam.
- **Usuário:** com a chave ligada, aparece o grupo "Treino em casa" em Ajustes. A pessoa ativa (`user_settings.home_scores_on`) e escolhe **Separado** ou **Consolidar com a Phoenix 2** (`home_scores_mode`).
- **Importar** (`#/treino-casa`): a pessoa envia o `Stats.xml` do perfil (formato StepMania 5) e escolhe o simulador (StepP1, XSanity, StepF2, outro). O app lê no aparelho (`lib/homeScores.js`): música pela pasta (sem o número da frente), modo pelo StepsType e nível pelo `Meter` ou pela descrição (S21, D23…); melhor jogada sem quebra; grade calculada pelo score; judgments W1+W2 = perfect, W3 great, W4 good, W5 bad. Mostra o que bateu e o que não bateu antes de salvar (`save_home_scores`, fica o melhor por chart e simulador).
- **Separado:** recorde de casa só na tela Treino em casa e num cartão na página do chart.
- **Consolidado:** no app (`withHome`), quando o de casa é melhor, ele entra no lugar do da Phoenix 2 nas telas da própria pessoa (estatísticas, progresso, recomendações), marcado `fromHome`; o do fliperama fica em `arcade`. O servidor continua só com o fliperama (PUMBILITY oficial, missões, rankings, amigos).
- **Pendente:** validar o leitor com arquivos reais do StepP1 e do XSanity antes de ligar. O XSanity tem conta online (Saninet), sem API pública: perguntar à equipe se pode haver uma.
