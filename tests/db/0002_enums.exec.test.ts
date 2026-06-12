// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { novoBanco } from './_pglite/harness'

// T1a — enums RBAC (RN1/RN2). admin NÃO é valor de app_role (é flag).
describe('0002 enums RBAC', () => {
  it('app_role (sem admin), papel_empresa, tipo_notificacao (com verificacao_conta)', async () => {
    const db = await novoBanco()
    const vals = async (t: string) =>
      (
        await db.query<{ v: string }>(
          `select e.enumlabel v from pg_enum e join pg_type t on t.oid = e.enumtypid
           where t.typname = $1 order by e.enumsortorder`,
          [t],
        )
      ).rows.map((r) => r.v)
    expect(await vals('app_role')).toEqual(['aluno', 'representante', 'coordenador'])
    expect(await vals('papel_empresa')).toEqual(['representante', 'gestor'])
    expect(await vals('tipo_notificacao')).toContain('verificacao_conta')
    await db.close()
  })
})
