# Arquitetura Tecnica — Modulo Campanhas

**MailFlow Pro — Fase 3**
**Versao:** 2.0
**Estado:** Aprovado para implementacao

---

## 1. Contexto e Objetivo

O modulo Campanhas e o core do produto. Permite ao utilizador criar campanhas de email marketing,
selecionar contactos, escolher um template, pre-visualizar, agendar e enviar — com estatisticas
de entrega e abertura.

**Compatibilidade direta com:**
- Modulo Contactos (005) — selecionar destinatarios
- Modulo Templates (pendente de migration) — corpo do email
- Modulo Premium (004) — limites de envio por plano
- Overview (js/views/overview.js) — KPIs de campanhas na dashboard

---

## 2. Modelo de Dados

### 2.1 Tabelas Existentes (referencia)

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

Necessaria porque o overview.js ja consulta esta tabela e o modulo Campanhas depende dela.
Nao existe migration atualmente.

| Coluna | Tipo | Constraints | Descricao |
|--------|------|-------------|-----------|
| id | UUID | PK, gen_random_uuid() | Identificador unico |
| user_id | UUID | NOT NULL, FK -> auth.users ON DELETE CASCADE | Dono do template |
| nome | TEXT | NOT NULL, DEFAULT '' | Nome do template |
| assunto | TEXT | NOT NULL, DEFAULT '' | Assunto do email (suporta variaveis) |
| corpo_html | TEXT | NOT NULL, DEFAULT '' | Corpo HTML do email |
| corpo_text | TEXT | DEFAULT '' | Corpo em texto plano (fallback) |
| is_default | BOOLEAN | DEFAULT false | Template padrao do utilizador |
| thumbnail | TEXT | DEFAULT '' | URL ou path da miniatura (futura galeria) |
| usage_count | INTEGER | DEFAULT 0 | Numero de campanhas que usaram este template |
| last_used_at | TIMESTAMPTZ | NULL | Ultima vez que foi utilizado numa campanha |
| created_at | TIMESTAMPTZ | DEFAULT now() | Data de criacao |
| updated_at | TIMESTAMPTZ | DEFAULT now() | Ultima atualizacao |

**Variaveis suportadas no template (merge tags):**
- `{{nome}}` — nome do contacto
- `{{email}}` — email do contacto
- `{{empresa}}` — empresa do contacto
- `{{unsubscribe_url}}` — link de descadastro (futuro)

**Regras de templates:**
- Apenas um template pode ser `is_default = true` por utilizador
- `usage_count` e `last_used_at` sao atualizados APENAS pelo backend (motor de envio)
- `thumbnail` e preenchido pelo backend apos render do HTML (futuro)

#### Tabela: campaigns

| Coluna | Tipo | Constraints | Descricao |
|--------|------|-------------|-----------|
| id | UUID | PK, gen_random_uuid() | Identificador unico |
| user_id | UUID | NOT NULL, FK -> auth.users ON DELETE CASCADE | Dono da campanha |
| created_by | UUID | NOT NULL, FK -> auth.users | Quem criou (audit trail) |
| nome | TEXT | NOT NULL, DEFAULT '' | Nome interno da campanha |
| assunto | TEXT | NOT NULL, DEFAULT '' | Assunto do email (pode usar variaveis) |
| status | TEXT | NOT NULL, DEFAULT 'draft' | Estado da campanha |
| template_id | UUID | FK -> templates ON DELETE SET NULL | Template associado |
| from_name | TEXT | DEFAULT '' | Nome do remetente |
| from_email | TEXT | DEFAULT '' | Email do remetente |
| reply_to | TEXT | DEFAULT '' | Email de resposta |
| scheduled_at | TIMESTAMPTZ | NULL | Data/hora de envio agendado |
| started_at | TIMESTAMPTZ | NULL | Quando o envio efetivamente comecou |
| finished_at | TIMESTAMPTZ | NULL | Quando o envio terminou |
| last_error | TEXT | NULL | Ultima mensagem de erro (se status = failed) |
| progress_percent | INTEGER | DEFAULT 0 | Progresso do envio (0-100) |
| total_recipients | INTEGER | DEFAULT 0 | Total de destinatarios |
| total_sent | INTEGER | DEFAULT 0 | Emails enviados com sucesso |
| total_failed | INTEGER | DEFAULT 0 | Emails que falharam |
| total_opened | INTEGER | DEFAULT 0 | Emails abertos (rastreamento futuro) |
| total_clicked | INTEGER | DEFAULT 0 | Links clicados (rastreamento futuro) |
| created_at | TIMESTAMPTZ | DEFAULT now() | Data de criacao |
| updated_at | TIMESTAMPTZ | DEFAULT now() | Ultima atualizacao |

