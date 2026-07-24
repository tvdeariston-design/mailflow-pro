/**
 * MailFlow Pro — Express Server for Render
 * 
 * Servidor Express que expõe as mesmas APIs das Netlify Functions
 * para funcionar como Web Service no Render.
 */

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const nodemailer = require('nodemailer');
const campaignEngine = require('./services/campaign-engine');

const app = express();
const path = require('path');
const { config } = require('./config');
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS
// Servir ficheiros estáticos da raiz do projeto
app.use(express.static(path.join(__dirname)));
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// ============================================
// Configuração Supabase
// ============================================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Cliente Supabase para operações admin (service_role)
const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

// ============================================
// Helpers
// ============================================
function createResponse(statusCode, body) {
    return res.status(statusCode).json(body);
}

function createErrorResponse(statusCode, message) {
    return res.status(statusCode).json({ success: false, error: message });
}

function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function validateRequiredFields(data, fields) {
    const missing = [];
    for (const field of fields) {
        if (!data[field] || (typeof data[field] === 'string' && data[field].trim() === '')) {
            missing.push(field);
        }
    }
    return { valid: missing.length === 0, missing };
}

function validateStringLength(value, min, max) {
    if (value === null || value === undefined) return { valid: false, reason: 'missing' };
    const len = value.length;
    if (min > 0 && len < min) return { valid: false, reason: 'too_short' };
    if (max > 0 && len > max) return { valid: false, reason: 'too_long' };
    return { valid: true };
}

function sanitizeHtml(text) {
    return text
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/"/g, '"')
        .replace(/'/g, '&#039;')
        .replace(/\//g, '&#47;');
}

// Logger simples
const logger = {
    info: (msg, ctx) => console.log(`[INFO] ${new Date().toISOString()} [${ctx}] ${msg}`),
    warn: (msg, ctx) => console.warn(`[WARN] ${new Date().toISOString()} [${ctx}] ${msg}`),
    error: (msg, ctx) => console.error(`[ERROR] ${new Date().toISOString()} [${ctx}] ${msg}`),
};

// ============================================
// Middleware de autenticação
// ============================================
async function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Não autenticado' });
    }

    const token = authHeader.replace('Bearer ', '');
    
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        return res.status(500).json({ success: false, error: 'Serviço indisponível' });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
        return res.status(401).json({ success: false, error: 'Sessão inválida' });
    }

    req.user = user;
    req.supabase = supabase;
    next();
}

// ============================================
// ROTAS
// ============================================

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// 1. CRIAR CONTA (equivalente a criar-conta)
// ============================================
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { email, password, nome } = req.body;

        // Validações
        const fields = validateRequiredFields(req.body, ['email', 'password', 'nome']);
        if (!fields.valid) {
            return res.status(400).json({ success: false, error: 'Campo obrigatório em falta: ' + fields.missing.join(', ') });
        }

        const cleanEmail = email.trim();
        const cleanNome = nome.trim();

        if (!validateEmail(cleanEmail)) {
            return res.status(400).json({ success: false, error: 'Formato de email inválido' });
        }

        if (password.length < 6) {
            return res.status(400).json({ success: false, error: 'A password deve ter pelo menos 6 caracteres' });
        }

        if (cleanNome.length < 1 || cleanNome.length > 200) {
            return res.status(400).json({ success: false, error: 'Nome inválido' });
        }

        if (!supabaseAdmin) {
            return res.status(500).json({ success: false, error: 'Serviço de registo indisponível' });
        }

        // Criar utilizador no Supabase Auth
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
            email: cleanEmail,
            password: password,
            email_confirm: true,
            user_metadata: { nome: cleanNome }
        });

        if (error) {
            if (error.message.includes('already registered')) {
                return res.status(409).json({ success: false, error: 'Este email já está registado.' });
            }
            logger.error('Erro ao criar utilizador: ' + error.message, 'Signup');
            return res.status(500).json({ success: false, error: 'Erro ao criar conta. Tente novamente.' });
        }

        // Profile upsert (fallback)
        const now = new Date().toISOString();
        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .upsert({
                id: data.user.id,
                email: cleanEmail,
                nome: cleanNome,
                updated_at: now
            }, { onConflict: 'id' });

        if (profileError) {
            logger.warn('Profile upsert fallback falhou: ' + profileError.message, 'Signup');
        }

        logger.info('Conta criada com sucesso - Email: ' + cleanEmail + ', ID: ' + data.user.id, 'Signup');

        res.status(201).json({
            success: true,
            user: {
                id: data.user.id,
                email: data.user.email
            }
        });

    } catch (error) {
        logger.error('Erro inesperado ao criar conta: ' + error.message, 'Signup');
        res.status(500).json({ success: false, error: 'Erro ao processar registo' });
    }
});

// ============================================
// 2. LOGIN (usar Supabase Auth directamente no frontend)
// ============================================
// O frontend usa supabase.auth.signInWithPassword() directamente
// Não precisamos de endpoint aqui

// ============================================
// 3. VERIFICAR PREMIUM (equivalente a verificar-premium)
// ============================================
app.get('/api/premium/status', authMiddleware, async (req, res) => {
    try {
        // Chamar função SQL RPC (source of truth)
        const { data, error } = await req.supabase.rpc('verificar_status_premium', {
            user_id: req.user.id
        });

        if (error) {
            logger.error('Erro RPC verificar_status_premium: ' + error.message, 'PremiumStatus');
            return res.status(500).json({ success: false, error: 'Erro ao verificar estado premium' });
        }

        const result = data && data[0] ? data[0] : {
            premium: false,
            reason: 'none',
            trial_end: null,
            days_remaining: null
        };

        logger.info('Verificação premium: ' + req.user.email + ' -> ' + (result.premium ? 'PREMIUM (' + result.reason + ')' : 'GRATUITO'), 'PremiumStatus');

        res.json(result);

    } catch (error) {
        logger.error('Erro ao verificar premium: ' + error.message, 'PremiumStatus');
        res.status(500).json({ success: false, error: 'Erro ao verificar estado premium' });
    }
});

// ============================================
// 4. PERFIL - GET (equivalente a perfil GET)
// ============================================
app.get('/api/profile', authMiddleware, async (req, res) => {
    try {
        const { data, error } = await req.supabase
            .from('profiles')
            .select('*')
            .eq('id', req.user.id)
            .single();

        if (error || !data) {
            return res.status(404).json({ success: false, error: 'Profile não encontrado' });
        }

        res.json({ profile: data });

    } catch (error) {
        logger.error('Erro ao ler profile: ' + error.message, 'Profile');
        res.status(500).json({ success: false, error: 'Erro ao carregar profile' });
    }
});

// ============================================
// 5. PERFIL - PUT (equivalente a perfil PUT)
// ============================================
app.put('/api/profile', authMiddleware, async (req, res) => {
    try {
        const body = req.body;
        const updates = {};

        if (body.nome !== undefined) {
            const nomeCheck = validateStringLength(body.nome, 1, 200);
            if (!nomeCheck.valid) {
                return res.status(400).json({ success: false, error: 'Nome inválido' });
            }
            updates.nome = body.nome.trim();
        }

        if (body.empresa !== undefined) {
            const empresaCheck = validateStringLength(body.empresa, 0, 200);
            if (!empresaCheck.valid) {
                return res.status(400).json({ success: false, error: 'Empresa inválida' });
            }
            updates.empresa = body.empresa.trim();
        }

        if (body.telefone !== undefined) {
            updates.telefone = body.telefone.trim();
        }

        if (body.timezone !== undefined) {
            updates.timezone = body.timezone;
        }

        if (body.locale !== undefined) {
            updates.locale = body.locale;
        }

        // SMTP fields
        if (body.smtp_host !== undefined) {
            updates.smtp_host = body.smtp_host.trim();
        }
        if (body.smtp_port !== undefined) {
            const port = parseInt(body.smtp_port, 10);
            if (!isNaN(port) && port > 0 && port <= 65535) {
                updates.smtp_port = port;
            } else {
                return res.status(400).json({ success: false, error: 'Porta SMTP inválida' });
            }
        }
        if (body.smtp_username !== undefined) {
            updates.smtp_username = body.smtp_username.trim();
        }
        if (body.smtp_password !== undefined) {
            updates.smtp_password = body.smtp_password;
        }
        if (body.smtp_secure !== undefined) {
            updates.smtp_secure = Boolean(body.smtp_secure);
        }
        if (body.smtp_from_email !== undefined) {
            updates.smtp_from_email = body.smtp_from_email.trim();
        }
        if (body.smtp_from_name !== undefined) {
            updates.smtp_from_name = body.smtp_from_name.trim();
        }

        // Update smtp_status when SMTP fields are saved
        var smtpFieldsProvided = body.smtp_host !== undefined && body.smtp_port !== undefined &&
                                  body.smtp_username !== undefined && body.smtp_password !== undefined;
        if (smtpFieldsProvided) {
            var hasHost = body.smtp_host && body.smtp_host.trim();
            var hasPort = body.smtp_port !== undefined && !isNaN(parseInt(body.smtp_port, 10)) && parseInt(body.smtp_port, 10) > 0;
            var hasUser = body.smtp_username && body.smtp_username.trim();
            var hasPass = body.smtp_password !== undefined && body.smtp_password !== '';
            if (hasHost && hasPort && hasUser && hasPass) {
                updates.smtp_status = 'configured';
            } else {
                updates.smtp_status = 'not_configured';
            }
        }

        updates.updated_at = new Date().toISOString();

        const { data, error } = await req.supabase
            .from('profiles')
            .update(updates)
            .eq('id', req.user.id)
            .select()
            .single();

        if (error) {
            logger.error('Erro ao atualizar profile: ' + error.message, 'Profile');
            return res.status(500).json({ success: false, error: 'Erro ao guardar alterações' });
        }

        logger.info('Profile atualizado - User: ' + req.user.id, 'Profile');
        res.json({ profile: data });

    } catch (error) {
        logger.error('Erro inesperado ao atualizar profile: ' + error.message, 'Profile');
        res.status(500).json({ success: false, error: 'Erro ao processar alterações' });
    }
});
// ============================================
// SMTP TEST ENDPOINT
// ============================================
app.post('/api/smtp/test', authMiddleware, async (req, res) => {
    try {
        const body = req.body;
        
        // Validate required fields
        if (!body.smtp_host || !body.smtp_host.trim()) {
            return res.status(400).json({ success: false, error: 'Host SMTP é obrigatório' });
        }
        const port = parseInt(body.smtp_port, 10);
        if (isNaN(port) || port < 1 || port > 65535) {
            return res.status(400).json({ success: false, error: 'Porta SMTP inválida' });
        }
        if (!body.smtp_username || !body.smtp_username.trim()) {
            return res.status(400).json({ success: false, error: 'Username SMTP é obrigatório' });
        }
        if (!body.smtp_password) {
            return res.status(400).json({ success: false, error: 'Password SMTP é obrigatória' });
        }

        // Create temporary transporter
        const testTransporter = nodemailer.createTransport({
            host: body.smtp_host.trim(),
            port: port,
            secure: Boolean(body.smtp_secure),
            auth: {
                user: body.smtp_username.trim(),
                pass: body.smtp_password
            },
            tls: {
                // Allow self-signed certificates for testing
                rejectUnauthorized: false
            }
        });

        // Verify connection only - do NOT send email
        await testTransporter.verify();

        // Update smtp_status to verified
        await req.supabase
            .from('profiles')
            .update({ smtp_status: 'verified', smtp_verified_at: new Date().toISOString() })
            .eq('id', req.user.id);

        logger.info('SMTP test successful - User: ' + req.user.id, 'SMTP');
        res.json({ success: true, message: 'Ligação SMTP bem-sucedida!' });

    } catch (error) {
        logger.error('SMTP test failed - User: ' + req.user.id + ' - ' + error.message, 'SMTP');
        res.status(400).json({ success: false, error: error.message || 'Erro ao testar ligação SMTP' });
    }
});

