#!/bin/sh
# O backend é o dono do schema do banco (o auth-service usa o mesmo schema, só lendo/escrevendo).
# Ao subir, sincroniza o banco com prisma/schema.prisma. Sem --accept-data-loss: mudanças que
# apagariam dados (remover coluna, mudar tipo) param o deploy com uma mensagem clara no log,
# para que sejam aplicadas à mão de forma consciente.
set -e

if [ "${SKIP_DB_SYNC:-false}" != "true" ]; then
  echo "[deploy] Sincronizando o schema do banco (prisma db push)..."
  npx prisma db push
fi

exec node dist/server.js
