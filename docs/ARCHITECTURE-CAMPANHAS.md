# Arquitetura Técnica — Módulo Campanhas

**MailFlow Pro — Fase 3**
**Versão:** 1.0
**Estado:** Revisão (sem código)

---

## 1. Contexto e Objetivo

O módulo Campanhas é o core do produto. Permite ao utilizador criar campanhas de email marketing,
selecionar contactos, escolher um template, pré-visualizar, agendar e enviar — com estatísticas
de entrega e abertura.

**Compatibilidade direta com:**
- Módulo Contactos (005) — selecionar destinatários
- Módulo Templates (pendente de migration) — corpo do email
- Módulo Premium (004) — limites de envio por plano
- Overview (js/views/overview.js) — KPIs de campanhas na dashboard

---

## 2. Modelo de Dados

### 2.1 Tabelas Existentes (referência)

```
profiles (001)
  id (PK -> auth.users)
  email, nome, empresa, telefone, ...
  premium_trial_end, subscription_status, ...

contacts (005)
  id (PK, UUID)
  user_id (FK -> auth.users)
  nome, email, telefone, empresa, tags[]
  UNIQUE(user_id, email)
```

### 2.2 Tabelas Novas

#### Tabela: templates

Necessária porque o overview.js já consulta esta tabela e o módulo Campanhas depende dela.
Não existe migration atualmente.

| Coluna | Tipo | Constraints | Descricao |
|--------|------|-------------|-----------|
| id | UUID | PK, gen_random_uuid() | Identificador unico |
| user_id | UUID | NOT NULL, FK -> auth.users ON DELETE CASCADE | Dono do template |
| nome | TEXT | NOT NULL, DEFAULT '' | Nome do template |
| assunto | TEXT | NOT NULL, DEFAULT '' | Assunto do email (suporta variaveis) |
| corpo_html | TEXT | NOT NULL, DEFAULT '' | Corpo HTML do email |
| corpo_text | TEXT | DEFAULT '' | Corpo em texto plano (fallback) |
| created_at | TIMESTAMPTZ | DEFAULT now() | Data de criacao |
| updated_at | TIMESTAMPTZ | DEFAULT now() | Ultima atualizacao |

**Variaveis suportadas no template (merge tags):**
- `{{nome}}` — nome do contacto
- `{{email}}` — email do contacto
- `{{empresa}}` — empresa do contacto
- `{{unsubscribe_url}}` — link de descadastro (futuro)

#### Tabela: campaigns

| Coluna | Tipo | Constraints | Descricao |
|--------|------|-------------|-----------|
| id | UUID | PK, gen_random_uuid() | Identificador unico |
| user_id | UUID | NOT NULL, FK -> auth.users ON DELETE CASCADE | Dono da campanha |
| nome | TEXT | NOT NULL, DEFAULT '' | Nome interno da campanha |
| assunto | TEXT | NOT NULL, DEFAULT '' | Assunto do email (pode usar variaveis) |
| status | TEXT | NOT NULL, DEFAULT 'draft' | Estado da campanha |
| template_id | UUID | FK -> templates ON DELETE SET NULL | Template associado |
| total_recipients | INTEGER | DEFAULT 0 | Total de destinatarios |
| total_sent | INTEGER | DEFAULT 0 | Emails enviados com sucesso |
| total_failed | INTEGER | DEFAULT 0 | Emails que falharam |
| total_opened | INTEGER | DEFAULT 0 | Emails abertos (rastreamento futuro) |
| total_clicked | INTEGER | DEFAULT 0 | Links clicados (rastreamento futuro) |
| scheduled_at | TIMESTAMPTZ | NULL | Data/hora de envio agendado |
| sent_at | TIMESTAMPTZ | NULL | Data/hora do envio efetivo |
| from_name | TEXT | DEFAULT '' | Nome do remetente |
| from_email | TEXT | DEFAULT '' | Email do remetente |
| reply_to | TEXT | DEFAULT '' | Email de resposta |
| created_at | TIMESTAMPTZ | DEFAULT now() | Data de criacao |
| updated_at | TIMESTAMPTZ | DEFAULT now() | Ultima atualizacao |

