/**
 * ADR-0002 — /casos → redirect 301 para /dores
 * A vitrine de casos foi unificada em /dores (decisão ratificada pelo cliente 2026-06-12).
 * Este arquivo NÃO é deletado — preserva SEO/links externos via redirect permanente.
 * Remoção física só após 1 ciclo sem tráfego (ADR-0002 §consequências).
 */

import { redirect } from 'next/navigation'

export default function CasosPage() {
  redirect('/dores')
}
