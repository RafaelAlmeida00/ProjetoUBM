import { createSupabaseServerClient } from '@/lib/supabase/server'
import { NovaDorForm } from '@/components/dores/NovaDorForm'

/**
 * Delta 3 — /app/dores/nova (RSC): rota dedicada para representante logado criar dor.
 * Lê vínculos de membro_empresa (papel representante + empresa).
 * Se não for representante verificado → exibe NovaDorForm com empresas=[] (estado bloqueado).
 */
export default async function NovaDorPage() {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()

  // Sem sessão → NovaDorForm sem empresas (bloqueado)
  if (!user) {
    return (
      <main className="ubm-section" style={{ maxWidth: '48rem' }}>
        <header className="ubm-page-header">
          <div className="ubm-breadcrumb">
            <span>APP</span>
            <span aria-hidden="true">/</span>
            <span>DORES</span>
            <span aria-hidden="true">/</span>
            <b>NOVA</b>
          </div>
          <h1 className="ubm-page-title">Propor uma nova dor</h1>
        </header>
        <NovaDorForm empresas={[]} />
      </main>
    )
  }

  // Busca vínculos de representante verificado
  // Lê membro_empresa onde o usuário é representante da empresa
  const { data: vinculos } = await supabase
    .from('membro_empresa')
    .select('empresa_id, empresa:empresa(id, nome_canonico)')
    .eq('user_id', user.id)
    .eq('papel', 'representante')

  // Verifica se conta está verificada
  const { data: perfil } = await supabase
    .from('perfil')
    .select('verificado_em')
    .eq('user_id', user.id)
    .single()

  const isVerificado = !!perfil?.verificado_em

  // Sem vínculo OU conta não verificada → empresas vazia (estado bloqueado no form)
  let empresas: { id: string; nome: string }[] = []

  if (isVerificado && vinculos && vinculos.length > 0) {
    empresas = vinculos
      .map((v) => {
        const emp = Array.isArray(v.empresa) ? v.empresa[0] : v.empresa
        if (!emp) return null
        return { id: emp.id as string, nome: emp.nome_canonico as string }
      })
      .filter((e): e is { id: string; nome: string } => e !== null)
  }

  return (
    <main className="ubm-section" style={{ maxWidth: '48rem' }}>
      <header className="ubm-page-header">
        <div className="ubm-breadcrumb">
          <span>APP</span>
          <span aria-hidden="true">/</span>
          <a href="/app/dores" className="ubm-link">DORES</a>
          <span aria-hidden="true">/</span>
          <b>NOVA</b>
        </div>
        <h1 className="ubm-page-title">Propor uma nova dor</h1>
        <p className="ubm-page-lead">
          Conte o desafio da sua empresa em poucas linhas. A UBM analisa e, se encaixar, ela vira um
          projeto de extensão conduzido pelos nossos alunos — sem custo para você.
        </p>
      </header>
      <NovaDorForm empresas={empresas} />
    </main>
  )
}
