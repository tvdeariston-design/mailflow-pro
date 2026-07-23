#!/bin/bash
# ============================================
# MailFlow Pro — Setup Supabase
# ============================================
# Executar após criar projeto no Supabase Dashboard.
# Pede as credenciais e configura automaticamente.
#
# Uso: chmod +x setup-supabase.sh && ./setup-supabase.sh
# ============================================

set -e

echo ""
echo "============================================"
echo "  MailFlow Pro — Setup Supabase"
echo "============================================"
echo ""

# Pedir credenciais
echo "Introduz as credenciais do Supabase Dashboard:"
echo "(Settings → API → Project URL, anon key, service_role key)"
echo ""

read -p "Project URL (https://xxxxx.supabase.co): " SUPABASE_URL
read -p "Anon Public Key (eyJ...): " SUPABASE_ANON_KEY
read -p "Service Role Key (eyJ...): " SUPABASE_SERVICE_ROLE_KEY

# Validar que não estão vazios
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo ""
    echo "❌ Erro: Todas as credenciais são obrigatórias."
    exit 1
fi

# Validar formato da URL
if [[ ! "$SUPABASE_URL" == *"supabase.co"* ]]; then
    echo ""
    echo "❌ Erro: URL não parece ser do Supabase."
    exit 1
fi

# Atualizar .env
cat > .env << EOF
# ============================================
# MailFlow Pro — Variáveis de Ambiente
# ============================================

# Supabase (Fase 1)
SUPABASE_URL=$SUPABASE_URL
SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY

# Stripe (Fase 9 — não configurar ainda)
STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_PRICE_ID=
STRIPE_WEBHOOK_SECRET=

# Email (Fase 6)
EMAIL_USER=
EMAIL_PASS=

# Netlify
SITE_URL=https://mailflow-pro.netlify.app
EOF

# Atualizar supabase-client.js
sed -i "s|var SUPABASE_URL = '.*';|var SUPABASE_URL = '$SUPABASE_URL';|" js/supabase-client.js
sed -i "s|var SUPABASE_ANON_KEY = '.*';|var SUPABASE_ANON_KEY = '$SUPABASE_ANON_KEY';|" js/supabase-client.js

echo ""
echo "============================================"
echo "  ✅ Configuração atualizada!"
echo "============================================"
echo ""
echo "Ficheiros atualizados:"
echo "  - .env (com credenciais reais)"
echo "  - js/supabase-client.js (com URL e anon key)"
echo ""
echo "Próximos passos:"
echo "  1. Abrir Supabase Dashboard → SQL Editor"
echo "  2. Executar na ordem:"
echo "     - database/migrations/001_profiles.sql"
echo "     - database/migrations/002_rls.sql"
echo "     - database/migrations/003_triggers.sql"
echo "  3. Authentication → Settings → desativar email confirmation"
echo "  4. Testar: criar-conta.html → dashboard.html"
echo ""
