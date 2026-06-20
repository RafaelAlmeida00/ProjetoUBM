// @vitest-environment node
/**
 * 0059 — dor.titulo: o representante informa o título ao propor a dor; ele acompanha o projeto.
 * criar_dor/editar_dor passam a aceitar p_titulo (DEFAULT null). Título só-espaços vira null (CHECK).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { novoBanco, comoUsuario } from './_pglite/harness'
import type { PGlite } from '@electric-sql/pglite'

const REP = '00000000-0000-0000-0000-000000000001'
const EMP = 'aaaaaaaa-0000-0000-0000-000000000001'
const ADM = '00000000-0000-0000-0000-000000000004'
const NOW = new Date().toISOString()
let db: PGlite

beforeEach(async () => {
  db = await novoBanco()
  await db.exec(`
    insert into auth.users(id,email) values ('${REP}','rep@empresa.com'),('${ADM}','adm@empresa.com');
    insert into public.admin_app(user_id) values ('${ADM}');
    insert into public.empresa(id,nome_canonico,created_by) values ('${EMP}','Empresa A','${ADM}');
    insert into public.papel_usuario(user_id,role) values ('${REP}','representante');
    insert into public.membro_empresa(user_id,empresa_id,papel) values ('${REP}','${EMP}','representante');
    update public.perfil set verificado_em=now() where user_id='${REP}';
  `)
})
afterEach(async () => { await db.close() })

async function criar(titulo?: string | null): Promise<string> {
  await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
  const { rows } = await db.query<{ id: string }>(
    `select public.criar_dor(p_empresa_id=>$1, p_descricao=>$2, p_consentimento=>$3,
       p_consent_version=>$4, p_consent_at=>$5, p_titulo=>$6) as id`,
    [EMP, 'Descricao da dor de teste', true, 'v1', NOW, titulo ?? null],
  )
  return rows[0]!.id
}
async function tituloDe(id: string): Promise<string | null> {
  return (await db.query<{ titulo: string | null }>(`select titulo from public.dor where id=$1`, [id])).rows[0]!.titulo
}

describe('0059 dor.titulo — criar_dor/editar_dor persistem o título', () => {
  it('criar_dor grava o título informado', async () => {
    const id = await criar('Plataforma de Telemetria')
    expect(await tituloDe(id)).toBe('Plataforma de Telemetria')
  })

  it('título ausente fica null (UI cai no fallback da empresa)', async () => {
    expect(await tituloDe(await criar(null))).toBeNull()
  })

  it('título só com espaços vira null (CHECK não-vazio)', async () => {
    expect(await tituloDe(await criar('   '))).toBeNull()
  })

  it('editar_dor atualiza o título', async () => {
    const id = await criar('Antigo')
    await comoUsuario(db, { uid: REP, email: 'rep@empresa.com' })
    await db.query(
      `select public.editar_dor(p_dor_id=>$1, p_descricao=>$2, p_titulo=>$3)`,
      [id, 'Descricao da dor de teste', 'Novo Título'],
    )
    expect(await tituloDe(id)).toBe('Novo Título')
  })
})
