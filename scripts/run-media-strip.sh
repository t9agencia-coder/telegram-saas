#!/bin/sh
# Limpeza diária de base64 redundante nos fluxos (cron: 5h na FireBot, 4h na XBot).
#
# Só remove mídia (nodes + config) que tenha OUTRA cópia comprovada: o arquivo na
# mídia-teca (garantia forte, só FireBot) ou um file_id validado no getFile do
# Telegram (garantia fraca, comportamento antigo — ver media-strip-backfill.js).
# Faz backup comprimido de todos os fluxos antes (mantém os 6 mais recentes).
#
# Este arquivo é versionado no repo desde 2026-09-12; antes vivia solto na VPS.
# Serve as duas instâncias sem edição: descobre qual é pelo PRÓPRIO CAMINHO
# (/opt/<instancia>/scripts/run-media-strip.sh). Isso não é preciosismo — as duas
# rodam na mesma máquina, e um padrão fixo faria o cron do XBot mexer nos
# containers da FireBot no dia em que o repo fosse deployado lá.
set -e

INSTANCIA=${INSTANCIA:-$(echo "$0" | sed -n 's|^/opt/\([^/]*\)/.*|\1|p')}
if [ -z "$INSTANCIA" ]; then
  echo "run-media-strip.sh: não consegui descobrir a instância pelo caminho ($0)." >&2
  echo "Rode a partir de /opt/<instancia>/scripts/ ou defina INSTANCIA=firebot|xbot." >&2
  exit 1
fi
DIR=/opt/$INSTANCIA/scripts
LOG=/var/log/$INSTANCIA-media-strip.log
BKDIR=/opt/$INSTANCIA/flow-strip-backups
PREFIXO=$INSTANCIA   # nome dos containers: firebot-postgres / xbot-postgres

mkdir -p "$BKDIR"
TS=$(date +%Y%m%d-%H%M%S)

{
  echo ""
  echo "========================= $TS ========================="

  PGPASS=$(grep -E '^POSTGRES_PASSWORD=' /opt/$INSTANCIA/.env | cut -d= -f2-)

  # 1) backup (nodes+config+edges de todos os fluxos), comprimido
  docker cp "$DIR/_strip_backup.sql" $PREFIXO-postgres:/tmp/_strip_backup.sql
  docker exec -e PGPASSWORD="$PGPASS" $PREFIXO-postgres \
    psql -U postgres -d telegram_saas -f /tmp/_strip_backup.sql \
    | gzip > "$BKDIR/flows-$TS.jsonl.gz"
  echo "backup: $BKDIR/flows-$TS.jsonl.gz ($(du -h "$BKDIR/flows-$TS.jsonl.gz" | cut -f1))"
  # mantém só os 6 mais recentes
  ls -1t "$BKDIR"/flows-*.jsonl.gz 2>/dev/null | tail -n +7 | xargs -r rm -f

  # 2) strip dentro do container backend (usa decrypt + Prisma + mídia-teca do app)
  docker cp "$DIR/media-strip-backfill.js" $PREFIXO-backend:/app/_strip.js
  docker exec -w /app -e DRY=0 $PREFIXO-backend node /app/_strip.js
  docker exec -u root $PREFIXO-backend rm -f /app/_strip.js 2>/dev/null || true

  # 3) VACUUM leve na Flow (recupera espaço reutilizável)
  docker exec -e PGPASSWORD="$PGPASS" $PREFIXO-postgres \
    psql -U postgres -d telegram_saas -c 'VACUUM (ANALYZE) "Flow";' >/dev/null 2>&1 || true

  echo "========================= fim $TS ====================="
} >> "$LOG" 2>&1