**Estados da campanha (status):**

```
draft --> scheduled --> sending --> sent
  |          |            |
  |          |            +--> failed
  |          |
  |          +--> cancelled
  |
  +--> cancelled
```

| Estado | Descricao | Transicoes Permitidas |
|--------|-----------|----------------------|
| draft | Rascunho, editavel | -> scheduled, cancelled |
| scheduled | Agendada para envio futuro | -> sending, cancelled, draft (reverter) |
| sending | Em processo de envio batch | -> sent, failed, paused |
| sent | Envio concluido | Estado final (terminal) |
| paused | Envio pausado manualmente | -> sending, cancelled |
| cancelled | Cancelada | Estado final (terminal) |
| failed | Falha no envio | -> draft (recriar) |

**Regras de transicao (validacao server-side):**

- draft -> scheduled: template_id obrigatorio, total_recipients > 0
- scheduled -> sending: scheduled_at <= now()
- sending -> sent: total_sent + total_failed == total_recipients
- sending -> failed: erro critico no envio
- sending -> paused: pausa manual
- paused -> sending: retomar envio
- qualquer -> cancelled: so se nao estiver em 'sent'

#### Tabela: campaign_recipients

Tabela de juncao M:N entre campaigns e contacts. Cada registo representa
um envio individual a um contacto especifico, com estado de entrega.

| Coluna | Tipo | Constraints | Descricao |
|--------|------|-------------|-----------|
| id | UUID | PK, gen_random_uuid() | Identificador unico |
| campaign_id | UUID | NOT NULL, FK -> campaigns ON DELETE CASCADE | Campanha |
| contact_id | UUID | NOT NULL, FK -> contacts ON DELETE CASCADE | Contacto |
| status | TEXT | NOT NULL, DEFAULT 'pending' | Estado do envio individual |
| sent_at | TIMESTAMPTZ | NULL | Quando foi enviado |
| opened_at | TIMESTAMPTZ | NULL | Quando foi aberto (futuro) |
| clicked_at | TIMESTAMPTZ | NULL | Quando clicou link (futuro) |
| error_message | TEXT | NULL | Mensagem de erro se falhou |
| retry_count | INTEGER | DEFAULT 0 | Numero de tentativas |
| created_at | TIMESTAMPTZ | DEFAULT now() | Data de criacao |

**Estados do recipient (status):**

| Estado | Descricao |
|--------|-----------|
| pending | Aguarda envio |
| sending | Em processo de envio |
| sent | Enviado com sucesso |
| failed | Falhou (com error_message) |
| skipped | Ignorado (email duplicado, descadastro, etc.) |

**Constraint UNIQUE:**
```sql
UNIQUE(campaign_id, contact_id)
```
Impede que o mesmo contacto seja adicionado duas vezes a mesma campanha.

### 2.3 Diagrama de Relacoes

```
auth.users
    |
    +-- 1:1 -- profiles
    |
    +-- 1:N -- contacts
    |
    +-- 1:N -- templates
    |
    +-- 1:N -- campaigns
                    |
                    +-- N:1 -- templates (template_id)
                    |
                    +-- 1:N -- campaign_recipients
                                    |
                                    +-- N:1 -- contacts (contact_id)
```

---

## 3. Indices

### contacts (ja existe)
- idx_contacts_user_id — queries por user
- idx_contacts_created_at — ordenacao
- idx_contacts_nome — autocomplete
- UNIQUE (user_id, email) — integridade

### templates (novo)
```sql
CREATE INDEX idx_templates_user_id ON templates(user_id);
CREATE INDEX idx_templates_created_at ON templates(user_id, created_at DESC);
```

