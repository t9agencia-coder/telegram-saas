const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const VPS_IP = '187.77.247.140';
const PASSWORD = 'SENHA_REMOVIDA_DO_HISTORICO';

async function runCommand(client, cmd) {
  return new Promise((resolve, reject) => {
    client.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '', stderr = '';
      stream.on('close', (code) => {
        if (code !== 0) reject(new Error(`Exit code ${code}: ${stderr}`));
        else resolve(stdout.trim());
      });
      stream.on('data', (d) => stdout += d.toString());
      stream.stderr.on('data', (d) => stderr += d.toString());
    });
  });
}

async function main() {
  console.log('=== Connecting to VPS ===');
  
  const conn = new Client();
  
  conn.on('ready', async () => {
    console.log('Connected to VPS');

    try {
      // 1. Copy SSH public key
      console.log('\n1. Setting up SSH key auth...');
      const pubKey = fs.readFileSync(
        path.join(process.env.USERPROFILE || '~', '.ssh', 'id_rsa.pub'),
        'utf8'
      ).trim();
      
      await runCommand(conn, `mkdir -p ~/.ssh`);
      await runCommand(conn, `echo '${pubKey}' >> ~/.ssh/authorized_keys`);
      await runCommand(conn, `chmod 600 ~/.ssh/authorized_keys`);
      await runCommand(conn, `chmod 700 ~/.ssh`);
      console.log('SSH key copied successfully');

      // 2. Update system
      console.log('\n2. Updating system...');
      await runCommand(conn, 'apt-get update -y');
      await runCommand(conn, 'apt-get upgrade -y');
      console.log('System updated');

      // 3. Install Docker
      console.log('\n3. Installing Docker...');
      await runCommand(conn, 'curl -fsSL https://get.docker.com -o /tmp/get-docker.sh');
      await runCommand(conn, 'sh /tmp/get-docker.sh');
      await runCommand(conn, 'systemctl enable docker');
      await runCommand(conn, 'systemctl start docker');
      console.log('Docker installed');

      // 4. Install Docker Compose
      console.log('\n4. Installing Docker Compose...');
      await runCommand(conn, 'curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose');
      await runCommand(conn, 'chmod +x /usr/local/bin/docker-compose');
      console.log('Docker Compose installed');

      // 5. Install Nginx and Certbot
      console.log('\n5. Installing Nginx & Certbot...');
      await runCommand(conn, 'apt-get install -y nginx certbot python3-certbot-nginx');
      console.log('Nginx & Certbot installed');

      // 6. Configure firewall
      console.log('\n6. Configuring firewall...');
      await runCommand(conn, 'ufw default deny incoming');
      await runCommand(conn, 'ufw default allow outgoing');
      await runCommand(conn, 'ufw allow ssh');
      await runCommand(conn, 'ufw allow http');
      await runCommand(conn, 'ufw allow https');
      await runCommand(conn, 'ufw --force enable');
      console.log('Firewall configured');

      // 7. Clone repository
      console.log('\n7. Cloning repository...');
      await runCommand(conn, 'cd /opt && if [ -d telegram-saas ]; then cd telegram-saas && git pull; else git clone https://github.com/t9agencia-coder/telegram-saas.git; fi');
      console.log('Repository cloned');

      // System info
      const hostname = await runCommand(conn, 'hostname');
      const specs = await runCommand(conn, 'echo "CPU: $(nproc) cores | RAM: $(free -h | awk \'/^Mem:/ {print $2}\') | Disk: $(df -h / | awk \'NR==2 {print $2}\')"');
      
      console.log(`\n=== VPS Ready! ===`);
      console.log(`Hostname: ${hostname}`);
      console.log(`Specs: ${specs}`);
      console.log(`IP: ${VPS_IP}`);
      console.log('\nNext: run scripts/deploy-vps.sh on VPS');

    } catch (err) {
      console.error('Error:', err.message);
    }

    conn.end();
  });

  conn.connect({
    host: VPS_IP,
    username: 'root',
    password: PASSWORD,
    readyTimeout: 30000,
  });
}

main().catch(console.error);
