/**
 * 009 T3 — /app/projetos (lista) → redirect /app/dores.
 * A vitrine única /app/dores já lista todas as dores publicadas (com selo de estágio, incl.
 * projetos avançados) — a "lista de projetos" virou redundante. O detalhe /app/dores/[id]
 * concentra a gestão. Stub preservado (ADR-0002 §consequências).
 */
import { redirect } from 'next/navigation'

export default function ProjetosListaPage() {
  redirect('/app/dores')
}
