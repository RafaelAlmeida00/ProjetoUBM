'use client'
import { useEffect } from 'react'
import Link from 'next/link'
import { clearDraft } from '@/lib/wizard/draft'

// AC6 — confirmação. Limpa o rascunho ao chegar aqui (RS15/I-04).
export default function ConfirmacaoPage() {
  useEffect(() => {
    clearDraft()
  }, [])

  return (
    <div className="ubm-confirmacao">
      <h1>Recebemos sua proposta 🎉</h1>
      <p>
        Obrigado! Sua dor foi registrada. A equipe da UBM vai analisar e, se fizer sentido para um
        projeto de extensão, entraremos em contato pelo e-mail da sua conta.
      </p>
      <Link href="/conta" className="ubm-btn ubm-btn-primary">
        Ir para minha conta
      </Link>
    </div>
  )
}