**Regra critica — Contadores:**
Os campos total_sent, total_failed, total_recipients, total_opened, total_clicked,
progress_percent e last_error sao atualizados EXCLUSIVAMENTE pelo backend (motor de envio).
O frontend NUNCA atualiza estes campos diretamente. Esta separacao garante:
- Integridade dos dados (nao ha race conditions entre UI e motor)
- Single source of truth (o motor e o unico que sabe o estado real)
- Facil debugging (se contadores estiverem errados, o problema e no motor)

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

- draft -> scheduled: template_id obrigatorio, total_recipients > 0, assunto obrigatorio
- scheduled -> sending: scheduled_at <= now()
- sending -> sent: total_sent + total_failed == total_recipients
- sending -> failed: erro critico no envio (last_error preenchido)
- sending -> paused: pausa manual (progress_percent preservado)
- paused -> sending: retoma de onde parou (progress_percent mantido)
- qualquer -> cancelled: so se nao estiver em 'sent'
- failed -> draft: permite recriar a campanha

**Campos de timeline:**
- `created_at`: quando a campanha foi criada
- `scheduled_at`: quando esta agendada para enviar
- `started_at`: quando o motor de envio comecou a processar
- `finished_at`: quando todos os recipients foram processados
- `updated_at`: ultima alteracao a campanha (trigger automatico)

#### Tabela: campaign_recipients

Tabela de juncao M:N entre campaigns e contacts. Cada registo representa
um envio individual a um contacto especifico, com estado de entrega.

| Coluna | Tipo | Constraints | Descricao |
|--------|------|-------------|-----------|
| id | UUID | PK, gen_random_uuid() | Identificador unico |
| campaign_id | UUID | NOT NULL, FK -> campaigns ON DELETE CASCADE | Campanha |
| contact_id | UUID | NOT NULL, FK -> contacts ON DELETE CASCADE | Contacto |
| status | TEXT | NOT NULL, DEFAULT 'pending' | Estado do envio individual |
| message_id | TEXT | NULL | ID unico da mensagem (para tracking/rastreamento) |
| sent_at | TIMESTAMPTZ | NULL | Quando foi enviado |
| delivered_at | TIMESTAMPTZ | NULL | Quando a entrega foi confirmada (futuro) |
| opened_at | TIMESTAMPTZ | NULL | Quando foi aberto (futuro) |
| clicked_at | TIMESTAMPTZ | NULL | Quando clicou link (futuro) |
| bounced_at | TIMESTAMPTZ | NULL | Quando bounce foi detectado (futuro) |
| unsubscribed_at | TIMESTAMPTZ | NULL | Quando utilizador cancelou subscricao (futuro) |
| error_message | TEXT | NULL | Mensagem de erro se falhou |
| retry_count | INTEGER | DEFAULT 0 | Numero de tentativas |
| created_at | TIMESTAMPTZ | DEFAULT now() | Data de criacao |

**Estados do recipient (status):**

| Estado | Descricao |
|--------|-----------|
| pending | Aguarda envio |
| sending | Em processo de envio |
| sent | Enviado com sucesso |
| delivered | Entrega confirmada (futuro) |
| opened | Email aberto (futuro) |
| clicked | Link clicado (futuro) |
| bounced | Email devolvido (futuro) |
| unsubscribed | Utilizador cancelou subscricao (futuro) |
| failed | Falhou (com error_message) |
| skipped | Ignorado (email duplicado, descadastro, etc.) |

**Constraint UNIQUE:**
```sql
UNIQUE(campaign_id, contact_id)
```
Impede que o mesmo contacto seja adicionado duas vezes a mesma campanha.

**Campo message_id:**
ID unico gerado pelo servidor de email (nodemailer). Usado para:
- Rastreamento de entrega (delivery status callbacks)
- Correlacao com webhooks de bounce/open/click (futuro)
- Debug de problemas de envio

### 2.3 Diagrama de Relacoes