### campaigns (novo)
```sql
CREATE INDEX idx_campaigns_user_id ON campaigns(user_id);
CREATE INDEX idx_campaigns_status ON campaigns(user_id, status);
CREATE INDEX idx_campaigns_scheduled ON campaigns(scheduled_at)
    WHERE status = 'scheduled';
CREATE INDEX idx_campaigns_created_at ON campaigns(user_id, created_at DESC);
```

### campaign_recipients (novo)
```sql
CREATE INDEX idx_cr_campaign_id ON campaign_recipients(campaign_id);
CREATE INDEX idx_cr_contact_id ON campaign_recipients(contact_id);
CREATE INDEX idx_cr_campaign_status ON campaign_recipients(campaign_id, status);
CREATE UNIQUE INDEX idx_cr_unique ON campaign_recipients(campaign_id, contact_id);
```

O indice idx_cr_campaign_status e critico para o motor de envio:
```sql
SELECT * FROM campaign_recipients
WHERE campaign_id = $1 AND status = 'pending'
ORDER BY created_at
LIMIT 100;
```

---

## 4. Row Level Security (RLS)

### templates
```sql
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "templates_select_own"
    ON templates FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "templates_insert_own"
    ON templates FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "templates_update_own"
    ON templates FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "templates_delete_own"
    ON templates FOR DELETE USING (auth.uid() = user_id);
```

### campaigns
```sql
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaigns_select_own"
    ON campaigns FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "campaigns_insert_own"
    ON campaigns FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "campaigns_update_own"
    ON campaigns FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "campaigns_delete_own"
    ON campaigns FOR DELETE USING (auth.uid() = user_id);
```

### campaign_recipients
```sql
ALTER TABLE campaign_recipients ENABLE ROW LEVEL SECURITY;

-- Acesso indireto via campaign: o utilizador so ve recipients
-- das suas proprias campanhas.

CREATE POLICY "cr_select_own"
    ON campaign_recipients FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM campaigns
            WHERE campaigns.id = campaign_recipients.campaign_id
            AND campaigns.user_id = auth.uid()
        )
    );

CREATE POLICY "cr_insert_own"
    ON campaign_recipients FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM campaigns
            WHERE campaigns.id = campaign_recipients.campaign_id
            AND campaigns.user_id = auth.uid()
        )
    );
```

**Nota:** O motor de envio (backend) usa service_role para fazer UPDATE
nos status dos recipients. Os utilizadores autenticados apenas fazem
SELECT (estatisticas) e INSERT (adicionar recipients).

---

## 5. Triggers

### updated_at automatico

Reutiliza a funcao update_updated_at_column() ja definida na migration 005.

```sql
CREATE TRIGGER trg_templates_updated_at
    BEFORE UPDATE ON templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_campaigns_updated_at
    BEFORE UPDATE ON campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## 6. API REST

### 6.1 Templates

| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | /api/templates | Listar templates (com paginacao) |
| GET | /api/templates/:id | Obter template por ID |
| POST | /api/templates | Criar template |
| PUT | /api/templates/:id | Atualizar template |
| DELETE | /api/templates/:id | Eliminar template |

**POST /api/templates — Body:**
```json
{
    "nome": "Boas-vindas",
    "assunto": "Bem-vindo, {{nome}}!",
    "corpo_html": "<h1>Ola {{nome}}</h1><p>...</p>",
    "corpo_text": "Ola {{nome}}, ..."
}
```

**Validacoes:**
- assunto: obrigatorio, max 200 chars
- corpo_html: obrigatorio, max 50KB
- nome: obrigatorio, max 100 chars

### 6.2 Campanhas

| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | /api/campaigns | Listar campanhas (com filtros) |
| GET | /api/campaigns/:id | Obter campanha com recipients |
| POST | /api/campaigns | Criar campanha (draft) |
| PUT | /api/campaigns/:id | Atualizar campanha |
| DELETE | /api/campaigns/:id | Eliminar campanha |
| POST | /api/campaigns/:id/recipients | Adicionar contactos |
| DELETE | /api/campaigns/:id/recipients | Remover contactos |
| GET | /api/campaigns/:id/recipients | Listar recipients com status |
| POST | /api/campaigns/:id/schedule | Agendar envio |
| POST | /api/campaigns/:id/send | Enviar agora |
| POST | /api/campaigns/:id/cancel | Cancelar campanha |
| POST | /api/campaigns/:id/pause | Pausar envio |
| POST | /api/campaigns/:id/resume | Retomar envio |
| GET | /api/campaigns/:id/stats | Estatisticas da campanha |

### 6.3 Detalhes dos Endpoints Principais

#### POST /api/campaigns — Criar Campanha

```json
// Request
{
    "nome": "Campanha Julho 2026",
    "assunto": "Ofertas de Verao, {{nome}}!",
    "template_id": "uuid-do-template",
    "from_name": "MailFlow Pro",
    "from_email": "noreply@exemplo.com"
}

