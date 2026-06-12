// @vitest-environment node
// T-X1a RED — 0043 ler_audit v2: expõe id + record (new) + old_record (old) de audit.record_version
// Rastreab.: diagnóstico Maestro B1 / report arquiteto §6 · admin-only (LGPD log)
// Shape: { id, op, tabela, ator, datahora, old, new, actor_role, record_id }
import { describe, it, expect } from 'vitest'
import { novoBanco, comoUsuario, comoServiceRole, negado } from './_pglite/harness'

const ADM = '00000000-0000-0000-0000-0000000000cc'
const USR = '00000000-0000-0000-0000-0000000000bb'

async function seedBase(db: import('@electric-sql/pglite').PGlite) {
  await db.exec(`
    insert into auth.users(id, email) values
      ('${ADM}', 'adm@empresa.com'),
      ('${USR}', 'user@gmail.com');
    insert into public.admin_app(user_id) values ('${ADM}');
  `)
}

/** Produz ao menos uma linha de auditoria via UPDATE na tabela perfil (trigger 0008).
 *  O trigger de auth.users já criou uma linha em public.perfil com nome_publico=null;
 *  aqui fazemos dois UPDATEs consecutivos para garantir old_record preenchido no 2º.
 */
async function produzirEntradaAudit(db: import('@electric-sql/pglite').PGlite) {
  await comoServiceRole(db)
  // 1º UPDATE: seta o valor inicial (old_record = null, record = {nome_publico: 'Usuario Inicial'})
  await db.exec(`
    update public.perfil set nome_publico = 'Usuario Inicial' where user_id = '${USR}';
  `)
  // 2º UPDATE: gera entrada com old_record = {nome_publico: 'Usuario Inicial'}
  await db.exec(`
    update public.perfil set nome_publico = 'Usuario Atualizado' where user_id = '${USR}';
  `)
}

describe('0043 ler_audit v2 — retorna id + old + new (T-X1a)', () => {
  it('admin chama ler_audit → retorna linhas com id, old e new não-nulos para UPDATE', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await produzirEntradaAudit(db)

    await comoUsuario(db, { uid: ADM, email: 'adm@empresa.com' })
    const rows = (await db.query<{
      id: number;
      op: string;
      tabela: string;
      ator: string | null;
      datahora: string;
      old: Record<string, unknown> | null;
      new: Record<string, unknown> | null;
      actor_role: string | null;
      record_id: string | null;
    }>(`select * from public.ler_audit(100)`)).rows

    expect(rows.length, 'ler_audit deve retornar pelo menos 1 linha').toBeGreaterThan(0)

    // Encontrar a linha de UPDATE do perfil
    const updateRow = rows.find(r => r.op === 'UPDATE' && r.tabela === 'public.perfil')
    expect(updateRow, 'deve existir linha de UPDATE do perfil').toBeTruthy()

    expect(updateRow!.id, 'id deve ser não-nulo e positivo').toBeGreaterThan(0)
    expect(updateRow!.new, 'new (record) deve ser não-nulo para UPDATE').toBeTruthy()
    expect(updateRow!.old, 'old (old_record) deve ser não-nulo para UPDATE').toBeTruthy()
    expect(updateRow!.datahora, 'datahora deve estar presente').toBeTruthy()
    expect(updateRow!.tabela).toBe('public.perfil')
    expect(updateRow!.op).toBe('UPDATE')
    await db.close()
  })

  it('new contém o estado APÓS o update (nome_publico atualizado)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await produzirEntradaAudit(db)

    await comoUsuario(db, { uid: ADM, email: 'adm@empresa.com' })
    const rows = (await db.query<{ op: string; tabela: string; new: Record<string, unknown> | null }>(
      `select * from public.ler_audit(100)`,
    )).rows

    const updateRow = rows.find(r => r.op === 'UPDATE' && r.tabela === 'public.perfil')
    expect(updateRow?.new?.nome_publico, 'new deve conter o nome após o update').toBe('Usuario Atualizado')
    await db.close()
  })

  it('old contém o estado ANTES do update (nome_publico original)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await produzirEntradaAudit(db)

    await comoUsuario(db, { uid: ADM, email: 'adm@empresa.com' })
    const rows = (await db.query<{ op: string; tabela: string; old: Record<string, unknown> | null }>(
      `select * from public.ler_audit(100)`,
    )).rows

    const updateRow = rows.find(r => r.op === 'UPDATE' && r.tabela === 'public.perfil')
    expect(updateRow?.old?.nome_publico, 'old deve conter o nome antes do update').toBe('Usuario Inicial')
    await db.close()
  })

  it('não-admin → negado (admin-only LGPD)', async () => {
    const db = await novoBanco()
    await seedBase(db)
    await produzirEntradaAudit(db)

    await comoUsuario(db, { uid: USR, email: 'user@gmail.com' })
    const err = await negado(db.query(`select * from public.ler_audit(10)`))
    expect(err, 'não-admin não deve acessar ler_audit').toBe(true)
    await db.close()
  })
})
