#!/usr/bin/env bash
# O piugame.com não envia o certificado intermediário. O Chrome do PC busca sozinho; o Android não
# ("Trust anchor for certification path not found"), então capas e ícones não baixam no app.
# Aqui buscamos o intermediário indicado no próprio certificado (AIA "CA Issuers") e gravamos em
# res/raw/piu_ca.pem; o network_security_config do app confia nele só para piugame.com e am-pass.net.
set -u
out="${1:-android/app/src/main/res/raw/piu_ca.pem}"
mkdir -p "$(dirname "$out")"
: > "$out"
tmp=$(mktemp -d)
for h in piugame.com phoenix.piugame.com am-pass.net; do
  leaf=$(echo | timeout 25 openssl s_client -connect "$h:443" -servername "$h" 2>/dev/null | openssl x509 2>/dev/null) || continue
  [ -n "$leaf" ] || continue
  url=$(echo "$leaf" | openssl x509 -noout -ext authorityInfoAccess 2>/dev/null | sed -n 's/.*CA Issuers - URI:\(.*\)/\1/p' | head -1 | tr -d '[:space:]')
  [ -n "$url" ] || { echo "$h: sem AIA"; continue; }
  curl -fsSL --max-time 25 "$url" -o "$tmp/ca.bin" || { echo "$h: falhou ao baixar $url"; continue; }
  if openssl x509 -inform DER -in "$tmp/ca.bin" -out "$tmp/ca.pem" 2>/dev/null \
    || openssl x509 -in "$tmp/ca.bin" -out "$tmp/ca.pem" 2>/dev/null \
    || openssl pkcs7 -inform DER -in "$tmp/ca.bin" -print_certs -out "$tmp/ca.pem" 2>/dev/null; then
    echo "$h -> $(openssl x509 -in "$tmp/ca.pem" -noout -subject 2>/dev/null)"
    grep -q "$(sed -n 2p "$tmp/ca.pem")" "$out" 2>/dev/null || cat "$tmp/ca.pem" >> "$out"
  fi
done
rm -rf "$tmp"
if [ ! -s "$out" ]; then echo "::error::Não consegui buscar o certificado intermediário do piugame.com"; exit 1; fi
echo "certificados gravados em $out: $(grep -c 'BEGIN CERTIFICATE' "$out")"
