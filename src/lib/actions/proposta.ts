'use server'
/**
 * T4.2/T4.3/T4.4 — Server Actions de proposta/assinatura.
 * Padrão: equipe.ts (Server Action → RPC + mapDbError + revalidatePath).
 * service_role NUNCA aqui — somente no webhook (RS10/V1).
 */
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getSignatureGateway } from '@/lib/signature/gateway'

export type ActionResult = { ok: true } | { ok: false; error: string }

const MAX_PDF_SIZE = 10 * 1024 * 1024 // 10 MB (RS12 / arch §4.6)

function validarPdf(file: File): string | null {
  if (file.type !== 'application/pdf') {
    return 'Apenas arquivos PDF são aceitos.'
  }
  if (file.size > MAX_PDF_SIZE) {
    return 'O arquivo PDF não pode ultrapassar 10 MB.'
  }
  return null
}

// ── T4.2 — enviarProposta (Caminho A) ────────────────────────────────────────

export interface EnviarPropostaParams {
  projetoId: string
  documentoId: string
  signatario: { nome: string; email: string }
  pdf: File
}

/**
 * Caminho A: valida PDF → upload bucket → gateway.criarPedido → RPC enviar_proposta.
 * AUTZ é do banco (RPC SECURITY DEFINER valida is_project_host + esta_verificado).
 */
export async function enviarProposta(params: EnviarPropostaParams): Promise<ActionResult> {
  try {
    const pdfErr = validarPdf(params.pdf)
    if (pdfErr) return { ok: false, error: pdfErr }

    const supabase = await createSupabaseServerClient()

    // 1. Upload ao bucket privado 'propostas'
    const storagePath = `${params.projetoId}/${params.documentoId}-original.pdf`
    const arrayBuf = await params.pdf.arrayBuffer()
    const { error: uploadErr } = await supabase.storage
      .from('propostas')
      .upload(storagePath, arrayBuf, {
        contentType: 'application/pdf',
        upsert: false,
      })
    if (uploadErr) return { ok: false, error: mapDbError(uploadErr.message) }

    // 2. Criar pedido no gateway (Caminho A — com cláusula de aceite CA4)
    const gateway = getSignatureGateway()
    const pedido = await gateway.criarPedido({
      projetoId: params.projetoId,
      documentoId: params.documentoId,
      storagePath,
      signatario: params.signatario,
      clausulaAceiteMeioEletronico: true,
    })

    // 3. RPC enviar_proposta (AUTZ + INSERT documento_proposta + assinatura + UPDATE projeto)
    const { error: rpcErr } = await supabase.rpc('enviar_proposta', {
      p_projeto_id: params.projetoId,
      p_storage_path: storagePath,
      p_provedor_doc_id: pedido.provedor_doc_id,
    })
    if (rpcErr) return { ok: false, error: mapDbError(rpcErr.message) }

    // 4. Revalidar
    revalidatePath(`/app/dores`, 'layout')
    revalidatePath('/app/notificacoes')
    revalidatePath('/app')

    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: mapDbError(msg) }
  }
}

// ── T4.3 — enviarDocumentoAssinado (Caminho B — upload livre) ────────────────

export interface EnviarDocumentoAssinadoParams {
  projetoId: string
  documentoId: string
  pdfAssinado: File
}

/**
 * Caminho B: valida PDF → upload do PDF assinado → RPC confirmar_assinatura(upload_livre).
 * SEM chamada externa. AUTZ é do banco (RPC valida is_company_rep + documento vigente).
 */
export async function enviarDocumentoAssinado(
  params: EnviarDocumentoAssinadoParams,
): Promise<ActionResult> {
  try {
    const pdfErr = validarPdf(params.pdfAssinado)
    if (pdfErr) return { ok: false, error: pdfErr }

    const supabase = await createSupabaseServerClient()

    // 1. Upload do PDF assinado ao bucket privado 'propostas'
    const storagePath = `${params.projetoId}/${params.documentoId}-assinado.pdf`
    const arrayBuf = await params.pdfAssinado.arrayBuffer()
    const { error: uploadErr } = await supabase.storage
      .from('propostas')
      .upload(storagePath, arrayBuf, {
        contentType: 'application/pdf',
        upsert: true, // 2º upload do mesmo doc → sobrescreve (no-op da RPC garante idempotência)
      })
    if (uploadErr) return { ok: false, error: mapDbError(uploadErr.message) }

    // 2. RPC confirmar_assinatura (idempotente — no-op se já assinada CA25)
    // p_chave = documento_id (Caminho B); prova já persistida antes da virada (RN11)
    const { error: rpcErr } = await supabase.rpc('confirmar_assinatura', {
      p_origem: 'upload_livre',
      p_chave: params.documentoId,
      p_storage_path: storagePath,
      p_evidencias: {
        origem: 'upload_livre',
        uploaded_at: new Date().toISOString(),
      },
    })
    if (rpcErr) return { ok: false, error: mapDbError(rpcErr.message) }

    // 3. Revalidar
    revalidatePath(`/app/dores`, 'layout')
    revalidatePath('/app/notificacoes')
    revalidatePath('/app')

    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: mapDbError(msg) }
  }
}

