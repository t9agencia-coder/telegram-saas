#!/bin/sh
# entrypoint.sh
#
# Executado toda vez que o container sobe.
# Garante migrations antes de iniciar o servidor.
# Lida com banco existente (baseline automático) e banco novo.

set -e

echo ""
echo "==========================================="
echo "  FireBot Backend — Iniciando"
echo "==========================================="
echo ""

# ── Aguarda PostgreSQL ──────────────────────────────────────────────────────
echo "[startup] Aguardando PostgreSQL..."
MAX=30
COUNT=0
until nc -z "${POSTGRES_HOST:-postgres}" "${POSTGRES_PORT:-5432}" 2>/dev/null; do
  COUNT=$((COUNT + 1))
  if [ $COUNT -ge $MAX ]; then
    echo "[startup] TIMEOUT: PostgreSQL não respondeu. Abortando."
    exit 1
  fi
  echo "[startup] Aguardando PostgreSQL... (${COUNT}/${MAX})"
  sleep 2
done
echo "[startup] PostgreSQL pronto."
echo ""

# ── Aplica migrations ────────────────────────────────────────────────────────
echo "[startup] Aplicando migrations..."

# Tenta aplicar normalmente
if npx prisma migrate deploy 2>&1; then
  echo "[startup] Migrations OK."
else
  EXIT_CODE=$?

  # Verifica se o erro é P3005 (banco existente sem histórico de migration)
  RESULT=$(npx prisma migrate deploy 2>&1 || true)
  if echo "$RESULT" | grep -q "P3005"; then
    echo ""
    echo "[startup] Banco existente detectado sem histórico de migrations."
    echo "[startup] Aplicando baseline da migration inicial..."

    # Marca a migration inicial como já aplicada (não executa o SQL)
    npx prisma migrate resolve --applied "20240101000000_init"
    echo "[startup] Baseline aplicado."

    # Agora aplica qualquer migration pendente após a inicial
    echo "[startup] Aplicando migrations pendentes..."
    npx prisma migrate deploy
    echo "[startup] Migrations OK."
  else
    echo "[startup] ERRO nas migrations:"
    echo "$RESULT"
    exit 1
  fi
fi

echo ""

# ── Inicia o servidor ────────────────────────────────────────────────────────
echo "[startup] Iniciando servidor NestJS..."
exec node --max-old-space-size=4096 dist/main
