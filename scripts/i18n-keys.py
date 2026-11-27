# Lista todas as chaves de tradução (texto em português) usadas no app.
import json, re, glob, sys
keys = []
def add(k):
    if k and k not in keys: keys.append(k)
src = sorted(glob.glob('web/src/**/*.js*', recursive=True))
call = re.compile(r"""\bt[n]?\(\s*(?:[^,()]+,\s*)?(['"])((?:\\.|(?!\1).)*)\1""")
for f in src:
    s = open(f, encoding='utf-8').read()
    for m in re.finditer(r"""\bt\(\s*(['"])((?:\\.|(?!\1).)*)\1""", s): add(m.group(2).replace("\\'", "'"))
    for m in re.finditer(r"""\btn\([^,]+,\s*(['"])((?:\\.|(?!\1).)*)\1\s*,\s*(['"])((?:\\.|(?!\3).)*)\3""", s):
        add(m.group(2)); add(m.group(4))
# textos que vêm de constantes ou do servidor e passam por t()/tErr()/tMsg() na tela
extra_files = ['web/src/lib/piu.js', 'web/src/lib/style.js', 'web/src/components/ChartReviews.jsx', 'web/src/pages/Queue.jsx',
               'web/src/lib/presence.js', 'web/src/pages/Online.jsx', 'web/src/lib/auth.js', 'web/src/lib/queue.js']
pat = {
  'web/src/lib/piu.js': [r"label: '([^']+)'", r"(?:VeryHard|Hard|Medium|Easy|VeryEasy|Underrated|Overrated|Unrecorded): '([^']+)'", r"\[-?\d, '([^']+)'\]", r"name: '(SEM FAIXA)'"],
  'web/src/lib/style.js': [r"label: '([^']+)'", r"tip: '([^']+)'", r"[\w'-]+: '([^']+)',?"],
  'web/src/components/ChartReviews.jsx': [r"\['\w+', '([^']+)'\]"],
  'web/src/pages/Queue.jsx': [r"(?:join|pass|leave|away|back|remove|reset|expire): '([^']+)'"],
  'web/src/lib/presence.js': [r"'([^']+\?|[^']+!)'"],
  'web/src/pages/Online.jsx': [r"\['(Bom x1|Nível parecido)'"],
  'web/src/lib/auth.js': [r"': '([^']+)'", r"\|\| '([^']+)'"],
  'web/src/lib/queue.js': [r"Error\('([^']+)'\)", r"\? '([^']+)'", r": '([^']+)'\)"],
  'web/src/pages/Progress.jsx': [r"(?m)^  \w+: '([^']+)',$", r"\['(?:speed|stamina)', '([^']+)'\]", r"(?:warm|focus|consolidate|challenge|score): '([^']+)'"],
  'web/src/lib/plans.js': [r"label: '([^']+)'"],
  'web/src/lib/quiz.js': [r"q: '([^']+)'", r"hint: '([^']+)'", r"\['\w+', '([^']+)'\]"],
  'web/src/components/QuizModal.jsx': [r"\w+: '([A-ZÀ-Ú][^']+)'"],
  'web/src/lib/admin.js': [r"\['\w+', '([A-ZÀ-Ú][^']+)'", r"', '([^']{20,})'\]"],
}
for f, ps in pat.items():
    s = open(f, encoding='utf-8').read()
    for p in ps:
        for m in re.finditer(p, s):
            v = m.group(1)
            if re.search(r'[a-zà-ú]{3}', v, re.I) and not v.startswith(('http', 'linear', '#', 'stepclub:')): add(v)
for f in glob.glob('server/*.js'):
    s = open(f, encoding='utf-8').read()
    for m in re.finditer(r"(?:error|message): '([^']+)'|new Error\('([^']+)'\)|message = '([^']+)'", s):
        add(next(g for g in m.groups() if g))
for f in sorted(glob.glob('supabase/migrations/*.sql')):
    s = open(f, encoding='utf-8').read()
    for m in re.finditer(r"raise exception '((?:''|[^'])+)'", s): add(m.group(1).replace("''", "'"))
JUNK = {'top', 'high', 'mid', 'low', 'bottom', 'twist', 'drill', 'run', 'bracket', 'jump', 'jack', 'doublestep', 'footswitch',
        'application/json', 'null', 'not found', 'payload grande demais', 'chave de ingestão inválida', 'chave inválida',
        'chave de sincronização inválida', 'formato do export do PIU Scores mudou', 'session_expired'}
keys = [k for k in keys if k not in JUNK and re.search(r'[a-zà-ú]{2}', k, re.I) and not re.search(r'(?<!})%', k)]
json.dump(keys, open(sys.argv[1], 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print(len(keys))
