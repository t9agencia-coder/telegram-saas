import { NextRequest, NextResponse } from 'next/server';

const SCRAPER_UA = /facebookexternalhit|Facebot|meta-externalagent|LinkedInBot|Twitterbot|WhatsApp|Slackbot/i;

const DEFAULT_OG_IMAGE = 'https://app.firebot.shop/logo8878.png';

function buildScraperHtml(destination: string, pageUrl: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta property="og:title" content="Link compartilhado" />
  <meta property="og:description" content="Você foi convidado a acessar este conteúdo." />
  <meta property="og:image" content="${DEFAULT_OG_IMAGE}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:url" content="${pageUrl}" />
  <meta property="og:type" content="website" />
  <meta property="fb:app_id" content="1002048010922718" />
  <title>Link compartilhado</title>
  <meta http-equiv="refresh" content="0; url=${destination}" />
</head>
<body></body>
</html>`;
}

function buildRedirectHtml(
  destinationUrl: string,
  alternativeUrl: string | undefined,
  pageUrl: string,
): string {
  const safeUrl = JSON.stringify(destinationUrl);
  const safeAlt = JSON.stringify(alternativeUrl || '/');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta property="og:title" content="Link compartilhado" />
  <meta property="og:description" content="Você foi convidado a acessar este conteúdo." />
  <meta property="og:image" content="${DEFAULT_OG_IMAGE}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:url" content="${pageUrl}" />
  <meta property="og:type" content="website" />
  <meta property="fb:app_id" content="1002048010922718" />
  <title>Link compartilhado</title>
  <style>body{margin:0;background:#000;}</style>
</head>
<body>
<script>
(function(){
  var ua = navigator.userAgent || navigator.vendor || window.opera || '';
  var isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|tablet/i.test(ua);
  var hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  var isNarrow = window.screen.width < 768;
  var isCoarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

  // Método 1: plataforma Windows/Linux x86 com UA mobile (DevTools clássico)
  // MacIntel removido: iOS 13+ retorna "MacIntel" em iPhones reais, causando falso positivo
  var isEmulatedPlatform = /Win32|Win64|Linux x86_64|Linux i686/i.test(navigator.platform) && isMobileUA;

  // Método 2: screen.width simulado difere do outerWidth real do browser
  var isScreenSimulated = window.screen.width < 768 && (window.outerWidth - window.screen.width) > 100;

  // Método 3: DevTools aberto
  var devtools = (window.outerWidth - window.innerWidth > 100) || (window.outerHeight - window.innerHeight > 100);

  if (isEmulatedPlatform || isScreenSimulated || devtools || (!isMobileUA && !hasTouch && !isNarrow && !isCoarsePointer)) {
    window.location.replace(${safeAlt});
    return;
  }
  window.location.href = ${safeUrl};
})();
</script>
</body>
</html>`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  const { slug } = params;
  const url = new URL(req.url);

  const ua             = req.headers.get('user-agent') || '';
  const acceptLanguage = req.headers.get('accept-language') || '';
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '';
  // Só pra classificar origem do tráfego (rede social/WhatsApp/direto) na
  // aba Filtro do admin quando não há utm_source/click id — nunca usado pra
  // decidir o redirecionamento em si.
  const referer = req.headers.get('referer') || req.headers.get('referrer') || '';

  const fbclid  = url.searchParams.get('fbclid')  || undefined;
  const ttclid  = url.searchParams.get('ttclid')  || undefined;
  const verificationCode = url.searchParams.get('app') || undefined;

  const utmSource    = url.searchParams.get('utm_source')   || undefined;
  const utmMedium    = url.searchParams.get('utm_medium')   || undefined;
  const utmCampaign  = url.searchParams.get('utm_campaign') || undefined;
  const utmContentRaw = url.searchParams.get('utm_content') || undefined;
  const utmTerm      = url.searchParams.get('utm_term')     || undefined;

  // Kwai bloqueia "pixel_id"/"click_id" como parâmetro próprio na criação da
  // campanha, então (igual à UTMify) esses valores vêm empacotados dentro do
  // utm_content como "ad_id::click_id::pixel_id". Só desempacota quando a
  // origem é kwai — nenhuma outra plataforma usa "::" no utm_content.
  let utmContent = utmContentRaw;
  let kwaiIdFromContent: string | undefined;
  let kwaiPixelFromContent: string | undefined;
  if (utmSource === 'kwai' && utmContentRaw?.includes('::')) {
    const [adId, clickIdPart, pixelIdPart] = utmContentRaw.split('::');
    utmContent = adId || undefined;
    kwaiIdFromContent = clickIdPart || undefined;
    kwaiPixelFromContent = pixelIdPart || undefined;
  }

  // click_id/pixel_id como parâmetro próprio continuam suportados (links
  // antigos já publicados em campanhas do cliente, criados antes dessa mudança).
  const kwaiId = url.searchParams.get('click_id') || kwaiIdFromContent || undefined;

  const fbp = req.cookies.get('_fbp')?.value || undefined;
  const ttp = req.cookies.get('_ttp')?.value || undefined;
  const kwaiPixel = req.cookies.get('_kwai_pixel')?.value
    || (kwaiId ? url.searchParams.get('pixel_id') || kwaiPixelFromContent || undefined : undefined);
  const fbc = req.cookies.get('_fbc')?.value
    || (fbclid ? `fb.1.${Date.now()}.${fbclid}` : undefined);

  const isScraper = SCRAPER_UA.test(ua);
  const host      = req.headers.get('x-forwarded-host') || req.headers.get('host') || url.host;
  const proto     = req.headers.get('x-forwarded-proto') || 'https';
  const pageUrl   = `${proto}://${host}/r/${slug}`;

  const primaryUrl  = process.env.API_URL_INTERNAL || 'http://localhost:3001';
  // Standby do blue-green: se o backend primário estiver reiniciando (deploy),
  // tenta o standby antes de desistir — assim um clique de anúncio nunca cai na
  // home só porque o container estava recriando.
  const fallbackUrl = process.env.API_URL_INTERNAL_FALLBACK || 'http://backend-standby:3001';

  const payload = JSON.stringify({
    ua, acceptLanguage, ip, referer,
    fbclid, ttclid, kwaiId, verificationCode,
    utmSource, utmMedium, utmCampaign, utmContent, utmTerm,
    fbp, fbc, ttp, kwaiPixel,
  });

  const tryResolve = async (base: string, timeoutMs: number) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetch(`${base}/api/redirectors/resolve/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        cache: 'no-store',
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let res: Response;
    try {
      res = await tryResolve(primaryUrl, 5000);
    } catch {
      res = await tryResolve(fallbackUrl, 5000); // primário fora → standby
    }

    if (!res.ok) {
      return NextResponse.redirect(new URL('/', `${proto}://${host}`));
    }

    const { url: destination, deviceFilter, alternativeUrl } = await res.json();

    if (deviceFilter === 'mobile_only') {
      if (isScraper) {
        return new NextResponse(buildScraperHtml(destination, pageUrl), {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
      return new NextResponse(
        buildRedirectHtml(destination, alternativeUrl, pageUrl),
        { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      );
    }

    return NextResponse.redirect(destination, { status: 302 });
  } catch {
    return NextResponse.redirect(new URL('/', `${proto}://${host}`));
  }
}
