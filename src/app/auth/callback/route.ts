import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const FALLBACK_NEXT = '/app'

// Hardening anti open-redirect (OWASP A01): o ?next é controlado pelo atacante.
// Só aceitamos caminho relativo interno — começa com '/', NÃO começa com '//' nem '/\',
// e não resolve para outra origem (URL absoluta). Caso inválido → fallback seguro /app.
function caminhoInternoSeguro(raw: string | null): string {
  if (!raw || !raw.startsWith('/')) return FALLBACK_NEXT
  if (raw.startsWith('//') || raw.startsWith('/\\')) return FALLBACK_NEXT
  try {
    const base = 'http://internal.invalid'
    if (new URL(raw, base).origin !== base) return FALLBACK_NEXT
  } catch {
    return FALLBACK_NEXT
  }
  return raw
}

// Troca o ?code do OAuth por uma sessão (cookies) e redireciona. AC4/AC5 (e-mail vem do provedor).
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const next = caminhoInternoSeguro(req.nextUrl.searchParams.get('next'))
  if (code) {
    const supabase = await createSupabaseServerClient()
    await supabase.auth.exchangeCodeForSession(code)
    // Orçamento $0 / sem domínio: o login Google já prova posse do e-mail → marca a conta
    // verificada (A1/RN9). O trigger 0018 publica as dores aprovadas do autor. Não bloqueia o login.
    try {
      await supabase.rpc('marcar_verificado_oauth')
    } catch {
      /* o login não depende disso */
    }
  }
  return NextResponse.redirect(new URL(next, req.url))
}
