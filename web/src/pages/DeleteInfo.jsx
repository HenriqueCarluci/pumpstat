// Página pública: como excluir a conta e os dados (link exigido pela Google Play).
import { t } from '../lib/i18n.js';

export default function DeleteInfo() {
  return (
    <div className="page privacy">
      <h2>{t('Excluir sua conta do PIU Stats')}</h2>
      <p>{t('Você pode apagar sua conta e todos os seus dados a qualquer momento, pelo app ou pelo site.')}</p>
      <h3>{t('Como excluir')}</h3>
      <ol>
        <li>{t('Abra o app PIU Stats ou o site piustats.com.br e entre na sua conta.')}</li>
        <li>{t('Vá em Configurações e toque em "Excluir conta".')}</li>
        <li>{t('Confirme digitando o texto pedido. A exclusão é imediata.')}</li>
      </ol>
      <p>{t('Sem acesso à conta? Fale com a gente pelo e-mail de contato da nossa página na Google Play, a partir do e-mail cadastrado, e excluímos em até 30 dias.')}</p>
      <h3>{t('Apagar só os dados de jogo')}</h3>
      <p>{t('Para apagar seus recordes, jogadas e histórico sem excluir a conta, vá em Ajustes e toque em “Desconectar conta da Pump”. Amigos, time e preferências continuam na sua conta do PIU Stats. Para apagar outros dados específicos, fale com o suporte pelo app.')}</p>
      <h3>{t('O que é apagado')}</h3>
      <p>{t('Sua conta de login, a ligação com o AM.PASS, sessões salvas, recordes e jogadas sincronizados, histórico, amizades, mensagens e convites, avaliações, votos, participação em desafios, fila e preferências.')}</p>
      <h3>{t('O que pode ficar')}</h3>
      <p>{t('Registros mínimos exigidos por lei, como comprovantes de pagamento de assinaturas, pelo prazo legal. Nada disso fica ligado ao seu perfil público.')}</p>
      <p><a href="#/privacidade">{t('Política de privacidade')}</a></p>
    </div>
  );
}