// Response 201
{
    "success": true,
    "campaign": { "id": "...", "status": "draft", ... }
}
```

**Validacoes:**
- nome: obrigatorio, max 200 chars
- assunto: obrigatorio, max 200 chars
- template_id: opcional (pode definir depois)

#### POST /api/campaigns/:id/recipients — Adicionar Contactos

```json
// Request — selecionar contactos especificos
{
    "contact_ids": ["uuid1", "uuid2", "uuid3"]
}

// OU — selecionar por tags
{
    "filter": {
        "tags": ["vip", "newsletter"]
    }
}

// Response 200
{
    "success": true,
    "added": 3,
    "skipped": 0,
    "total_recipients": 3
}
```

**Comportamento:**
- Verifica se contactos pertencem ao mesmo user (RLS + validacao)
- Ignora duplicados (UNIQUE constraint)
- Atualiza total_recipients na campanha

#### POST /api/campaigns/:id/send — Enviar Agora

```json
// Response 200
{
    "success": true,
    "message": "Campanha em processo de envio",
    "total_recipients": 150,
    "batch_info": {
        "total_batches": 2,
        "batch_size": 100
    }
}
```

**Comportamento server-side:**
1. Valida transicao de estado: draft/scheduled -> sending
2. Valida que template_id existe e tem conteudo
3. Valida que total_recipients > 0
4. Atualiza status para 'sending'
5. Inicia processamento em batches de 100
6. Para cada batch:
   a. Busca 100 recipients com status 'pending'
   b. Para cada recipient:
      - Busca dados do contacto
      - Substitui merge tags no template
      - Envia email via nodemailer
      - Atualiza status do recipient (sent/failed)
      - Incrementa contadores na campanha
   c. Pequena pausa entre batches (rate limiting)
7. Quando todos processados -> status 'sent'
8. Se erro critico -> status 'failed'

#### GET /api/campaigns/:id/stats — Estatisticas

```json
// Response 200
{
    "campaign_id": "...",
    "status": "sent",
    "totals": {
        "recipients": 150,
        "sent": 145,
        "failed": 5,
        "opened": 0,
        "clicked": 0
    },
    "rates": {
        "delivery_rate": 96.67,
        "open_rate": 0,
        "click_rate": 0
    },
    "sent_at": "2026-07-23T14:30:00Z",
    "duration_seconds": 45
}
```

### 6.4 Filtros na Listagem

**GET /api/campaigns** suporta:

| Param | Tipo | Descricao |
|-------|------|-----------|
| page | integer | Pagina (default: 1) |
| limit | integer | Itens por pagina (default: 20, max: 100) |
| status | string | Filtrar por estado (draft, sent, etc.) |
| search | string | Pesquisar por nome |

---

## 7. Estrutura Frontend

### 7.1 Ficheiros

```
js/views/
  campanhas.js          # View principal (listagem + empty state)
  campanha-editor.js    # Editor de campanha (criar/editar)
  campanha-preview.js   # Pre-visualizacao do email
  campanha-stats.js     # Estatisticas da campanha
  templates.js          # Ja existe (completo)
