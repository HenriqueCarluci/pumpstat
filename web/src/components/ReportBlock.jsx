import { useState } from 'react';
import { rpc } from '../lib/api.js';
import { t, tErr } from '../lib/i18n.js';
import { Flag, Ban } from './Icons.jsx';

const REASONS = [['spam', 'Spam'], ['abuse', 'Ofensa ou assédio'], ['cheating', 'Trapaça nas notas'], ['inappropriate', 'Conteúdo impróprio'], ['other', 'Outro']];

/** Botões "Denunciar" e "Bloquear" para um usuário (com contexto de onde veio a denúncia). */
export default function ReportBlock({ user, name, context, onBlocked, compact }) {
  const [mode, setMode] = useState(null); // 'report' | null
  const [reason, setReason] = useState('abuse');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const block = async () => {
    if (!window.confirm(t('Bloquear {who}? Vocês deixam de ser amigos, e essa pessoa não poderá te chamar, mandar mensagem ou ver você online.', { who: name || t('este jogador') }))) return;
    setBusy(true); setErr('');
    try { await rpc('block_user', { p_user: user, p_block: true }); setMsg(t('Jogador bloqueado.')); onBlocked?.(); } catch (e) { setErr(tErr(e.message)); }
    setBusy(false);
  };
  const report = async () => {
    setBusy(true); setErr('');
    try {
      await rpc('report_user', { p_user: user, p_reason: reason, p_details: details, p_context: context || {} });
      setMsg(t('Denúncia enviada. Obrigado por avisar.')); setMode(null); setDetails('');
    } catch (e) { setErr(tErr(e.message)); }
    setBusy(false);
  };

  return (
    <div className={`report-block ${compact ? 'compact' : ''}`}>
      {!mode && !msg && (
        <div className="bm-row">
          <button className="link small ic-row" onClick={() => setMode('report')}><Flag size={13} /> {t('Denunciar')}</button>
          <button className="link small ic-row danger" disabled={busy} onClick={block}><Ban size={13} /> {t('Bloquear')}</button>
        </div>
      )}
      {mode === 'report' && (
        <div className="report-form">
          <div className="chips">{REASONS.map(([k, l]) => <button key={k} className={reason === k ? 'on' : ''} onClick={() => setReason(k)}>{t(l)}</button>)}</div>
          <textarea rows={2} maxLength={1000} placeholder={t('Detalhes (opcional)')} value={details} onChange={(e) => setDetails(e.target.value)} />
          <div className="bm-row">
            <button className="btn" disabled={busy} onClick={report}>{t('Enviar denúncia')}</button>
            <button className="btn ghost" onClick={() => setMode(null)}>{t('Cancelar')}</button>
          </div>
        </div>
      )}
      {msg && <p className="muted small">{msg}</p>}
      {err && <div className="form-err">{err}</div>}
    </div>
  );
}
