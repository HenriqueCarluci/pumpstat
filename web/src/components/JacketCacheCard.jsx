import { useEffect, useState } from 'react';
import { useData } from '../App.jsx';
import {
  downloadJackets, estimateBytes, jacketMode, jacketModeChosen, jacketsRunning, jacketUrls, lastJacketRun, onCellular,
  pendingJackets, resetJacketHistory, setJacketMode, stopJackets, unavailableJackets,
} from '../lib/jacketCache.js';
import { clearImgStore, storedBytes, storedCount } from '../lib/imgStore.js';
import { t } from '../lib/i18n.js';
import { isNative } from '../lib/native.js';
import { CircleCheck, ImagePlus, Pause, Trash2, Wifi, WifiOff } from './Icons.jsx';
import { Chips } from '../pages/Songs.jsx';

const mb = (b) => (b >= 1e6 ? `${Math.max(1, Math.round(b / 1e6))} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
const dur = (s) => (s >= 60 ? t('{m} min {s} s', { m: Math.floor(s / 60), s: s % 60 }) : t('{s} s', { s }));

/**
 * Só no app: escolher se as imagens são salvas conforme aparecem ou todas de uma vez, ver o progresso,
 * quanto ocupam e apagar. Na Início aparece até a pessoa escolher (e mostra o progresso de quem acabou de tocar).
 */
export default function JacketCacheCard({ where = 'settings' }) {
  const { data } = useData();
  const [mode, setMode] = useState(jacketMode);
  const [chosen, setChosen] = useState(jacketModeChosen);
  const [hideHome, setHideHome] = useState(jacketModeChosen);
  const [prog, setProg] = useState(null);
  const [result, setResult] = useState(null); // resultado do download feito agora (para a mensagem de "pronto")
  const [confirmClear, setConfirmClear] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [, setTick] = useState(0);

  const follow = (p) => p.then((r) => { setProg(null); setResult(r); setTick((x) => x + 1); });
  useEffect(() => { if (jacketsRunning()) follow(downloadJackets(data, (n, tot) => setProg([n, tot]))); }, []); // eslint-disable-line
  useEffect(() => {
    const on = () => setOnline(true); const off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  if (!isNative || !data || (where === 'home' && hideHome)) return null;
  if (where === 'home' && chosen && mode === 'lazy' && !prog) return null;

  const start = (retry = false) => follow(downloadJackets(data, (n, tot) => setProg([n, tot]), { retry }));
  const pick = (m) => {
    setJacketMode(m); setMode(m); setChosen(true); setResult(null);
    if (m === 'all') start();
    else stopJackets();
  };
  const all = jacketUrls(data);
  const pending = pendingJackets(data);
  const unavailable = unavailableJackets(data);
  const saved = storedCount();
  const cellular = onCellular();
  const last = lastJacketRun();
  const pct = prog && prog[1] ? Math.round((prog[0] / prog[1]) * 100) : 0;

  const clear = async () => {
    stopJackets();
    await clearImgStore();
    resetJacketHistory();
    setConfirmClear(false); setResult({ cleared: true }); setTick((x) => x + 1);
  };

  return (
    <section className="card jcache">
      <h3 className="ic-row"><ImagePlus size={18} /> {t('Imagens do app')}</h3>
      <p className="small muted">{t('Capas, níveis, notas, plates, ícones de PUMBILITY e fotos dos amigos ficam salvos no aparelho e aparecem na hora, mesmo com internet ruim.')}</p>

      {where === 'home' && !chosen ? (
        <>
          <div className="card-actions">
            <button className="btn" onClick={() => pick('all')}>{t('Baixar todas (cerca de {mb})', { mb: mb(estimateBytes(pending)) })}</button>
            <button className="btn ghost" onClick={() => pick('lazy')}>{t('Só as que aparecerem')}</button>
          </div>
          <small className="muted tiny">{cellular ? t('Você está nos dados móveis: se preferir, baixe todas depois, no Wi-Fi.') : t('Dá para mudar depois em Ajustes.')}</small>
        </>
      ) : (
        <>
          <Chips value={mode} onChange={pick} options={[['lazy', t('Conforme aparecem')], ['all', t('Todas de uma vez')]]} />
          <small className="muted">
            {mode === 'lazy'
              ? t('Cada imagem é salva na primeira vez que aparece. Gasta menos dados.')
              : t('Baixa tudo agora e as imagens novas sozinho, no Wi-Fi.')}
          </small>
        </>
      )}

      {prog ? (
        <div className="jcache-prog">
          <div className="jcache-bar"><span style={{ width: `${prog[1] ? pct : 100}%` }} /></div>
          <div className="jcache-row">
            <small className="muted">{prog[1] ? t('Baixando {n} de {t} ({p}%)', { n: prog[0], t: prog[1], p: pct }) : t('Preparando o download…')}</small>
            <button type="button" className="btn ghost sm" onClick={stopJackets}><Pause size={14} /> {t('Pausar')}</button>
          </div>
          <small className="muted tiny">{t('Pode usar o app normalmente enquanto baixa.')}</small>
        </div>
      ) : (
        <div className="jcache-prog">
          {!online ? (
            <small className="jcache-msg"><WifiOff size={15} /> {t('Sem internet agora. O download continua quando a conexão voltar.')}</small>
          ) : result?.cleared ? (
            <small className="jcache-msg"><CircleCheck size={15} /> {t('Imagens apagadas. Elas voltam a ser salvas conforme aparecem.')}</small>
          ) : result && !result.offline && result.stopped ? (
            <small className="jcache-msg"><Pause size={15} /> {t('Pausado. Faltam {n} imagens.', { n: pending.length })}</small>
          ) : result && !result.offline && !result.stopped && result.total > 0 && !pending.length ? (
            <small className="jcache-msg ok"><CircleCheck size={15} /> {t('Pronto! {n} imagens salvas em {d}.', { n: result.ok, d: dur(result.sec) })}</small>
          ) : mode === 'all' && !pending.length ? (
            <small className="jcache-msg ok"><CircleCheck size={15} /> {t('Todas as imagens estão no aparelho.')}</small>
          ) : null}

          {mode === 'all' && online && pending.length > 0 && (
            <>
              <small className="muted">
                {cellular
                  ? <><Wifi size={14} /> {t('Faltam {n} imagens (cerca de {mb}). Para não gastar seus dados móveis, elas baixam sozinhas no Wi-Fi.', { n: pending.length, mb: mb(estimateBytes(pending)) })}</>
                  : t('Faltam {n} imagens (cerca de {mb}).', { n: pending.length, mb: mb(estimateBytes(pending)) })}
              </small>
              <button type="button" className="btn ghost" onClick={() => start()}>{cellular ? t('Baixar agora mesmo assim') : t('Baixar agora')}</button>
            </>
          )}

          {unavailable.length > 0 && online && (
            <small className="muted tiny">
              {t('{n} imagens não estão disponíveis no site da Pump agora; o app tenta de novo em alguns dias.', { n: unavailable.length })}{' '}
              <button type="button" className="linkish" onClick={() => start(true)}>{t('Tentar agora')}</button>
            </small>
          )}

          {where === 'settings' && saved > 0 && (
            <div className="jcache-row">
              <small className="muted">{t('{n} de {t} imagens salvas · ocupam {mb}', { n: saved, t: Math.max(saved, all.length), mb: mb(storedBytes()) })}</small>
              {!confirmClear && <button type="button" className="btn ghost sm" onClick={() => setConfirmClear(true)}><Trash2 size={14} /> {t('Apagar')}</button>}
            </div>
          )}
          {confirmClear && (
            <div className="jcache-confirm">
              <small>{t('Apagar as {n} imagens salvas? Elas voltam a ser baixadas quando aparecerem.', { n: saved })}</small>
              <div className="card-actions">
                <button type="button" className="btn danger sm" onClick={clear}>{t('Apagar imagens')}</button>
                <button type="button" className="btn ghost sm" onClick={() => setConfirmClear(false)}>{t('Cancelar')}</button>
              </div>
            </div>
          )}
          {where === 'settings' && !result && mode === 'all' && last?.total > 0 && !last.stopped && !last.offline && (
            <small className="muted tiny">{t('Último download: {n} imagens em {d}.', { n: last.ok, d: dur(last.sec) })}</small>
          )}
          {where === 'home' && chosen && !pending.length && (
            <button type="button" className="btn ghost sm" onClick={() => setHideHome(true)}>{t('Ok')}</button>
          )}
        </div>
      )}
    </section>
  );
}
