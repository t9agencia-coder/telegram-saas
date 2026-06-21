#!/bin/bash
# Deploy script for Hostinger KVM 2 VPS
# Run this on your VPS after initial setup

set -e

echo "=== Telegram SaaS - VPS Deploy ==="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
  echo -e "${RED}Please run as root (sudo)${NC}"
  exit 1
fi

echo -e "${YELLOW}1. Installing Docker...${NC}"
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
systemctl enable docker
systemctl start docker

echo -e "${YELLOW}2. Installing Docker Compose...${NC}"
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

echo -e "${YELLOW}3. Installing Nginx for SSL...${NC}"
apt-get update -y
apt-get install -y nginx certbot python3-certbot-nginx

echo -e "${YELLOW}4. Cloning repository...${NC}"
cd /opt
if [ -d "telegram-saas" ]; then
  cd telegram-saas
  git pull origin master
else
  git clone https://github.com/t9agencia-coder/telegram-saas.git
  cd telegram-saas
fi

echo -e "${YELLOW}5. Creating .env file...${NC}"
if [ ! -f ".env" ]; then
  cat > .env << 'ENVEOF'
# === Database ===
POSTGRES_PASSWORD=CHANGE_ME_STRONG_PASSWORD

# === Redis ===
REDIS_PASSWORD=CHANGE_ME_REDIS_PASSWORD

# === JWT ===
JWT_SECRET=CHANGE_ME_JWT_SECRET_32_CHARS_MIN
JWT_REFRESH_SECRET=CHANGE_ME_REFRESH_SECRET_32_CHARS_MIN

# === Encryption ===
ENCRYPTION_KEY=CHANGE_ME_ENCRYPTION_KEY_32_CHARS!!

# === BlackPay ===
BLACKPAY_API_KEY=your-blackpay-api-key
BLACKPAY_WEBHOOK_SECRET=your-blackpay-webhook-secret

# === URLs ===
API_URL=https://api.seudominio.com
FRONTEND_URL=https://telegram-saas-frontend.vercel.app
ENVEOF
  echo -e "${RED}Edit .env file with your values: nano /opt/telegram-saas/.env${NC}"
else
  echo ".env already exists"
fi

echo -e "${YELLOW}6. Setting up SSL with Let's Encrypt...${NC}"
read -p "Enter your domain for the API (e.g., api.seudominio.com): " API_DOMAIN
certbot --nginx -d $API_DOMAIN --non-interactive --agree-tos -m admin@$API_DOMAIN

echo -e "${YELLOW}7. Building and starting services...${NC}"
cd /opt/telegram-saas

# Build backend
docker-compose -f docker-compose.prod.yml build backend

# Start all services
docker-compose -f docker-compose.prod.yml up -d

# Run migrations
echo -e "${YELLOW}8. Running database migrations...${NC}"
docker exec telegram-saas-backend npx prisma db push

echo -e "${GREEN}=== Deploy Complete! ===${NC}"
echo -e "${GREEN}Backend API: https://$API_DOMAIN${NC}"
echo -e "${GREEN}Frontend: ${FRONTEND_URL:-https://telegram-saas-frontend.vercel.app}${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Configure NEXT_PUBLIC_API_URL=https://$API_DOMAIN in Vercel dashboard"
echo "2. Update FRONTEND_URL in .env on VPS"
echo "3. Monitor logs: docker-compose -f docker-compose.prod.yml logs -f"
