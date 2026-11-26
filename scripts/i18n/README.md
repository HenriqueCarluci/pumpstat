# Traduções do PIU Stats

O app usa o texto em português como chave (`t('Músicas')`).

1. `python3 scripts/i18n-keys.py /tmp/keys.json` lista todas as chaves usadas no app, nas constantes e nas mensagens do servidor.
2. Cada linha de `part*.txt` tem `pt | en | es | ko | ja | fr | it`.
3. `python3 scripts/i18n-build.py /tmp/keys.json` gera `web/src/lib/locales/*.json` e mostra o que falta traduzir e placeholders (`{n}`) trocados.
