import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { token } = await req.json()
    if (!token) {
      return NextResponse.json({ error: 'Token é obrigatório' }, { status: 400 })
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`)
    const data = await res.json()

    if (!data.ok) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 400 })
    }

    return NextResponse.json({
      id: data.result.id,
      name: data.result.first_name,
      username: data.result.username,
      isBot: data.result.is_bot,
    })
  } catch {
    return NextResponse.json({ error: 'Erro ao validar token' }, { status: 500 })
  }
}
