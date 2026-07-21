# MailFlow Pro — Guia de Deploy

## Estado Atual

| Componente | Estado |
|------------|--------|
| Netlify Functions (backend) | ✅ Pronto |
| Template de email | ✅ Pronto |
| Validação e sanitização | ✅ Pronto |
| Logging estruturado | ✅ Pronto |
| Segurança (CSP, headers) | ⏳ Pendente (netlify.toml) |
| Stripe (conta) | ⏳ Aguarda validação legal/fiscal |
| Frontend (chave Stripe) | ⏳ Aguarda conta Stripe ativa |

---

## Passos Finais (quando a conta Stripe for aprovada)

### 1. Configurar Variáveis de Ambiente no Netlify

No **Netlify Dashboard → Site → Environment Variables**, adicionar:

| Variável | Origem | Notas |
|----------|--------|-------|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys | Chave secreta (`sk_live_...`) |
| `STRIPE_PUBLISHABLE_KEY` | Stripe Dashboard → Developers → API keys | Chave pública (`pk_live_...`) |
| `STRIPE_PRICE_ID` | Stripe Dashboard → Products → Price | ID do preço (`price_...`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Developers → Webhooks | Secret do webhook (`whsec_...`) |
| `EMAIL_USER` | Gmail | Endereço Gmail para envio |
| `EMAIL_PASS` | Gmail → App Passwords | Senha de app (não a senha normal) |
| `URL` | Automática pelo Netlify | Não precisa de configurar manualmente |

**Opicional:**
| Variável | Default | Descrição |
|----------|---------|-----------|
| `SUCCESS_URL` | `{URL}/sucesso.html` | URL de sucesso após pagamento |
| `CANCEL_URL` | `{URL}` | URL de cancelamento |

### 2. Criar Produto e Preço no Stripe

1. Stripe Dashboard → **Products** → **Add product**
2. Nome: `MailFlow Pro`
3. Adicionar preço: `49,99€` recorrente (mensal)
4. Copiar o `price_...` → adicionar como `STRIPE_PRICE_ID`

### 3. Configurar Webhook no Stripe

1. Stripe Dashboard → **Developers** → **Webhooks** → **Add endpoint**
2. Endpoint URL: `https://<seu-site>.netlify.app/webhook`
3. Events to send: `checkout.session.completed`
4. Copiar o signing secret → adicionar como `STRIPE_WEBHOOK_SECRET`

### 4. Atualizar Frontend

Em `index.html`, substituir:

```javascript
// De:
const stripe = Stripe('pk_test_...');

// Para:
const stripe = Stripe('pk_live_...');
```

**Nota:** A Publishable Key é pública e segura para uso no frontend.

### 5. Testar o Fluxo Completo

1. Abrir o site
2. Clicar "Subscrever Pro"
3. Inserir email de teste
4. Completar pagamento com cartão de teste do Stripe
5. Verificar email de boas-vindas recebido
6. Verificar logs no Netlify Dashboard

### 6. Alternar para Modo Live

1. No Stripe Dashboard, alternar de **Test mode** para **Live mode**
2. Atualizar todas as variáveis de ambiente com chaves `sk_live_`, `pk_live_`, etc.
3. Reconfigurar webhook com URL de produção
4. Testar novamente

---

## Estrutura do Código

```
netlify/functions/
├── config.js              # Variáveis de ambiente centralizadas
├── logger.js              # Logger (wrapper de console.log)
├── utils.js               # Funções utilitárias (validação, CORS, etc.)
├── criar-checkout.js      # Cria sessão Stripe Checkout
├── webhook-stripe.js      # Processa eventos do Stripe
├── enviar-email.js        # Envia email via Gmail SMTP
└── templates/
    ├── index.js           # Registo de templates (lazy loading)
    └── welcome.js         # Template de boas-vindas
```

---

## Checklist Pré-Deploy

- [ ] Conta Stripe aprovada
- [ ] Produto e preço criados no Stripe
- [ ] Webhook configurado no Stripe
- [ ] Variáveis de ambiente configuradas no Netlify
- [ ] Chave Stripe atualizada no `index.html`
- [ ] Teste de checkout concluído
- [ ] Email de boas-vindas recebido
- [ ] Logs verificados no Netlify Dashboard
- [ ] Modo live ativado no Stripe
