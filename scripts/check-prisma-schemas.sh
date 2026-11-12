#!/bin/sh
# backend e auth-service usam o mesmo banco, cada um com sua cópia de prisma/schema.prisma
# (o client gerado fica dentro de cada serviço). O backend é o dono do schema e o aplica no deploy;
# este script falha se as cópias divergirem nos modelos/enums.
#
# Uso: sh scripts/check-prisma-schemas.sh   (rodar antes de commitar mudanças no schema)
set -e
cd "$(dirname "$0")/.."

models() {
  # Ignora generator/datasource (o output do client é específico de cada serviço)
  sed -n '/^\(model\|enum\) /,$p' "$1" | tr -d '\r'
}

if ! models backend/prisma/schema.prisma > /tmp/kreato-schema-backend.prisma \
  || ! models auth-service/prisma/schema.prisma > /tmp/kreato-schema-auth.prisma; then
  echo "Não foi possível ler os schemas." >&2
  exit 1
fi

if diff -u /tmp/kreato-schema-backend.prisma /tmp/kreato-schema-auth.prisma; then
  echo "Schemas do Prisma em sincronia."
else
  echo "" >&2
  echo "backend/prisma/schema.prisma e auth-service/prisma/schema.prisma divergem." >&2
  echo "Edite o do backend (dono do schema) e copie os modelos para o auth-service." >&2
  exit 1
fi
