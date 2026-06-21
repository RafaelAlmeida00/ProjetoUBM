'use client'
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { getPerfilAction, atualizarPerfil } from '@/lib/actions/perfil'
import { useToast } from '@/components/feedback/ToastProvider'

/**
 * T4 — /app/conta: perfil do usuário.
 * Verificação de conta NÃO aparece mais aqui: o login Google já verifica a conta
 * (decisão $0 / sem domínio — migração 0045). Acessível pelo menu "Meu Perfil".
 *
 * Fix identidade: botão Salvar chama atualizarPerfil (nomePublico + rankingOptin);
 * checkbox ranking_optin funcional; feedback .ubm-save-feedback com ícones (ux-ui 2026-06-12).
 */
export default function ContaPage() {
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [nomePub, setNomePub] = useState('')
  const [rankingOptin, setRankingOptin] = useState(false)
  const toast = useToast()

  useEffect(() => {
    getPerfilAction().then((p) => {
      setNomePub(p?.nome_publico ?? '')
      setRankingOptin(p?.ranking_optin ?? false)
      setLoading(false)
    })
  }, [])

  const handleSalvar = async () => {
    setSalvando(true)
    const result = await atualizarPerfil({ nomePublico: nomePub, rankingOptin })
    setSalvando(false)
    if (result.ok) {
      toast.sucesso('Perfil atualizado.')
    } else {
      toast.erro(result.error ?? 'Não foi possível salvar seu perfil. Tente novamente.')
    }
  }

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
        {/* Campo Nome público com helper contextual (ux-ui 2026-06-12) */}
        <div className="ubm-field">
          <label htmlFor="nome_publico" className="ubm-field-label">
            Nome público
          </label>
          <input
            id="nome_publico"
            type="text"
            className="ubm-combobox-input"
            value={nomePub}
            onChange={(e) => {
              setNomePub(e.target.value)
            }}
            placeholder="Seu nome público na plataforma"
            aria-describedby="nome_publico-help"
          />
          <p id="nome_publico-help" className="ubm-field-help">
            Esse é o nome que aparece para colegas, coordenadores e nos rankings (se você optar).
          </p>
        </div>

        {/* Checkbox ranking opt-in */}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginTop: '1rem',
            cursor: 'pointer',
            fontSize: '0.9rem',
          }}
        >
          <input
            type="checkbox"
            checked={rankingOptin}
            onChange={(e) => setRankingOptin(e.target.checked)}
            style={{ width: '1.1rem', height: '1.1rem', accentColor: 'hsl(var(--primary))' }}
          />
          Aparecer com meu nome nos rankings públicos (opcional)
        </label>

        {/* Botão Salvar — desabilitado se nome vazio ou salvando */}
        <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="ubm-btn ubm-btn-primary"
            disabled={salvando || nomePub.trim() === ''}
            onClick={handleSalvar}
          >
            {salvando ? (
              <>
                <Loader2 size={14} className="animate-spin" aria-hidden />
                Salvando…
              </>
            ) : (
              'Salvar'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
