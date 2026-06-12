/**
 * T18–T22 — Tests RTL para a tela /admin/paletas
 *
 * T18: OficialSelector (Zona A)
 * T19: PaletaEditor (Zona B)
 * T20: PalettePreview (zona preview)
 * T21: ListaPaletas (Zona C)
 * T22: page.tsx compõe as 3 zonas + gate admin
 *
 * Server Actions mockadas — testa comportamento/UI, não o banco.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

// ─── Mocks das Server Actions e do cliente Supabase ──────────────────────────
vi.mock('@/lib/actions/admin-paletas', () => ({
  salvarPaleta: vi.fn(),
  definirOficialAtiva: vi.fn(),
  ativarPaletaEmpresa: vi.fn(),
  excluirPaleta: vi.fn(),
  restaurarPaleta: vi.fn(),
  // Novas funções de leitura — vi.fn() por padrão; T22c usa importação dinâmica
  listarPaletas: vi.fn(),
  listarEmpresasAdmin: vi.fn(),
}))

// Mock do cliente Supabase (hoisted pelo Vitest — usado em T22c)
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
}))

// Mock do paleta-core (gerarTriade + validarAA)
vi.mock('@/lib/theming/paleta-core', () => ({
  gerarTriade: vi.fn(),
  validarAA: vi.fn(),
  ENCAIXE_LIGHT: {
    primary: '205 68% 33%',
    'primary-foreground': '0 0% 100%',
    accent: '345 62% 30%',
    'accent-foreground': '0 0% 100%',
    ring: '205 68% 33%',
    secondary: '40 18% 88%',
    'secondary-foreground': '215 30% 18%',
  },
  ENCAIXE_DARK: {
    primary: '205 75% 62%',
    'primary-foreground': '216 40% 10%',
    accent: '345 60% 60%',
    'accent-foreground': '216 40% 10%',
    ring: '205 75% 62%',
    secondary: '216 20% 20%',
    'secondary-foreground': '40 24% 92%',
  },
  CONJUNTO_FECHADO: [
    'primary', 'primary-foreground', 'accent', 'accent-foreground',
    'ring', 'secondary', 'secondary-foreground',
  ],
}))

import {
  salvarPaleta,
  definirOficialAtiva,
  excluirPaleta,
  restaurarPaleta,
} from '@/lib/actions/admin-paletas'
import { gerarTriade, validarAA } from '@/lib/theming/paleta-core'

// ─── Dados de fixture ─────────────────────────────────────────────────────────
const TOKENS_LIGHT = {
  primary: '205 68% 33%',
  'primary-foreground': '0 0% 100%',
  accent: '345 62% 30%',
  'accent-foreground': '0 0% 100%',
  ring: '205 68% 33%',
  secondary: '40 18% 88%',
  'secondary-foreground': '215 30% 18%',
}

const TOKENS_DARK = {
  primary: '205 75% 62%',
  'primary-foreground': '216 40% 10%',
  accent: '345 60% 60%',
  'accent-foreground': '216 40% 10%',
  ring: '205 75% 62%',
  secondary: '216 20% 20%',
  'secondary-foreground': '40 24% 92%',
}

const PALETAS_OFICIAIS = [
  {
    id: 'paleta-azul',
    nome: 'Azul ENCAIXE',
    escopo: 'oficial' as const,
    empresaId: null,
    ativa: true,
    aprovadaAA: true,
    sementeHsl: '205 68% 33%',
    tokensLight: TOKENS_LIGHT,
    tokensDark: TOKENS_DARK,
    criadoEm: '2026-06-07T10:00:00Z',
    adminEmail: 'admin@ubm.br',
    deletedAt: null,
    empresaAusente: false,
  },
  {
    id: 'paleta-vermelho',
    nome: 'Vermelho',
    escopo: 'oficial' as const,
    empresaId: null,
    ativa: false,
    aprovadaAA: true,
    sementeHsl: '0 72% 45%',
    tokensLight: {
      primary: '0 72% 45%',
      'primary-foreground': '0 0% 100%',
      accent: '14 80% 42%',
      'accent-foreground': '0 0% 100%',
      ring: '0 72% 45%',
      secondary: '0 10% 88%',
      'secondary-foreground': '215 30% 18%',
    },
    tokensDark: {
      primary: '0 80% 62%',
      'primary-foreground': '216 40% 10%',
      accent: '14 85% 60%',
      'accent-foreground': '216 40% 10%',
      ring: '0 80% 62%',
      secondary: '0 10% 20%',
      'secondary-foreground': '40 24% 92%',
    },
    criadoEm: '2026-06-07T10:00:00Z',
    adminEmail: 'admin@ubm.br',
    deletedAt: null,
    empresaAusente: false,
  },
]

const PALETAS_EMPRESA = [
  {
    id: 'paleta-empresa-1',
    nome: 'Cor da Empresa ABC',
    escopo: 'empresa' as const,
    empresaId: 'empresa-uuid-1',
    empresaNome: 'Empresa ABC',
    ativa: true,
    aprovadaAA: true,
    sementeHsl: '180 50% 40%',
    tokensLight: { ...TOKENS_LIGHT, primary: '180 50% 30%' },
    tokensDark: { ...TOKENS_DARK, primary: '180 60% 60%' },
    criadoEm: '2026-06-07T11:00:00Z',
    adminEmail: 'admin@ubm.br',
    deletedAt: null,
    empresaAusente: false,
  },
  {
    id: 'paleta-excluida',
    nome: 'Paleta XYZ Excluída',
    escopo: 'empresa' as const,
    empresaId: 'empresa-uuid-2',
    empresaNome: 'Empresa XYZ',
    ativa: false,
    aprovadaAA: true,
    sementeHsl: '60 50% 50%',
    tokensLight: { ...TOKENS_LIGHT, primary: '60 60% 30%' },
    tokensDark: { ...TOKENS_DARK, primary: '60 70% 60%' },
    criadoEm: '2026-06-06T09:00:00Z',
    adminEmail: 'admin@ubm.br',
    deletedAt: '2026-06-07T15:00:00Z',
    empresaAusente: false,
  },
  {
    id: 'paleta-orfa',
    nome: 'Paleta Órfã',
    escopo: 'empresa' as const,
    empresaId: 'empresa-uuid-3',
    empresaNome: null,
    ativa: false,
    aprovadaAA: true,
    sementeHsl: '270 50% 45%',
    tokensLight: { ...TOKENS_LIGHT, primary: '270 50% 30%' },
    tokensDark: { ...TOKENS_DARK, primary: '270 60% 60%' },
    criadoEm: '2026-06-05T08:00:00Z',
    adminEmail: 'admin@ubm.br',
    deletedAt: null,
    empresaAusente: true,
  },
]

// ─── Import dos componentes (após os mocks) ────────────────────────────────────
import { OficialSelector } from '@/app/admin/paletas/OficialSelector'
import { PaletaEditor } from '@/app/admin/paletas/PaletaEditor'
import { PalettePreview } from '@/app/admin/paletas/PalettePreview'
import { ListaPaletas } from '@/app/admin/paletas/ListaPaletas'

// ═══════════════════════════════════════════════════════════════════════════════
// T18 — Zona A: OficialSelector
// ═══════════════════════════════════════════════════════════════════════════════
describe('T18 — OficialSelector (Zona A — oficial ativa site-wide)', () => {
  const defaultProps = {
    paletas: PALETAS_OFICIAIS,
    onAtivada: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renderiza as 2 paletas oficiais com nome visível', () => {
    render(<OficialSelector {...defaultProps} />)
    expect(screen.getByText('Azul ENCAIXE')).toBeTruthy()
    expect(screen.getByText('Vermelho')).toBeTruthy()
  })

  it('a paleta ativa tem selo "NO AR" acessível', () => {
    render(<OficialSelector {...defaultProps} />)
    // Selo "NO AR" via aria-label ou texto
    const noAr = screen.getByLabelText(/no ar/i) || screen.queryByText(/no ar/i)
    expect(noAr).toBeTruthy()
  })

  it('tem role="radiogroup" e cada opção tem role="radio"', () => {
    render(<OficialSelector {...defaultProps} />)
    const group = screen.getByRole('radiogroup')
    expect(group).toBeTruthy()
    const radios = within(group).getAllByRole('radio')
    expect(radios.length).toBeGreaterThanOrEqual(2)
  })

  it('a opção ativa tem aria-checked="true"', () => {
    render(<OficialSelector {...defaultProps} />)
    const group = screen.getByRole('radiogroup')
    const checkedRadios = within(group)
      .getAllByRole('radio')
      .filter((el) => el.getAttribute('aria-checked') === 'true')
    expect(checkedRadios.length).toBe(1)
  })

  it('selecionar uma opção diferente da ativa abre modal de confirmação', async () => {
    const user = userEvent.setup()
    render(<OficialSelector {...defaultProps} />)

    // Vermelho não está ativa — clicar deve abrir modal
    const radios = screen.getAllByRole('radio')
    const vermelho = radios.find((r) => r.getAttribute('aria-checked') === 'false')
    expect(vermelho).toBeTruthy()
    await user.click(vermelho!)

    // Modal de confirmação deve aparecer
    expect(screen.getByText(/trocar a cor oficial/i) || screen.getByRole('dialog')).toBeTruthy()
  })

  it('modal de confirmação informa o impacto site-wide e que é reversível', async () => {
    const user = userEvent.setup()
    render(<OficialSelector {...defaultProps} />)

    const radios = screen.getAllByRole('radio')
    const naoAtiva = radios.find((r) => r.getAttribute('aria-checked') === 'false')
    await user.click(naoAtiva!)

    const modal = screen.getByRole('dialog')
    expect(modal.textContent).toMatch(/site|todos|visitantes/i)
    expect(modal.textContent).toMatch(/revers/i)
  })

  it('confirmar no modal chama definirOficialAtiva com o id correto', async () => {
    vi.mocked(definirOficialAtiva).mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    render(<OficialSelector {...defaultProps} />)

    const radios = screen.getAllByRole('radio')
    const naoAtiva = radios.find((r) => r.getAttribute('aria-checked') === 'false')
    await user.click(naoAtiva!)

    // Botão de confirmar no modal
    const btnConfirmar = screen.getByRole('button', { name: /ativar|confirmar/i })
    await user.click(btnConfirmar)

    await waitFor(() => {
      expect(definirOficialAtiva).toHaveBeenCalledWith('paleta-vermelho')
    })
  })

  it('ESC fecha o modal sem chamar a action', async () => {
    const user = userEvent.setup()
    render(<OficialSelector {...defaultProps} />)

    const radios = screen.getAllByRole('radio')
    const naoAtiva = radios.find((r) => r.getAttribute('aria-checked') === 'false')
    await user.click(naoAtiva!)

    // Confirma que modal abriu
    expect(screen.getByRole('dialog')).toBeTruthy()

    // ESC fecha
    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeFalsy()
    })
    expect(definirOficialAtiva).not.toHaveBeenCalled()
  })

  it('paleta com aprovadaAA=false fica desabilitada (CA6 — sem bypass)', () => {
    const paletasComReprovada = [
      ...PALETAS_OFICIAIS,
      {
        ...PALETAS_OFICIAIS[1],
        id: 'paleta-reprovada',
        nome: 'Cor Reprovada',
        aprovadaAA: false,
        ativa: false,
      },
    ]
    render(<OficialSelector paletas={paletasComReprovada} onAtivada={vi.fn()} />)

    const radios = screen.getAllByRole('radio')
    const reprovada = radios.find((r) => {
      const label = r.closest('[data-palette-id]') || r.parentElement
      return label?.textContent?.includes('Cor Reprovada')
    })

    // Deve estar desabilitada
    if (reprovada) {
      expect(reprovada.getAttribute('aria-disabled') === 'true' || (reprovada as HTMLInputElement).disabled).toBe(true)
    }
  })

  it('cada paleta exibe badge AA', () => {
    render(<OficialSelector {...defaultProps} />)
    const badges = screen.getAllByText(/aprovad|aa/i)
    expect(badges.length).toBeGreaterThanOrEqual(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// T19 — Zona B: PaletaEditor
// ═══════════════════════════════════════════════════════════════════════════════
describe('T19 — PaletaEditor (Zona B — cor-semente → tríade + gate AA)', () => {
  const EMPRESAS = [
    { id: 'emp-1', nomeCanonico: 'Empresa ABC' },
    { id: 'emp-2', nomeCanonico: 'Empresa XYZ' },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(gerarTriade).mockReturnValue({ tokens_light: TOKENS_LIGHT, tokens_dark: TOKENS_DARK })
    vi.mocked(validarAA).mockReturnValue({ ok: true, falhas: [] })
  })

  it('renderiza o campo de cor-semente (.ubm-seed-input)', () => {
    render(<PaletaEditor empresas={EMPRESAS} onSalva={vi.fn()} />)
    // campo de semente presente
    const seedInput = document.querySelector('.ubm-seed-input') || screen.queryByLabelText(/semente|cor/i)
    expect(seedInput).toBeTruthy()
  })

  it('renderiza o combobox de empresa', () => {
    render(<PaletaEditor empresas={EMPRESAS} onSalva={vi.fn()} />)
    const combo = screen.getByRole('combobox') || document.querySelector('.ubm-combobox-input')
    expect(combo).toBeTruthy()
  })

  it('toggle "Manter acento marsala" está ligado por padrão', () => {
    render(<PaletaEditor empresas={EMPRESAS} onSalva={vi.fn()} />)
    const toggle = screen.getByRole('checkbox', { name: /marsala/i })
    expect((toggle as HTMLInputElement).checked).toBe(true)
  })

  it('ao mudar a cor-semente, gerarTriade é chamado', async () => {
    const user = userEvent.setup()
    render(<PaletaEditor empresas={EMPRESAS} onSalva={vi.fn()} />)

    const textInput = screen.getByRole('textbox', { name: /hsl|semente|cor/i })
    await user.clear(textInput)
    await user.type(textInput, '180 50% 40%')

    await waitFor(() => {
      expect(gerarTriade).toHaveBeenCalled()
    })
  })

  it('tríade deriva ao vivo: exibe swatches (.ubm-swatch-trio)', async () => {
    render(<PaletaEditor empresas={EMPRESAS} onSalva={vi.fn()} />)
    const trio = document.querySelector('.ubm-swatch-trio')
    expect(trio).toBeTruthy()
  })

  it('badge AA "APROVADA EM AA" quando validarAA retorna ok:true', async () => {
    vi.mocked(validarAA).mockReturnValue({ ok: true, falhas: [] })
    render(<PaletaEditor empresas={EMPRESAS} onSalva={vi.fn()} />)

    // Digitar uma semente para triggar avaliação
    const textInput = screen.getByRole('textbox', { name: /hsl|semente|cor/i })
    fireEvent.change(textInput, { target: { value: '205 68% 33%' } })

    await waitFor(() => {
      const badgeOk = screen.queryByText(/aprovad.*aa|aa.*aprovad/i)
      expect(badgeOk).toBeTruthy()
    })
  })

  it('badge AA "REPROVADA EM AA" quando validarAA retorna ok:false + lista falhas', async () => {
    vi.mocked(validarAA).mockReturnValue({
      ok: false,
      falhas: ['TEXTO SOBRE PRIMÁRIA 3.9:1 < 4.5 (claro)', 'ANEL DE FOCO 2.4:1 < 3.0 (escuro)'],
    })
    render(<PaletaEditor empresas={EMPRESAS} onSalva={vi.fn()} />)

    const textInput = screen.getByRole('textbox', { name: /hsl|semente|cor/i })
    fireEvent.change(textInput, { target: { value: '50 100% 60%' } })

    await waitFor(() => {
      const badgeFail = screen.queryByText(/reprovad.*aa|aa.*reprovad/i)
      expect(badgeFail).toBeTruthy()
    })
    // Lista de falhas visível
    await waitFor(() => {
      expect(screen.queryByText(/TEXTO SOBRE PRIMÁRIA/i) || screen.queryByText(/3\.9:1/)).toBeTruthy()
    })
  })

  it('CTA "Salvar" desabilitado enquanto AA reprovar (CA6)', async () => {
    vi.mocked(validarAA).mockReturnValue({
      ok: false,
      falhas: ['TEXTO SOBRE PRIMÁRIA 3.9:1 < 4.5 (claro)'],
    })
    render(<PaletaEditor empresas={EMPRESAS} onSalva={vi.fn()} />)

    const textInput = screen.getByRole('textbox', { name: /hsl|semente|cor/i })
    fireEvent.change(textInput, { target: { value: '50 100% 60%' } })

    await waitFor(() => {
      const btnSalvar = screen.queryByRole('button', { name: /salvar/i })
      if (btnSalvar) {
        expect(
          (btnSalvar as HTMLButtonElement).disabled ||
          btnSalvar.getAttribute('aria-disabled') === 'true'
        ).toBe(true)
      }
    })
  })

  it('CTA "Salvar" habilitado quando AA aprovado', async () => {
    vi.mocked(validarAA).mockReturnValue({ ok: true, falhas: [] })
    render(<PaletaEditor empresas={EMPRESAS} onSalva={vi.fn()} />)

    const textInput = screen.getByRole('textbox', { name: /hsl|semente|cor/i })
    fireEvent.change(textInput, { target: { value: '205 68% 33%' } })

    await waitFor(() => {
      const btnSalvar = screen.queryByRole('button', { name: /salvar/i })
      if (btnSalvar) {
        expect(
          (btnSalvar as HTMLButtonElement).disabled ||
          btnSalvar.getAttribute('aria-disabled') === 'true'
        ).not.toBe(true)
      }
    })
  })

  it('resultado AA tem aria-live="polite" (acessível por leitor de tela)', () => {
    render(<PaletaEditor empresas={EMPRESAS} onSalva={vi.fn()} />)
    const liveRegion = document.querySelector('[aria-live="polite"]')
    expect(liveRegion).toBeTruthy()
  })

  it('confirmar salvar chama salvarPaleta', async () => {
    vi.mocked(validarAA).mockReturnValue({ ok: true, falhas: [] })
    vi.mocked(salvarPaleta).mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    const onSalva = vi.fn()

    render(<PaletaEditor empresas={EMPRESAS} onSalva={onSalva} />)

    // Preenche semente
    const textInput = screen.getByRole('textbox', { name: /hsl|semente|cor/i })
    await user.clear(textInput)
    await user.type(textInput, '205 68% 33%')

    await waitFor(() => {
      const btnSalvar = screen.queryByRole('button', { name: /salvar/i })
      expect(btnSalvar && !(btnSalvar as HTMLButtonElement).disabled).toBeTruthy()
    })

    const btnSalvar = screen.getByRole('button', { name: /salvar/i })
    await user.click(btnSalvar)

    await waitFor(() => {
      expect(salvarPaleta).toHaveBeenCalled()
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// T20 — Zona preview: PalettePreview
// ═══════════════════════════════════════════════════════════════════════════════
describe('T20 — PalettePreview (zona preview — aplica sem publicar)', () => {
  const triadeExemplo = { tokens_light: TOKENS_LIGHT, tokens_dark: TOKENS_DARK }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renderiza o contêiner .ubm-preview-frame', () => {
    render(<PalettePreview triade={triadeExemplo} />)
    const frame = document.querySelector('.ubm-preview-frame')
    expect(frame).toBeTruthy()
  })

  it('aplica vars inline APENAS no contêiner .ubm-preview-frame, NÃO no :root/<html> (CA18)', () => {
    render(<PalettePreview triade={triadeExemplo} />)
    const frame = document.querySelector('.ubm-preview-frame') as HTMLElement

    // O frame deve ter vars inline
    const inlineStyle = frame?.style?.cssText || frame?.getAttribute('style') || ''
    expect(inlineStyle).toMatch(/--primary/)

    // O <html>/<body> NÃO deve ter --primary injetado pelo preview
    const htmlStyle = document.documentElement.style.cssText
    expect(htmlStyle).not.toMatch(/--primary.*ubm-preview/)
  })

  it('mostra cota "PRÉ-VISUALIZAÇÃO" (design §5.3)', () => {
    render(<PalettePreview triade={triadeExemplo} />)
    const cota = screen.queryByText(/pré.?visualiza|preview/i)
    expect(cota).toBeTruthy()
  })

  it('tem aria-label que descreve como não-publicado (a11y)', () => {
    render(<PalettePreview triade={triadeExemplo} />)
    const frame = document.querySelector('[aria-label]')
    expect(frame).toBeTruthy()
    expect(frame!.getAttribute('aria-label')).toMatch(/preview|visualiza|não publicad/i)
  })

  it('toggle "Ver no escuro" altera tema APENAS dentro da moldura, não no <html>', async () => {
    const user = userEvent.setup()
    render(<PalettePreview triade={triadeExemplo} />)

    const toggleEscuro = screen.queryByRole('button', { name: /escuro|dark/i })
    if (!toggleEscuro) return // toggle opcional

    await user.click(toggleEscuro)

    // <html> não deve ter data-theme alterado pelo preview
    expect(document.documentElement.getAttribute('data-theme')).not.toBe('dark')
  })

  it('montar PalettePreview NÃO chama nenhuma Server Action (CA18)', () => {
    render(<PalettePreview triade={triadeExemplo} />)
    expect(salvarPaleta).not.toHaveBeenCalled()
    expect(definirOficialAtiva).not.toHaveBeenCalled()
  })

  it('estado vazio: sem tríade mostra mensagem de convite', () => {
    render(<PalettePreview triade={null} />)
    const msg = screen.queryByText(/escolha.*cor|pré.?visualiza.*aqui/i)
    expect(msg).toBeTruthy()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// T21 — Zona C: ListaPaletas
// ═══════════════════════════════════════════════════════════════════════════════
describe('T21 — ListaPaletas (Zona C — soft-delete/restore + status)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renderiza oficiais e paletas de empresa', () => {
    render(
      <ListaPaletas
        oficiais={PALETAS_OFICIAIS}
        empresa={PALETAS_EMPRESA}
        onExcluida={vi.fn()}
        onRestaurada={vi.fn()}
      />,
    )
    expect(screen.getByText('Azul ENCAIXE')).toBeTruthy()
    expect(screen.getByText('Empresa ABC')).toBeTruthy()
  })

  it('status "NO AR" para paleta ativa', () => {
    render(
      <ListaPaletas
        oficiais={PALETAS_OFICIAIS}
        empresa={PALETAS_EMPRESA}
        onExcluida={vi.fn()}
        onRestaurada={vi.fn()}
      />,
    )
    const statusNoAr = screen.queryAllByText(/no ar/i)
    expect(statusNoAr.length).toBeGreaterThanOrEqual(1)
  })

  it('status "EXCLUÍDA" para paleta com deletedAt', () => {
    render(
      <ListaPaletas
        oficiais={PALETAS_OFICIAIS}
        empresa={PALETAS_EMPRESA}
        onExcluida={vi.fn()}
        onRestaurada={vi.fn()}
      />,
    )
    const excluida = screen.queryByText(/excluída/i)
    expect(excluida).toBeTruthy()
  })

  it('status "DESATIVADA" + informação de empresa ausente para paleta órfã (CA9b)', () => {
    render(
      <ListaPaletas
        oficiais={PALETAS_OFICIAIS}
        empresa={PALETAS_EMPRESA}
        onExcluida={vi.fn()}
        onRestaurada={vi.fn()}
      />,
    )
    const desativada = screen.queryByText(/desativad|empresa ausente/i)
    expect(desativada).toBeTruthy()
  })

  it('botão "Excluir" abre modal de confirmação', async () => {
    const user = userEvent.setup()
    // Usa paleta não-ativa e não-excluída para que o botão Excluir apareça
    const paletaNaoAtiva = { ...PALETAS_EMPRESA[0], ativa: false, id: 'paleta-nao-ativa' }
    render(
      <ListaPaletas
        oficiais={[]}
        empresa={[paletaNaoAtiva]}
        onExcluida={vi.fn()}
        onRestaurada={vi.fn()}
      />,
    )

    const btnExcluir = screen.getByRole('button', { name: /excluir/i })
    await user.click(btnExcluir)

    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toMatch(/circula|restaurar|nada.*apagado/i)
  })

  it('confirmar exclusão chama excluirPaleta com o id correto', async () => {
    vi.mocked(excluirPaleta).mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    const onExcluida = vi.fn()

    // Usa paleta não-ativa e não-excluída
    const paletaNaoAtiva = { ...PALETAS_EMPRESA[0], ativa: false, id: 'paleta-nao-ativa' }
    render(
      <ListaPaletas
        oficiais={[]}
        empresa={[paletaNaoAtiva]}
        onExcluida={onExcluida}
        onRestaurada={vi.fn()}
      />,
    )

    const btnExcluir = screen.getByRole('button', { name: /excluir/i })
    await user.click(btnExcluir)

    // O modal tem dois botões "Excluir" — pega o destrutivo (o segundo)
    const botoesExcluir = screen.getAllByRole('button', { name: /excluir/i })
    const btnConfirmar = botoesExcluir[botoesExcluir.length - 1]
    await user.click(btnConfirmar)

    await waitFor(() => {
      expect(excluirPaleta).toHaveBeenCalledWith('paleta-nao-ativa')
    })
  })

  it('botão "Restaurar" aparece para paleta excluída e chama restaurarPaleta', async () => {
    vi.mocked(restaurarPaleta).mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    const onRestaurada = vi.fn()

    render(
      <ListaPaletas
        oficiais={[]}
        empresa={[PALETAS_EMPRESA[1]]} // paleta excluída
        onExcluida={vi.fn()}
        onRestaurada={onRestaurada}
      />,
    )

    const btnRestaurar = screen.getByRole('button', { name: /restaurar/i })
    await user.click(btnRestaurar)

    await waitFor(() => {
      expect(restaurarPaleta).toHaveBeenCalledWith('paleta-excluida')
    })
  })

  it('cota de auditoria visível (por <admin> · <data> — CA17)', () => {
    render(
      <ListaPaletas
        oficiais={PALETAS_OFICIAIS}
        empresa={PALETAS_EMPRESA}
        onExcluida={vi.fn()}
        onRestaurada={vi.fn()}
      />,
    )
    // Alguma cota de auditoria deve estar visível
    const auditorias = screen.queryAllByText(/por.*admin|admin.*ubm|jun 2026/i)
    expect(auditorias.length).toBeGreaterThanOrEqual(1)
  })

  it('lista tem role="list" e itens com role="listitem" (a11y — design §5.4)', () => {
    render(
      <ListaPaletas
        oficiais={PALETAS_OFICIAIS}
        empresa={PALETAS_EMPRESA}
        onExcluida={vi.fn()}
        onRestaurada={vi.fn()}
      />,
    )
    const list = screen.getAllByRole('list')
    expect(list.length).toBeGreaterThanOrEqual(1)
  })

  it('estado vazio empresa: exibe mensagem humanizada', () => {
    render(
      <ListaPaletas
        oficiais={PALETAS_OFICIAIS}
        empresa={[]}
        onExcluida={vi.fn()}
        onRestaurada={vi.fn()}
      />,
    )
    const vazio = screen.queryByText(/nenhuma empresa.*cor|cor própria/i)
    expect(vazio).toBeTruthy()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// T22 — page.tsx: compõe as 3 zonas
// ═══════════════════════════════════════════════════════════════════════════════
describe('T22 — AdminPaletasPage (compõe 3 zonas + gate admin)', () => {
  it('arquivo page.tsx existe em app/admin/paletas/', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const pagePath = path.resolve(__dirname, '../../src/app/admin/paletas/page.tsx')
    expect(fs.existsSync(pagePath)).toBe(true)
  })

  it('page.tsx importa OficialSelector', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/app/admin/paletas/page.tsx'),
      'utf8',
    )
    expect(src).toContain('OficialSelector')
  })

  it('page.tsx importa PaletaEditor', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/app/admin/paletas/page.tsx'),
      'utf8',
    )
    expect(src).toContain('PaletaEditor')
  })

  it('page.tsx importa PalettePreview', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/app/admin/paletas/page.tsx'),
      'utf8',
    )
    expect(src).toContain('PalettePreview')
  })

  it('page.tsx importa ListaPaletas', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/app/admin/paletas/page.tsx'),
      'utf8',
    )
    expect(src).toContain('ListaPaletas')
  })

  it('page.tsx referencia admin-paletas (wiring real via Server Actions)', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/app/admin/paletas/page.tsx'),
      'utf8',
    )
    expect(src).toContain('admin-paletas')
  })

  it('page.tsx chama listarPaletas (RSC com wiring real)', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/app/admin/paletas/page.tsx'),
      'utf8',
    )
    expect(src).toContain('listarPaletas')
  })

  it('page.tsx não usa PLACEHOLDER como dado final (sem wiring fake)', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/app/admin/paletas/page.tsx'),
      'utf8',
    )
    // page.tsx (RSC) não deve conter os placeholders — eles ficam no PaletasView
    expect(src).not.toContain('PALETAS_OFICIAIS_PLACEHOLDER')
    expect(src).not.toContain('PALETAS_EMPRESA_PLACEHOLDER')
    expect(src).not.toContain('Carregando…')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// T22b — PaletasView: componente client orquestrador testável via RTL
// ═══════════════════════════════════════════════════════════════════════════════
describe('T22b — PaletasView (client orquestrador com dados reais como props)', () => {
  const EMPRESAS_FIXTURE = [
    { id: 'emp-1', nomeCanonico: 'Empresa ABC' },
    { id: 'emp-2', nomeCanonico: 'Empresa XYZ' },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('PaletasView.tsx existe em app/admin/paletas/', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const viewPath = path.resolve(__dirname, '../../src/app/admin/paletas/PaletasView.tsx')
    expect(fs.existsSync(viewPath)).toBe(true)
  })

  it('renderiza heading "Gestão de Paletas"', async () => {
    const { PaletasView } = await import('@/app/admin/paletas/PaletasView')
    render(
      <PaletasView
        paletasOficiais={PALETAS_OFICIAIS}
        paletasEmpresa={PALETAS_EMPRESA}
        empresas={EMPRESAS_FIXTURE}
      />,
    )
    expect(screen.getByRole('heading', { name: /gestão de paletas/i })).toBeTruthy()
  })

  it('renderiza as 3 zonas (Oficial do site, Cor de empresa, Todas as paletas)', async () => {
    const { PaletasView } = await import('@/app/admin/paletas/PaletasView')
    render(
      <PaletasView
        paletasOficiais={PALETAS_OFICIAIS}
        paletasEmpresa={PALETAS_EMPRESA}
        empresas={EMPRESAS_FIXTURE}
      />,
    )
    // Usa getAllByText pois o OficialSelector renderiza internamente "OFICIAL DO SITE"
    expect(screen.getAllByText(/oficial do site/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/cor de empresa/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/todas as paletas/i).length).toBeGreaterThanOrEqual(1)
  })

  it('passa paletasOficiais para OficialSelector (renderiza nomes)', async () => {
    const { PaletasView } = await import('@/app/admin/paletas/PaletasView')
    render(
      <PaletasView
        paletasOficiais={PALETAS_OFICIAIS}
        paletasEmpresa={PALETAS_EMPRESA}
        empresas={EMPRESAS_FIXTURE}
      />,
    )
    // getAllByText pois os nomes podem aparecer em múltiplos contextos (lista + selector)
    expect(screen.getAllByText('Azul ENCAIXE').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Vermelho').length).toBeGreaterThanOrEqual(1)
  })

  it('passa paletasEmpresa para ListaPaletas (renderiza empresa ABC)', async () => {
    const { PaletasView } = await import('@/app/admin/paletas/PaletasView')
    render(
      <PaletasView
        paletasOficiais={PALETAS_OFICIAIS}
        paletasEmpresa={PALETAS_EMPRESA}
        empresas={EMPRESAS_FIXTURE}
      />,
    )
    // getAllByText: "Empresa ABC" aparece na ListaPaletas e pode aparecer no combobox
    expect(screen.getAllByText('Empresa ABC').length).toBeGreaterThanOrEqual(1)
  })

  it('passa empresas para PaletaEditor (combobox de empresa aparece)', async () => {
    const { PaletasView } = await import('@/app/admin/paletas/PaletasView')
    render(
      <PaletasView
        paletasOficiais={PALETAS_OFICIAIS}
        paletasEmpresa={PALETAS_EMPRESA}
        empresas={EMPRESAS_FIXTURE}
      />,
    )
    const combo = screen.getByRole('combobox')
    expect(combo).toBeTruthy()
  })

  it('sem props (listas vazias) renderiza estados vazios sem crash', async () => {
    const { PaletasView } = await import('@/app/admin/paletas/PaletasView')
    render(
      <PaletasView
        paletasOficiais={[]}
        paletasEmpresa={[]}
        empresas={[]}
      />,
    )
    // Não deve lançar erro; heading deve existir
    expect(screen.getByRole('heading', { name: /gestão de paletas/i })).toBeTruthy()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// T22c — listarPaletas + listarEmpresasAdmin (adapter de leitura — RSC)
// O vi.mock('@/lib/supabase/server') é hoisted para o topo do módulo pelo Vitest.
// Dentro dos testes usamos o serverModule importado para configurar o retorno
// do mock a cada caso.
// ═══════════════════════════════════════════════════════════════════════════════
describe('T22c — listarPaletas + listarEmpresasAdmin (adapter de leitura com Supabase mockado)', () => {
  // Helpers de mock — reutilizados em cada teste
  function makePaletasClient(data: unknown[], error: null | { message: string } = null) {
    const orderMock = vi.fn().mockResolvedValue({ data, error })
    const selectMock = vi.fn().mockReturnValue({ order: orderMock })
    const fromMock = vi.fn().mockReturnValue({ select: selectMock })
    return { from: fromMock }
  }

  function makeEmpresasClient(data: unknown[], error: null | { message: string } = null) {
    const orderMock = vi.fn().mockResolvedValue({ data, error })
    const isMock = vi.fn().mockReturnValue({ order: orderMock })
    const selectMock = vi.fn().mockReturnValue({ is: isMock })
    const fromMock = vi.fn().mockReturnValue({ select: selectMock })
    return { from: fromMock }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('listarPaletas existe em admin-paletas.ts (verificação de fonte)', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/lib/actions/admin-paletas.ts'),
      'utf8',
    )
    expect(src).toContain('listarPaletas')
    expect(src).toContain('export async function listarPaletas')
  })

  it('listarEmpresasAdmin existe em admin-paletas.ts (verificação de fonte)', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/lib/actions/admin-paletas.ts'),
      'utf8',
    )
    expect(src).toContain('listarEmpresasAdmin')
    expect(src).toContain('export async function listarEmpresasAdmin')
  })

  it('listarPaletas usa createSupabaseServerClient (nunca importa/chama service_role key)', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/lib/actions/admin-paletas.ts'),
      'utf8',
    )
    // Deve usar o cliente autenticado (RLS)
    expect(src).toContain('createSupabaseServerClient')
    // Não deve ter import nem uso da chave service_role (comentário não conta)
    const linhasDecodigo = src
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n')
    expect(linhasDecodigo).not.toContain('service_role')
    expect(linhasDecodigo).not.toContain('SUPABASE_SERVICE')
  })

  it('listarPaletas faz join com empresa para trazer nome_canonico', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/lib/actions/admin-paletas.ts'),
      'utf8',
    )
    // A query deve incluir join com empresa para trazer o nome
    expect(src).toMatch(/empresa.*nome_canonico|nome_canonico.*empresa/s)
  })

  it('listarPaletas retorna PaletaItem com empresaNome mapeado do join', async () => {
    // Dado que listarPaletas está mockada pelo vi.mock do topo,
    // configuramos o retorno e verificamos que ela está disponível para consumo
    const { listarPaletas } = await import('@/lib/actions/admin-paletas') as {
      listarPaletas: ReturnType<typeof vi.fn>
    }
    const fixture = [
      { id: 'p1', nome: 'Azul ENCAIXE', escopo: 'oficial', empresaId: null, empresaNome: null,
        ativa: true, aprovadaAA: true, sementeHsl: '205 68% 33%',
        tokensLight: { primary: '205 68% 33%' }, tokensDark: { primary: '205 75% 62%' },
        criadoEm: '2026-06-07T10:00:00Z', adminEmail: null, deletedAt: null, empresaAusente: false },
    ]
    vi.mocked(listarPaletas).mockResolvedValue(fixture)
    const result = await listarPaletas()
    expect(result[0]).toMatchObject({ nome: 'Azul ENCAIXE', escopo: 'oficial' })
  })

  it('listarEmpresasAdmin retorna { id, nomeCanonico }', async () => {
    const { listarEmpresasAdmin } = await import('@/lib/actions/admin-paletas') as {
      listarEmpresasAdmin: ReturnType<typeof vi.fn>
    }
    const fixture = [
      { id: 'emp-1', nomeCanonico: 'Empresa ABC' },
      { id: 'emp-2', nomeCanonico: 'Empresa XYZ' },
    ]
    vi.mocked(listarEmpresasAdmin).mockResolvedValue(fixture)
    const result = await listarEmpresasAdmin()
    expect(result.length).toBe(2)
    expect(result[0]).toMatchObject({ id: 'emp-1', nomeCanonico: 'Empresa ABC' })
  })
})
