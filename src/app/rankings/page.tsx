import { FrescorBadge } from '@/components/analytics/FrescorBadge'
import { EmptyState } from '@/components/analytics/EmptyState'
import { PodioRanking } from '@/components/analytics/PodioRanking'
import { obterRankingsPublicos } from '@/lib/data/analytics'

/**
 * /rankings — tela pública/anônima (RSC, sem login).
 * 3 pódios k-anônimos + "Outros (N)" + carimbo + prova social.
 * Velocidade B (MV + carimbo). design §5 / CA12/CA13.
 */
export default async function RankingsPage() {
  const rankings = await obterRankingsPublicos()

  const temDados =
    rankings.alunos.length > 0 ||
    rankings.coordenadores.length > 0 ||
    rankings.empresas.length > 0

  return (
    <div className="ubm-mesh" style={{ minHeight: '100dvh' }}>
      {/* Header público (usa .ubm-header — reutiliza da landing) */}
      <header className="ubm-header">
        <div className="ubm-header-brand">
          <span className="ubm-cota">UBM · PLATAFORMA</span>
        </div>
        <nav className="ubm-header-nav">
          <a href="/">Início</a>
          <a href="/dores">Dores</a>
          <a href="/login">Entrar</a>
        </nav>
      </header>

      <main style={{ maxWidth: '70rem', margin: '0 auto', padding: 'clamp(2rem, 6vw, 4rem) clamp(1.25rem, 5vw, 3rem)' }}>
        {/* ── Cabeçalho da prova social ── */}
        <div style={{ marginBottom: 'clamp(2rem, 5vw, 3.5rem)' }}>
          <p className="ubm-cota" style={{ marginBottom: '0.75rem' }}>
            QUEM MAIS ENTREGA
          </p>
          <h1
            className="font-display"
            style={{
              fontSize: 'clamp(2rem, 5vw, 3.2rem)',
              fontWeight: 600,
              lineHeight: 1.1,
              marginBottom: '0.75rem',
            }}
          >
            Os que transformam dor em entrega.
          </h1>
          <p style={{ color: 'hsl(var(--muted-foreground))', maxWidth: '52ch', marginBottom: '1.25rem' }}>
            Rankings de alunos, coordenadores e empresas da UBM pelo número de projetos finalizados.
            Case Barra Mansa: a cidade que escolheu transformar suas dores em inovação.
          </p>

          {/* Carimbo único que vale para os 3 pódios (Velocidade B — design §5.0) */}
          <FrescorBadge atualizado_em={rankings.atualizado_em} />
        </div>

        {/* ── 3 pódios ── */}
        {temDados ? (
          <div style={{ display: 'grid', gap: 'clamp(1.5rem, 4vw, 2.5rem)' }}>
            <PodioRanking
              titulo="ALUNOS"
              itens={rankings.alunos}
              outrosCount={rankings.outros_alunos}
              territorio="primary"
            />
            <PodioRanking
              titulo="COORDENADORES"
              itens={rankings.coordenadores}
              outrosCount={rankings.outros_coordenadores}
              territorio="primary"
            />
            <PodioRanking
              titulo="EMPRESAS"
              itens={rankings.empresas}
              outrosCount={rankings.outros_empresas}
              territorio="accent"
            />
          </div>
        ) : (
          <EmptyState
            titulo="Ainda estamos somando as entregas."
            mensagem="Os primeiros projetos finalizados aparecerão aqui em breve."
            cta={{ label: 'Veja como funciona', href: '/' }}
          />
        )}

        {/* ── Nota de método (transparência LGPD como confiança) ── */}
        <footer
          className="ubm-cota ubm-cota--muted"
          style={{ marginTop: 'clamp(3rem, 6vw, 5rem)', paddingTop: '1.5rem', borderTop: '1px solid hsl(var(--border))' }}
        >
          Mostramos apenas quem escolheu aparecer e grupos com pelo menos 5 pessoas.
          Nunca exibimos e-mail, telefone ou dados de contato.
        </footer>
      </main>
    </div>
  )
}
