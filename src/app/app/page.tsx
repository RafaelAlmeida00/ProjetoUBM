/**
 * T1 — /app dashboard role-aware "Bancada de trabalho" (casca).
 * Widgets ricos são ⏳ futuro (Onda 3+). Aqui entrega a casca com estados humanizados.
 */
export default function AppDashboardPage() {
  return (
    <div className="p-[clamp(1.25rem,4vw,2rem)]">
      <div className="mb-2">
        <span className="ubm-cota">BANCADA</span>
      </div>
      <h1
        className="font-display mb-4 text-[clamp(1.6rem,4vw,2.4rem)] font-semibold"
      >
        Bem-vindo à sua bancada.
      </h1>
      <p className="max-w-[52ch] leading-[1.65] text-[hsl(var(--muted-foreground))]">
        Use a navegação ao lado para acessar as dores, propor novas ou moderar envios.
      </p>

      {/* Estado vazio humanizado — widgets ricos são Onda 3+ */}
      <div className="ubm-empty mt-10">
        <div className="ubm-empty-node" aria-hidden />
        <p className="ubm-empty-title">Sua bancada está limpa.</p>
        <p className="ubm-empty-msg">
          As atividades e notificações aparecerão aqui conforme você usa a plataforma.
        </p>
      </div>
    </div>
  )
}
