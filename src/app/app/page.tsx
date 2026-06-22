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
import {
  obterMeuResumo,
  obterPainelEmpresa,
  obterVisaoGeral,
} from '@/lib/data/analytics'
import { PainelPessoal } from '@/components/analytics/PainelPessoal'
import { PainelEmpresa } from '@/components/analytics/PainelEmpresa'
import { VisaoGeral } from '@/components/analytics/VisaoGeral'

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

    // 008 — analytics (B1 + B3 para admin)
    const [resumoAdmin, visaoGeralAdmin] = await Promise.all([
      obterMeuResumo().catch(() => null),
      obterVisaoGeral().catch(() => ({ dados: null, locked: false, erro: true } as const)),
    ])

    return (
      <div className="ubm-shell--blueprint p-[clamp(1.25rem,4vw,2rem)]">
        <BancadaAdmin
          nome={nome}
          qtdDoresPendentes={qtdDoresPendentes}
          qtdProjetosPendentes={qtdProjetosPendentes}
        />
        {/* 008 — Painel pessoal (B1 — Velocidade A) */}
        <div style={{ marginTop: '2rem' }}>
          <PainelPessoal dados={resumoAdmin} />
        </div>
        {/* 008 — Visão Geral (B3 — Velocidade B, admin vê tudo) */}
        <div style={{ marginTop: '1.5rem' }}>
          <VisaoGeral resultado={visaoGeralAdmin} />
        </div>
      </div>
    )
  }

  // ── REPRESENTANTE ────────────────────────────────────────────────────────
  if (papelBase === 'representante') {
    const [meusProjetos, contagemDores, resumoRep, painelEmp] = await Promise.all([
      listarMeusProjetos().catch(() => []),
      contarMinhasDoresPorStatus().catch(() => ({
        rascunho: 0, em_moderacao: 0, publicada: 0, arquivada: 0, total: 0,
      })),
      obterMeuResumo().catch(() => null),          // 008 B1
      obterPainelEmpresa().catch(() => null),       // 008 B2
    ])

    return (
      <div className="p-[clamp(1.25rem,4vw,2rem)]">
        <BancadaRepresentante
          nome={nome}
          meusProjetos={meusProjetos}
          contagemDores={contagemDores}
        />
        {/* 008 — Painel pessoal (B1 — Velocidade A) */}
        <div style={{ marginTop: '2rem' }}>
          <PainelPessoal dados={resumoRep} />
        </div>
        {/* 008 — Painel da empresa (B2 — Velocidade A, sem nome de aluno) */}
        <div style={{ marginTop: '1.5rem' }}>
          <PainelEmpresa dados={painelEmp} />
        </div>
      </div>
    )
  }

  // ── COORDENADOR ──────────────────────────────────────────────────────────
  if (papelBase === 'coordenador') {
    const meusProjetos = await listarMeusProjetos().catch(() => [])
    // Só projetos com a JANELA AINDA ABERTA (em_analise) onde o coord é host/co — são os que
    // pedem ação. Projetos já fechados (aprovado+) não contam como "candidatura a revisar".
    const projetosAbertos = meusProjetos.filter(
      (p) => (p.papel_projeto === 'host' || p.papel_projeto === 'co_coordenador') && p.status === 'em_analise',
    )
    // Projeto onde o coord é HOST: ele pode compor a equipe → CTA leva direto ao detalhe da dor.
    // 009 T15: navega por dor_id (a gestão vive em /app/dores/<dor_id>), não mais por projeto_id.
    const hostDorId = projetosAbertos.find((p) => p.papel_projeto === 'host')?.dor_id

    const indicacoesPorProjeto = await Promise.all(
      projetosAbertos.slice(0, 5).map((p) =>
        listarIndicacoes(p.projeto_id).catch(() => []),
      ),
    )
    // Exclui a PRÓPRIA indicação do coordenador (não conta a si como candidato a revisar).
    const todasIndicacoes = indicacoesPorProjeto.flat().filter((i) => i.pessoa_id !== user!.id)

    // 008 — analytics (B1 + B3 para coordenador)
    const [resumoCoord, visaoGeralCoord] = await Promise.all([
      obterMeuResumo().catch(() => null),
      obterVisaoGeral().catch(() => ({ dados: null, locked: false, erro: true } as const)),
    ])

    return (
      <div className="p-[clamp(1.25rem,4vw,2rem)]">
        <BancadaCoordenador
          nome={nome}
          indicacoes={todasIndicacoes}
          hostDorId={hostDorId}
        />
        {/* 008 — Painel pessoal (B1 — Velocidade A) */}
        <div style={{ marginTop: '2rem' }}>
          <PainelPessoal dados={resumoCoord} />
        </div>
        {/* 008 — Visão Geral (B3 — Velocidade B, coordenador vê seus cursos) */}
        <div style={{ marginTop: '1.5rem' }}>
          <VisaoGeral resultado={visaoGeralCoord} />
        </div>
      </div>
    )
  }

  // ── ALUNO ────────────────────────────────────────────────────────────────
  if (papelBase === 'aluno') {
    const [indicacoes, tarefas, resumoAluno] = await Promise.all([
      listarMinhasIndicacoes().catch(() => []),
      listarMinhasTarefasAbertas().catch(() => []),
      obterMeuResumo().catch(() => null),          // 008 B1
    ])

    return (
      <div className="p-[clamp(1.25rem,4vw,2rem)]">
        <BancadaAluno
          nome={nome}
          indicacoes={indicacoes}
          tarefas={tarefas}
        />
        {/* 008 — Painel pessoal (B1 — Velocidade A) */}
        <div style={{ marginTop: '2rem' }}>
          <PainelPessoal dados={resumoAluno} />
        </div>
        {/* 008 — VisaoGeral (B3) — aluno é negado pelo banco (42501 → .ubm-locked) */}
        <div style={{ marginTop: '1.5rem' }}>
          <VisaoGeral resultado={{ dados: null, locked: true }} />
        </div>
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
