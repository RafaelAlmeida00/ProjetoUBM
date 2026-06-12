import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConsentGate } from '@/components/consent/ConsentGate'
import { PRIVACY_POLICY_URL } from '@/lib/config'

// T2c — AC8/RN5/RS4 (consentimento + link externo seguro)
describe('ConsentGate', () => {
  it('aciona onChange ao marcar o checkbox', () => {
    const onChange = vi.fn()
    render(<ConsentGate checked={false} onChange={onChange} />)
    fireEvent.click(screen.getByRole('checkbox'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('tem link externo da política com rel seguro (RS4)', () => {
    render(<ConsentGate checked={false} onChange={() => {}} />)
    const link = screen.getByRole('link', { name: /pol[ií]tica/i })
    expect(link).toHaveAttribute('href', PRIVACY_POLICY_URL)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel') ?? '').toContain('noopener')
  })
})
