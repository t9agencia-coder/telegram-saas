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

  const fbclid  = url.searchParams.get('fbclid')  || undefined;
  const ttclid  = url.searchParams.get('ttclid')  || undefined;
  const kwaiId  = url.searchParams.get('click_id') || undefined;

  const utmSource   = url.searchParams.get('utm_source')   || undefined;
  const utmMedium   = url.searchParams.get('utm_medium')   || undefined;
  const utmCampaign = url.searchParams.get('utm_campaign') || undefined;
  const utmContent  = url.searchParams.get('utm_content')  || undefined;
  const utmTerm     = url.searchParams.get('utm_term')     || undefined;

  const fbp = req.cookies.get('_fbp')?.value || undefined;
  const ttp = req.cookies.get('_ttp')?.value || undefined;
  const kwaiPixel = req.cookies.get('_kwai_pixel')?.value
    || (kwaiId ? url.searchParams.get('pixel_id') || undefined : undefined);
  const fbc = req.cookies.get('_fbc')?.value
    || (fbclid ? `fb.1.${Date.now()}.${fbclid}` : undefined);

  const isScraper = SCRAPER_UA.test(ua);
  const host      = req.headers.get('x-forwarded-host') || req.headers.get('host') || url.host;
  const proto     = req.headers.get('x-forwarded-proto') || 'https';
  const pageUrl   = `${proto}://${host}/r/${slug}`;

  const backendUrl = process.env.API_URL_INTERNAL || 'http://localhost:3001';
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);

  try {
    const res = await fetch(`${backendUrl}/api/redirectors/resolve/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ua, acceptLanguage, ip,
        fbclid, ttclid, kwaiId,
        utmSource, utmMedium, utmCampaign, utmContent, utmTerm,
        fbp, fbc, ttp, kwaiPixel,
      }),
      cache: 'no-store',
      signal: ctrl.signal,
    });

    if (!res.ok) {
      return NextResponse.redirect(new URL('/', req.url));
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
    return NextResponse.redirect(new URL('/', req.url));
  } finally {
    clearTimeout(timer);
  }
}
