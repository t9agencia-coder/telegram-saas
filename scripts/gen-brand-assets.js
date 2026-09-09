#!/usr/bin/env node
'use strict';
/**
 * gen-brand-assets.js — gera os assets da identidade da FireBot nos tamanhos
 * usados pelo app, a partir dos originais em firebot-identidaddevisual-nova/.
 *
 * NÃO toca em logo8878.png (OG image do /r/ — o redirect não pode mudar) nem
 * na identidade da XBot (apps/landing-xbot, public/logo-xbot.png).
 *
 * Precisa do sharp:  cd apps/frontend && npm i sharp   (não fica commitado)
 * Rodar do root:     node scripts/gen-brand-assets.js
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
let sharp;
try { sharp = require(path.join(REPO, 'apps', 'frontend', 'node_modules', 'sharp')); }
catch { sharp = require('sharp'); } // fallback: sharp instalado no root
const SRC_LOGO = path.join(REPO, 'firebot-identidaddevisual-nova', 'firebot-logo.png');
const SRC_ICON = path.join(REPO, 'firebot-identidaddevisual-nova', 'firebot-icone-app.png');
const FE = path.join(REPO, 'apps', 'frontend', 'public');
const LP = path.join(REPO, 'apps', 'landing-firebot', 'public');

async function wordmark(dest, width) {
  await sharp(SRC_LOGO)
    .resize({ width, withoutEnlargement: true })
    .png({ compressionLevel: 9, quality: 90 })
    .toFile(dest);
  console.log('  ' + path.relative(REPO, dest) + '  (' + width + 'w, ' + kb(dest) + ')');
}
async function icon(dest, size) {
  await sharp(SRC_ICON)
    .resize(size, size, { fit: 'cover' })
    .png({ compressionLevel: 9 })
    .toFile(dest);
  console.log('  ' + path.relative(REPO, dest) + '  (' + size + 'px, ' + kb(dest) + ')');
}
function kb(f) { return Math.round(fs.statSync(f).size / 1024) + 'KB'; }

(async () => {
  console.log('Wordmark (dashboard + landing):');
  await wordmark(path.join(FE, 'logo.png'), 640);
  await wordmark(path.join(LP, 'logo.png'), 520);

  console.log('Ícones (PWA + favicon):');
  await icon(path.join(FE, 'icons', 'icon-192.png'), 192);
  await icon(path.join(FE, 'icons', 'icon-512.png'), 512);
  await icon(path.join(FE, 'icons', 'icon-maskable-512.png'), 512);

  console.log('Favicon da landing (firebot.shop):');
  await icon(path.join(REPO, 'apps', 'landing-firebot', 'src', 'app', 'icon.png'), 256);
  const oldSvg = path.join(REPO, 'apps', 'landing-firebot', 'src', 'app', 'icon.svg');
  if (fs.existsSync(oldSvg)) { fs.unlinkSync(oldSvg); console.log('  removido icon.svg antigo'); }

  console.log('\nOK. logo8878.png (OG do /r/) NÃO foi tocado.');
})().catch(e => { console.error(e); process.exit(1); });
