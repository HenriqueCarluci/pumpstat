import { twitchUrl } from '../lib/notify.js';
import { t } from '../lib/i18n.js';

/** Selo AO VIVO: abre a live na Twitch. `live` vem de useLives(). */
export default function LiveBadge({ live, big = false }) {
  if (!live) return null;
  return (
    <a className={`live-badge${big ? ' big' : ''}`} href={twitchUrl(live.login)} target="_blank" rel="noopener noreferrer"
      title={live.title || t('Assistir na Twitch')} onClick={(e) => e.stopPropagation()}>
      <i aria-hidden /> {t('AO VIVO')}{big && live.title ? <span className="live-title">{live.title}</span> : null}
    </a>
  );
}