// ============================================
// SMTP SEND TEST EMAIL ENDPOINT
// ============================================
app.post('/api/smtp/send-test', authMiddleware, async (req, res) => {
    try {
        const body = req.body;
        
        // Validate required fields
        if (!body.smtp_host || !body.smtp_host.trim()) {
            return res.status(400).json({ success: false, error: 'Host SMTP é obrigatório' });
        }
        const port = parseInt(body.smtp_port, 10);
        if (isNaN(port) || port < 1 || port > 65535) {
            return res.status(400).json({ success: false, error: 'Porta SMTP inválida' });
        }
        if (!body.smtp_username || !body.smtp_username.trim()) {
            return res.status(400).json({ success: false, error: 'Username SMTP é obrigatório' });
        }
        if (!body.smtp_password) {
            return res.status(400).json({ success: false, error: 'Password SMTP é obrigatória' });
        }
        if (!body.to || !body.to.trim()) {
            return res.status(400).json({ success: false, error: 'Email de destino é obrigatório' });
        }
        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(body.to.trim())) {
            return res.status(400).json({ success: false, error: 'Email de destino inválido' });
        }

        // Create temporary transporter
        const testTransporter = nodemailer.createTransport({
            host: body.smtp_host.trim(),
            port: port,
            secure: Boolean(body.smtp_secure),
            auth: {
                user: body.smtp_username.trim(),
                pass: body.smtp_password
            },
            tls: {
                rejectUnauthorized: false
            }
        });

        // Verify connection first
        await testTransporter.verify();

        // Send test email
        const fromEmail = (body.smtp_from_email && body.smtp_from_email.trim()) ? body.smtp_from_email.trim() : body.smtp_username.trim();
        const fromName = (body.smtp_from_name && body.smtp_from_name.trim()) ? body.smtp_from_name.trim() : 'MailFlow Pro';
        
        await testTransporter.sendMail({
            from: '"' + fromName + '" <' + fromEmail + '>',
            to: body.to.trim(),
            subject: 'MailFlow Pro - Teste SMTP',
            html: '<h2>Ligação SMTP bem-sucedida</h2><p>Este é um email de teste enviado pelo MailFlow Pro.</p>'
        });

        // Update smtp_status to verified
        await req.supabase
            .from('profiles')
            .update({ smtp_status: 'verified', smtp_verified_at: new Date().toISOString() })
            .eq('id', req.user.id);

        logger.info('SMTP test email sent - User: ' + req.user.id + ', To: ' + body.to, 'SMTP');
        res.json({ success: true });

    } catch (error) {
        logger.error('SMTP test email failed - User: ' + req.user.id + ' - ' + error.message, 'SMTP');
        res.status(400).json({ success: false, error: error.message || 'Erro ao enviar email de teste' });
    }
});





// ============================================
// CONTACTOS API
// ============================================

// GET /api/contacts - Listar contactos com paginação, pesquisa e filtros
app.get('/api/contacts', authMiddleware, async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 20, 
            search = '', 
            empresa = '',
            telefone = '' 
        } = req.query;

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const offset = (pageNum - 1) * limitNum;

        let query = req.supabase
            .from('contacts')
            .select('*', { count: 'exact' })
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false });

        // Pesquisa por nome ou email
        if (search) {
            query = query.or(`nome.ilike.%${search}%,email.ilike.%${search}%`);
        }

        // Filtro por empresa
        if (empresa) {
            query = query.ilike('empresa', `%${empresa}%`);
        }

        // Filtro por telefone
        if (telefone) {
            query = query.ilike('telefone', `%${telefone}%`);
        }

        query = query.range(offset, offset + limitNum - 1);

        const { data, error, count } = await query;

        if (error) {
            logger.error('Erro ao listar contactos: ' + error.message, 'Contacts');
            return res.status(500).json({ success: false, error: 'Erro ao buscar contactos' });
        }

        const totalPages = Math.ceil((count || 0) / limitNum);

        logger.info('Contactos listados - User: ' + req.user.id + ', Página: ' + pageNum, 'Contacts');
        res.json({
            contacts: data || [],
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: count || 0,
                totalPages: totalPages
            }
        });

    } catch (error) {
        logger.error('Erro inesperado ao listar contactos: ' + error.message, 'Contacts');
        res.status(500).json({ success: false, error: 'Erro ao processar pedido' });
    }
});


// GET /api/contacts/export - Exportar contactos para CSV ou XLSX
app.get('/api/contacts/export', authMiddleware, async (req, res) => {
    try {
        const { search = '', empresa = '', telefone = '', format = 'csv' } = req.query;

        let query = req.supabase
            .from('contacts')
            .select('nome,email,telefone,empresa,tags,created_at')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false });

        if (search) {
            query = query.or(`nome.ilike.%${search}%,email.ilike.%${search}%`);
        }
        if (empresa) {
            query = query.ilike('empresa', `%${empresa}%`);
        }
        if (telefone) {
            query = query.ilike('telefone', `%${telefone}%`);
        }

        const { data, error } = await query;

        if (error) {
            logger.error('Erro ao exportar contactos: ' + error.message, 'Contacts');
            return res.status(500).json({ success: false, error: 'Erro ao exportar contactos' });
        }

        const headers = ['Nome', 'Email', 'Telefone', 'Empresa', 'Tags', 'Data de Criação'];
        const rows = (data || []).map(c => [
            c.nome || '',
            c.email || '',
            c.telefone || '',
            c.empresa || '',
            (c.tags || []).join('; '),
            c.created_at ? new Date(c.created_at).toLocaleDateString('pt-PT') : ''
        ]);

        const filename = 'contactos-' + new Date().toISOString().split('T')[0];

        if (format === 'xlsx') {
            // XLSX export using SheetJS
            const XLSX = require('xlsx');
            const wb = XLSX.utils.book_new();
            const wsData = [headers, ...rows];
            const ws = XLSX.utils.aoa_to_sheet(wsData);

            // Make first row bold
            const range = XLSX.utils.decode_range(ws['!ref']);
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const cellAddress = XLSX.utils.encode_cell({ r: 0, c: C });
                if (!ws[cellAddress]) ws[cellAddress] = { v: headers[C] };
                ws[cellAddress].s = { font: { bold: true } };
            }

            // Auto column width
            const colWidths = headers.map((h, i) => {
                const maxLen = Math.max(
                    h.length,
                    ...rows.map(r => String(r[i] || '').length)
                );
                return { wch: Math.min(maxLen + 2, 50) };
            });
            ws['!cols'] = colWidths;

            XLSX.utils.book_append_sheet(wb, ws, 'Contactos');

            const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '.xlsx"');
            res.send(buf);
        } else {
            // CSV export with UTF-8 BOM
            const csv = [headers.join(','), ...rows.map(r => r.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(','))].join('\n');
            const bom = '\uFEFF'; // UTF-8 BOM

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '.csv"');
            res.send(bom + csv);
        }

    } catch (error) {
        logger.error('Erro inesperado ao exportar contactos: ' + error.message, 'Contacts');
        res.status(500).json({ success: false, error: 'Erro ao processar pedido' });
    }
});


// GET /api/contacts/:id - Obter um contacto específico
app.get('/api/contacts/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await req.supabase
            .from('contacts')
            .select('*')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ success: false, error: 'Contacto não encontrado' });
            }
            logger.error('Erro ao obter contacto: ' + error.message, 'Contacts');
            return res.status(500).json({ success: false, error: 'Erro ao buscar contacto' });
        }

        logger.info('Contacto obtido - ID: ' + id, 'Contacts');
        res.json({ contact: data });

    } catch (error) {
        logger.error('Erro inesperado ao obter contacto: ' + error.message, 'Contacts');
        res.status(500).json({ success: false, error: 'Erro ao processar pedido' });
    }
});


// POST /api/contacts - Criar novo contacto
app.post('/api/contacts', authMiddleware, async (req, res) => {
    try {
        const { nome, email, telefone, empresa, tags } = req.body;

        // Validações
        if (!email || !validateEmail(email)) {
            return res.status(400).json({ success: false, error: 'Email inválido ou em falta' });
        }

        const cleanEmail = email.trim().toLowerCase();
        const cleanNome = nome ? nome.trim() : cleanEmail.split('@')[0];
        const cleanTelefone = telefone ? telefone.trim() : '';
        const cleanEmpresa = empresa ? empresa.trim() : '';
        const cleanTags = Array.isArray(tags) ? tags.filter(t => t && typeof t === 'string').map(t => t.trim()) : [];

        const { data, error } = await req.supabase
            .from('contacts')
            .insert({
                user_id: req.user.id,
                nome: cleanNome,
                email: cleanEmail,
                telefone: cleanTelefone,
                empresa: cleanEmpresa,
                tags: cleanTags
            })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(409).json({ success: false, error: 'Já existe um contacto com este email' });
            }
            logger.error('Erro ao criar contacto: ' + error.message, 'Contacts');
            return res.status(500).json({ success: false, error: 'Erro ao criar contacto' });
        }

        logger.info('Contacto criado - ID: ' + data.id + ', User: ' + req.user.id, 'Contacts');
        res.status(201).json({ success: true, contact: data });

    } catch (error) {
        logger.error('Erro inesperado ao criar contacto: ' + error.message, 'Contacts');
        res.status(500).json({ success: false, error: 'Erro ao processar pedido' });
    }
});


