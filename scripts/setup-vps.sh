#!/bin/bash
# Initial VPS setup script for Hostinger KVM 2
# Run ONCE on a fresh VPS

set -e

echo "=== Hostinger KVM 2 - Initial Setup ==="

# Update system
apt-get update && apt-get upgrade -y

# Install basics
apt-get install -y \
  curl \
  wget \
  git \
  ufw \
  fail2ban \
  htop \
  net-tools

# Configure firewall
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow http
ufw allow https
ufw --force enable

# Configure fail2ban
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
EOF

systemctl restart fail2ban

# Optimize kernel params
cat >> /etc/sysctl.conf << 'EOF'
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_tw_reuse = 1
vm.swappiness = 10
EOF

sysctl -p

# Create deploy user
useradd -m -s /bin/bash deploy
usermod -aG sudo deploy
echo "Set password for deploy user:"
passwd deploy

# Setup SSH key for deploy user
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/ 2>/dev/null || true
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

echo "=== Setup Complete ==="
echo "You can now SSH as deploy user and run deploy-vps.sh"