```

### 7.2 Views

#### View: Campanhas (listagem)
- Toolbar com filtros (status, pesquisa)
- Tabela com: nome, status (badge), destinatarios, data, acoes
- Empty state para primeiro utilizador
- Botao "Nova Campanha"

#### View: Editor de Campanha
- **Passo 1:** Informacoes basicas (nome, assunto, remetente)
- **Passo 2:** Selecionar template (grid de previews)
- **Passo 3:** Selecionar contactos (tabela com busca e filtros por tag)
- **Passo 4:** Pre-visualizacao (render do template com dados reais)
- **Passo 5:** Agendar ou enviar agora

**Stepper UI:**
```
[1. Detalhes] -> [2. Template] -> [3. Contactos] -> [4. Preview] -> [5. Enviar]
```

Cada passo tem validacoes antes de avancar. O utilizador pode voltar a passos anteriores.

#### View: Pre-visualizacao
- Render do HTML do template com dados de amostra
- Simula merge tags com primeiro contacto real
- Mostra versao desktop e mobile
- Botao "Enviar" ou "Agendar"

#### View: Estatisticas
- KPIs: enviados, abertos, clicados, taxa de entrega
- Grafico de timeline de envio (futuro)
- Lista de recipients com status individual
- Botao "Exportar CSV" dos recipients

### 7.3 Navegacao

```
#/campanhas              -> Lista de campanhas
#/campanhas/nova         -> Editor (criar)
#/campanhas/:id          -> Detalhe + stats
#/campanhas/:id/editar   -> Editor (editar draft)
#/campanhas/:id/preview  -> Pre-visualizacao
```

---

## 8. Fluxo Completo

### 8.1 Criar Campanha

```
Utilizador clica "Nova Campanha"
    |
Preenche: nome, assunto, remetente
    |
Escolhe template (grid com previews)
    |
Seleciona contactos (tabela com busca/tag filters)
    |
Pre-visualiza (template renderizado com dados reais)
    |
Clica "Guardar como Rascunho" OU "Agendar" OU "Enviar Agora"
```

### 8.2 Enviar (server-side)

```
POST /api/campaigns/:id/send
    |
Valida: template existe, contacts > 0, estado valido
    |
status -> 'sending'
    |
+-- BATCH 1 ------------------------------+
|  SELECT 100 pending recipients          |
|  Para cada:                             |
|    -> Busca dados do contacto           |
|    -> Substitui {{nome}}, etc           |
|    -> transporter.sendMail()            |
|    -> Atualiza recipient: sent          |
|    -> Incrementa campaign.sent          |
|  Aguarda 1s (rate limit)               |
+-----------------------------------------+
    |
+-- BATCH 2 ------------------------------+
|  ... repete ...                         |
+-----------------------------------------+
    |
Todos processados -> status -> 'sent'
    |
sent_at = now()
    |
Overview KPIs atualizados automaticamente
```

### 8.3 Agendar

```
POST /api/campaigns/:id/schedule
{ "scheduled_at": "2026-07-25T09:00:00Z" }
    |
status -> 'scheduled'
    |
(server-side polling verifica campanhas scheduled)
    |
Quando scheduled_at <= now():
    -> Inicia envio automaticamente
    -> status -> 'sending'
```

**Implementacao do agendamento:**
- Opcao A (recomendada para MVP): Polling no server.js a cada 60s
  - Verifica campanhas com status = 'scheduled' AND scheduled_at <= now()
  - Inicia envio automaticamente
- Opcao B (futuro): Webhook externo / cron job no Render

### 8.4 Pausar / Retomar

```
POST /api/campaigns/:id/pause
    |
status -> 'paused'
    |
Batch processing para
    |
POST /api/campaigns/:id/resume
    |
status -> 'sending'
    |