```
auth.users
    |
    +-- 1:1 -- profiles
    |
    +-- 1:N -- contacts
    |
    +-- 1:N -- templates
    |              |
    |              +-- usage_count (atualizado pelo backend)
    |              +-- last_used_at (atualizado pelo backend)
    |
    +-- 1:N -- campaigns
                    |  created_by -> auth.users (audit)
                    |  template_id -> templates (FK)
                    |
                    +-- counters (atualizados EXCLUSIVAMENTE pelo backend)
                    |   total_recipients, total_sent, total_failed,
                    |   total_opened, total_clicked, progress_percent
                    |
                    +-- 1:N -- campaign_recipients
                                    |  contact_id -> contacts (FK)
                                    |  message_id (tracking ID)
                                    |
                                    +-- timeline fields (atualizados pelo backend)
                                        sent_at, delivered_at, opened_at,
                                        clicked_at, bounced_at, unsubscribed_at
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
CREATE INDEX idx_templates_is_default ON templates(user_id, is_default)
    WHERE is_default = true;
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

### templates: is_default exclusivo

Quando um template e marcado como default, todos os outros do mesmo user
devem ser desmarcados. Implementado via trigger:

```sql
CREATE OR REPLACE FUNCTION enforce_single_default_template()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_default = true THEN
        UPDATE templates
        SET is_default = false
        WHERE user_id = NEW.user_id
        AND id != NEW.id
        AND is_default = true;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_templates_single_default
    BEFORE INSERT OR UPDATE ON templates
    FOR EACH ROW EXECUTE FUNCTION enforce_single_default_template();
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
| POST | /api/templates/:id/duplicate | Duplicar template |
| POST | /api/templates/preview | Pre-visualizar HTML com merge tags |

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

**POST /api/templates/:id/duplicate:**
Cria uma copia do template com nome "(Copia) Nome Original".
Nao copia usage_count nem last_used_at.

**POST /api/templates/preview:**
```json
// Request
{
    "corpo_html": "<h1>Ola {{nome}}</h1>",
    "assunto": "Bem-vindo, {{nome}}!",
    "sample_data": { "nome": "Joao", "email": "joao@teste.com" }
}

// Response
{
    "html_rendered": "<h1>Ola Joao</h1>",
    "assunto_rendered": "Bem-vindo, Joao!"
}
```

### 6.2 Campanhas

| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | /api/campaigns | Listar campanhas (com filtros) |
| GET | /api/campaigns/:id | Obter campanha com recipients |
| POST | /api/campaigns | Criar campanha (draft) |
| PUT | /api/campaigns/:id | Atualizar campanha |
| DELETE | /api/campaigns/:id | Eliminar campanha |
| POST | /api/campaigns/:id/duplicate | Duplicar campanha |
| POST | /api/campaigns/:id/recipients | Adicionar contactos |
| DELETE | /api/campaigns/:id/recipients | Remover contactos |
| GET | /api/campaigns/:id/recipients | Listar recipients com status |
| POST | /api/campaigns/:id/schedule | Agendar envio |
| POST | /api/campaigns/:id/reschedule | Reagendar (alterar data) |
| POST | /api/campaigns/:id/send | Enviar agora |
| POST | /api/campaigns/:id/test-send | Enviar teste para um email |
| POST | /api/campaigns/:id/cancel | Cancelar campanha |
| POST | /api/campaigns/:id/pause | Pausar envio |
| POST | /api/campaigns/:id/resume | Retomar campanha pausada |
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
- created_by: preenchido automaticamente com user_id

#### POST /api/campaigns/:id/duplicate — Duplicar Campanha

```json
// Response 201
{
    "success": true,
    "campaign": {
        "id": "nova-uuid",
        "nome": "Copia de Campanha Julho 2026",
        "status": "draft",
        "template_id": "original-template-id"
    }
}
```

**Comportamento:**
- Copia: nome, assunto, template_id, from_name, from_email, reply_to
- NAO copia: status (sempre draft), recipients, contadores, timestamps de envio
- Cria copia dos campaign_recipients (os mesmos contactos)
- Usage_count do template nao e incrementado (so no envio real)

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
- Atualiza total_recipients na campanha (APENAS backend)

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
4. Atualiza status para 'sending', started_at = now()
5. Inicia processamento em batches de 100
6. Para cada batch:
   a. Busca 100 recipients com status 'pending'
   b. Para cada recipient:
      - Busca dados do contacto
      - Substitui merge tags no template
      - Gera message_id unico
      - Envia email via nodemailer
      - Atualiza recipient: status=sent, sent_at, message_id
      - Incrementa campaign.total_sent
      - Atualiza campaign.progress_percent
   c. Pequena pausa entre batches (rate limiting)
