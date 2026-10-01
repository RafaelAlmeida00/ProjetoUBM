import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppProviders } from '@/components/app/AppProviders'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string | { pathname?: string }; children: React.ReactNode }) => (
    <a href={typeof href === 'string' ? href : (href?.pathname ?? '#')} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} />
  },
}))

import Home from '@/app/page'

const renderHome = () =>
  render(
    <AppProviders>
      <Home />
    </AppProviders>,
  )

// T3b — AC1 (CTA → wizard), RN6 (link → login), prova social, quick-login
describe('Landing', () => {
  it('CTA primário leva ao wizard', () => {
    renderHome()
    expect(screen.getByRole('link', { name: /proponha sua dor/i })).toHaveAttribute('href', '/propor')
  })

  it('oferece entrar (link para /login)', () => {
    renderHome()
    expect(
      screen.getByRole('link', { name: /só quero conhecer a plataforma/i }),
    ).toHaveAttribute('href', '/login')
  })

  it('exibe prova social (Barra Mansa) e quick-login (Google)', () => {
    renderHome()
    expect(screen.getAllByText(/barra mansa/i).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /google/i })).toBeInTheDocument()
  })
})

// Revisão de texto do Setor de Marketing e Captação (24/09/2026): UBM é Centro
// Universitário → artigo masculino sempre; dados de contato e de fundação reais.
describe('Landing — revisão de texto (artigo masculino e dados)', () => {
  it('nunca usa artigo feminino com a sigla UBM', () => {
    const { container } = renderHome()
    expect(container.textContent).not.toMatch(/\b(a|A|da|Da|na|Na|à|À|pela|Pela) UBM\b/)
  })

  it('usa "o UBM" no título, na vitrine e no campus', () => {
    renderHome()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(
      /O UBM tem o talento que se encaixa\./,
    )
    expect(screen.getByText(/trouxeram seus desafios ao UBM/i)).toBeInTheDocument()
    expect(screen.getByText(/O UBM forma profissionais em Barra Mansa há 65 anos/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /conheça o UBM/i })).toBeInTheDocument()
  })

  it('apresenta o nome completo da instituição ao menos uma vez', () => {
    renderHome()
    expect(
      screen.getByText(/Centro Universitário de Barra Mansa \(UBM\)/i),
    ).toBeInTheDocument()
  })

  it('não chama o UBM de universidade nos depoimentos', () => {
    const { container } = renderHome()
    expect(container.textContent).not.toMatch(/universidade/i)
    expect(screen.getByText(/aproximou de vez a prefeitura do UBM/i)).toBeInTheDocument()
  })

  it('publica o telefone oficial da extensão', () => {
    renderHome()
    expect(screen.getByRole('link', { name: '(24) 3325-0262' })).toHaveAttribute(
      'href',
      'tel:+552433250262',
    )
  })

  it('não repete a mesma foto de banco nos depoimentos', () => {
    const { container } = renderHome()
    expect(container.querySelectorAll('img[src="/person.png"]').length).toBe(0)
  })

  it('usa "Caso de sucesso" em vez do anglicismo "O case"', () => {
    const { container } = renderHome()
    expect(container.textContent).toMatch(/Caso de sucesso · Governo Presente!/)
    expect(container.textContent).not.toMatch(/\bO case\b/)
  })
})
