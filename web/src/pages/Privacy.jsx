import { getLang } from '../lib/i18n.js';

// Política de privacidade (pública, sem login). Português e inglês; os outros idiomas mostram a versão em inglês.
const PT = {
  title: 'Política de privacidade do StepClub',
  updated: 'Atualizada em 26 de novembro de 2026',
  sections: [
    ['Quem somos', 'O StepClub é um app independente para jogadores de Pump It Up, sem vínculo com a Andamiro. Ele mostra seus recordes, ajuda a organizar filas nos fliperamas e a jogar com amigos.'],
    ['O que coletamos', 'E-mail e dados de login (ou da conta Google que você usar para entrar). Dados da sua conta Pump It Up que você pede para importar: nickname, título, avatar, recordes, jogadas recentes, títulos e PUMBILITY. Sua localização apenas no momento do check-in na fila, para conferir se você está no fliperama; ela não é guardada depois da conferência. Mensagens, convites, avaliações de charts, denúncias e mensagens ao suporte que você enviar. Informações técnicas do aparelho, só quando você escolhe incluí-las ao falar com o suporte.'],
    ['Senha da Pump It Up', 'A senha do AM.PASS é usada apenas para entrar no piugame.com no momento da sincronização e nunca é gravada. Guardamos somente a sessão do site, criptografada, para a sincronização funcionar sem pedir a senha de novo. Você pode apagar a sessão a qualquer momento entrando com outra conta ou excluindo sua conta.'],
    ['Como usamos', 'Para mostrar suas estatísticas, recomendações e tier; para amigos que você aprovou verem suas notas; para mostrar você como online (você pode ficar invisível em "Online agora"); para notificações dentro do app; para moderar denúncias e responder ao suporte. Não vendemos seus dados e não usamos seus dados para publicidade.'],
    ['Quem vê o quê', 'Suas notas só aparecem para amigos que você aprovou. Na lista de online e na busca aparecem nick, título, avatar, PUMBILITY e o maior nível passado. Comentários em charts são visíveis para usuários logados. Administradores do StepClub podem ver dados da conta para suporte e moderação.'],
    ['Serviços de terceiros', 'Supabase (banco de dados e login), Render (hospedagem), Google (login com Google), FormSubmit (envio de e-mails do suporte), piugame.com (origem dos seus dados de jogo), PIU Scores e piucenter (catálogo e estilo dos charts) e YouTube (links de vídeo).'],
    ['Seus direitos', 'Você pode ver e corrigir seus dados no app, bloquear e denunciar usuários, ficar invisível e excluir sua conta em Ajustes → Excluir minha conta. A exclusão apaga a conta e todos os dados ligados a ela de forma definitiva. Para outras solicitações, use Ajustes → Falar com o suporte.'],
    ['Crianças', 'O StepClub não é direcionado a menores de 13 anos.'],
    ['Mudanças', 'Se esta política mudar, a data acima é atualizada e avisamos no app quando a mudança for relevante.'],
  ],
};
const EN = {
  title: 'StepClub privacy policy',
  updated: 'Last updated November 26, 2026',
  sections: [
    ['Who we are', 'StepClub is an independent app for Pump It Up players, not affiliated with Andamiro. It shows your scores, helps organize arcade queues and lets you play with friends.'],
    ['What we collect', 'Your e-mail and sign-in data (or the Google account you sign in with). Pump It Up account data you ask us to import: nickname, title, avatar, best scores, recent plays, titles and PUMBILITY. Your location only at queue check-in, to confirm you are at the arcade; it is not stored afterwards. Messages, invites, chart reviews, reports and support messages you send. Device information, only when you choose to include it in a support message.'],
    ['Your Pump It Up password', 'Your AM.PASS password is used only to sign in to piugame.com during a sync and is never stored. We keep only the encrypted site session so syncing works without asking for the password again. You can remove it anytime by signing in with another account or deleting your account.'],
    ['How we use it', 'To show your stats, recommendations and tiers; to let friends you approved see your scores; to show you as online (you can go invisible in "Online now"); for in-app notifications; to handle reports and answer support. We do not sell your data and do not use it for advertising.'],
    ['Who sees what', 'Your scores are visible only to friends you approved. The online list and search show nickname, title, avatar, PUMBILITY and highest level cleared. Chart comments are visible to signed-in users. StepClub administrators can see account data for support and moderation.'],
    ['Third-party services', 'Supabase (database and sign-in), Render (hosting), Google (Google sign-in), FormSubmit (support e-mails), piugame.com (source of your game data), PIU Scores and piucenter (chart catalog and styles) and YouTube (video links).'],
    ['Your rights', 'You can view and correct your data in the app, block and report users, go invisible and delete your account under Settings → Delete my account. Deletion permanently removes your account and all data linked to it. For anything else, use Settings → Contact support.'],
    ['Children', 'StepClub is not directed to children under 13.'],
    ['Changes', 'If this policy changes, the date above is updated and we notify you in the app when the change is relevant.'],
  ],
};

export default function Privacy() {
  const doc = getLang() === 'pt' ? PT : EN;
  return (
    <div className="page privacy">
      <h1>{doc.title}</h1>
      <p className="muted small">{doc.updated}</p>
      {doc.sections.map(([h, p]) => (
        <section key={h}><h3>{h}</h3><p>{p}</p></section>
      ))}
    </div>
  );
}