7. Quando todos processados:
   - status -> 'sent'
   - finished_at = now()
   - progress_percent = 100
   - template.usage_count += 1
   - template.last_used_at = now()
8. Se erro critico:
   - status -> 'failed'
   - last_error = mensagem de erro
   - finished_at = now()

#### POST /api/campaigns/:id/test-send — Enviar Teste

```json
// Request
{
    "email": "meu-email@exemplo.com"
}

// Response 200
{
    "success": true,
    "message": "Email de teste enviado"
}
```

**Comportamento:**
- Envia o template renderizado para UM unico email
- Nao altera contadores da campanha
- Nao cria campaign_recipients
- Valida que template existe e tem conteudo
- Util para verificar formatacao antes de enviar de verdade

#### POST /api/campaigns/:id/reschedule — Reagendar

```json
// Request
{
    "scheduled_at": "2026-07-26T10:00:00Z"
}

// Response 200
{
    "success": true,
    "scheduled_at": "2026-07-26T10:00:00Z"
}
```

**Comportamento:**
- Apenas permitido se status = 'scheduled'
- Atualiza scheduled_at
- Valida que nova data e no futuro

#### POST /api/campaigns/:id/resume — Retomar

```json
// Response 200
{
    "success": true,
    "message": "Campanha retomada"
}
```

**Comportamento:**
- Apenas permitido se status = 'paused'
- Retoma envio de onde parou (recipients pending)
- progress_percent e preservado
- status -> 'sending'

#### GET /api/campaigns/:id/stats — Estatisticas

```json
// Response 200
{
    "campaign_id": "...",
    "status": "sent",
    "timeline": {
        "created_at": "...",
        "scheduled_at": "...",
        "started_at": "...",
        "finished_at": "..."
    },
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
- Acoes por linha: editar (draft), ver stats, duplicar, eliminar

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

**Botao "Guardar Rascunho":**
Disponivel em qualquer passo. Guarda o estado atual como draft.
Util quando o utilizador quer interromper e continuar depois.

**Botao "Enviar Teste":**
Disponivel no passo 4 (preview). Envia o email para um endereco de teste.
Nao afeta contadores da campanha.

#### View: Pre-visualizacao
- Render do HTML do template com dados de amostra
- Simula merge tags com primeiro contacto real
- Mostra versao desktop e mobile
- Botao "Enviar" ou "Agendar"

#### View: Estatisticas
- KPIs: enviados, abertos, clicados, taxa de entrega
- Timeline: created -> scheduled -> started -> finished
- Progress bar (durante envio)
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
status -> 'sending', started_at = now()
    |
+-- BATCH 1 ------------------------------+
|  SELECT 100 pending recipients          |
|  Para cada:                             |
|    -> Busca dados do contacto           |
|    -> Substitui {{nome}}, etc           |
|    -> Gera message_id unico             |
|    -> transporter.sendMail()            |
|    -> Atualiza recipient: sent, sent_at |
|    -> Incrementa campaign.sent          |
|    -> Atualiza progress_percent         |
|  Aguarda 1s (rate limit)               |
+-----------------------------------------+
    |
+-- BATCH 2 ------------------------------+
|  ... repete ...                         |
+-----------------------------------------+
    |
Todos processados:
    status -> 'sent'
    finished_at = now()
    progress_percent = 100
    template.usage_count += 1
    template.last_used_at = now()
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
progress_percent preservado
    |
Batch processing para
    |
POST /api/campaigns/:id/resume
    |
status -> 'sending'
    |
Retoma de onde parou (recipients pending)
```

### 8.5 Reagendar

```
POST /api/campaigns/:id/reschedule
{ "scheduled_at": "2026-07-26T10:00:00Z" }
    |
Apenas se status = 'scheduled'
    |
Atualiza scheduled_at
    |
Polling processa na nova data
```

### 8.6 Enviar Teste

