import { useState } from 'react';
import { t } from '../lib/i18n.js';

const WORD = 'DESCONECTAR';

/**
 * Desconectar a conta da Pump pede 3 confirmações: abrir o aviso, confirmar que entendeu o que será apagado
 * e digitar DESCONECTAR. Usado em Ajustes (a própria conta) e no Admin → Usuários (conta de outra pessoa).
 */
export default function UnlinkConfirm({ who, busy, onConfirm, label }) {
  const [step, setStep] = useState(0);
  const [typed, setTyped] = useState('');
  const reset = () => { setStep(0); setTyped(''); };
  if (step === 0) {
    return <button type="button" className="btn ghost danger-text" disabled={busy} onClick={() => setStep(1)}>{label || t('Desconectar conta da Pump')}</button>;
  }
  return (
    <div className="unlink-confirm">
      <b>{t('Desconectar a conta da Pump (AM.PASS){w}?', { w: who ? ` ${t('de {n}', { n: who })}` : '' })}</b>
      <p className="small">{t('As notas, jogadas e o histórico importados da Pump saem do PIU Stats. Amigos, time, ajustes e lista de treino continuam. Para ter as notas de volta, é preciso conectar e sincronizar de novo.')}</p>
      {step === 1 && (
        <div className="card-actions">
          <button type="button" className="btn danger sm" onClick={() => setStep(2)}>{t('Sim, continuar')}</button>
          <button type="button" className="btn ghost sm" onClick={reset}>{t('Cancelar')}</button>
        </div>
      )}
      {step === 2 && (
        <>
          <label className="field small">{t('Para confirmar, digite {w}', { w: WORD })}
            <input value={typed} onChange={(e) => setTyped(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" placeholder={WORD} />
          </label>
          <div className="card-actions">
            <button type="button" className="btn danger sm" disabled={busy || typed.trim() !== WORD}
              onClick={async () => { await onConfirm(); reset(); }}>
              {busy ? t('Aguarde…') : t('Desconectar agora')}
            </button>
            <button type="button" className="btn ghost sm" onClick={reset}>{t('Cancelar')}</button>
          </div>
        </>
      )}
    </div>
  );
}
