'use client'
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { getPerfilAction, type PerfilData } from '@/lib/actions/perfil'

/**
 * T4 — /app/conta: perfil do usuário.
 * Verificação de conta NÃO aparece mais aqui: o login Google já verifica a conta
 * (decisão $0 / sem domínio — migração 0045). Acessível pelo menu "Meu Perfil".
 */
export default function ContaPage() {
  const [perfil, setPerfil] = useState<PerfilData | null>(null)
  const [loading, setLoading] = useState(true)
  const [nomePub, setNomePub] = useState('')

  useEffect(() => {
    getPerfilAction().then((p) => {
      setPerfil(p)
      setNomePub(p?.nome_publico ?? '')
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="ubm-conta">
        <Loader2 className="animate-spin" aria-hidden />
        <p>Carregando perfil…</p>
      </div>
    )
  }

  return (
    <div className="ubm-conta" style={{ alignItems: 'stretch', maxWidth: '42rem', margin: '0 auto' }}>
      <div style={{ marginBottom: '0.25rem' }}>
        <span className="ubm-cota">CONTA</span>
      </div>
      <h1
        className="font-display"
        style={{ fontSize: 'clamp(1.6rem, 4vw, 2rem)', fontWeight: 600, marginBottom: '1.25rem' }}
      >
        {nomePub || 'Meu perfil'}
      </h1>

      <div className="ubm-machined" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
        <label
          htmlFor="nome_publico"
          style={{ display: 'block', fontWeight: 600, marginBottom: '0.35rem', fontSize: '0.9rem' }}
        >
          Nome público
        </label>
        <input
          id="nome_publico"
          type="text"
          className="ubm-combobox-input"
          value={nomePub}
          onChange={(e) => setNomePub(e.target.value)}
          placeholder="Seu nome público na plataforma"
        />
        <label
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem', cursor: 'pointer', fontSize: '0.9rem' }}
        >
          <input
            type="checkbox"
            checked={perfil?.ranking_optin ?? false}
            onChange={() => { /* update via action — Onda 3 */ }}
            style={{ width: '1.1rem', height: '1.1rem', accentColor: 'hsl(var(--primary))' }}
          />
          Aparecer com meu nome nos rankings públicos (opcional)
        </label>
      </div>
    </div>
  )
}
