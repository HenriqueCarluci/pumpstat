# StepClub nas lojas (Capacitor)

O app nativo usa o Capacitor 8: os arquivos do site (`dist/`) vão dentro do app, numa webview nativa.
Pacote: `com.henriquecarluci.stepclub` (dá para trocar em `capacitor.config.json` **antes** da primeira publicação; depois não muda mais).

## O que já está pronto
- Pastas `android/` (alvo Android 16 / API 36) e `ios/`.
- Ícone e tela de abertura gerados a partir de `assets/` (`npx @capacitor/assets generate --android --ios`).
- Login com Google abre no navegador do sistema e volta para o app por `com.henriquecarluci.stepclub://auth` (o Google bloqueia login dentro de webview).
- Localização nativa no check-in da fila (permissões no AndroidManifest e no Info.plist, com o texto de uso).
- Botão voltar do Android, barra de status escura, splash.
- A API aceita as origens do app (`https://localhost` no Android e `capacitor://localhost` no iOS).

## Toda vez que mudar o código
```bash
npm run app:sync          # build do site + copia para android/ e ios/
```

## Android (no Windows)
1. Instale o Android Studio (já vem com o Java).
2. Na pasta do projeto: `npm install` e `npm run app:android` (abre o Android Studio).
3. Teste num celular: ative a depuração USB no aparelho e clique em ▶ Run.
4. Para a loja: Build → Generate Signed App Bundle → crie a chave (keystore). **Guarde a keystore e as senhas em lugar seguro**: sem elas não dá para publicar atualizações.
5. No Play Console: crie o app, preencha a ficha (descrição, prints, classificação etária, segurança de dados, link da política de privacidade `https://stepclub.onrender.com/#/privacidade`), envie o `.aab` para o **teste fechado** com 12 testadores por 14 dias (exigido para contas pessoais novas) e depois peça a produção.

## iOS (precisa de Mac ou build na nuvem)
- Com Mac: `npm run app:ios`, abrir no Xcode, escolher o Team (conta Apple Developer), Product → Archive → enviar ao App Store Connect.
- Sem Mac: Codemagic (ou similar) conectado ao GitHub gera e envia o build.
- Na revisão da Apple: informe uma conta de teste (e-mail e senha do StepClub com dados já sincronizados) nas notas da revisão e destaque os recursos que vão além do site (check-in por localização, fila em tempo real, convites/chat, sincronização com o jogo).

## Configurações externas
- Supabase → Authentication → URL Configuration → Redirect URLs: incluir `com.henriquecarluci.stepclub://auth`.
- Próximos plugins: push (`@capacitor/push-notifications` + Firebase/APNs) e compras nas lojas (assinaturas Plus/Pro).
