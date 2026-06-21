#!/bin/bash
# Build backend for production
# Run this locally before pushing to VPS, OR let the VPS build it

set -e

echo "=== Building Backend ==="

cd "$(dirname "$0")/../apps/backend"

echo "1. Installing dependencies..."
npm ci --only=production

echo "2. Generating Prisma client..."
npx prisma generate

echo "3. Building NestJS..."
npm run build

echo "=== Build Complete ==="
echo "Backend is ready for deployment"