// POST /api/contacts/import/preview - Preview CSV/XLSX file
app.post('/api/contacts/import/preview', authMiddleware, async (req, res) => {
    try {
        const { content, filename, mapping } = req.body;

        if (!content || !filename) {
            return res.status(400).json({ success: false, error: 'Ficheiro em falta' });
        }

        const ext = filename.split('.').pop().toLowerCase();
        let headers = [];
        let rows = [];

        if (ext === 'csv') {
            const lines = content.trim().split('\n');
            if (lines.length < 2) {
                return res.status(400).json({ success: false, error: 'CSV deve ter cabeçalho e pelo menos uma linha de dados' });
            }

            // Auto-detect separator
            const separators = [',', ';', '\t'];
            let bestSep = ',';
            let maxCols = 0;
            for (const sep of separators) {
                const cols = lines[0].split(sep).length;
                if (cols > maxCols) {
                    maxCols = cols;
                    bestSep = sep;
                }
            }

            headers = lines[0].split(bestSep).map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
            rows = lines.slice(1).map(line => {
                const cells = [];
                let current = '';
                let inQuotes = false;
                for (let j = 0; j < line.length; j++) {
                    const char = line[j];
                    if (char === '"') inQuotes = !inQuotes;
                    else if (char === bestSep && !inQuotes) {
                        cells.push(current.trim().replace(/""/g, '"'));
                        current = '';
                    } else {
                        current += char;
                    }
                }
                cells.push(current.trim().replace(/""/g, '"'));
                return cells;
            });
        } else if (ext === 'xlsx' || ext === 'xls') {
            const XLSX = require('xlsx');
            const buffer = Buffer.from(content, 'base64');
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

            if (json.length < 2) {
                return res.status(400).json({ success: false, error: 'Ficheiro deve ter cabeçalho e pelo menos uma linha de dados' });
            }

            headers = json[0].map(h => String(h).trim().toLowerCase());
            rows = json.slice(1);
        } else {
            return res.status(400).json({ success: false, error: 'Formato não suportado. Use CSV ou XLSX' });
        }

        // Apply column mapping if provided
        const requiredFields = ['nome', 'email', 'telefone', 'empresa', 'tags'];
        const finalHeaders = {};
        for (const field of requiredFields) {
            const mappedIdx = mapping && mapping[field] !== undefined ? mapping[field] : headers.indexOf(field);
            finalHeaders[field] = mappedIdx >= 0 ? mappedIdx : -1;
        }

        if (finalHeaders.email === -1) {
            return res.status(400).json({ success: false, error: 'Coluna "email" é obrigatória (mapeie uma coluna do ficheiro)' });
        }

        // Preview first 10 rows with validation
        const preview = [];
        let validCount = 0;
        let invalidCount = 0;
        let emptyEmailCount = 0;
        const seenEmails = new Set();
        let duplicateCount = 0;

        for (let i = 0; i < Math.min(rows.length, 10); i++) {
            const row = rows[i];
            const email = finalHeaders.email >= 0 ? row[finalHeaders.email] : '';
            const nome = finalHeaders.nome >= 0 ? row[finalHeaders.nome] : '';
            const telefone = finalHeaders.telefone >= 0 ? row[finalHeaders.telefone] : '';
            const empresa = finalHeaders.empresa >= 0 ? row[finalHeaders.empresa] : '';
            const tags = finalHeaders.tags >= 0 && row[finalHeaders.tags] ? 
                String(row[finalHeaders.tags]).split(';').map(t => t.trim()).filter(t => t) : [];

            const emailStr = String(email).toLowerCase().trim();
            const isEmpty = !emailStr;
            const emailValid = emailStr && validateEmail(emailStr);
            const isDuplicate = emailStr && seenEmails.has(emailStr);
            
            let status = 'valid';
            if (isEmpty) { status = 'empty'; emptyEmailCount++; }
            else if (!emailValid) { status = 'invalid_email'; invalidCount++; }
            else if (isDuplicate) { status = 'duplicate'; duplicateCount++; }
            else { status = 'valid'; validCount++; seenEmails.add(emailStr); }

            preview.push({
                rowIndex: i + 1,
                email: emailStr,
                nome: String(nome).trim(),
                telefone: String(telefone).trim(),
                empresa: String(empresa).trim(),
                tags: tags,
                status,
                statusLabel: status === 'valid' ? 'Válido' : 
                            status === 'empty' ? 'Email vazio' : 
                            status === 'invalid_email' ? 'Email inválido' : 'Duplicado no ficheiro'
            });
        }

        // Count total stats for all rows
        for (let i = 10; i < rows.length; i++) {
            const row = rows[i];
            const emailStr = String(finalHeaders.email >= 0 ? row[finalHeaders.email] : '').toLowerCase().trim();
            const isEmpty = !emailStr;
            const emailValid = emailStr && validateEmail(emailStr);
            const isDuplicate = emailStr && seenEmails.has(emailStr);
            
            if (isEmpty) emptyEmailCount++;
            else if (!emailValid) invalidCount++;
            else if (isDuplicate) duplicateCount++;
            else { validCount++; seenEmails.add(emailStr); }
        }

        // Check DB duplicates for preview rows
        if (validCount > 0) {
            const previewEmails = preview.filter(p => p.status === 'valid').map(p => p.email);
            if (previewEmails.length > 0) {
                const { data: existing } = await req.supabase
                    .from('contacts')
                    .select('email')
                    .eq('user_id', req.user.id)
                    .in('email', previewEmails);
                
                if (existing && existing.length > 0) {
                    const existingSet = new Set(existing.map(e => e.email));
                    preview.forEach(p => {
                        if (p.status === 'valid' && existingSet.has(p.email)) {
                            p.status = 'db_duplicate';
                            p.statusLabel = 'Já existe na base de dados';
                            duplicateCount++;
                            validCount--;
                        }
                    });
                }
            }
        }

        res.json({
            success: true,
            preview,
            totalRows: rows.length,
            headers,
            validCount,
            invalidCount,
            emptyEmailCount,
            duplicateCount,
            finalHeaders
        });

    } catch (error) {
        logger.error('Erro ao pré-visualizar importação: ' + error.message, 'Contacts');
        res.status(500).json({ success: false, error: 'Erro ao processar ficheiro' });
    }
});


