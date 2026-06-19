import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getPerfil } from '@/lib/data/perfil'
import {
  listarMeusProjetos,
  listarMinhasTarefasAbertas,
  listarMinhasIndicacoes,
  contarMinhasDoresPorStatus,
  listarIndicacoes,
} from '@/lib/data/projetos'
import {
  BancadaRepresentante,
  BancadaAluno,
  BancadaCoordenador,
  BancadaAdmin,
} from '@/components/app/Bancada'

/**
 * ADR-0002 — /app (RSC) — Bancada por papel.
 * Ramifica por papel real (papel_usuario, nunca JWT claim) e compõe adapters
 * de leitura já existentes sob a RLS do usuário autenticado.
 * A RLS continua sendo o controle central: a UI só renderiza o que o banco deixa ler.
 * Degradação por-widget: cada adapter retorna []/null em erro — não derruba a página.
 */
export default async function AppDashboardPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Perfil (nome para saudação)
  const perfil = user ? await getPerfil() : null
  const nome = perfil?.nome_publico ?? null

  // Admin via app_metadata (JWT claim — sem query extra)
  const isAdmin = user?.app_metadata?.is_admin === true

  // Papel base (papel_usuario — leitura real, não JWT claim)
  let papelBase: 'aluno' | 'coordenador' | 'representante' | undefined

  if (user && !isAdmin) {
    const { data: papeis } = await supabase
      .from('papel_usuario')
      .select('role')
      .eq('user_id', user.id)

    if (papeis?.some((p: { role: string }) => p.role === 'representante')) {
      papelBase = 'representante'
    } else if (papeis?.some((p: { role: string }) => p.role === 'coordenador')) {
      papelBase = 'coordenador'
    } else if (papeis?.some((p: { role: string }) => p.role === 'aluno')) {
      papelBase = 'aluno'
    }
  }

  // ── ADMIN ────────────────────────────────────────────────────────────────
  if (isAdmin) {
    let qtdDoresPendentes = 0
    let qtdProjetosPendentes = 0
    try {
      // dor pendente de moderação = status_dor 'em_moderacao'. Antes usava 'em_analise'
      // (status de PROJETO) → enum inválido → erro engolido pelo catch → contagem sempre 0.
      const { count: cd } = await supabase
        .from('dor')
        .select('id', { count: 'exact', head: true })
        .eq('status_dor', 'em_moderacao')
        .is('deleted_at', null)
      qtdDoresPendentes = cd ?? 0
    } catch { /* fail-soft */ }
    try {
      const { count: cp } = await supabase
        .from('projeto')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'em_analise')
        .is('deleted_at', null)
      qtdProjetosPendentes = cp ?? 0
    } catch { /* fail-soft */ }

    return (
      <div className="ubm-shell--blueprint p-[clamp(1.25rem,4vw,2rem)]">
        <BancadaAdmin
          nome={nome}
          qtdDoresPendentes={qtdDoresPendentes}
          qtdProjetosPendentes={qtdProjetosPendentes}
        />
      </div>
    )
  }

  // ── REPRESENTANTE ────────────────────────────────────────────────────────
  if (papelBase === 'representante') {
    const [meusProjetos, contagemDores] = await Promise.all([
      listarMeusProjetos().catch(() => []),
      contarMinhasDoresPorStatus().catch(() => ({
        rascunho: 0, em_moderacao: 0, publicada: 0, arquivada: 0, total: 0,
      })),
    ])

    return (
      <div className="p-[clamp(1.25rem,4vw,2rem)]">
        <BancadaRepresentante
          nome={nome}
          meusProjetos={meusProjetos}
          contagemDores={contagemDores}
        />
      </div>
    )
  }

  // ── COORDENADOR ──────────────────────────────────────────────────────────
  if (papelBase === 'coordenador') {
    const meusProjetos = await listarMeusProjetos().catch(() => [])
    const projetosCoord = meusProjetos.filter(
      (p) => p.papel_projeto === 'host' || p.papel_projeto === 'co_coordenador',
    )

    const indicacoesPorProjeto = await Promise.all(
      projetosCoord.slice(0, 5).map((p) =>
        listarIndicacoes(p.projeto_id).catch(() => []),
      ),
    )
    const todasIndicacoes = indicacoesPorProjeto.flat()

    return (
      <div className="p-[clamp(1.25rem,4vw,2rem)]">
        <BancadaCoordenador
          nome={nome}
          indicacoes={todasIndicacoes}
        />
      </div>
    )
  }

  // ── ALUNO ────────────────────────────────────────────────────────────────
  if (papelBase === 'aluno') {
    const [indicacoes, tarefas] = await Promise.all([
      listarMinhasIndicacoes().catch(() => []),
      listarMinhasTarefasAbertas().catch(() => []),
    ])

    return (
      <div className="p-[clamp(1.25rem,4vw,2rem)]">
        <BancadaAluno
          nome={nome}
          indicacoes={indicacoes}
          tarefas={tarefas}
        />
      </div>
    )
  }

  // ── Sem papel (onboarding não concluído) ─────────────────────────────────
  return (
    <div className="p-[clamp(1.25rem,4vw,2rem)]">
      <div className="mb-2">
        <span className="ubm-cota">BANCADA</span>
      </div>
      <h1 className="font-display mb-4 text-[clamp(1.6rem,4vw,2.4rem)] font-semibold">
        Bem-vindo à sua bancada.
      </h1>
      <div className="ubm-empty mt-10">
        <div className="ubm-empty-node" aria-hidden />
        <p className="ubm-empty-title">Complete seu cadastro para começar.</p>
        <p className="ubm-empty-msg">
          Defina seu papel para ver sua bancada personalizada.
        </p>
      </div>
    </div>
  )
}
