import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// Consome o token de verificação (RPC verificar_conta) e redireciona 302 LIMPANDO o token da URL (RS15).
// Resposta sempre genérica (anti-enumeração): a RPC retorna boolean; não revelamos o resultado na URL.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const destino = new URL('/app/conta?verificacao=processada', req.url)
  if (token) {
    const supabase = await createSupabaseServerClient()
    await supabase.rpc('verificar_conta', { p_token: token })
    await supabase.auth.refreshSession() // para o claim 'verificado' refletir
  }
  const res = NextResponse.redirect(destino)
  res.headers.set('Referrer-Policy', 'no-referrer')
  return res
}