// ── T4.4 — contrapropor ──────────────────────────────────────────────────────

export interface ContrapropOrParams {
  projetoId: string
  motivo: string
  /** Presente apenas no Caminho A — provedor_doc_id para cancelar no Autentique */
  provedorDocId?: string
  /** origem: 'autentique' | 'upload_livre' — determina se cancela no gateway */
  origem?: 'autentique' | 'upload_livre'
}

/**
 * Representante contrapropõe → cancela pedido no Autentique (Caminho A) + RPC.
 * AUTZ: RPC valida is_company_rep + estado proposta_em_analise + motivo obrigatório.
 */
export async function contrapropor(params: ContrapropOrParams): Promise<ActionResult> {
  try {
    // Se Caminho A: cancela o pedido pendente no Autentique (RS15/CA12)
    if (params.origem === 'autentique' && params.provedorDocId) {
      const gateway = getSignatureGateway()
      await gateway.cancelarPedido(params.provedorDocId)
    }

    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.rpc('contrapropor_proposta', {
      p_projeto_id: params.projetoId,
      p_motivo: params.motivo,
    })
    if (error) return { ok: false, error: mapDbError(error.message) }

    revalidatePath(`/app/dores`, 'layout')
    revalidatePath('/app/notificacoes')
    revalidatePath('/app')

    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: mapDbError(msg) }
  }
}

// ── T4.4 — iniciarExecucao ───────────────────────────────────────────────────

/**
 * Host inicia a execução (proposta_aprovada → em_execucao).
 * AUTZ: RPC valida is_project_host + guarda de transição.
 */
export async function iniciarExecucao(projetoId: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.rpc('iniciar_execucao', { p_projeto_id: projetoId })
    if (error) return { ok: false, error: mapDbError(error.message) }

    revalidatePath(`/app/dores`, 'layout')
    revalidatePath('/app/notificacoes')
    revalidatePath('/app')

    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: mapDbError(msg) }
  }
}

// ── T4.4 — finalizarProjeto ──────────────────────────────────────────────────

/**
 * Host finaliza o projeto (em_execucao → finalizado).
 * AUTZ: RPC valida is_project_host + guarda de transição (pular etapa = negado — CA17).
 */
export async function finalizarProjeto(projetoId: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.rpc('finalizar_projeto', { p_projeto_id: projetoId })
    if (error) return { ok: false, error: mapDbError(error.message) }

    revalidatePath(`/app/dores`, 'layout')
    revalidatePath('/app/notificacoes')
    revalidatePath('/app')

    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: mapDbError(msg) }
  }
}

// ── mapDbError ───────────────────────────────────────────────────────────────

function mapDbError(msg: string): string {
  if (/host.*verificado|esta_verificado|conta.*verificad/i.test(msg))
    return 'Apenas hosts com conta verificada podem enviar propostas.'
  if (/is_project_host|nao.*host|not.*host/i.test(msg))
    return 'Apenas o host do projeto pode realizar esta ação.'
  if (/aguardando_proposta|proposta.*analise|status.*incorreto/i.test(msg))
    return 'O projeto não está no estado correto para esta ação.'
  if (/is_company_rep|nao.*representante|not.*rep/i.test(msg))
    return 'Apenas o representante da empresa pode realizar esta ação.'
  if (/motivo.*obrigatorio|motivo.*vazio|motivo.*required/i.test(msg))
    return 'O motivo da contraproposta é obrigatório.'
  if (/proposta.*aprovada|nao.*aprovad/i.test(msg))
    return 'A proposta não foi aprovada ainda. Não é possível iniciar a execução.'
  if (/em_execucao|nao.*execucao/i.test(msg))
    return 'O projeto não está em execução. Não é possível finalizar.'
  if (/superado|obsoleto|versao.*superada|documento.*superado/i.test(msg))
    return 'Este documento foi superado por uma contraproposta. Faça o upload da versão mais recente.'
  if (/prova.*ausente|storage_path.*null|prova.*assinada.*ausente/i.test(msg))
    return 'A prova de assinatura é obrigatória antes de confirmar.'
  if (/pdf|mime|application\/pdf/i.test(msg))
    return 'Apenas arquivos PDF são aceitos.'
  if (/tamanho|size|10mb|limite/i.test(msg))
    return 'O arquivo excede o tamanho máximo permitido (10 MB).'
  if (/bucket.*full|storage.*error|upload.*fail/i.test(msg))
    return 'Erro ao armazenar o arquivo. Tente novamente.'
  if (/permissao|permission|negado|denied|not authorized/i.test(msg))
    return 'Você não tem permissão para esta operação.'
  if (/Autentique|autentique/i.test(msg)) return msg // degrada com msg honesta do adapter
  return 'Não foi possível processar a operação. Tente novamente.'
}
