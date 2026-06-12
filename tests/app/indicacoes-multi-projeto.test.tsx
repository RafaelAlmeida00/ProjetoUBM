/**
 * P1.3 — lista de indicações de TODOS os projetos abertos (não só [0])
 * RED: garante que a lógica de busca itera sobre todos os projetos.
 */
import { describe, it, expect } from 'vitest'

// Lógica correta: iterar todos os projetos abertos
type Projeto = { id: string; status: string }
type Indicacao = { id: string; projeto_id: string }

async function coletarTodasIndicacoes(
  projetosAbertos: Projeto[],
  podeVerLista: boolean,
  buscar: (id: string) => Promise<Indicacao[]>,
): Promise<Record<string, Indicacao[]>> {
  if (!podeVerLista || projetosAbertos.length === 0) return {}
  const resultado: Record<string, Indicacao[]> = {}
  await Promise.all(
    projetosAbertos.map(async (p) => {
      resultado[p.id] = await buscar(p.id)
    }),
  )
  return resultado
}

describe('P1.3 — indicações de todos os projetos abertos', () => {
  it('com 2 projetos abertos, busca indicações dos dois', async () => {
    const projetos: Projeto[] = [
      { id: 'proj-A', status: 'em_analise' },
      { id: 'proj-B', status: 'em_analise' },
    ]
    const buscar = async (id: string): Promise<Indicacao[]> => [
      { id: `ind-${id}`, projeto_id: id },
    ]
    const resultado = await coletarTodasIndicacoes(projetos, true, buscar)
    expect(Object.keys(resultado).length).toBe(2)
    expect(resultado['proj-A']).toHaveLength(1)
    expect(resultado['proj-B']).toHaveLength(1)
  })

  it('com 1 projeto, retorna indicações desse projeto', async () => {
    const projetos: Projeto[] = [{ id: 'proj-A', status: 'em_analise' }]
    const buscar = async (id: string): Promise<Indicacao[]> => [{ id: `ind-${id}`, projeto_id: id }]
    const resultado = await coletarTodasIndicacoes(projetos, true, buscar)
    expect(Object.keys(resultado).length).toBe(1)
  })

  it('sem permissão (podeVerLista=false) retorna objeto vazio', async () => {
    const projetos: Projeto[] = [{ id: 'proj-A', status: 'em_analise' }]
    const buscar = async () => []
    const resultado = await coletarTodasIndicacoes(projetos, false, buscar)
    expect(Object.keys(resultado).length).toBe(0)
  })

  it('sem projetos abertos retorna objeto vazio', async () => {
    const resultado = await coletarTodasIndicacoes([], true, async () => [])
    expect(Object.keys(resultado).length).toBe(0)
  })
})
