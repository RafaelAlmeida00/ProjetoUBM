'use client'
import React, { useEffect, useState } from 'react'
import {
  Shield,
  ShieldOff,
  Loader2,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Pencil,
} from 'lucide-react'
import {
  listarUsuarios,
  revogarAdmin,
  concederAdmin,
  revogarPapel,
  concederPapel,
  concederCoordenador,
  concederRepresentante,
  adminEditarPerfil,
  obterSessaoAdmin,
  listarCoordenadoresPendentes,
  aprovarCoordenador,
  recusarCoordenador,
  type UsuarioAdmin,
  type CoordenadorPendente,
} from '@/lib/actions/admin-usuarios'
import { CURSOS_UBM, type CursoUbm } from '@/lib/courses'
import { CourseMultiSelect } from '@/components/course/CourseMultiSelect'
import { EmpresaCombobox } from '@/components/empresa/EmpresaCombobox'
import type { EmpresaResult } from '@/lib/actions/empresa'

// Cursos disponíveis para conceder coordenação (exclui nao_sei)
const CURSOS_COORD = CURSOS_UBM.filter((c) => c.value !== 'nao_sei')

// 0057: coordenador usa RPC própria; representante também usa RPC própria (com empresa).
// concederPapel só é válido para 'aluno'.
const PAPEIS_SIMPLES = ['aluno'] as const

// Mapa papel → label legível
const PAPEL_LABEL: Record<string, string> = {
  aluno: 'Aluno',
  representante: 'Representante',
  coordenador: 'Coordenador',
}

// Mapa papel → modifier CSS
const PAPEL_CHIP_MOD: Record<string, string> = {
  aluno: 'ubm-member-papel-chip--aluno',
  representante: 'ubm-member-papel-chip--host',
  coordenador: 'ubm-member-papel-chip--coordenador',
}

// ─── ConfirmDialog ────────────────────────────────────────────────────────────

