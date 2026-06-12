import { describe, it, expect } from 'vitest'
import { ping } from '@/lib/health'

// T0b — primeiro RED: valida que o runner roda a suíte canônica (workspace/tests)
// e que o alias '@' resolve para workspace/src. Falha até existir @/lib/health (T0a→GREEN).
describe('toolchain smoke', () => {
  it('resolve o alias @ e executa a suíte', () => {
    expect(ping()).toBe('pong')
  })
})
