#!/bin/sh
set -e

echo "Running prisma migrate deploy..."
node /opt/prisma-cli/node_modules/prisma/build/index.js migrate deploy --schema=/app/prisma/schema.prisma

echo "Starting Next.js standalone server..."
exec node server.js
