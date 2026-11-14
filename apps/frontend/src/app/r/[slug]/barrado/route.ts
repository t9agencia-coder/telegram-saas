import { NextRequest, NextResponse } from 'next/server';

// Recebe o sendBeacon da página de checagem do /r/[slug] (deviceFilter
// 'mobile_only') quando o navegador barra o visitante — DevTools, emulador,
// computador — e repassa ao backend, que corrige o clique de "entrou" para
// "alternativa" com o motivo. Fica sob /r/ pra funcionar em qualquer domínio
// de link, sem depender de o domínio expor /api/.
export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    const body = JSON.parse(raw || '{}');
    const clickId = String(body.clickId || '');
    const motivo  = String(body.motivo  || '');
    if (!/^[0-9a-f-]{36}$/i.test(clickId) || !motivo) {
      return new NextResponse(null, { status: 204 });
    }

    const backendUrl = process.env.API_URL_INTERNAL || 'http://localhost:3001';
    await fetch(`${backendUrl}/api/redirectors/click/${clickId}/barrado`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo }),
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    }).catch(() => {});
  } catch { /* beacon: nunca falha pro navegador */ }
  return new NextResponse(null, { status: 204 });
}
