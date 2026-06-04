#!/bin/bash
# Esegui questo script UNA VOLTA sul server per ottenere il primo certificato.
# Prerequisiti: DOMAIN e LETSENCRYPT_EMAIL impostati in .env, porta 80 aperta.
set -euo pipefail

# Carica variabili da .env
set -a; source .env; set +a

DOMAIN="${DOMAIN:?Imposta DOMAIN in .env (es. miodominio.example.com)}"
EMAIL="${LETSENCRYPT_EMAIL:?Imposta LETSENCRYPT_EMAIL in .env}"
STAGING="${LETSENCRYPT_STAGING:-0}"

CERT_PATH="./certbot/conf/live/$DOMAIN"

echo "==> Inizializzazione HTTPS per: $DOMAIN"
mkdir -p "$CERT_PATH" ./certbot/www

# Crea un certificato temporaneo self-signed per permettere a nginx di avviarsi
echo "==> Certificato temporaneo..."
openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout "$CERT_PATH/privkey.pem" \
    -out "$CERT_PATH/fullchain.pem" \
    -subj "/CN=$DOMAIN" 2>/dev/null

# Avvia lo stack con il certificato temporaneo
echo "==> Avvio backend..."
docker compose up -d backend

echo "==> Attesa backend healthy..."
until docker compose exec backend curl -sf http://localhost:5001/ > /dev/null 2>&1; do
    sleep 3
done

echo "==> Avvio frontend (nginx)..."
docker compose up -d frontend

sleep 5

# Rimuovi il certificato temporaneo
rm -rf "$CERT_PATH"

# Ottieni il certificato reale tramite ACME webroot challenge
STAGING_FLAG=""
[ "$STAGING" = "1" ] && STAGING_FLAG="--staging" && echo "==> MODALITÀ STAGING (nessun limite di rate)"

echo "==> Richiesta certificato Let's Encrypt..."
docker compose run --rm certbot certonly \
    --webroot --webroot-path /var/www/certbot \
    --email "$EMAIL" \
    --domain "$DOMAIN" \
    --agree-tos --no-eff-email \
    --force-renewal \
    $STAGING_FLAG

# Ricarica nginx con il certificato reale
echo "==> Ricarica nginx..."
docker compose exec frontend nginx -s reload

echo ""
echo "=== Completato! ==="
echo "Sito disponibile su: https://$DOMAIN"
echo ""
echo "Nota: il rinnovo automatico avviene ogni 12h tramite il container certbot."
echo "Dopo ogni rinnovo, ricarica nginx manualmente oppure aggiungi un cron:"
echo "  0 0 * * 1 docker compose exec frontend nginx -s reload"