interface ConfirmDialogProps {
  open: boolean
  titulo: string
  mensagem: string
  confirmVariant?: 'primary' | 'destructive'
  /** Exige checkbox antes de habilitar Confirmar (confirmação forte p/ conceder admin) */
  checkboxLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmDialog({
  open,
  titulo,
  mensagem,
  confirmVariant = 'destructive',
  checkboxLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [checked, setChecked] = useState(false)

  if (!open) return null

  const confirmarDisabled = Boolean(checkboxLabel && !checked)

  return (
    <div className="ubm-modal-overlay" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="ubm-modal ubm-machined">
        <div className="ubm-confirm">
          <p className="ubm-confirm-title">{titulo}</p>
          <p className="ubm-confirm-msg">{mensagem}</p>
          {checkboxLabel && (
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                style={{ marginTop: '0.2rem', flexShrink: 0 }}
              />
              <span className="ubm-confirm-msg" style={{ margin: 0 }}>
                {checkboxLabel}
              </span>
            </label>
          )}
          <div className="ubm-confirm-actions">
            <button type="button" className="ubm-btn ubm-btn-ghost" onClick={onCancel}>
              Cancelar
            </button>
            <button
              type="button"
              className={`ubm-btn ${confirmVariant === 'primary' ? 'ubm-btn-primary' : 'ubm-btn-destructive'}`}
              onClick={onConfirm}
              disabled={confirmarDisabled}
              aria-disabled={confirmarDisabled}
            >
              Confirmar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── PainelGerir (expand inline por usuário) ──────────────────────────────────

interface PainelGerirProps {
  usuario: UsuarioAdmin
  currentUserId: string | null
  adminCount: number
  onRefresh: (update: (prev: UsuarioAdmin[]) => UsuarioAdmin[]) => void
  onToast: (msg: string) => void
}

type PendingAction =
  | { tipo: 'revogar-papel'; role: string }
  | { tipo: 'conceder-papel'; role: string; cursoSlugs?: string[]; empresaId?: string; empresaNome?: string }
  | { tipo: 'conceder-admin' }
  | { tipo: 'revogar-admin' }
  | null

function PainelGerir({
  usuario,
  currentUserId,
  adminCount,
  onRefresh,
  onToast,
}: PainelGerirProps) {
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [selectedPapel, setSelectedPapel] = useState('')
  // 0057: coordenador → N slugs via CourseMultiSelect
  const [selectedCursos, setSelectedCursos] = useState<CursoUbm[]>([])
  // 0057: representante → empresa obrigatória via EmpresaCombobox
  const [selectedEmpresa, setSelectedEmpresa] = useState<EmpresaResult | null>(null)
  const [editandoNome, setEditandoNome] = useState(false)
  const [nomeEditado, setNomeEditado] = useState(usuario.nome)
  const [salvandoNome, setSalvandoNome] = useState(false)
  const [carregando, setCarregando] = useState(false)

  const isSelf = currentUserId === usuario.id
  const isLastAdmin = adminCount <= 1

  // Papéis que o usuário já tem
  const papeisAtuais = new Set(usuario.papeis)

  // Papéis simples disponíveis para conceder via concederPapel (só 'aluno' — 0057)
  const papeisDisponiveis = PAPEIS_SIMPLES.filter((p) => !papeisAtuais.has(p))
  const podeOfereceCoord = !papeisAtuais.has('coordenador')
  const podeOfereceRepresentante = !papeisAtuais.has('representante')
  // Opções para o <select>: aluno (via concederPapel) + coordenador + representante (via RPCs próprias)
  const opcoesPapel = [
    ...papeisDisponiveis,
    ...(podeOfereceCoord ? (['coordenador'] as const) : []),
    ...(podeOfereceRepresentante ? (['representante'] as const) : []),
  ]

  const isCoordenador = selectedPapel === 'coordenador'
  const isRepresentante = selectedPapel === 'representante'
  const concederDisabled =
    !selectedPapel ||
    (isCoordenador && selectedCursos.length === 0) ||
    (isRepresentante && !selectedEmpresa)

  const getCursoLabel = (cursoId: string) =>
    CURSOS_COORD.find((c) => c.value === cursoId)?.label ?? cursoId

  // Constrói as mensagens de confirmação
  function getMensagemConfirm(): { titulo: string; mensagem: string; confirmVariant: 'primary' | 'destructive'; checkboxLabel?: string } {
    if (!pendingAction) return { titulo: '', mensagem: '', confirmVariant: 'destructive' }
    switch (pendingAction.tipo) {
      case 'revogar-papel':
        return {
          titulo: 'Revogar papel',
          mensagem: `Remover o papel de ${PAPEL_LABEL[pendingAction.role] ?? pendingAction.role} de ${usuario.nome}? Ele perde o acesso vinculado a esse papel.`,
          confirmVariant: 'destructive',
        }
      case 'conceder-papel':
        if (pendingAction.role === 'coordenador') {
          const cursosLabel = (pendingAction.cursoSlugs ?? [])
            .map(getCursoLabel)
            .join(', ')
          return {
            titulo: 'Conceder coordenador',
            mensagem: `Conceder a ${usuario.nome} o papel de coordenador, já aprovado, nos cursos: ${cursosLabel}?`,
            confirmVariant: 'primary',
          }
        }
        if (pendingAction.role === 'representante') {
          return {
            titulo: 'Conceder representante',
            mensagem: `Conceder a ${usuario.nome} o papel de representante vinculado à empresa ${pendingAction.empresaNome ?? ''}?`,
            confirmVariant: 'primary',
          }
        }
        return {
          titulo: 'Conceder papel',
          mensagem: `Conceder o papel de ${PAPEL_LABEL[pendingAction.role] ?? pendingAction.role} a ${usuario.nome}?`,
          confirmVariant: 'primary',
        }
      case 'conceder-admin':
        return {
          titulo: 'Conceder acesso de administrador',
          mensagem: `Você vai tornar ${usuario.nome} administrador da plataforma. Administradores podem gerir todos os usuários, papéis e o próprio acesso de admin. Confirme apenas se tem certeza.`,
          confirmVariant: 'destructive',
          checkboxLabel: 'Entendo que isto concede privilégios totais de administração.',
        }
      case 'revogar-admin':
        return {
          titulo: 'Revogar acesso de administrador',
          mensagem: `Remover o acesso de administrador de ${usuario.nome}?`,
          confirmVariant: 'destructive',
        }
    }
  }

  async function executarAcao() {
    if (!pendingAction) return
    setCarregando(true)
    setPendingAction(null)

    switch (pendingAction.tipo) {
      case 'revogar-papel': {
        const res = await revogarPapel(usuario.id, pendingAction.role)
        if (res.ok) {
          onRefresh((prev) =>
            prev.map((u) =>
              u.id === usuario.id
                ? {
                    ...u,
                    papeis: u.papeis.filter((p) => p !== pendingAction.role),
                    cursos_coordenados:
                      pendingAction.role === 'coordenador' ? [] : u.cursos_coordenados,
                  }
                : u,
            ),
          )
          onToast(`Papel de ${PAPEL_LABEL[pendingAction.role] ?? pendingAction.role} removido de ${usuario.nome}.`)
        } else {
          onToast('Não foi possível concluir. Tente novamente.')
        }
        break
      }
      case 'conceder-papel': {
        if (pendingAction.role === 'coordenador' && pendingAction.cursoSlugs && pendingAction.cursoSlugs.length > 0) {
          // 0057: N cursos via concederCoordenador(userId, slugs[])
          const res = await concederCoordenador(usuario.id, pendingAction.cursoSlugs)
          if (res.ok) {
            const novosCursos = pendingAction.cursoSlugs.map((slug) => ({
              curso_id: slug,
              curso_label: getCursoLabel(slug),
            }))
            onRefresh((prev) =>
              prev.map((u) =>
                u.id === usuario.id
                  ? {
                      ...u,
                      papeis: u.papeis.includes('coordenador') ? u.papeis : [...u.papeis, 'coordenador'],
                      cursos_coordenados: [
                        ...(u.cursos_coordenados ?? []),
                        ...novosCursos,
                      ],
                    }
                  : u,
              ),
            )
            const cursosLabel = pendingAction.cursoSlugs.map(getCursoLabel).join(', ')
            onToast(`Papel de coordenador concedido a ${usuario.nome} (${cursosLabel}).`)
          } else {
            onToast('Não foi possível concluir. Tente novamente.')
          }
        } else if (pendingAction.role === 'representante' && pendingAction.empresaId) {
          // 0057: representante via concederRepresentante(userId, empresaId)
          const res = await concederRepresentante(usuario.id, pendingAction.empresaId)
          if (res.ok) {
            onRefresh((prev) =>
              prev.map((u) =>
                u.id === usuario.id
                  ? { ...u, papeis: u.papeis.includes('representante') ? u.papeis : [...u.papeis, 'representante'] }
                  : u,
              ),
            )
            onToast(`Papel de representante concedido a ${usuario.nome}.`)
          } else {
            onToast('Não foi possível concluir. Tente novamente.')
          }
        } else {
          // aluno — via concederPapel
          const res = await concederPapel(usuario.id, pendingAction.role)
          if (res.ok) {
            onRefresh((prev) =>
              prev.map((u) =>
                u.id === usuario.id
                  ? { ...u, papeis: [...u.papeis, pendingAction.role] }
                  : u,
              ),
            )
            onToast(`Papel de ${PAPEL_LABEL[pendingAction.role] ?? pendingAction.role} concedido a ${usuario.nome}.`)
          } else {
            onToast('Não foi possível concluir. Tente novamente.')
          }
        }
        setSelectedPapel('')
        setSelectedCursos([])
        setSelectedEmpresa(null)
        break
      }
      case 'conceder-admin': {
        const res = await concederAdmin(usuario.id)
        if (res.ok) {
          onRefresh((prev) =>
            prev.map((u) => (u.id === usuario.id ? { ...u, is_admin: true } : u)),
          )
          onToast('Acesso de administrador concedido.')
        } else {
          onToast('Não foi possível concluir. Tente novamente.')
        }
        break
      }
      case 'revogar-admin': {
        const res = await revogarAdmin(usuario.id)
        if (res.ok) {
          onRefresh((prev) =>
            prev.map((u) => (u.id === usuario.id ? { ...u, is_admin: false } : u)),
          )
          onToast('Acesso de administrador revogado.')
        } else {
          onToast('Não foi possível concluir. Tente novamente.')
        }
        break
      }
    }

    setCarregando(false)
  }

  async function salvarNome() {
    const nome = nomeEditado.trim()
    if (!nome) return
    setSalvandoNome(true)
    const res = await adminEditarPerfil(usuario.id, nome)
    setSalvandoNome(false)
    if (res.ok) {
      onRefresh((prev) =>
        prev.map((u) => (u.id === usuario.id ? { ...u, nome } : u)),
      )
      setEditandoNome(false)
      onToast(`Nome atualizado para ${nome}.`)
    } else {
      onToast('Não foi possível concluir. Tente novamente.')
    }
  }

  const confirm = getMensagemConfirm()

  return (
    <tr>
      <td
        colSpan={4}
        style={{ padding: 0, background: 'hsl(var(--muted) / 0.25)' }}
      >
        <div
          role="region"
          aria-label={`Ações de ${usuario.nome}`}
          style={{
            padding: '1.25rem 1.5rem',
            borderTop: '1px solid hsl(var(--border))',
          }}
        >
          {/* Bloco A — Papéis */}
          <div style={{ marginBottom: '1.25rem' }}>
            <span
              className="ubm-cota ubm-cota--muted"
              style={{ display: 'block', marginBottom: '0.75rem' }}
            >
              PAPÉIS
            </span>

            {/* Chips atuais com × para revogar */}
            <div className="ubm-member-chips" style={{ marginBottom: '0.75rem' }}>
              {usuario.papeis.map((papel) => {
                const chipMod = PAPEL_CHIP_MOD[papel] ?? 'ubm-member-papel-chip--aluno'
                // Para coordenador, inclui o curso no label se disponível
                const cursosDoUsuario = usuario.cursos_coordenados ?? []
                const chipTexto =
                  papel === 'coordenador' && cursosDoUsuario.length > 0
                    ? cursosDoUsuario
                        .map((c) => `COORDENADOR · ${c.curso_label}`)
                        .join(', ')
                    : (PAPEL_LABEL[papel]?.toUpperCase() ?? papel.toUpperCase())

                return (
                  <span
                    key={papel}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                  >
                    <span className={`ubm-member-papel-chip ${chipMod}`}>
                      {chipTexto}
                    </span>
                    <button
                      type="button"
                      className="ubm-btn ubm-btn-ghost"
                      style={{
                        height: '1.4rem',
                        padding: '0 0.3rem',
                        fontSize: '0.7rem',
                        minWidth: 'unset',
                      }}
                      aria-label={`Revogar papel ${papel}`}
                      onClick={() => setPendingAction({ tipo: 'revogar-papel', role: papel })}
                      disabled={carregando}
                    >
                      <X size={11} aria-hidden />
                    </button>
                  </span>
                )
              })}
              {usuario.papeis.length === 0 && (
                <span className="ubm-cota ubm-cota--muted">Nenhum papel</span>
              )}
            </div>

            {/* Conceder novo papel */}
            {opcoesPapel.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {/* Select de papel */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label
                    htmlFor={`select-papel-${usuario.id}`}
                    className="ubm-cota ubm-cota--muted"
                    style={{ fontSize: '0.7rem' }}
                  >
                    Papel
                  </label>
                  <select
                    id={`select-papel-${usuario.id}`}
                    className="ubm-input"
                    value={selectedPapel}
                    onChange={(e) => {
                      setSelectedPapel(e.target.value)
                      setSelectedCursos([])
                      setSelectedEmpresa(null)
                    }}
                    style={{ minWidth: '160px', height: '2.4rem', maxWidth: '240px' }}
                    aria-label="Papel"
                  >
                    <option value="">Selecionar papel…</option>
                    {opcoesPapel.map((p) => (
                      <option key={p} value={p}>
                        {PAPEL_LABEL[p] ?? p}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 0057: CourseMultiSelect — aparece quando coordenador selecionado */}
                {isCoordenador && (
                  <div>
                    <span
                      className="ubm-cota ubm-cota--muted"
                      style={{ display: 'block', fontSize: '0.7rem', marginBottom: '0.4rem' }}
                    >
                      Cursos <span aria-hidden>*</span>
                    </span>
                    <CourseMultiSelect
                      value={selectedCursos}
                      onChange={setSelectedCursos}
                    />
                    <p className="ubm-confirm-msg" style={{ margin: '0.4rem 0 0', fontSize: '0.8rem' }}>
                      Como admin, você concede o papel de coordenador já aprovado para os cursos escolhidos.
                    </p>
                  </div>
                )}

                {/* 0057: EmpresaCombobox — aparece quando representante selecionado */}
                {isRepresentante && (
                  <div>
                    <EmpresaCombobox
                      value={selectedEmpresa}
                      onChange={setSelectedEmpresa}
                      mode="auth"
                      label="Empresa *"
                      placeholder="Busque ou crie a empresa…"
                    />
                    <p className="ubm-confirm-msg" style={{ margin: '0.4rem 0 0', fontSize: '0.8rem' }}>
                      O representante será vinculado à empresa selecionada.
                    </p>
                  </div>
                )}

                <div>
                  <button
                    type="button"
                    className="ubm-btn ubm-btn-primary"
                    style={{ height: '2.4rem' }}
                    disabled={concederDisabled || carregando}
                    aria-disabled={concederDisabled}
                    onClick={() => {
                      if (!selectedPapel) return
                      setPendingAction({
                        tipo: 'conceder-papel',
                        role: selectedPapel,
                        cursoSlugs: isCoordenador ? (selectedCursos as string[]) : undefined,
                        empresaId: isRepresentante ? selectedEmpresa?.id : undefined,
                        empresaNome: isRepresentante ? selectedEmpresa?.nome : undefined,
                      })
                    }}
                  >
                    Conceder
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Bloco B — Administração */}
          <div
            style={{
              borderTop: '1px solid hsl(var(--border))',
              paddingTop: '1rem',
              marginBottom: '1.25rem',
            }}
          >
            <span
              className="ubm-cota"
              style={{
                display: 'block',
                marginBottom: '0.75rem',
                color: 'hsl(var(--accent))',
              }}
            >
              ADMINISTRAÇÃO
            </span>

            {!usuario.is_admin ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <button
                  type="button"
                  className="ubm-btn ubm-btn-destructive"
                  style={{ height: '2.4rem', alignSelf: 'flex-start' }}
                  onClick={() => setPendingAction({ tipo: 'conceder-admin' })}
                  disabled={carregando}
                  aria-label={`Conceder admin de ${usuario.nome}`}
                >
                  <Shield size={14} aria-hidden />
                  Conceder admin
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {/* Guard: lockout (último admin) — tem precedência visual sobre self-revoke */}
                {isLastAdmin ? (
                  <>
                    <button
                      type="button"
                      className="ubm-btn ubm-btn-ghost"
                      style={{ height: '2.4rem', alignSelf: 'flex-start' }}
                      disabled
                      aria-disabled="true"
                      aria-label={`Revogar admin de ${usuario.nome}`}
                    >
                      <ShieldOff size={14} aria-hidden />
                      Revogar admin
                    </button>
                    <p className="ubm-confirm-msg" style={{ margin: 0, fontSize: '0.82rem' }}>
                      A plataforma precisa de ao menos um administrador.
                    </p>
                  </>
                ) : isSelf ? (
                  <>
                    <button
                      type="button"
                      className="ubm-btn ubm-btn-ghost"
                      style={{ height: '2.4rem', alignSelf: 'flex-start' }}
                      disabled
                      aria-disabled="true"
                      aria-label={`Revogar admin de ${usuario.nome}`}
                    >
                      <ShieldOff size={14} aria-hidden />
                      Revogar admin
                    </button>
                    <p className="ubm-confirm-msg" style={{ margin: 0, fontSize: '0.82rem' }}>
                      Você não pode revogar o próprio acesso de administrador.
                    </p>
                  </>
                ) : (
                  <button
                    type="button"
                    className="ubm-btn ubm-btn-ghost"
                    style={{ height: '2.4rem', alignSelf: 'flex-start' }}
                    onClick={() => setPendingAction({ tipo: 'revogar-admin' })}
                    disabled={carregando}
                    aria-label={`Revogar admin de ${usuario.nome}`}
                  >
                    <ShieldOff size={14} aria-hidden />
                    Revogar admin
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Bloco C — Dados básicos (editar nome) */}
          <div style={{ borderTop: '1px solid hsl(var(--border))', paddingTop: '1rem' }}>
            <span
              className="ubm-cota ubm-cota--muted"
              style={{ display: 'block', marginBottom: '0.75rem' }}
            >
              DADOS BÁSICOS
            </span>

            {!editandoNome ? (
              <button
                type="button"
                className="ubm-btn ubm-btn-ghost"
                style={{ height: '2.2rem', fontSize: '0.82rem' }}
                onClick={() => {
                  setNomeEditado(usuario.nome)
                  setEditandoNome(true)
                }}
              >
                <Pencil size={13} aria-hidden />
                Editar nome
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <label htmlFor={`input-nome-${usuario.id}`} className="sr-only">
                  Nome
                </label>
                <input
                  id={`input-nome-${usuario.id}`}
                  className="ubm-input"
                  type="text"
                  value={nomeEditado}
                  onChange={(e) => setNomeEditado(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') salvarNome()
                    if (e.key === 'Escape') {
                      setEditandoNome(false)
                      setNomeEditado(usuario.nome)
                    }
                  }}
                  style={{ minWidth: '200px', height: '2.4rem' }}
                  aria-label="Nome"
                  autoFocus
                />
                <button
                  type="button"
                  className="ubm-btn ubm-btn-primary"
                  style={{ height: '2.4rem' }}
                  onClick={salvarNome}
                  disabled={salvandoNome}
                >
                  {salvandoNome ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
                  Salvar
                </button>
                <button
                  type="button"
                  className="ubm-btn ubm-btn-ghost"
                  style={{ height: '2.4rem' }}
                  onClick={() => {
                    setEditandoNome(false)
                    setNomeEditado(usuario.nome)
                  }}
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ConfirmDialog para ações do painel — key força remount a cada nova ação (reset checkbox) */}
        <ConfirmDialog
          key={pendingAction ? pendingAction.tipo : 'closed'}
          open={Boolean(pendingAction)}
          titulo={confirm.titulo}
          mensagem={confirm.mensagem}
          confirmVariant={confirm.confirmVariant}
          checkboxLabel={confirm.checkboxLabel}
          onConfirm={executarAcao}
          onCancel={() => setPendingAction(null)}
        />
      </td>
    </tr>
  )
}

// ─── AdminUsuariosPage ────────────────────────────────────────────────────────

/**
 * T10 — /admin/usuarios: gestão completa de papéis e admin (Onda 2).
 * Modo blueprint. Tabela .ubm-machined enriquecida + painel Gerir por linha.
 */
export default function AdminUsuariosPage() {
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // Coordenadores pendentes
  const [pendentes, setPendentes] = useState<CoordenadorPendente[]>([])
  const [confirmandoCoord, setConfirmandoCoord] = useState<{
    tipo: 'aprovar' | 'recusar'
    pendente: CoordenadorPendente
  } | null>(null)

  useEffect(() => {
    Promise.all([
      listarUsuarios(),
      listarCoordenadoresPendentes(),
      obterSessaoAdmin(),
    ]).then(([u, p, sessao]) => {
      setUsuarios(u)
      setPendentes(p)
      setCurrentUserId(sessao?.userId ?? null)
      setLoading(false)
    })
  }, [])

  const mostrarToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  const handleAprovarCoordenador = async (pendente: CoordenadorPendente) => {
    const res = await aprovarCoordenador(pendente.user_id, pendente.curso_id)
    setConfirmandoCoord(null)
    if (res.ok) {
      // chave composta (user_id+curso_id): o mesmo usuário pode ter N cursos pendentes;
      // aprovar um não pode derrubar os demais (a RPC 0054 dá o mesmo id às linhas).
      setPendentes((prev) =>
        prev.filter((p) => !(p.user_id === pendente.user_id && p.curso_id === pendente.curso_id)),
      )
      mostrarToast(
        `Coordenador aprovado. ${pendente.nome} já pode acessar as indicações de ${pendente.curso_label}.`,
      )
    } else {
      mostrarToast('Não foi possível concluir. Tente novamente.')
    }
  }

  const handleRecusarCoordenador = async (pendente: CoordenadorPendente) => {
    const res = await recusarCoordenador(pendente.user_id, pendente.curso_id)
    setConfirmandoCoord(null)
    if (res.ok) {
      // mesma chave composta da aprovação — recusar um curso não derruba os outros.
      setPendentes((prev) =>
        prev.filter((p) => !(p.user_id === pendente.user_id && p.curso_id === pendente.curso_id)),
      )
      mostrarToast('Cadastro de coordenador recusado.')
    } else {
      mostrarToast('Não foi possível concluir. Tente novamente.')
    }
  }

  // Contagem de admins para o guard "último admin"
  const adminCount = usuarios.filter((u) => u.is_admin).length

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '2rem' }}>
        <Loader2 className="animate-spin" aria-hidden />
        <span>Carregando usuários…</span>
      </div>
    )
  }

  return (
    <div style={{ padding: 'clamp(1.25rem, 4vw, 2rem)' }}>
      <div style={{ marginBottom: '1rem' }}>
        <span className="ubm-cota">ADMIN</span>
      </div>
      <h1
        className="font-display"
        style={{
          fontSize: 'clamp(1.4rem, 3vw, 1.9rem)',
          fontWeight: 600,
          marginBottom: '1.5rem',
        }}
      >
        Usuários e papéis
      </h1>

      {/* Seção de coordenadores aguardando aprovação */}
      {pendentes.length > 0 && (
        <div className="ubm-machined" style={{ marginBottom: '2rem', padding: '1.25rem 1.5rem' }}>
          <div style={{ marginBottom: '0.75rem' }}>
            <span className="ubm-cota" style={{ color: 'hsl(var(--warning))' }}>
              APROVAÇÕES PENDENTES
            </span>{' '}
            <span className="ubm-cota ubm-cota--muted">{pendentes.length} pendente(s)</span>
          </div>
          <h2
            className="font-display"
            style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1rem' }}
          >
            Coordenadores aguardando aprovação
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {pendentes.map((p) => (
              <div
                key={`${p.user_id}-${p.curso_id}`}
                className="ubm-machined ubm-indication-row"
                style={{ borderColor: 'hsl(var(--warning) / 0.4)', padding: '0.75rem 1rem' }}
                role="group"
                aria-label={`Pendência de ${p.nome}`}
              >
                <span className="ubm-indication-avatar ubm-clip-node" aria-hidden>
                  C
                </span>
                <div className="ubm-indication-nome">
                  {p.nome}
                  <span className="ubm-indication-curso"> · {p.email}</span>
                  <div>
                    <span className="ubm-member-papel-chip ubm-member-papel-chip--coordenador">
                      CURSO: {p.curso_label}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="ubm-btn ubm-btn-ghost"
                    onClick={() => setConfirmandoCoord({ tipo: 'recusar', pendente: p })}
                  >
                    Recusar
                  </button>
                  <button
                    type="button"
                    className="ubm-btn ubm-btn-primary"
                    onClick={() => setConfirmandoCoord({ tipo: 'aprovar', pendente: p })}
                  >
                    <Check size={14} aria-hidden /> Aprovar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabela de usuários */}
      {usuarios.length === 0 ? (
        <div className="ubm-empty">
          <div className="ubm-empty-node" />
          <p className="ubm-empty-title">Nenhum usuário encontrado.</p>
        </div>
      ) : (
        <div className="ubm-machined" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid hsl(var(--border))' }}>
                <th
                  scope="col"
                  className="ubm-cota ubm-cota--muted"
                  style={{ padding: '0.75rem 1rem', textAlign: 'left' }}
                >
                  Usuário
                </th>
                <th
                  scope="col"
                  className="ubm-cota ubm-cota--muted"
                  style={{ padding: '0.75rem 1rem', textAlign: 'left' }}
                >
                  Papéis
                </th>
                <th
                  scope="col"
                  className="ubm-cota ubm-cota--muted"
                  style={{ padding: '0.75rem 1rem', textAlign: 'left' }}
                >
                  Admin
                </th>
                <th scope="col" className="ubm-cota ubm-cota--muted" style={{ padding: '0.75rem 1rem' }}>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => {
                const isExpanded = expandedId === u.id
                return (
                  <React.Fragment key={u.id}>
                    <tr
                      style={{
                        borderBottom: '1px solid hsl(var(--border))',
                        transition: 'background 0.12s ease',
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = 'hsl(var(--muted) / 0.4)')
                      }
                      onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                    >
                      {/* Col: Usuário (nome + email) */}
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div
                          className="font-display"
                          style={{ fontWeight: 600, fontSize: '0.95rem' }}
                        >
                          {u.nome}
                        </div>
                        <div
                          className="ubm-cota ubm-cota--muted"
                          style={{ fontSize: '0.82rem', marginTop: '0.1rem' }}
                        >
                          {u.email}
                        </div>
                      </td>

                      {/* Col: Chips de papéis */}
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div className="ubm-member-chips">
                          {u.papeis.length === 0 && (
                            <span className="ubm-cota ubm-cota--muted">—</span>
                          )}
                          {u.papeis.map((papel) => {
                            const chipMod =
                              PAPEL_CHIP_MOD[papel] ?? 'ubm-member-papel-chip--aluno'
                            const cursosDoUsuario = u.cursos_coordenados ?? []
                            if (papel === 'coordenador' && cursosDoUsuario.length > 0) {
                              return cursosDoUsuario.map((c) => (
                                <span
                                  key={`${papel}-${c.curso_id}`}
                                  className={`ubm-member-papel-chip ${chipMod}`}
                                >
                                  COORDENADOR · {c.curso_label}
                                </span>
                              ))
                            }
                            return (
                              <span
                                key={papel}
                                className={`ubm-member-papel-chip ${chipMod}`}
                              >
                                {PAPEL_LABEL[papel]?.toUpperCase() ?? papel.toUpperCase()}
                              </span>
                            )
                          })}
                        </div>
                      </td>

                      {/* Col: Selo ADMIN */}
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {u.is_admin ? (
                          <span
                            className="ubm-cota"
                            style={{
                              color: 'hsl(var(--accent))',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                            }}
                          >
                            <Shield size={12} aria-hidden />
                            ADMIN
                          </span>
                        ) : (
                          <span className="ubm-cota ubm-cota--muted">—</span>
                        )}
                      </td>

                      {/* Col: Botão Gerir */}
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <button
                          type="button"
                          className="ubm-btn ubm-btn-ghost"
                          style={{ height: '2.2rem', fontSize: '0.82rem', gap: '0.4rem' }}
                          onClick={() => setExpandedId(isExpanded ? null : u.id)}
                          aria-expanded={isExpanded}
                          aria-label={`Gerir ${u.nome}`}
                        >
                          {isExpanded ? (
                            <ChevronUp size={13} aria-hidden />
                          ) : (
                            <ChevronDown size={13} aria-hidden />
                          )}
                          Gerir
                        </button>
                      </td>
                    </tr>

                    {/* Painel inline expandido */}
                    {isExpanded && (
                      <PainelGerir
                        key={`painel-${u.id}`}
                        usuario={u}
                        currentUserId={currentUserId}
                        adminCount={adminCount}
                        onRefresh={setUsuarios}
                        onToast={mostrarToast}
                      />
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ConfirmDialog para coordenadores pendentes */}
      <ConfirmDialog
        open={Boolean(confirmandoCoord)}
        titulo={confirmandoCoord?.tipo === 'aprovar' ? 'Aprovar coordenador' : 'Recusar cadastro'}
        mensagem={
          confirmandoCoord?.tipo === 'aprovar'
            ? `Liberar o acesso de coordenador de ${confirmandoCoord.pendente.nome} para o curso ${confirmandoCoord.pendente.curso_label}? Ele poderá ver e moderar as indicações deste curso.`
            : `Recusar o cadastro de coordenador de ${confirmandoCoord?.pendente.nome}? Ele continua com acesso comum à plataforma.`
        }
        confirmVariant={confirmandoCoord?.tipo === 'aprovar' ? 'primary' : 'destructive'}
        onConfirm={() => {
          if (!confirmandoCoord) return
          if (confirmandoCoord.tipo === 'aprovar') {
            handleAprovarCoordenador(confirmandoCoord.pendente)
          } else {
            handleRecusarCoordenador(confirmandoCoord.pendente)
          }
        }}
        onCancel={() => setConfirmandoCoord(null)}
      />

      {/* Toast global */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            bottom: '1.5rem',
            right: '1.5rem',
            background: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            padding: '0.75rem 1.25rem',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-md)',
            fontSize: '0.92rem',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}