// POST /api/contacts/import - Importar contactos de CSV/XLSX
app.post('/api/contacts/import', authMiddleware, async (req, res) => {
    try {
        const { content, filename, mapping, duplicateMode } = req.body;

        if (!content || !filename) {
            return res.status(400).json({ success: false, error: 'Ficheiro em falta' });
        }

        const ext = filename.split('.').pop().toLowerCase();
        let headers = [];
        let rows = [];

        if (ext === 'csv') {
            const lines = content.trim().split('\n');
            if (lines.length < 2) {
                return res.status(400).json({ success: false, error: 'CSV deve ter cabeçalho e pelo menos uma linha de dados' });
            }

            // Auto-detect separator
            const separators = [',', ';', '\t'];
            let bestSep = ',';
            let maxCols = 0;
            for (const sep of separators) {
                const cols = lines[0].split(sep).length;
                if (cols > maxCols) {
                    maxCols = cols;
                    bestSep = sep;
                }
            }

            headers = lines[0].split(bestSep).map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
            rows = lines.slice(1).map(line => {
                const cells = [];
                let current = '';
                let inQuotes = false;
                for (let j = 0; j < line.length; j++) {
                    const char = line[j];
                    if (char === '"') inQuotes = !inQuotes;
                    else if (char === bestSep && !inQuotes) {
                        cells.push(current.trim().replace(/""/g, '"'));
                        current = '';
                    } else {
                        current += char;
                    }
                }
                cells.push(current.trim().replace(/""/g, '"'));
                return cells;
            });
        } else if (ext === 'xlsx' || ext === 'xls') {
            const XLSX = require('xlsx');
            const buffer = Buffer.from(content, 'base64');
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
            
            if (json.length < 2) {
                return res.status(400).json({ success: false, error: 'Ficheiro deve ter cabeçalho e pelo menos uma linha de dados' });
            }
            
            headers = json[0].map(h => String(h).trim().toLowerCase());
            rows = json.slice(1);
        } else {
            return res.status(400).json({ success: false, error: 'Formato não suportado. Use CSV ou XLSX' });
        }

        // Apply column mapping
        const requiredFields = ['nome', 'email', 'telefone', 'empresa', 'tags'];
        const finalHeaders = {};
        for (const field of requiredFields) {
            const mappedIdx = mapping && mapping[field] !== undefined ? mapping[field] : headers.indexOf(field);
            finalHeaders[field] = mappedIdx >= 0 ? mappedIdx : -1;
        }

        if (finalHeaders.email === -1) {
            return res.status(400).json({ success: false, error: 'Coluna "email" é obrigatória' });
        }

        // Parse and validate all rows
        const contactsToInsert = [];
        const errors = [];
        const existingEmails = new Set();
        
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const email = finalHeaders.email >= 0 ? String(row[finalHeaders.email] || '').toLowerCase().trim() : '';
            const nome = finalHeaders.nome >= 0 ? String(row[finalHeaders.nome] || '').trim() : '';
            const telefone = finalHeaders.telefone >= 0 ? String(row[finalHeaders.telefone] || '').trim() : '';
            const empresa = finalHeaders.empresa >= 0 ? String(row[finalHeaders.empresa] || '').trim() : '';
            const tags = finalHeaders.tags >= 0 && row[finalHeaders.tags] ? 
                String(row[finalHeaders.tags]).split(';').map(t => t.trim()).filter(t => t) : [];

            if (!email) {
                errors.push({ line: i + 2, error: 'Email vazio', type: 'empty' });
                continue;
            }

            if (!validateEmail(email)) {
                errors.push({ line: i + 2, error: 'Email inválido: ' + email, type: 'invalid_email' });
                continue;
            }

            if (existingEmails.has(email)) {
                errors.push({ line: i + 2, error: 'Email duplicado no ficheiro: ' + email, type: 'duplicate_in_file' });
                continue;
            }

            existingEmails.add(email);
            contactsToInsert.push({
                user_id: req.user.id,
                nome: nome || email.split('@')[0],
                email,
                telefone,
                empresa,
                tags
            });
        }

        if (contactsToInsert.length === 0) {
            return res.status(400).json({ success: false, error: 'Nenhum contacto válido para importar', errors });
        }

        // Check for existing contacts in DB
        const emailsToCheck = contactsToInsert.map(c => c.email);
        const { data: existingContacts, error: checkError } = await req.supabase
            .from('contacts')
            .select('email')
            .eq('user_id', req.user.id)
            .in('email', emailsToCheck);

        const existingInDb = new Set((existingContacts || []).map(c => c.email));

        // Handle duplicates based on mode
        let imported = 0;
        let updated = 0;
        let skipped = 0;
        const batchSize = 100;

        for (let i = 0; i < contactsToInsert.length; i += batchSize) {
            const batch = contactsToInsert.slice(i, i + batchSize);
            
            for (const contact of batch) {
                const isDuplicate = existingInDb.has(contact.email);
                
                if (isDuplicate) {
                    if (duplicateMode === 'update') {
                        const { error } = await req.supabase
                            .from('contacts')
                            .update({ nome: contact.nome, telefone: contact.telefone, empresa: contact.empresa, tags: contact.tags, updated_at: new Date().toISOString() })
                            .eq('user_id', req.user.id)
                            .eq('email', contact.email);
                        if (!error) updated++;
                        else errors.push({ email: contact.email, error: error.message });
                    } else if (duplicateMode === 'skip') {
                        skipped++;
                    }
                    // For 'create-only' (default), we just don't insert
                } else {
                    const { error } = await req.supabase
                        .from('contacts')
                        .insert(contact);
                    if (!error) imported++;
                    else errors.push({ email: contact.email, error: error.message });
                }
            }
        }

        logger.info(`Importação ${ext.toUpperCase()} - User: ${req.user.id}, Importados: ${imported}, Atualizados: ${updated}, Ignorados: ${skipped}, Erros: ${errors.length}`, 'Contacts');
        res.json({
            success: true,
            imported,
            updated,
            skipped,
            totalProcessed: contactsToInsert.length,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        logger.error('Erro inesperado ao importar contactos: ' + error.message, 'Contacts');
        res.status(500).json({ success: false, error: 'Erro ao processar importação' });
    }
});

// PUT /api/contacts/:id - Atualizar contacto
app.put('/api/contacts/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, email, telefone, empresa, tags } = req.body;

        // Verificar se o contacto pertence ao user
        const { data: existing, error: checkError } = await req.supabase
            .from('contacts')
            .select('id, email')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .single();

        if (checkError || !existing) {
            return res.status(404).json({ success: false, error: 'Contacto não encontrado' });
        }

        const updates = {};
        if (nome !== undefined) {
            const nomeCheck = validateStringLength(nome, 1, 200);
            if (!nomeCheck.valid) {
                return res.status(400).json({ success: false, error: 'Nome inválido' });
            }
            updates.nome = nome.trim();
        }

        if (email !== undefined) {
            if (!validateEmail(email)) {
                return res.status(400).json({ success: false, error: 'Email inválido' });
            }
            updates.email = email.trim().toLowerCase();
        }

        if (telefone !== undefined) updates.telefone = telefone.trim();
        if (empresa !== undefined) updates.empresa = empresa.trim();
        if (tags !== undefined) {
            updates.tags = Array.isArray(tags) ? tags.filter(t => t && typeof t === 'string').map(t => t.trim()) : [];
        }

        const { data, error } = await req.supabase
            .from('contacts')
            .update(updates)
            .eq('id', id)
            .eq('user_id', req.user.id)
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return res.status(409).json({ success: false, error: 'Já existe um contacto com este email' });
            }
            logger.error('Erro ao atualizar contacto: ' + error.message, 'Contacts');
            return res.status(500).json({ success: false, error: 'Erro ao atualizar contacto' });
        }

        logger.info('Contacto atualizado - ID: ' + id, 'Contacts');
        res.json({ success: true, contact: data });

    } catch (error) {
        logger.error('Erro inesperado ao atualizar contacto: ' + error.message, 'Contacts');
        res.status(500).json({ success: false, error: 'Erro ao processar pedido' });
    }
});


// DELETE /api/contacts/bulk - Eliminar múltiplos contactos
app.delete('/api/contacts/bulk', authMiddleware, async (req, res) => {
    try {
        const { ids } = req.body;

        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, error: 'Lista de IDs inválida' });
        }

        const { error } = await req.supabase
            .from('contacts')
            .delete()
            .eq('user_id', req.user.id)
            .in('id', ids);

        if (error) {
            logger.error('Erro ao eliminar contactos em bulk: ' + error.message, 'Contacts');
            return res.status(500).json({ success: false, error: 'Erro ao eliminar contactos' });
        }

        logger.info('Contactos eliminados em bulk - Count: ' + ids.length + ', User: ' + req.user.id, 'Contacts');
        res.json({ success: true, deleted: ids.length });

    } catch (error) {
        logger.error('Erro inesperado ao eliminar contactos bulk: ' + error.message, 'Contacts');
        res.status(500).json({ success: false, error: 'Erro ao processar pedido' });
    }
});


// DELETE /api/contacts/:id - Eliminar contacto
app.delete('/api/contacts/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await req.supabase
            .from('contacts')
            .delete()
            .eq('id', id)
            .eq('user_id', req.user.id);

        if (error) {
            logger.error('Erro ao eliminar contacto: ' + error.message, 'Contacts');
            return res.status(500).json({ success: false, error: 'Erro ao eliminar contacto' });
        }

        logger.info('Contacto eliminado - ID: ' + id, 'Contacts');
        res.json({ success: true, message: 'Contacto eliminado com sucesso' });

    } catch (error) {
        logger.error('Erro inesperado ao eliminar contacto: ' + error.message, 'Contacts');
        res.status(500).json({ success: false, error: 'Erro ao processar pedido' });
    }
});



// ============================================
// TEMPLATES API
// ============================================

// GET /api/templates - Listar templates com paginacao e pesquisa
app.get('/api/templates', authMiddleware, async (req, res) => {
    try {
        const { page = 1, limit = 20, search = '' } = req.query;

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const offset = (pageNum - 1) * limitNum;

        let query = req.supabase
            .from('templates')
            .select('*', { count: 'exact' })
            .eq('user_id', req.user.id)
            .is('deleted_at', null)
            .order('created_at', { ascending: false });

        if (search) {
            query = query.or('nome.ilike.%' + search + '%,subject.ilike.%' + search + '%');
        }

        query = query.range(offset, offset + limitNum - 1);

        const { data, error, count } = await query;

        if (error) {
            logger.error('Erro ao listar templates: ' + error.message, 'Templates');
            return res.status(500).json({ success: false, error: 'Erro ao buscar templates' });
        }

        const totalPages = Math.ceil((count || 0) / limitNum);

        logger.info('Templates listados - User: ' + req.user.id + ', Pagina: ' + pageNum, 'Templates');
        res.json({
            templates: data || [],
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: count || 0,
                totalPages: totalPages
            }
        });
    } catch (error) {
        logger.error('Erro inesperado ao listar templates: ' + error.message, 'Templates');
        res.status(500).json({ success: false, error: 'Erro ao processar pedido' });
    }
});

// GET /api/templates/:id - Obter template por ID
app.get('/api/templates/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await req.supabase
            .from('templates')
            .select('*')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .is('deleted_at', null)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ success: false, error: 'Template nao encontrado' });
            }
            logger.error('Erro ao obter template: ' + error.message, 'Templates');
            return res.status(500).json({ success: false, error: 'Erro ao buscar template' });
        }

        logger.info('Template obtido - ID: ' + id, 'Templates');
        res.json({ template: data });
    } catch (error) {
        logger.error('Erro inesperado ao obter template: ' + error.message, 'Templates');
        res.status(500).json({ success: false, error: 'Erro ao processar pedido' });
    }
});

// POST /api/templates - Criar template
app.post('/api/templates', authMiddleware, async (req, res) => {
    try {
        const { nome, subject, preheader, html, text_version, is_default } = req.body;

        if (!nome || !nome.trim()) {
            return res.status(400).json({ success: false, error: 'Nome e obrigatorio' });
        }
        if (!subject || !subject.trim()) {
            return res.status(400).json({ success: false, error: 'Assunto e obrigatorio' });
        }
        if (!html || !html.trim()) {
            return res.status(400).json({ success: false, error: 'Corpo HTML e obrigatorio' });
        }

        const { data, error } = await req.supabase
            .from('templates')
            .insert({
                user_id: req.user.id,
                nome: nome.trim(),
                subject: subject.trim(),
                preheader: (preheader || '').trim(),
                html: html,
                text_version: (text_version || '').trim(),
                is_default: is_default === true
            })
            .select()
            .single();

        if (error) {
            logger.error('Erro ao criar template: ' + error.message, 'Templates');
            return res.status(500).json({ success: false, error: 'Erro ao criar template' });
        }

        logger.info('Template criado - ID: ' + data.id + ', User: ' + req.user.id, 'Templates');
        res.status(201).json({ success: true, template: data });
    } catch (error) {
        logger.error('Erro inesperado ao criar template: ' + error.message, 'Templates');
        res.status(500).json({ success: false, error: 'Erro ao processar pedido' });
    }
});

// PUT /api/templates/:id - Atualizar template
app.put('/api/templates/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, subject, preheader, html, text_version, is_default } = req.body;

        const { data: existing, error: checkError } = await req.supabase
            .from('templates')
            .select('id')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .is('deleted_at', null)
            .single();

        if (checkError || !existing) {
            return res.status(404).json({ success: false, error: 'Template nao encontrado' });
        }

        const updates = {};
        if (nome !== undefined) updates.nome = nome.trim();
        if (subject !== undefined) updates.subject = subject.trim();
        if (preheader !== undefined) updates.preheader = (preheader || '').trim();
        if (html !== undefined) updates.html = html;
        if (text_version !== undefined) updates.text_version = (text_version || '').trim();
        if (is_default !== undefined) updates.is_default = is_default === true;

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ success: false, error: 'Nenhum campo para atualizar' });
        }

        const { data, error } = await req.supabase
            .from('templates')
            .update(updates)
            .eq('id', id)
            .eq('user_id', req.user.id)
            .select()
            .single();

        if (error) {
            logger.error('Erro ao atualizar template: ' + error.message, 'Templates');
            return res.status(500).json({ success: false, error: 'Erro ao atualizar template' });
        }

        logger.info('Template atualizado - ID: ' + id, 'Templates');
        res.json({ success: true, template: data });
    } catch (error) {
        logger.error('Erro inesperado ao atualizar template: ' + error.message, 'Templates');
        res.status(500).json({ success: false, error: 'Erro ao processar pedido' });
    }
});

