# Edge Function — enviar-emails (runbook)

Drena `fila.email_outbox` via RPCs `service_role` e entrega por Resend.
Invocada a cada minuto pelo cron `drenar-emails` (pg_cron + pg_net).

---

## Segredos a configurar

Acesse: **Supabase Dashboard → Edge Functions → enviar-emails → Secrets**
(ou use `supabase secrets set` via CLI)

| Segredo | Obrigatório | Descrição |
|---|---|---|
| `RESEND_API_KEY` | **sim** | Chave de API Resend. Obter em resend.com → API Keys. |
| `RESEND_FROM` | não | Remetente. Default: `Plataforma UBM <onboarding@resend.dev>`. Sem domínio verificado, Resend só entrega ao e-mail dono da conta (suficiente para testes). |
| `DRAIN_SECRET` | recomendado | String aleatória (ex.: `openssl rand -hex 32`). Deve ser a mesma valor colocado no SQL do cron em `<DRAIN_SECRET_PLACEHOLDER>`. Protege a função de invocações não autorizadas. |

> `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são injetados automaticamente pela plataforma.

---

## Passos de deploy (Maestro)

1. **Criar conta Resend** em <https://resend.com> e gerar uma API Key.
2. **Setar segredos** na edge function (Dashboard ou CLI):
   ```bash
   supabase secrets set RESEND_API_KEY=re_xxxx
   supabase secrets set DRAIN_SECRET=<string-aleatoria>
   # RESEND_FROM é opcional
   ```
3. **Deploy da edge function** via MCP (`deploy_edge_function`) ou CLI:
   ```bash
   supabase functions deploy enviar-emails --no-verify-jwt
   ```
   > `--no-verify-jwt` permite invocação pelo cron sem Bearer token.
4. **Aplicar o cron** — substituir `<DRAIN_SECRET_PLACEHOLDER>` no arquivo
   `workspace/src/supabase/cron/0044_cron_enviar_emails.sql` pelo valor real
   do `DRAIN_SECRET` e executar via MCP (`execute_sql`) ou CLI.
5. **Smoke test** — invocar manualmente a function e verificar resposta
   `{ drenados, enviados, falhas }` e o log da edge function no Dashboard.

---

## Limitacoes do free tier Resend (sem dominio verificado)

- Resend entrega e-mails somente para o endereço do dono da conta Resend.
- Para enviar a qualquer destinatário é necessário verificar um domínio em
  resend.com → Domains e atualizar `RESEND_FROM` com `noreply@seu-dominio.com`.
- Para o teste funcional do cliente isso é suficiente: cadastrar com o e-mail
  da conta Resend e receber o link de verificação.

---

## Rollback

- Para pausar a entrega: `select cron.unschedule('drenar-emails');`
- Para remover a function: Dashboard → Edge Functions → Delete (ou `supabase functions delete enviar-emails`).
- Registros na fila permanecem intactos com `status = 'pendente'` ou `'processando'`;
  basta re-drainer após corrigir o problema.