Retoma de onde parou (recipients pending)
```

---

## 9. Escalabilidade

### 9.1 Limites por Plano

| Plano | Contactos por campanha | Campanhas/mes | Envios/mes |
|-------|----------------------|---------------|------------|
| Trial | 50 | 5 | 500 |
| Premium | 10.000 | Ilimitado | Ilimitado |

**Validacao server-side:**
- Antes de adicionar recipients: verificar total_recipients <= limite
- Antes de enviar: verificar envios_mes <= limite

### 9.2 Processamento em Batches

Para listas grandes (10.000 contactos), o envio e feito em batches:

```
Batch size: 100 emails
Pausa entre batches: 1-2 segundos
Tempo estimado para 10.000: ~100 batches x 2s = ~3.3 minutos
```

**Otimizacoes futuras:**
- Paralelismo controlado (3-5 workers simultaneos)
- Fila de envio com prioridade
- Retry automatico para failures temporarias (max 3 tentativas)

### 9.3 Indices Criticos para Performance

```sql
-- Motor de envio: buscar pending recipients rapidamente
CREATE INDEX idx_cr_campaign_status
    ON campaign_recipients(campaign_id, status)
    WHERE status = 'pending';

-- Agendamento: buscar campanhas prontas para enviar
CREATE INDEX idx_campaigns_scheduled
    ON campaigns(scheduled_at)
    WHERE status = 'scheduled';

-- Listagem: campanhas do user ordenadas por data
CREATE INDEX idx_campaigns_created_at
    ON campaigns(user_id, created_at DESC);
```

### 9.4 Contadores Denormalizados

Os campos total_sent, total_failed, total_recipients na tabela campaigns
sao contadores denormalizados. Sao atualizados automaticamente pelo motor
de envio apos cada batch. Evitam queries COUNT(*) na tabela campaign_recipients.

---

## 10. Automacoes Futuras

### 10.1 Estrutura Planeada

```sql
-- Tabela: automation_rules (futuro)
CREATE TABLE automation_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    nome            TEXT NOT NULL,
    trigger_type    TEXT NOT NULL,  -- 'signup', 'tag_added', 'date', 'manual'
    trigger_config  JSONB DEFAULT '{}',
    campaign_id     UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    template_id     UUID REFERENCES templates(id) ON DELETE SET NULL,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
```

### 10.2 Tipos de Trigger

| Trigger | Descricao | Exemplo |
|---------|-----------|---------|
| signup | Quando novo utilizador se regista | Email de boas-vindas |
| tag_added | Quando contacto recebe uma tag | Email de oferta VIP |
| date | Em data especifica | Aniversario do contacto |
| manual | Execucao manual | Campanha recorrente |
| condition | Baseado em condicoes | Contacto nao abriu ha 30 dias |

### 10.3 Integracao com Arquitetura Atual

As automacoes reutilizam:
- campaigns — a automacao cria/associa uma campanha
- campaign_recipients — adiciona recipients automaticamente
- Motor de envio — envia quando triggered
- Templates — template associado a regra

Nao e necessario alterar as tabelas existentes para suportar automacoes.
A tabela automation_rules e independente e pode ser adicionada numa fase futura.

---

## 11. Migracoes Necessarias

| Migration | Conteudo | Ordem |
|-----------|----------|-------|
| 006_templates.sql | Tabela templates + RLS + triggers + indices | Antes de 007 |
| 007_campaigns.sql | Tabelas campaigns + campaign_recipients + RLS + triggers + indices | Apos 006 |

### Ordem de execucao no Supabase SQL Editor:
```sql
-- 1. Templates (base para campanhas)
-- Colar conteudo de 006_templates.sql

