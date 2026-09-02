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
# A instância worker (QUEUE_ROLE=worker) pula — a api aplica antes; rodar
# `prisma migrate deploy` em 2 processos ao mesmo tempo é desnecessário.
if [ "${SKIP_MIGRATIONS}" = "1" ]; then
  echo "[startup] SKIP_MIGRATIONS=1 — pulando migrations (instância worker)."
else
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
fi

echo ""

# ── Inicia o servidor ────────────────────────────────────────────────────────
echo "[startup] Iniciando servidor NestJS (QUEUE_ROLE=${QUEUE_ROLE:-all})..."
exec node --max-old-space-size="${NODE_HEAP_MB:-4096}" dist/main
