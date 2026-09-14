#!/bin/bash
#
# firebot-backup.sh — backup diário do banco. Instalado em /usr/local/bin/ e
# chamado pelo cron (0 3 * * *). Versionado no repo desde 2026-09-14.
#
# CONTEXTO: a versão anterior rodou por 31+ dias gravando arquivos VAZIOS de
# 20 bytes e registrando "OK" no log. Tinha quatro defeitos somados:
#   1. usuário/banco errados (`-U firebot firebot`; o real é `postgres` /
#      `telegram_saas`), então o pg_dump falhava sempre;
#   2. pg_dump num pipe pro gzip — sem `pipefail`, o status que sobra é o do
#      gzip, que "funciona" gravando um .gz vazio;
#   3. mensagem "OK" incondicional, sem olhar se deu certo;
#   4. a poda dos antigos rodava mesmo com a falha, então ia apagando os
#      backups bons (se houvesse) enquanto acumulava vazios.
#
# Esta versão falha alto e só considera sucesso o que passa na validação.
set -euo pipefail

INSTANCIA="${INSTANCIA:-firebot}"
BACKUP_DIR="/root/backups/${INSTANCIA}"
RETENCAO_DIAS="${RETENCAO_DIAS:-14}"
DATE=$(date +%Y%m%d_%H%M%S)
DEST="$BACKUP_DIR/${INSTANCIA}_${DATE}.sql.gz"
TMP="$DEST.parcial"

# Tamanho mínimo aceitável. Um dump real deste banco passa de centenas de MB;
# qualquer coisa abaixo disso é sintoma de falha silenciosa (era o caso antigo,
# com 20 bytes). Ajuste se o banco encolher muito.
MIN_BYTES="${MIN_BYTES:-10485760}"   # 10 MB

mkdir -p "$BACKUP_DIR"

# Nunca APAGA o arquivo ao falhar — só marca como rejeitado. Um dump de vários
# GB leva minutos; jogar fora por causa de um bug na validação (já aconteceu:
# `zcat | head` + pipefail derrubava um dump perfeitamente bom) é pior do que
# deixar o arquivo pra inspeção manual.
falhar() {
  echo "[backup] ERRO: $1" >&2
  if [ -f "$TMP" ]; then
    mv "$TMP" "$DEST.rejeitado" 2>/dev/null || true
    echo "[backup] arquivo preservado para inspeção: $DEST.rejeitado ($(du -h "$DEST.rejeitado" 2>/dev/null | cut -f1))" >&2
  fi
  exit 1
}

echo "[backup] iniciando $(date '+%F %T') → $DEST"

# Descobre banco e usuário reais a partir do compose/.env em vez de fixar no
# script — foi exatamente o hardcode errado que quebrou a versão anterior.
DB_NAME="${DB_NAME:-telegram_saas}"
DB_USER="${DB_USER:-postgres}"

docker exec "${INSTANCIA}-postgres" psql -U "$DB_USER" -d "$DB_NAME" -c 'SELECT 1' >/dev/null 2>&1 \
  || falhar "não consigo conectar em $DB_NAME como $DB_USER no container ${INSTANCIA}-postgres"

# pg_dump direto pro arquivo temporário. set -o pipefail (herdado do set -e
# acima via `set -euo pipefail`) garante que falha do pg_dump derruba o script.
docker exec "${INSTANCIA}-postgres" pg_dump -U "$DB_USER" --no-owner --no-acl "$DB_NAME" \
  | gzip -c > "$TMP" || falhar "pg_dump falhou"

# ── Validação ───────────────────────────────────────────────────────────────
# ATENÇÃO: pipefail fica DESLIGADO neste bloco de propósito. Comandos como
# `zcat | head` fazem o zcat morrer de SIGPIPE quando o head fecha o pipe, e com
# pipefail o pipeline inteiro vira erro mesmo quando o grep achou o que queria.
# Foi exatamente isso que reprovou um dump bom na primeira execução.
# O pipefail continua valendo onde importa: no `pg_dump | gzip` acima.
set +o pipefail

[ -s "$TMP" ] || falhar "arquivo vazio"

BYTES=$(stat -c %s "$TMP")
[ "$BYTES" -ge "$MIN_BYTES" ] || falhar "arquivo suspeito de $BYTES bytes (mínimo $MIN_BYTES)"

gzip -t "$TMP" 2>/dev/null || falhar "gzip corrompido"

# Cabeçalho do pg_dump nas primeiras linhas
zcat "$TMP" 2>/dev/null | head -200 | grep -q "PostgreSQL database dump" \
  || falhar "conteúdo não parece um dump do PostgreSQL"

# O dump tem que terminar com o marcador de fim — prova de que não foi cortado
# no meio (processo morto, disco cheio, conexão perdida).
zcat "$TMP" 2>/dev/null | tail -5 | grep -q "PostgreSQL database dump complete" \
  || falhar "dump incompleto (não encontrei o marcador de fim)"

TABELAS=$(zcat "$TMP" 2>/dev/null | grep -c "^CREATE TABLE")
[ "$TABELAS" -ge 10 ] || falhar "só $TABELAS tabelas no dump — parece incompleto"

set -o pipefail

mv "$TMP" "$DEST"

# Poda SÓ depois do sucesso — nunca apaga o que já existe se o novo falhou.
find "$BACKUP_DIR" -name "*.sql.gz" -mtime "+$RETENCAO_DIAS" -delete

echo "[backup] OK: $(basename "$DEST") — $(du -h "$DEST" | cut -f1), $TABELAS tabelas"
echo "[backup] guardados: $(ls -1 "$BACKUP_DIR"/*.sql.gz 2>/dev/null | wc -l) arquivo(s), $(du -sh "$BACKUP_DIR" | cut -f1)"