-- 2. Campanhas
-- Colar conteudo de 007_campaigns.sql
```

---

## 12. Compatibilidade

### 12.1 Com Modulos Existentes

| Modulo | Compatibilidade | Accao |
|--------|----------------|-------|
| Contactos (005) | Direta | campaign_recipients FK -> contacts |
| Templates | Migration pendente | Criar 006_templates.sql |
| Premium (004) | Direta | Validar limites antes de enviar |
| Overview | Direta | KPIs usam campaigns.total_sent |
| Auth | Direta | user_id em todas as tabelas |
| Profile | Direta | Sem alteracoes |

### 12.2 Com Dashboard

- dashboard.js VIEWS ja inclui 'campanhas' com module: null
- Basta criar js/views/campanhas.js e associar window.CampanhasView
- Badge #badge-campanhas ja existe no sidebar
- Overview.js ja consulta tabela campaigns para KPIs

### 12.3 Com API existente

- POST /api/email/send (ja existe) — endpoint para envio individual
- Motor de campanhas reutiliza transporter (nodemailer) ja configurado
- Padrao de endpoints: /api/{resource} com authMiddleware (consistente)

---

## 13. Decisoes de Design

### 13.1 Porque campaign_recipients (junction table) em vez de array na campanha?

- **Rastreamento individual:** Cada envio tem o seu estado (sent/failed/opened)
- **Escalabilidade:** Arrays PostgreSQL tem limite de 1GB; junction table escala infinitamente
- **Consultas eficientes:** "Quantos falharam?" e um COUNT(*) com indice, nao um unnest()
- **Automacoes futuras:** Facil associar triggers a recipients especificos

### 13.2 Porque contadores denormalizados em campaigns?

- **Performance:** Evita COUNT(*) em campaign_recipients a cada listagem
- **Simplicidade:** Overview.js ja consulta campaigns.total_sent
- **Trade-off:** Contadores podem ficar inconsistentes se o motor de envio falhar a meio
  - Mitigacao: funcao SQL de recalculo manual (recalculate_campaign_stats)

### 13.3 Porque templates como tabela separada (nao JSONB na campanha)?

- **Reutilizacao:** O mesmo template serve multiplas campanhas
- **Edicao independente:** Alterar um template nao afeta campanhas ja enviadas
- **Gestao:** O utilizador gere templates numa view dedicada
- **Integridade:** FK garante que o template existe antes de enviar

### 13.4 Porque polling em vez de webhook para agendamento?

- **Simplicidade MVP:** Nao requer infraestrutura adicional (Redis, Bull, etc.)
- **Render compatibility:** Render suporta background workers mas sao pagos
- **Migracao futura:** Facil substituir polling por fila quando necessario
- **Precisao:** Polling a cada 60s e suficiente para email marketing (nao e tempo real)

---

## 14. Riscos e Mitigacoes

| Risco | Impacto | Mitigacao |
|-------|---------|-----------|
| Gmail SMTP rate limits | Envios bloqueados | Batches com pausas, max 500/dia |
| Template com HTML invalido | Email quebrado | Validacao HTML no server |
| Contacto sem email | Falha no envio | Skip com status 'skipped' |
| Campanha gigante (10k+) | Timeout do server | Processamento assincrono com polling |
| Concurrent sends | Duplicados | Lock na tabela campaigns (SELECT FOR UPDATE) |
| Template alterado apos envio | Inconsistencia | Snapshot do template no momento do envio (futuro) |

---

## 15. Resumo de Entregaveis

| Entregavel | Ficheiro | Prioridade |
|------------|----------|------------|
| Migration templates | 006_templates.sql | P0 |
| Migration campanhas | 007_campaigns.sql | P0 |
| API templates | server.js (endpoints) | P0 |
| API campanhas | server.js (endpoints) | P0 |
| Motor de envio | server.js (batch processor) | P0 |
| View listagem | js/views/campanhas.js | P0 |
| View editor | js/views/campanha-editor.js | P0 |
| View pre-visualizacao | js/views/campanha-preview.js | P1 |
| View estatisticas | js/views/campanha-stats.js | P1 |
| CSS campanhas | css/dashboard.css | P0 |
| Dashboard wiring | dashboard.js (VIEWS) | P0 |
| Polling agendamento | server.js (cron) | P1 |
| Testes | test-campanhas.js | P0 |

---

*Documento produzido para revisao. Nenhum codigo foi escrito.*
*Proximo passo: revisao e aprovacao -> implementacao fase a fase.*