// DELETE /api/templates/:id - Eliminar template (soft delete)
app.delete('/api/templates/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        const { data: existing, error: checkError } = await req.supabase
            .from('templates')
            .select('id')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .is('deleted_at', null)
            .single();

        if (checkError || !existing) {
            return res.status(404).json({ success: false, error: 'Template nao encontrado' });
        }

        const { error } = await req.supabase
            .from('templates')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id)
            .eq('user_id', req.user.id);

        if (error) {
            logger.error('Erro ao eliminar template: ' + error.message, 'Templates');
            return res.status(500).json({ success: false, error: 'Erro ao eliminar template' });
        }

        logger.info('Template eliminado (soft) - ID: ' + id, 'Templates');
        res.json({ success: true, message: 'Template eliminado com sucesso' });
    } catch (error) {
        logger.error('Erro inesperado ao eliminar template: ' + error.message, 'Templates');
        res.status(500).json({ success: false, error: 'Erro ao processar pedido' });
    }
});



// ============================================
// TEMPLATES PREVIEW & TEST SEND
// ============================================

// POST /api/templates/preview - Renderizar template com merge tags
app.post('/api/templates/preview', authMiddleware, async (req, res) => {
    try {
        const { html, text, subject, preheader, sampleContact } = req.body;

        if (!html && !subject) {
            return res.status(400).json({ success: false, error: 'HTML ou assunto obrigatorio' });
        }

        const contact = sampleContact || {
            nome: 'Joao Silva',
            email: 'joao@exemplo.com',
            empresa: 'TechCorp',
            telefone: '+351 912 345 678',
            data: new Date().toLocaleDateString('pt-PT')
        };

        function renderMergeTags(templateStr) {
            if (!templateStr) return '';
            return templateStr
                .replace(/\{\{nome\}\}/g, contact.nome || '')
                .replace(/\{\{email\}\}/g, contact.email || '')
                .replace(/\{\{empresa\}\}/g, contact.empresa || '')
                .replace(/\{\{telefone\}\}/g, contact.telefone || '')
                .replace(/\{\{data\}\}/g, contact.data || new Date().toLocaleDateString('pt-PT'));
        }

        const htmlRendered = renderMergeTags(html || '');
        const textRendered = renderMergeTags(text || '');
        const subjectRendered = renderMergeTags(subject || '');
        const preheaderRendered = renderMergeTags(preheader || '');

        res.json({
            html: htmlRendered,
            text: textRendered,
            subject: subjectRendered,
            preheader: preheaderRendered
        });
    } catch (error) {
        logger.error('Erro ao renderizar preview: ' + error.message, 'Templates');
        res.status(500).json({ success: false, error: 'Erro ao processar preview' });
    }
});

// POST /api/templates/test-send - Enviar email de teste para UM endereco
app.post('/api/templates/test-send', authMiddleware, async (req, res) => {
    try {
        const { email, subject, preheader, html, text } = req.body;

        if (!email || !validateEmail(email)) {
            return res.status(400).json({ success: false, error: 'Email invalido' });
        }
        if (!html && !subject) {
            return res.status(400).json({ success: false, error: 'HTML ou assunto obrigatorio' });
        }

        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            return res.status(500).json({ success: false, error: 'Servico de email nao configurado' });
        }

        const sampleContact = {
            nome: 'Teste',
            email: email,
            empresa: 'Empresa Teste',
            telefone: '+351 900 000 000',
            data: new Date().toLocaleDateString('pt-PT')
        };

        function renderMergeTags(templateStr) {
            if (!templateStr) return '';
            return templateStr
                .replace(/\{\{nome\}\}/g, sampleContact.nome)
                .replace(/\{\{email\}\}/g, sampleContact.email)
                .replace(/\{\{empresa\}\}/g, sampleContact.empresa)
                .replace(/\{\{telefone\}\}/g, sampleContact.telefone)
                .replace(/\{\{data\}\}/g, sampleContact.data);
        }

        const renderedHtml = renderMergeTags(html || '');
        const renderedText = renderMergeTags(text || '');
        const renderedSubject = renderMergeTags(subject || '');

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: '[TESTE] ' + renderedSubject,
            text: renderedText || undefined,
            html: renderedHtml || undefined
        };

        if (preheader) {
            const preheaderTag = '<span style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">' + renderMergeTags(preheader) + '</span>';
            if (mailOptions.html) {
                mailOptions.html = preheaderTag + mailOptions.html;
            }
        }

        await transporter.sendMail(mailOptions);

        logger.info('Email de teste enviado para: ' + email, 'Templates');
        res.json({ success: true, message: 'Email de teste enviado para ' + email });
    } catch (error) {
        logger.error('Erro ao enviar email de teste: ' + error.message, 'Templates');
        res.status(500).json({ success: false, error: 'Erro ao enviar email de teste: ' + error.message });
    }
});

// ============================================
// CAMPAIGNS API
// ============================================

// GET /api/campaigns - Listar campanhas com paginacao e filtros
app.get('/api/campaigns', authMiddleware, async (req, res) => {
    try {
        const { page = 1, limit = 20, search = '', status = '' } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const offset = (pageNum - 1) * limitNum;

        let query = req.supabase
            .from('campaigns')
            .select('*', { count: 'exact' })
            .eq('user_id', req.user.id)
            .is('deleted_at', null)
            .order('created_at', { ascending: false });

        if (search) query = query.or('nome.ilike.%' + search + '%,assunto.ilike.%' + search + '%');
        if (status) query = query.eq('status', status);
        query = query.range(offset, offset + limitNum - 1);

        const { data, error, count } = await query;
        if (error) {
            logger.error('Erro ao listar campanhas: ' + error.message, 'Campaigns');
            return res.status(500).json({ success: false, error: 'Erro ao buscar campanhas' });
        }
        res.json({ campaigns: data || [], pagination: { page: pageNum, limit: limitNum, total: count || 0, totalPages: Math.ceil((count || 0) / limitNum) } });
    } catch (error) {
        logger.error('Erro inesperado ao listar campanhas: ' + error.message, 'Campaigns');
        res.status(500).json({ success: false, error: 'Erro ao processar pedido' });
    }
});

// POST /api/campaigns - Criar campanha
app.post('/api/campaigns', authMiddleware, async (req, res) => {
    try {
        const { nome, assunto, template_id, from_name, from_email, reply_to } = req.body;
        if (!nome || !nome.trim()) return res.status(400).json({ success: false, error: 'Nome e obrigatorio' });

        const { data, error } = await req.supabase
            .from('campaigns')
            .insert({
                user_id: req.user.id, created_by: req.user.id,
                nome: nome.trim(), assunto: (assunto || '').trim(),
                template_id: template_id || null,
                from_name: (from_name || '').trim(), from_email: (from_email || '').trim(),
                reply_to: (reply_to || '').trim(), status: 'draft'
            })
            .select().single();

        if (error) { logger.error('Erro ao criar campanha: ' + error.message, 'Campaigns'); return res.status(500).json({ success: false, error: 'Erro ao criar campanha' }); }
        res.status(201).json({ success: true, campaign: data });
    } catch (error) {
        logger.error('Erro inesperado ao criar campanha: ' + error.message, 'Campaigns');
        res.status(500).json({ success: false, error: 'Erro ao processar pedido' });
    }
});

// GET /api/campaigns/:id/recipients - Listar recipients (STATIC before :id)
app.get('/api/campaigns/:id/recipients', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { data: campaign, error: campErr } = await req.supabase
            .from('campaigns').select('id').eq('id', id).eq('user_id', req.user.id).is('deleted_at', null).single();
        if (campErr || !campaign) return res.status(404).json({ success: false, error: 'Campanha nao encontrada' });

        const { data, error } = await req.supabase
            .from('campaign_recipients')
            .select('*, contacts!inner(id, nome, email)')
            .eq('campaign_id', id).order('created_at', { ascending: true });

        if (error) { logger.error('Erro ao listar recipients: ' + error.message, 'Campaigns'); return res.status(500).json({ success: false, error: 'Erro ao buscar recipients' }); }
        res.json({ recipients: data || [] });
    } catch (error) {
        logger.error('Erro inesperado ao listar recipients: ' + error.message, 'Campaigns');
        res.status(500).json({ success: false, error: 'Erro ao processar pedido' });
    }
});

// POST /api/campaigns/:id/recipients - Adicionar contactos (STATIC before :id)
app.post('/api/campaigns/:id/recipients', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { contact_ids, filter } = req.body;

        const { data: campaign, error: campErr } = await req.supabase
            .from('campaigns').select('id, status').eq('id', id).eq('user_id', req.user.id).is('deleted_at', null).single();
        if (campErr || !campaign) return res.status(404).json({ success: false, error: 'Campanha nao encontrada' });
        if (campaign.status !== 'draft') return res.status(400).json({ success: false, error: 'Apenas campanhas em rascunho podem receber contactos' });

        let contactIds = contact_ids || [];
        if (filter && filter.tags && filter.tags.length > 0) {
            const { data: filtered } = await req.supabase.from('contacts').select('id').eq('user_id', req.user.id).is('deleted_at', null).overlaps('tags', filter.tags);
            if (filtered) contactIds = [...new Set([...contactIds, ...filtered.map(c => c.id)])];
        }
        if (contactIds.length === 0) return res.status(400).json({ success: false, error: 'Nenhum contacto selecionado' });

        const { data: validContacts } = await req.supabase.from('contacts').select('id').eq('user_id', req.user.id).in('id', contactIds);
        const validIds = (validContacts || []).map(c => c.id);

        let added = 0, skipped = 0;
        for (const contactId of validIds) {
            const { error } = await req.supabase.from('campaign_recipients').insert({ campaign_id: id, contact_id: contactId });
            if (error) { if (error.code === '23505') skipped++; else logger.error('Erro ao adicionar recipient: ' + error.message, 'Campaigns'); }
            else added++;
        }

        const { count } = await req.supabase.from('campaign_recipients').select('id', { count: 'exact', head: true }).eq('campaign_id', id);
        await req.supabase.from('campaigns').update({ total_recipients: count || 0 }).eq('id', id);

        res.json({ success: true, added, skipped, total_recipients: count || 0 });
    } catch (error) {
        logger.error('Erro inesperado ao adicionar recipients: ' + error.message, 'Campaigns');
        res.status(500).json({ success: false, error: 'Erro ao processar pedido' });
    }
});

