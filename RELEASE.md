# MailFlow Pro RC1

## Versão
v1.0.0-rc1

## Estado
Release Candidate

## Funcionalidades

- Autenticação (login, logout, recuperação de password)
- Dashboard (KPIs, navegação, estados vazios/erro)
- Contactos (CRUD, importação CSV, exportação CSV, pesquisa, paginação)
- Campanhas (CRUD, duplicar, envio, polling, status)
- Templates (CRUD, duplicar, preview Desktop/Mobile/Text, envio de teste)
- Automações (CRUD, ativar/desativar, jobs, ordenação)
- Analytics (KPIs, gráficos canvas, filtros temporais, tabela ordenável)
- Configurações (perfil, password, SMTP, Resend, preferências)
- SMTP (configuração, teste de ligação, envio de teste)
- Resend (quando configurado via RESEND_API_KEY)

## Auditorias concluídas

- Dashboard (Fase 1)
- Contactos (Fase 2)
- Campanhas (Fase 3)
- Templates (Fase 4)
- Automações (Fase 5)
- Analytics (Fase 6)
- Configurações (Fase 7)
- Hardening de segurança (Fase 8)
- Auditoria de regressão (Fase Final)

## Bugs corrigidos

### Commits da auditoria funcional

| Commit | Descrição |
|--------|-----------|
| `d1a79f9` | fix(dashboard): botão Recarregar quebrado no estado de erro |
| `5d5cee6` | fix: event listeners duplicados, botão Recarregar, rota de automações |
| `3f2d109` | fix(contactos): memory leak no dropdown de exportação, botão preview preso, null check no renderPreview |
| `06a10fa` | fix(campanhas): apiCall sem try/catch, polling infinito, badge de status com id perdido |
| `f0bcb5d` | fix(templates): filtros de search+category aplicados duas vezes |
| `ee4494d` | fix(automations): apiCall sem try/catch, filtro de jobs quebrado, sort ignorado |
| `137dc0f` | fix(analytics): memory leak no resize, contagem de contactos a 0 após filtro |
| `31448ef` | fix(config): botão de password permanentemente disabled, seletor SMTP genérico |
| `4d0cfb2` | fix(config): badge SMTP perdia id após primeiro teste (regressão) |

### Commits do hardening

| Commit | Descrição |
|--------|-----------|
| `90bb5b4` | fix: password leak no PUT /api/profile, filter injection em 5 endpoints, merge tag XSS, exposição de source via static files, try/catch em campaign save, null check no exportContacts |

### Commits de prep RC1

| Commit | Descrição |
|--------|-----------|
| `pending` | fix: empty-state.js não carregava no dashboard.html (ReferenceError) |

## Problemas conhecidos

- Resend necessita domínio verificado para envio de emails
- SMTP Gmail pode ser bloqueado pelo ambiente Render (porta 587)
- Stripe ainda não implementado (adiado para v1.1.0)
- TLS verification desativada para conexões SMTP (configuração de desenvolvimento)

## Ambiente de produção

- **Plataforma:** Render
- **Variáveis de ambiente necessárias:**
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_KEY`
  - `RESEND_API_KEY` (opcional, ativa Resend como provider)
  - `ALLOWED_ORIGINS` (domínios permitidos para CORS)
  - `STRIPE_SECRET_KEY` (futuro)

## Estado final

O projeto encontra-se estável para utilização. Todas as páginas principais foram auditadas e corrigidas. Segurança reforçada com proteção contra XSS, filter injection e exposição de dados sensíveis.
