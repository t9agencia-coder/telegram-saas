/**
 * White-label — cada instância builda com NEXT_PUBLIC_BRAND ('firebot' | 'xbot').
 * O valor é inlined no build do Next (é NEXT_PUBLIC_*), então trocar exige rebuild
 * do frontend (o que o deploy já faz por instância).
 *
 * Cores: o accent de cada marca vem de `--primary` no globals.css, trocado pelo
 * seletor `:root[data-brand="xbot"]`. O `<html data-brand>` é setado no layout.
 */

const id = (process.env.NEXT_PUBLIC_BRAND || 'firebot').toLowerCase()

export const BRAND = {
  id,
  isXbot: id === 'xbot',
  /** Nome exibido no painel (loading, título). */
  name: id === 'xbot' ? 'XBot' : 'FireBot',
  /** Inicial pro sidebar colapsado. */
  shortMark: id === 'xbot' ? 'X' : 'F',
  /** Wordmark horizontal (sidebar + auth). */
  logo: id === 'xbot' ? '/logo-xbot.png' : '/logo.png',
  /** Favicon / ícone do app. */
  icon: id === 'xbot' ? '/icon-xbot.svg' : '/icons/icon-192.png',
  /** theme-color do navegador / PWA (valor literal — meta tag não aceita var()). */
  themeColor: id === 'xbot' ? '#4496ff' : '#E50914',
  title: id === 'xbot'
    ? 'XBot - Plataforma de Automação'
    : 'FireBot - Plataforma de Automação',
} as const
