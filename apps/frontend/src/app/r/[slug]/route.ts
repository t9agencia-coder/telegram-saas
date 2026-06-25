import { NextRequest, NextResponse } from 'next/server';

function buildRedirectHtml(
  destinationUrl: string,
  alternativeUrl?: string,
): string {
  const safeUrl = JSON.stringify(destinationUrl);
  const safeAlt = JSON.stringify(alternativeUrl || '/');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Redirecionando...</title>
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

  // Método 1: plataforma desktop com UA mobile (DevTools clássico)
  var isEmulatedPlatform = /Win32|Win64|MacIntel|MacPPC|Linux x86_64|Linux i686/i.test(navigator.platform) && isMobileUA;

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
  // Cookie tem prioridade; se não existir e o click_id veio junto, usa pixel_id da URL
  const kwaiPixel = req.cookies.get('_kwai_pixel')?.value
    || (kwaiId ? url.searchParams.get('pixel_id') || undefined : undefined);

  const fbc = req.cookies.get('_fbc')?.value
    || (fbclid ? `fb.1.${Date.now()}.${fbclid}` : undefined);

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

    // HTML com detecção de dispositivo real apenas quando filtro mobile_only ativo
    if (deviceFilter === 'mobile_only') {
      const html = buildRedirectHtml(destination, alternativeUrl);
      return new NextResponse(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    return NextResponse.redirect(destination, { status: 302 });
  } catch {
    return NextResponse.redirect(new URL('/', req.url));
  } finally {
    clearTimeout(timer);
  }
}
