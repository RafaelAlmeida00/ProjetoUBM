/**
 * /admin — painel "blueprint" (casca).
 * Gate de is_admin está no layout.tsx pai.
 */
export default function AdminDashboardPage() {
  return (
    <div style={{ padding: 'clamp(1.25rem, 4vw, 2rem)' }}>
      <div style={{ marginBottom: '0.5rem' }}>
        <span className="ubm-cota">MODO MODERAÇÃO</span>
      </div>
      <h1
        className="font-display"
        style={{ fontSize: 'clamp(1.4rem, 3vw, 1.9rem)', fontWeight: 600, marginBottom: '1rem' }}
      >
        Painel de administração
      </h1>
      <p style={{ color: 'hsl(var(--muted-foreground))', maxWidth: '52ch', lineHeight: 1.65 }}>
        Use a navegação ao lado para moderar dores, gerir usuários, empresas, auditoria e
        backfill.
      </p>
    </div>
  )
}
