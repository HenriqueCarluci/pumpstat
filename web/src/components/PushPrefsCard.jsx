import { useEffect, useState } from 'react';
import { useData } from '../App.jsx';
import { rpc } from '../lib/api.js';
import { t, tErr } from '../lib/i18n.js';
import { disablePush, enablePush, pushStatus, refreshPush } from '../lib/push.js';
import { Bell } from './Icons.jsx';
import { backgroundStatus, openBatterySettings, openNotificationSettings } from '../lib/nativePush.js';

/**
 * Só no app Android: avisos com o app fechado. Os avisos chegam pelo Firebase mesmo com o app fechado,
 * mas a economia de bateria de alguns aparelhos (Xiaomi, Samsung, Motorola…) segura ou atrasa. Mostra a
 * situação e leva às telas do sistema para liberar o PIU Stats.
 */
function BackgroundCard() {
  const [bg, setBg] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    const check = () => backgroundStatus().then(setBg);
    check();
    const f = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, []);
  if (!bg) return null;
  const free = bg.batteryFree && !bg.restricted;
  const open = async (fn) => { setErr(''); try { await fn(); } catch (e) { setErr(tErr(e.message)); } };
  return (
    <div className="push-bg">
      <div className="rv-label">{t('Com o app fechado')}</div>
      <p className="small">
        {!bg.notifications ? <b className="warn-text">{t('As notificações do PIU Stats estão desligadas no Android.')}</b>
          : free ? <b className="ok">{t('Liberado: os avisos chegam mesmo com o app fechado.')}</b>
            : <b className="warn-text">{t('A economia de bateria pode atrasar ou segurar os avisos quando o app está fechado.')}</b>}
      </p>
      {!free && bg.notifications && (
        <p className="muted tiny">{t('Toque em Liberar em segundo plano, abra Bateria e escolha Sem restrições (ou Não otimizar). Não use Forçar parada: ela bloqueia os avisos até você abrir o app de novo.')}</p>
      )}
      <div className="bm-row">
        {!free && <button type="button" className="btn sm" onClick={() => open(openBatterySettings)}>{t('Liberar em segundo plano')}</button>}
        <button type="button" className="btn ghost sm" onClick={() => open(openNotificationSettings)}>{t('Sons e alertas do Android')}</button>
      </div>
      {err && <div className="form-err">{err}</div>}
    </div>
  );
}

// categorias (iguais às do banco: push_category)
const CATS = [
  ['chat', 'Mensagens', 'Quando alguém te manda mensagem.'],
  ['invites', 'Convites para jogar', 'Chamados para um x1 ou para o fliperama.'],
  ['friends', 'Amizades', 'Pedidos de amizade e quem aceitou o seu.'],
  ['team', 'Time', 'Pedidos para entrar e novidades do seu time.'],
  ['app', 'App e suporte', 'Versão nova do app e respostas aos seus reports.'],
  ['other', 'Desafios, selos e votações', 'Resultados e conquistas.'],
  ['friends_activity', 'Atividade dos amigos', 'Amigo ao vivo ou subindo de PUMBILITY. Avisa bastante.'],
];
const HOURS = Array.from({ length: 24 }, (_, h) => [h, `${String(h).padStart(2, '0')}:00`]);

/** Ajustes → Notificações: ligar o push neste aparelho, escolher o que avisa e o horário de silêncio. */
export default function PushPrefsCard() {
  const { session, plan } = useData();
  const [st, setSt] = useState(null);
  const [prefs, setPrefs] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);

  const status = pushStatus;
  useEffect(() => {
    status().then((v) => { setSt(v); if (v === 'on') refreshPush(); }).catch(() => setSt('unsupported'));
    if (session) rpc('push_prefs_get').then(setPrefs).catch(() => setPrefs(null));
  }, [session?.user?.id]); // eslint-disable-line
  if (!session || !st) return null;

  const save = async (next) => {
    setPrefs(next); setSaved(false);
    try {
      await rpc('push_prefs_set', { p_off: next.off, p_quiet: next.quiet, p_from: next.quiet_from, p_to: next.quiet_to,
        p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo' });
      setSaved(true);
    } catch (e) { setErr(tErr(e.message)); }
  };
  const toggleCat = (c) => {
    const off = new Set(prefs.off || []);
    if (off.has(c)) off.delete(c); else off.add(c);
    save({ ...prefs, off: [...off] });
  };
  const turn = async () => {
    setBusy(true); setErr('');
    try {
      if (st === 'on') await disablePush();
      else await enablePush();
      setSt(await status());
    } catch (e) { setErr(tErr(e.message)); setSt(await status().catch(() => st)); }
    setBusy(false);
  };
  const cats = CATS.concat(plan?.admin ? [['admin', 'Administração', 'Usuários novos e pedidos para aprovar.']] : []);

  return (
    <section className="card push-prefs">
      <h3 className="ic-row"><Bell size={18} /> {t('Notificações')}</h3>
      <div className="push-dev">
        <div className="small">
          {st === 'on' ? <b className="ok">{t('Ligadas neste aparelho')}</b>
            : st === 'native' ? t('Atualize o app para receber os avisos no Android.')
              : st === 'ios-install' ? t('No iPhone, os avisos só funcionam com o PIU Stats na Tela de Início: toque em Compartilhar → Adicionar à Tela de Início e ative por lá.')
                : st === 'denied' ? t('As notificações estão bloqueadas para o PIU Stats. Libere nas configurações do aparelho ou do navegador.')
                  : st === 'unsupported' ? t('Este navegador não recebe notificações.')
                    : t('Desligadas neste aparelho.')}
        </div>
        {(st === 'on' || st === 'off') && (
          <button type="button" className={`btn ${st === 'on' ? 'ghost' : ''}`} disabled={busy} onClick={turn}>
            {busy ? '…' : st === 'on' ? t('Desligar') : t('Ativar')}
          </button>
        )}
      </div>
      <p className="muted tiny">{t('A fila sempre avisa quando você é o próximo e quando chega a sua vez.')}</p>
      {st === 'on' && <BackgroundCard />}

      {prefs && (
        <>
          <div className="rv-label">{t('O que avisar')}</div>
          <div className="push-cats">
            {cats.map(([c, l, d]) => (
              <label key={c} className="check">
                <input type="checkbox" checked={!(prefs.off || []).includes(c)} onChange={() => toggleCat(c)} />
                <span><b>{t(l)}</b><br /><small className="muted">{t(d)}</small></span>
              </label>
            ))}
          </div>
          <label className="check push-quiet">
            <input type="checkbox" checked={!!prefs.quiet} onChange={(e) => save({ ...prefs, quiet: e.target.checked })} />
            <span><b>{t('Horário de silêncio')}</b><br /><small className="muted">{t('Sem avisos nesse horário (a fila continua avisando).')}</small></span>
          </label>
          {prefs.quiet && (
            <div className="push-hours">
              <span className="small">{t('De')}</span>
              <select value={prefs.quiet_from} onChange={(e) => save({ ...prefs, quiet_from: Number(e.target.value) })}>
                {HOURS.map(([h, l]) => <option key={h} value={h}>{l}</option>)}
              </select>
              <span className="small">{t('até')}</span>
              <select value={prefs.quiet_to} onChange={(e) => save({ ...prefs, quiet_to: Number(e.target.value) })}>
                {HOURS.map(([h, l]) => <option key={h} value={h}>{l}</option>)}
              </select>
            </div>
          )}
          {saved && <small className="muted tiny">{t('Salvo')}</small>}
        </>
      )}
      {err && <div className="form-err">{err}</div>}
    </section>
  );
}
