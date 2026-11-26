# Junta scripts/i18n/part*.txt (pt | en | es | ko | ja | fr | it) em web/src/lib/locales/*.json e confere cobertura.
import json, re, glob, sys
LANGS = ['en', 'es', 'ko', 'ja', 'fr', 'it']
rows = {}
for f in sorted(glob.glob('scripts/i18n/part*.txt')):
    for n, line in enumerate(open(f, encoding='utf-8'), 1):
        line = line.rstrip('\n')
        if not line.strip() or line.startswith('#'): continue
        cols = [c.strip() for c in line.split(' | ')]
        if len(cols) != 7: print(f'{f}:{n}: {len(cols)} colunas'); continue
        rows[cols[0]] = cols[1:]
ph = lambda s: sorted(re.findall(r'\{\w+\}', s))
bad = 0
for k, vals in rows.items():
    for l, v in zip(LANGS, vals):
        if ph(k) != ph(v): print('placeholder', l, k, '=>', v); bad += 1
keys = json.load(open(sys.argv[1], encoding='utf-8')) if len(sys.argv) > 1 else list(rows)
missing = [k for k in keys if k not in rows]
for l_i, l in enumerate(LANGS):
    json.dump({k: rows[k][l_i] for k in rows}, open(f'web/src/lib/locales/{l}.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=0, sort_keys=True)
print(f'{len(rows)} textos, {len(missing)} sem tradução, {bad} placeholders errados')
for m in missing: print('  falta:', m)
