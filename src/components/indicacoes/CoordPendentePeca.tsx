/**
 * Onda 2 — A4: peça "EM ANÁLISE" para coordenador pendente de aprovação.
 * Exibida em /app/indicacoes quando coordPendente=true.
 * Variante do .ubm-locked com kicker warning e microcopy distinta.
 * Sem CTA — usuário aguarda ação do admin.
 */
export function CoordPendentePeca() {
  return (
    <section className="ubm-section-block">
      <div
        className="ubm-locked"
        style={{ borderColor: 'hsl(var(--warning) / 0.4)' }}
        role="status"
        aria-live="polite"
      >
        <span
          className="ubm-cota ubm-cota--muted"
          style={{ color: 'hsl(var(--warning))' }}
        >
          EM ANÁLISE
        </span>
        <span className="ubm-locked-title">
          Seu acesso de coordenador está em análise
        </span>
        <p className="ubm-locked-msg">
          Você poderá ver as indicações do seu curso assim que um administrador
          aprovar seu cadastro. Aguardando aprovação de um administrador da UBM.
        </p>
      </div>
    </section>
  )
}
