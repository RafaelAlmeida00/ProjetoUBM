import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// next/image é pesado em jsdom — mock simples para <img>
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { src, alt, width, height } = props as { src: string; alt: string; width?: number; height?: number }
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} width={width} height={height} />
  },
}))

import { Logo } from '@/components/brand/Logo'

// T2f — assets de marca + acessibilidade (alt)
describe('Logo', () => {
  it('tem alt acessível e aponta para um asset do UBM', () => {
    render(<Logo />)
    const img = screen.getByAltText(/ubm/i)
    expect(img).toBeInTheDocument()
    expect(img.getAttribute('src') ?? '').toMatch(/ubmlogo|ubm-logo/i)
  })
})