```
POST /api/campaigns/:id/test-send
{ "email": "teste@exemplo.com" }
    |
Valida template existe
    |
Renderiza HTML com merge tags
    |
Envia para UM email
    |
NAO altera contadores
NAO cria recipients
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

### 9.3 Suporte a Filas (Queue) — Design Abstrato

A arquitetura atual suporta migracao futura para filas SEM alterar a API publica:

**Nivel 1 (MVP):** Motor embutido no server.js
- Batch processor roda dentro do processo Express
- State em PostgreSQL (nao ha memoria compartilhada)
- Funciona para ate ~5.000 contactos por campanha

**Nivel 2 (Futuro):** Worker separado
- Extrair batch_processor() para ficheiro independente
- Worker roda como processo separado no mesmo Render service
- Comunicacao via PostgreSQL ( tabela de jobs ou status)
- Suporta ~50.000 contactos

**Nivel 3 (Escala):** Fila distribuida
- Adicionar tabela `job_queue`:
  ```sql
  CREATE TABLE job_queue (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      job_type TEXT NOT NULL,  -- 'send_campaign', 'process_batch'
      payload JSONB NOT NULL,
      status TEXT DEFAULT 'pending',  -- pending, processing, completed, failed
      priority INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now(),
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      error_message TEXT
  );
  ```
- Workers competem por jobs (SELECT FOR UPDATE SKIP LOCKED)
- Suporta multiplos nos e milhoes de contactos

**Transicao Nivel 1 -> Nivel 2:**
1. Extrair processCampaignBatch() para ficheiro separado
2. Server.js continua a aceitar pedidos e criar jobs
3. Worker roda em intervalo e processa jobs pendentes
4. API publica NAO muda

**Transicao Nivel 2 -> Nivel 3:**
1. Criar tabela job_queue
2. Server.js cria jobs na tabela em vez de processar inline
3. Workers leem da tabela com locking
4. API publica NAO muda

### 9.4 Multiplos Nos

A arquitetura suporta multiplos nos porque:
- Todo o estado esta em PostgreSQL (nao ha memoria compartilhada)
- Campaign_recipients usa SELECT FOR UPDATE para evitar processamento duplicado
- Locking por linha (row-level) permite concorrencia segura
- Contadores usam atomic updates (UPDATE ... SET total_sent = total_sent + 1)

### 9.5 Milhoes de Campanhas Simultaneas

Para suportar milhoes de campanhas:
- Indices parciais mantem queries rapidas mesmo com muitos dados
- Particionamento por data (futuro): campaign_recipients particionado por mes
- Cleanup periodico: archivar campanhas antigas (mais de 12 meses)
- Contadores denormalizados evitam COUNT(*) em tabelas grandes

### 9.6 Rate Limiting

```text
Gmail SMTP: max 500 emails/dia (free), 2000/dia (Workspace)
Supabase: 500 inserts/min (free), 5000/min (pro)
Render: 512MB RAM, 0.5 CPU (free), escalavel
```

Estrategia:
- Batches de 100 com pausa de 1-2s entre batches
- Max 500 envios/dia por conta Gmail (limitacao do plano)
- Monitorar uso via contadores na campanha
- Alerta quando atingir 80% do limite

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

### 13.5 Porque created_by E user_id?

- `user_id`: quem e o dono da campanha (para RLS e queries)
- `created_by`: quem criou especificamente (audit trail)
- No MVP, sempre igual (utilizador individual)
- No futuro, util para equipas (um membro cria, outro envia)

### 13.6 Porque started_at E finished_at?

- `scheduled_at`: quando o utilizador planeou enviar
- `started_at`: quando o motor comecou a processar (pode ser minutos depois)
- `finished_at`: quando todos os recipients foram processados
- Diferenca started_at -> finished_at = duracao real do envio
- Util para debugging e metricas de performance

### 13.7 Porque progress_percent?

- UI precisa de mostrar barra de progresso durante envio
- Backend atualiza a cada batch completado
- Frontend faz polling a cada 5s para atualizar barra
- Evita query complexa em tempo real

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
| Contadores inconsistentes | Metricas erradas | Funcao SQL de recalculo (recalculate_campaign_stats) |
| Motor de envio crasha a meio | Campanha presa | Retry automatico + alerta de falha |

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

*Documento v2.0 — Revisao final concluida.*
*Arquitetura aprovada para implementacao.*