// GET /api/campaigns/:id - Obter campanha por ID (AFTER static paths)
app.get('/api/campaigns/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { data, error } = await req.supabase
            .from('campaigns').select('*').eq('id', id).eq('user_id', req.user.id).is('deleted_at', null).single();
        if (error) {
            if (error.code === 'PGRST116') return res.status(404).json({ success: false, error: 'Campanha nao encontrada' });
            logger.error('Erro ao obter campanha: ' + error.message, 'Campaigns');
            return res.status(500).json({ success: false, error: 'Erro ao buscar campanha' });
        }
        res.json({ campaign: data });
    } catch (error) {
        logger.error('Erro inesperado ao obter campanha: ' + error.message, 'Campaigns');
        res.status(500).json({ success: false, error: 'Erro ao processar pedido' });
    }
});

// PUT /api/campaigns/:id - Atualizar campanha
app.put('/api/campaigns/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, assunto, template_id, from_name, from_email, reply_to, status } = req.body;

        const { data: existing, error: checkError } = await req.supabase
            .from('campaigns').select('id, status').eq('id', id).eq('user_id', req.user.id).is('deleted_at', null).single();
        if (checkError || !existing) return res.status(404).json({ success: false, error: 'Campanha nao encontrada' });
        if (existing.status !== 'draft' && status === undefined) return res.status(400).json({ success: false, error: 'Apenas campanhas em rascunho podem ser editadas completamente' });

        const updates = {};
        if (nome !== undefined) updates.nome = nome.trim();
        if (assunto !== undefined) updates.assunto = assunto.trim();
        if (template_id !== undefined) updates.template_id = template_id || null;
        if (from_name !== undefined) updates.from_name = (from_name || '').trim();
        if (from_email !== undefined) updates.from_email = (from_email || '').trim();
        if (reply_to !== undefined) updates.reply_to = (reply_to || '').trim();
        if (status !== undefined) updates.status = status;
        if (Object.keys(updates).length === 0) return res.status(400).json({ success: false, error: 'Nenhum campo para atualizar' });

        const { data, error } = await req.supabase.from('campaigns').update(updates).eq('id', id).eq('user_id', req.user.id).select().single();
        if (error) { logger.error('Erro ao atualizar campanha: ' + error.message, 'Campaigns'); return res.status(500).json({ success: false, error: 'Erro ao atualizar campanha' }); }
        res.json({ success: true, campaign: data });
    } catch (error) {
        logger.error('Erro inesperado ao atualizar campanha: ' + error.message, 'Campaigns');
        res.status(500).json({ success: false, error: 'Erro ao processar pedido' });
    }
});

// DELETE /api/campaigns/:id/recipients/:contactId - Remover contacto (STATIC before :id)
app.delete('/api/campaigns/:id/recipients/:contactId', authMiddleware, async (req, res) => {
    try {
        const { id, contactId } = req.params;
        const { data: campaign, error: campErr } = await req.supabase
            .from('campaigns').select('id, status').eq('id', id).eq('user_id', req.user.id).is('deleted_at', null).single();
        if (campErr || !campaign) return res.status(404).json({ success: false, error: 'Campanha nao encontrada' });
        if (campaign.status !== 'draft') return res.status(400).json({ success: false, error: 'Apenas campanhas em rascunho podem ter contactos removidos' });

        const { error } = await req.supabase.from('campaign_recipients').delete().eq('campaign_id', id).eq('contact_id', contactId);
        if (error) { logger.error('Erro ao remover recipient: ' + error.message, 'Campaigns'); return res.status(500).json({ success: false, error: 'Erro ao remover recipient' }); }

        const { count } = await req.supabase.from('campaign_recipients').select('id', { count: 'exact', head: true }).eq('campaign_id', id);
        await req.supabase.from('campaigns').update({ total_recipients: count || 0 }).eq('id', id);

        res.json({ success: true, message: 'Contacto removido da campanha' });
    } catch (error) {
        logger.error('Erro inesperado ao remover recipient: ' + error.message, 'Campaigns');
        res.status(500).json({ success: false, error: 'Erro ao processar pedido' });
    }
});

// DELETE /api/campaigns/:id - Eliminar campanha (soft delete) (AFTER /:id/recipients/:contactId)
app.delete('/api/campaigns/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { data: existing, error: checkError } = await req.supabase
            .from('campaigns').select('id').eq('id', id).eq('user_id', req.user.id).is('deleted_at', null).single();
        if (checkError || !existing) return res.status(404).json({ success: false, error: 'Campanha nao encontrada' });

        const { error } = await req.supabase.from('campaigns').update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('user_id', req.user.id);
        if (error) { logger.error('Erro ao eliminar campanha: ' + error.message, 'Campaigns'); return res.status(500).json({ success: false, error: 'Erro ao eliminar campanha' }); }

        res.json({ success: true, message: 'Campanha eliminada com sucesso' });
    } catch (error) {
        logger.error('Erro inesperado ao eliminar campanha: ' + error.message, 'Campaigns');
        res.status(500).json({ success: false, error: 'Erro ao processar pedido' });
    }
});

// ============================================
// ============================================
// CAMPAIGN ENGINE API
// ============================================

// POST /api/campaigns/:id/send — Iniciar envio de campanha
app.post('/api/campaigns/:id/send', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        // Verificar que a campanha existe e pertence ao utilizador
        const { data: campaign, error: campErr } = await req.supabase
            .from('campaigns').select('id, status').eq('id', id).eq('user_id', req.user.id).is('deleted_at', null).single();
        if (campErr || !campaign) return res.status(404).json({ success: false, error: 'Campanha nao encontrada' });

        const result = await campaignEngine.startCampaign(supabaseAdmin, id, req.user.id);
        if (!result.success) return res.status(400).json(result);

        res.json(result);
    } catch (error) {
        logger.error('Erro ao enviar campanha: ' + error.message, 'Campaigns');
        res.status(500).json({ success: false, error: 'Erro ao iniciar envio' });
    }
});

// POST /api/campaigns/:id/pause — Pausar envio
app.post('/api/campaigns/:id/pause', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        const { data: campaign, error: campErr } = await req.supabase
            .from('campaigns').select('id, status').eq('id', id).eq('user_id', req.user.id).is('deleted_at', null).single();
        if (campErr || !campaign) return res.status(404).json({ success: false, error: 'Campanha nao encontrada' });

        const result = campaignEngine.pauseCampaign(id);
        if (!result.success) return res.status(400).json(result);

        res.json(result);
    } catch (error) {
        logger.error('Erro ao pausar campanha: ' + error.message, 'Campaigns');
        res.status(500).json({ success: false, error: 'Erro ao pausar campanha' });
    }
});

// POST /api/campaigns/:id/resume — Retomar campanha pausada
app.post('/api/campaigns/:id/resume', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        const { data: campaign, error: campErr } = await req.supabase
            .from('campaigns').select('id, status').eq('id', id).eq('user_id', req.user.id).is('deleted_at', null).single();
        if (campErr || !campaign) return res.status(404).json({ success: false, error: 'Campanha nao encontrada' });

        const result = await campaignEngine.resumeCampaign(supabaseAdmin, id, req.user.id);
        if (!result.success) return res.status(400).json(result);

        res.json(result);
    } catch (error) {
        logger.error('Erro ao retomar campanha: ' + error.message, 'Campaigns');
        res.status(500).json({ success: false, error: 'Erro ao retomar campanha' });
    }
});

// POST /api/campaigns/:id/cancel — Cancelar campanha
app.post('/api/campaigns/:id/cancel', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        const { data: campaign, error: campErr } = await req.supabase
            .from('campaigns').select('id, status').eq('id', id).eq('user_id', req.user.id).is('deleted_at', null).single();
        if (campErr || !campaign) return res.status(404).json({ success: false, error: 'Campanha nao encontrada' });

        const result = campaignEngine.cancelCampaign(id);
        if (!result.success) return res.status(400).json(result);

        res.json(result);
    } catch (error) {
        logger.error('Erro ao cancelar campanha: ' + error.message, 'Campaigns');
        res.status(500).json({ success: false, error: 'Erro ao cancelar campanha' });
    }
});

// GET /api/campaigns/:id/progress — Obter progresso do envio
app.get('/api/campaigns/:id/progress', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await campaignEngine.getProgress(supabaseAdmin, id, req.user.id);
        if (!result.success) return res.status(404).json(result);
        res.json(result);
    } catch (error) {
        logger.error('Erro ao obter progresso: ' + error.message, 'Campaigns');
        res.status(500).json({ success: false, error: 'Erro ao obter progresso' });
    }
});



// ============================================
// TRACKING API (sem auth — chamado por clientes de email)
// ============================================

// GIF transparente 1x1 para pixel de abertura
const TRACKING_GIF = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
);

// GET /track/open/:recipientId — Pixel de abertura
app.get('/track/open/:recipientId', async (req, res) => {
    try {
        const { recipientId } = req.params;
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
        const userAgent = req.headers['user-agent'] || '';

        // Atualizar tracking (apenas via service_role para bypass RLS)
        if (supabaseAdmin) {
            // Buscar recipient para saber o campaign_id
            const { data: recipient } = await supabaseAdmin
                .from('campaign_recipients')
                .select('id, campaign_id, opened_at')
                .eq('id', recipientId)
                .single();

            if (recipient) {
                const isFirstOpen = !recipient.opened_at;

                // Atualizar recipient
                const recipientUpdates = {
                    open_count: supabaseAdmin.rpc ? 1 : 1, // fallback below
                    last_open_ip: ip,
                    last_open_user_agent: userAgent
                };

                // Incrementar open_count atomicamente via SQL raw
                await supabaseAdmin
                    .from('campaign_recipients')
                    .update({
                        last_open_ip: ip,
                        last_open_user_agent: userAgent
                    })
                    .eq('id', recipientId);

                // Incrementar open_count via rpc ou update manual
                if (isFirstOpen) {
                    await supabaseAdmin
                        .from('campaign_recipients')
                        .update({
                            opened_at: new Date().toISOString(),
                            open_count: 1
                        })
                        .eq('id', recipientId);

                    // Incrementar total_opened na campanha (apenas primeira vez)
                    await supabaseAdmin.rpc('increment_campaign_counter', {
                        p_campaign_id: recipient.campaign_id,
                        p_column: 'total_opened',
                        p_increment: 1
                    }).catch(() => {
                        // Fallback: update manual se rpc não existir
                        supabaseAdmin.from('campaigns').update({
                            total_opened: supabaseAdmin.rpc ? 0 : 1
                        }).eq('id', recipient.campaign_id);
                    });
                } else {
                    // Abertura subsequente: incrementar open_count
                    const { data: current } = await supabaseAdmin
                        .from('campaign_recipients')
                        .select('open_count')
                        .eq('id', recipientId)
                        .single();

                    await supabaseAdmin
                        .from('campaign_recipients')
                        .update({
                            open_count: (current ? current.open_count || 0 : 0) + 1
                        })
                        .eq('id', recipientId);
                }
            }
        }
    } catch (err) {
        // Silencioso — tracking nunca deve falhar o email
    }

    // Responder sempre com GIF
    res.set({
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    });
    res.send(TRACKING_GIF);
});

