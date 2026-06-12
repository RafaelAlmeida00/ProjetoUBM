// @vitest-environment node
// T-O1.0 — Pré-voo de enums/bridge herdados
// Asserta (ANTES de criar 0030+) que o banco herdado (0001–0026) tem:
//   1. enum tipo_notificacao contém 'dor_aprovada_curso' e 'status_mudou'
//   2. Trio curso/dor_curso/coordenador_curso existe e sustenta a ponte C-A1/§9.1.1
// RS10 / RN3 / RN25
import { describe, it, expect } from 'vitest'
import { novoBanco } from './_pglite/harness'

describe('0030 preflight — enums e bridge herdados', () => {
  it('tipo_notificacao contém dor_aprovada_curso e status_mudou (§9.1.2 — sem ALTER TYPE)', async () => {
    // Aplica apenas até 0026 (sem as migrações 005)
    const db = await novoBanco({ ate: '0026_paleta_orfa.sql' })

    const rows = (await db.query<{ enumlabel: string }>(
      `select e.enumlabel
       from pg_type t
       join pg_enum e on e.enumtypid = t.oid
       where t.typname = 'tipo_notificacao'`
    )).rows.map(r => r.enumlabel)

    expect(rows, 'tipo_notificacao deve conter dor_aprovada_curso').toContain('dor_aprovada_curso')
    expect(rows, 'tipo_notificacao deve conter status_mudou').toContain('status_mudou')
    await db.close()
  })

  it('public.curso tem colunas slug (curso_ubm) e id (uuid) — ponte C-A1', async () => {
    const db = await novoBanco({ ate: '0026_paleta_orfa.sql' })

    const cols = (await db.query<{ column_name: string; data_type: string; udt_name: string }>(
      `select column_name, data_type, udt_name
       from information_schema.columns
       where table_schema = 'public' and table_name = 'curso'`
    )).rows

    const colMap = Object.fromEntries(cols.map(c => [c.column_name, c.udt_name]))
    expect(colMap['id'], 'curso.id deve ser uuid').toBe('uuid')
    expect(colMap['slug'], 'curso.slug deve ser curso_ubm (enum)').toBe('curso_ubm')
    await db.close()
  })

  it('public.dor_curso tem coluna curso (curso_ubm) — ponte C-A1', async () => {
    const db = await novoBanco({ ate: '0026_paleta_orfa.sql' })

    const cols = (await db.query<{ column_name: string; udt_name: string }>(
      `select column_name, udt_name
       from information_schema.columns
       where table_schema = 'public' and table_name = 'dor_curso'`
    )).rows

    const colMap = Object.fromEntries(cols.map(c => [c.column_name, c.udt_name]))
    expect(colMap['curso'], 'dor_curso.curso deve ser curso_ubm (enum slug)').toBe('curso_ubm')
    await db.close()
  })

  it('public.coordenador_curso tem coluna curso_id (uuid) — ponte C-A1', async () => {
    const db = await novoBanco({ ate: '0026_paleta_orfa.sql' })

    const cols = (await db.query<{ column_name: string; udt_name: string }>(
      `select column_name, udt_name
       from information_schema.columns
       where table_schema = 'public' and table_name = 'coordenador_curso'`
    )).rows

    const colMap = Object.fromEntries(cols.map(c => [c.column_name, c.udt_name]))
    expect(colMap['curso_id'], 'coordenador_curso.curso_id deve ser uuid').toBe('uuid')
    await db.close()
  })

  it('ponte completa: dor_curso.curso (slug) → curso.slug → curso.id → coordenador_curso.curso_id', async () => {
    const db = await novoBanco({ ate: '0026_paleta_orfa.sql' })

    // Insere dados para exercitar a ponte
    const UID_COORD = '00000000-0000-0000-0000-aaaaaaaaaaaa'
    const UID_AUTOR = '00000000-0000-0000-0000-bbbbbbbbbbbb'
    const UID_ADMIN = '00000000-0000-0000-0000-cccccccccccc'

    await db.exec(`
      insert into auth.users(id, email) values
        ('${UID_COORD}', 'coord@ubm.br'),
        ('${UID_AUTOR}', 'autor@empresa.com'),
        ('${UID_ADMIN}', 'admin@ubm.br');
      insert into public.admin_app(user_id) values ('${UID_ADMIN}');
      insert into public.empresa(nome_canonico, created_by) values ('EmpresaTeste', '${UID_AUTOR}');
    `)

    // Insere curso 'direito'
    await db.exec(`
      insert into public.curso(id, slug, nome) values
        ('11111111-1111-1111-1111-111111111111', 'direito', 'Direito');
    `)
    // Vincula coordenador ao curso
    await db.exec(`
      insert into public.coordenador_curso(user_id, curso_id) values
        ('${UID_COORD}', '11111111-1111-1111-1111-111111111111');
    `)

    // Verifica que a ponte funciona:
    // dado dor_curso.curso = 'direito' (slug),
    // join curso c on c.slug = dc.curso
    // join coordenador_curso cc on cc.curso_id = c.id
    // retorna UID_COORD
    const rows = (await db.query<{ user_id: string }>(
      `select cc.user_id
       from public.curso c
       join public.coordenador_curso cc on cc.curso_id = c.id
       where c.slug = 'direito'::public.curso_ubm`
    )).rows

    expect(rows.map(r => r.user_id)).toContain(UID_COORD)
    await db.close()
  })
})