// GET /track/click/:recipientId?url=... — Click tracking + redirect
app.get('/track/click/:recipientId', async (req, res) => {
    try {
        const { recipientId } = req.params;
        const targetUrl = req.query.url;
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
        const userAgent = req.headers['user-agent'] || '';

        if (!targetUrl) {
            return res.status(400).send('Missing url parameter');
        }

        // Validar URL (básico)
        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
            return res.status(400).send('Invalid url');
        }

        if (supabaseAdmin) {
            const { data: recipient } = await supabaseAdmin
                .from('campaign_recipients')
                .select('id, campaign_id, clicked_at')
                .eq('id', recipientId)
                .single();

            if (recipient) {
                const isFirstClick = !recipient.clicked_at;

                // Atualizar IP e User-Agent
                await supabaseAdmin
                    .from('campaign_recipients')
                    .update({
                        last_click_ip: ip,
                        last_click_user_agent: userAgent
                    })
                    .eq('id', recipientId);

                if (isFirstClick) {
                    // Primeiro clique
                    await supabaseAdmin
                        .from('campaign_recipients')
                        .update({
                            clicked_at: new Date().toISOString(),
                            click_count: 1
                        })
                        .eq('id', recipientId);

                    // Incrementar total_clicked na campanha
                    await supabaseAdmin.rpc('increment_campaign_counter', {
                        p_campaign_id: recipient.campaign_id,
                        p_column: 'total_clicked',
                        p_increment: 1
                    }).catch(() => {});
                } else {
                    // Clique subsequente
                    const { data: current } = await supabaseAdmin
                        .from('campaign_recipients')
                        .select('click_count')
                        .eq('id', recipientId)
                        .single();

                    await supabaseAdmin
                        .from('campaign_recipients')
                        .update({
                            click_count: (current ? current.click_count || 0 : 0) + 1
                        })
                        .eq('id', recipientId);
                }
            }
        }
    } catch (err) {
        // Silencioso
    }

    // Redirect para URL original
    const targetUrl = req.query.url;
    if (targetUrl && (targetUrl.startsWith('http://') || targetUrl.startsWith('https://'))) {
        res.redirect(302, targetUrl);
    } else {
        res.status(400).send('Invalid url');
    }
});

// GET /api/campaigns/:id/stats — Estatísticas da campanha
app.get('/api/campaigns/:id/stats', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        const { data: campaign, error: campErr } = await supabaseAdmin
            .from('campaigns')
            .select('id, user_id, total_recipients, total_sent, total_failed, total_opened, total_clicked, status')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .is('deleted_at', null)
            .single();

        if (campErr || !campaign) return res.status(404).json({ success: false, error: 'Campanha nao encontrada' });

        const sent = campaign.total_sent || 0;
        const opened = campaign.total_opened || 0;
        const clicked = campaign.total_clicked || 0;

        const openRate = sent > 0 ? Math.round((opened / sent) * 10000) / 100 : 0;
        const clickRate = sent > 0 ? Math.round((clicked / sent) * 10000) / 100 : 0;

        res.json({
            success: true,
            stats: {
                total_recipients: campaign.total_recipients || 0,
                total_sent: sent,
                total_failed: campaign.total_failed || 0,
                total_opened: opened,
                total_clicked: clicked,
                open_rate: openRate,
                click_rate: clickRate,
                status: campaign.status
            }
        });
    } catch (error) {
        logger.error('Erro ao buscar stats: ' + error.message, 'Tracking');
        res.status(500).json({ success: false, error: 'Erro ao buscar estatisticas' });
    }
});


// 6. CRIAR CHECKOUT STRIPE (equivalente a criar-checkout)
// ============================================
app.post('/api/checkout/create', async (req, res) => {
    try {
        const { email } = req.body;

        const fields = validateRequiredFields(req.body, ['email']);
        if (!fields.valid) {
            return res.status(400).json({ success: false, error: 'Campo obrigatório em falta: ' + fields.missing.join(', ') });
        }

        const cleanEmail = email.trim();
        if (!validateEmail(cleanEmail)) {
            return res.status(400).json({ success: false, error: 'Formato de email inválido' });
        }

        if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRICE_ID) {
            logger.error('Variáveis Stripe em falta', 'Checkout');
            return res.status(500).json({ success: false, error: 'Serviço de pagamento indisponível' });
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price: process.env.STRIPE_PRICE_ID,
                quantity: 1,
            }],
            mode: 'subscription',
            customer_email: cleanEmail,
            success_url: process.env.SUCCESS_URL || config.app.successUrl,
            cancel_url: process.env.CANCEL_URL || config.app.cancelUrl,
        });

        logger.info('Sessão criada - Email: ' + cleanEmail + ', Session: ' + session.id, 'Checkout');

        res.json({ id: session.id });

    } catch (error) {
        logger.error('Falha ao criar sessão para ' + email + ': ' + error.message, 'Checkout');
        res.status(500).json({ success: false, error: 'Erro ao processar pagamento' });
    }
});

// ============================================
// 7. WEBHOOK STRIPE (equivalente a webhook-stripe)
// ============================================
app.post('/api/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
        logger.error('Variáveis Stripe webhook em falta', 'Webhook');
        return res.status(500).json({ success: false, error: 'Webhook não configurado' });
    }

    const sig = req.headers['stripe-signature'];
    let stripeEvent;

    try {
        stripeEvent = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        logger.error('Assinatura webhook inválida: ' + err.message, 'Webhook');
        return res.status(400).json({ success: false, error: 'Assinatura inválida' });
    }

    logger.info('Evento recebido: ' + stripeEvent.type, 'Webhook');

    // Usar service role para operações admin
    if (!supabaseAdmin) {
        return res.status(500).json({ received: true });
    }

    try {
        // 1. Pagamento concluído (checkout.session.completed)
        if (stripeEvent.type === 'checkout.session.completed') {
            const session = stripeEvent.data.object;
            const email = session.customer_email;

            if (email) {
                const subscriptionId = session.subscription;
                const customerId = session.customer;

                logger.info('Pagamento concluído - Email: ' + email + ', Session: ' + session.id, 'Webhook');

                const { error: updateError } = await supabaseAdmin
                    .from('profiles')
                    .update({
                        stripe_subscription_id: subscriptionId,
                        stripe_customer_id: customerId,
                        subscription_status: 'active',
                        updated_at: new Date().toISOString()
                    })
                    .eq('email', email);

                if (updateError) {
                    logger.error('Erro ao guardar subscription: ' + updateError.message, 'Webhook');
                } else {
                    logger.info('Subscription guardada no profile: ' + email, 'Webhook');
                }
            }
        }

        // 2. Pagamento de fatura bem-sucedido (renovação)
        if (stripeEvent.type === 'invoice.payment_succeeded') {
            const invoice = stripeEvent.data.object;
            const subscriptionId = invoice.subscription;
            const customerId = invoice.customer;

            if (subscriptionId) {
                logger.info('Pagamento de fatura bem-sucedido - Subscription: ' + subscriptionId, 'Webhook');

                const { error: updateError } = await supabaseAdmin
                    .from('profiles')
                    .update({
                        subscription_status: 'active',
                        stripe_customer_id: customerId,
                        updated_at: new Date().toISOString()
                    })
                    .eq('stripe_subscription_id', subscriptionId);

                if (updateError) {
                    logger.error('Erro ao atualizar subscription na renovação: ' + updateError.message, 'Webhook');
                } else {
                    logger.info('Subscription renovada no profile: ' + subscriptionId, 'Webhook');
                }
            }
        }

        // 3. Pagamento de fatura falhou
        if (stripeEvent.type === 'invoice.payment_failed') {
            const invoice = stripeEvent.data.object;
            const subscriptionId = invoice.subscription;
            const attemptCount = invoice.attempt_count || 1;

            if (subscriptionId) {
                logger.warn('Pagamento falhou - Subscription: ' + subscriptionId + ', Tentativa: ' + attemptCount, 'Webhook');

                let ourStatus = 'active';
                if (attemptCount >= 3) {
                    ourStatus = 'past_due';
                }

                const { error } = await supabaseAdmin
                    .from('profiles')
                    .update({
                        subscription_status: ourStatus,
                        updated_at: new Date().toISOString()
                    })
                    .eq('stripe_subscription_id', subscriptionId);

                if (error) {
                    logger.error('Erro ao atualizar status falha: ' + error.message, 'Webhook');
                } else {
                    logger.info('Status atualizado para ' + ourStatus + ': ' + subscriptionId, 'Webhook');
                }
            }
        }

        // 4. Subscrição atualizada
        if (stripeEvent.type === 'customer.subscription.updated') {
            const subscription = stripeEvent.data.object;
            const subscriptionId = subscription.id;
            const status = subscription.status;
            const customerId = subscription.customer;

            logger.info('Subscrição atualizada - ID: ' + subscriptionId + ', Status: ' + status, 'Webhook');

            let ourStatus;
            switch (status) {
                case 'active': ourStatus = 'active'; break;
                case 'trialing': ourStatus = 'trial'; break;
                case 'past_due': ourStatus = 'past_due'; break;
                case 'canceled': ourStatus = 'canceled'; break;
                case 'unpaid': ourStatus = 'canceled'; break;
                case 'incomplete_expired': ourStatus = 'canceled'; break;
                case 'paused': ourStatus = 'paused'; break;
                default: ourStatus = status;
            }

            const { error } = await supabaseAdmin
                .from('profiles')
                .update({
                    subscription_status: ourStatus,
                    stripe_customer_id: customerId,
                    updated_at: new Date().toISOString()
                })
                .eq('stripe_subscription_id', subscriptionId);

            if (error) {
                logger.error('Erro ao atualizar status subscription: ' + error.message, 'Webhook');
            } else {
                logger.info('Status da subscription atualizado para ' + ourStatus + ': ' + subscriptionId, 'Webhook');
            }
        }

        // 5. Subscrição cancelada
        if (stripeEvent.type === 'customer.subscription.deleted') {
            const subscription = stripeEvent.data.object;
            const subscriptionId = subscription.id;

            logger.info('Subscrição cancelada: ' + subscriptionId, 'Webhook');

            const { error } = await supabaseAdmin
                .from('profiles')
                .update({
                    subscription_status: 'canceled',
                    updated_at: new Date().toISOString()
                })
                .eq('stripe_subscription_id', subscriptionId);

            if (error) {
                logger.error('Erro ao cancelar subscription: ' + error.message, 'Webhook');
            } else {
                logger.info('Subscription cancelada no profile: ' + subscriptionId, 'Webhook');
            }
        }

    } catch (err) {
        logger.error('Erro ao processar webhook: ' + err.message, 'Webhook');
    }

    res.json({ received: true });
});

// ============================================
// 8. ENVIAR EMAIL (equivalente a enviar-email)
// ============================================
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

app.post('/api/email/send', async (req, res) => {
    try {
        const { email, nome } = req.body;

        const fields = validateRequiredFields(req.body, ['email']);
        if (!fields.valid) {
            return res.status(400).json({ success: false, error: 'Campo obrigatório em falta: ' + fields.missing.join(', ') });
        }

        const cleanEmail = email.trim();
        if (!validateEmail(cleanEmail)) {
            return res.status(400).json({ success: false, error: 'Formato de email inválido' });
        }

        const nomeRaw = nome || cleanEmail.split('@')[0];
        const nomeCheck = validateStringLength(nomeRaw, 1, 200);
        if (!nomeCheck.valid) {
            return res.status(400).json({ success: false, error: 'Nome inválido' });
        }

        const cleanNome = sanitizeHtml(nomeRaw.trim());

        const subject = 'Bem-vindo ao MailFlow Pro';
        const html = `
<!DOCTYPE html>
<html lang="pt-PT">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:40px 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
                    <tr>
                        <td style="background:linear-gradient(135deg,#667eea,#764ba2);padding:40px 30px;text-align:center;">
                            <h1 style="color:#ffffff;margin:0;font-size:24px;">MailFlow Pro</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:40px 30px;">
                            <h2 style="color:#1f2937;margin:0 0 16px;font-size:20px;">Olá ${cleanNome},</h2>
                            <p style="color:#4b5563;font-size:16px;line-height:1.6;margin:0 0 16px;">
                                A tua automação de e-mail marketing foi ativada com sucesso.
                            </p>
                            <p style="color:#4b5563;font-size:16px;line-height:1.6;margin:0 0 24px;">
                                Agora tens acesso a templates profissionais, campanhas segmentadas
                                e relatórios em tempo real.
                            </p>
                            <p style="color:#6b7280;font-size:14px;margin:0;">
                                Email associado: <strong>${cleanEmail}</strong>
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color:#f9fafb;padding:20px 30px;text-align:center;">
                            <p style="color:#9ca3af;font-size:12px;margin:0;">
                                © ${new Date().getFullYear()} MailFlow Pro. Todos os direitos reservados.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`.trim();

        await transporter.sendMail({
            from: '"MailFlow Pro" <nao-responder@mailflowpro.com>',
            to: cleanEmail,
            subject,
            html,
        });

        logger.info('Email enviado com sucesso', 'Email');
        logger.info('Destinatário: ' + cleanEmail, 'Email');

        res.json({ mensagem: 'E-mail enviado e logado!' });

    } catch (error) {
        logger.error('Falha ao enviar email para ' + email + ': ' + error.message, 'Email');
        res.status(500).json({ success: false, error: 'Erro ao enviar e-mail. Tente novamente mais tarde.' });
    }
});

// ============================================
// AUTOMATIONS API
// ============================================

// GET /api/automations - Listar automações
app.get('/api/automations', authMiddleware, async (req, res) => {
    try {
        const { page = 1, limit = 20, search = '' } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const offset = (pageNum - 1) * limitNum;

        let query = req.supabase
            .from('automation_rules')
            .select('*, campaign:campaigns(id,name)', { count: 'exact' })
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false });

        if (search) {
            query = query.ilike('name', `%${search}%`);
        }

        query = query.range(offset, offset + limitNum - 1);

        const { data, error, count } = await query;

        if (error) {
            logger.error('Erro ao listar automações: ' + error.message, 'Automations');
            return res.status(500).json({ success: false, error: 'Erro ao buscar automações' });
        }

        const totalPages = Math.ceil((count || 0) / limitNum);

        logger.info('Automações listadas - User: ' + req.user.id + ', Página: ' + pageNum, 'Automations');
        res.json({
            automations: data || [],
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: count || 0,
                totalPages: totalPages
            }
        });

    } catch (error) {
        logger.error('Erro inesperado ao listar automações: ' + error.message, 'Automations');
        res.status(500).json({ success: false, error: 'Erro ao processar pedido' });
    }
});

// POST /api/automations - Criar automação
app.post('/api/automations', authMiddleware, async (req, res) => {
    try {
        const { name, trigger_type, delay_minutes, campaign_id, enabled } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, error: 'Nome é obrigatório' });
        }
        if (!trigger_type) {
            return res.status(400).json({ success: false, error: 'Trigger é obrigatório' });
        }
        if (!['contact_created'].includes(trigger_type)) {
            return res.status(400).json({ success: false, error: 'Trigger inválido' });
        }

        const delay = parseInt(delay_minutes, 10) || 0;
        if (delay < 0 || delay > 10080) {
            return res.status(400).json({ success: false, error: 'Delay inválido (máx. 7 dias)' });
        }

        // Verify campaign belongs to user
        if (campaign_id) {
            const { data: campaign, error: campError } = await req.supabase
                .from('campaigns')
                .select('id')
                .eq('id', campaign_id)
                .eq('user_id', req.user.id)
                .single();
            if (campError || !campaign) {
                return res.status(400).json({ success: false, error: 'Campanha não encontrada' });
            }
        }

        const { data, error } = await req.supabase
            .from('automation_rules')
            .insert({
                user_id: req.user.id,
                name: name.trim(),
                trigger_type: trigger_type,
                delay_minutes: delay,
                campaign_id: campaign_id || null,
                enabled: Boolean(enabled)
            })
            .select()
            .single();

        if (error) {
            logger.error('Erro ao criar automação: ' + error.message, 'Automations');
            return res.status(500).json({ success: false, error: 'Erro ao criar automação' });
        }

        logger.info('Automação criada - User: ' + req.user.id + ', ID: ' + data.id, 'Automations');
        res.status(201).json({ automation: data });

    } catch (error) {
        logger.error('Erro inesperado ao criar automação: ' + error.message, 'Automations');
        res.status(500).json({ success: false, error: 'Erro ao processar pedido' });
    }
});

// PUT /api/automations/:id - Atualizar automação
app.put('/api/automations/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, trigger_type, delay_minutes, campaign_id, enabled } = req.body;

        const updates = {};
        if (name !== undefined) {
            if (!name.trim()) {
                return res.status(400).json({ success: false, error: 'Nome é obrigatório' });
            }
            updates.name = name.trim();
        }
        if (trigger_type !== undefined) {
            if (!['contact_created'].includes(trigger_type)) {
                return res.status(400).json({ success: false, error: 'Trigger inválido' });
            }
            updates.trigger_type = trigger_type;
        }
        if (delay_minutes !== undefined) {
            const delay = parseInt(delay_minutes, 10);
            if (isNaN(delay) || delay < 0 || delay > 10080) {
                return res.status(400).json({ success: false, error: 'Delay inválido (máx. 7 dias)' });
            }
            updates.delay_minutes = delay;
        }
        if (campaign_id !== undefined) {
            if (campaign_id) {
                const { data: campaign, error: campError } = await req.supabase
                    .from('campaigns')
                    .select('id')
                    .eq('id', campaign_id)
                    .eq('user_id', req.user.id)
                    .single();
                if (campError || !campaign) {
                    return res.status(400).json({ success: false, error: 'Campanha não encontrada' });
                }
            }
            updates.campaign_id = campaign_id || null;
        }
        if (enabled !== undefined) {
            updates.enabled = Boolean(enabled);
        }

        updates.updated_at = new Date().toISOString();

        const { data, error } = await req.supabase
            .from('automation_rules')
            .update(updates)
            .eq('id', id)
            .eq('user_id', req.user.id)
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ success: false, error: 'Automação não encontrada' });
            }
            logger.error('Erro ao atualizar automação: ' + error.message, 'Automations');
            return res.status(500).json({ success: false, error: 'Erro ao atualizar automação' });
        }

        logger.info('Automação atualizada - User: ' + req.user.id + ', ID: ' + id, 'Automations');
        res.json({ automation: data });

    } catch (error) {
        logger.error('Erro inesperado ao atualizar automação: ' + error.message, 'Automations');
        res.status(500).json({ success: false, error: 'Erro ao processar pedido' });
    }
});

// DELETE /api/automations/:id - Eliminar automação
app.delete('/api/automations/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await req.supabase
            .from('automation_rules')
            .delete()
            .eq('id', id)
            .eq('user_id', req.user.id);

        if (error) {
            logger.error('Erro ao eliminar automação: ' + error.message, 'Automations');
            return res.status(500).json({ success: false, error: 'Erro ao eliminar automação' });
        }

        logger.info('Automação eliminada - User: ' + req.user.id + ', ID: ' + id, 'Automations');
        res.json({ success: true });

    } catch (error) {
        logger.error('Erro inesperado ao eliminar automação: ' + error.message, 'Automations');
        res.status(500).json({ success: false, error: 'Erro ao processar pedido' });
    }
});


// ============================================
// Start server
// ============================================
app.listen(PORT, async () => {
    logger.info('Servidor iniciado na porta ' + PORT, 'Server');
    logger.info('Health check: http://localhost:' + PORT + '/health', 'Server');

    // Recuperar campanhas presas em 'sending' (ex: apos restart do servidor)
    if (supabaseAdmin && campaignEngine.recoverStuckCampaigns) {
        await campaignEngine.recoverStuckCampaigns(supabaseAdmin);
    }
});

module.exports = app;
