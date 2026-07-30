/**
 * MailFlow Pro — View: Configurações
 *
 * Página de configurações do utilizador.
 * Edição de perfil (nome, empresa, telefone, timezone),
 * info da conta, SMTP, e ações de logout.
 */

var ConfigView = (function() {
    'use strict';

    var sb = null;
    var user = null;
    var currentContainer = null;
    var profile = null;

    function init() { sb = window.supabaseClient; }

    function esc(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function formatDate(dateStr) {
        if (!dateStr) return '—';
        return new Date(dateStr).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    async function fetchProfile() {
        try {
            var token = (await sb.auth.getSession()).data.session?.access_token;
            if (!token) return null;
            var resp = await fetch('/api/profile', {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (!resp.ok) return null;
            var data = await resp.json();
            return data.profile || null;
        } catch (err) {
            console.error('[Config] Erro ao buscar perfil:', err);
            return null;
        }
    }

    async function saveProfile(updates) {
        try {
            var token = (await sb.auth.getSession()).data.session?.access_token;
            if (!token) return { success: false, error: 'Sessão inválida' };
            var resp = await fetch('/api/profile', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify(updates)
            });
            if (resp.status === 401) {
                MailFlowToast.error('Sessão expirada. Faça login novamente.');
                window.location.href = '/entrar.html';
                return { success: false, error: 'unauthorized' };
            }
            var data = await resp.json();
            if (!resp.ok) return { success: false, error: data.error || 'Erro ao guardar' };
            return { success: true, profile: data.profile };
        } catch (err) {
            console.error('[Config] Erro ao guardar perfil:', err);
            return { success: false, error: 'Erro de rede' };
        }
    }

    function renderHeader() {
        return '' +
            '<div class="tl-view-header">' +
                '<div class="tl-view-header__left">' +
                    '<span class="tl-badge tl-badge--indigo">Configurações</span>' +
                    '<h1 class="tl-view-header__title">Configurações</h1>' +
                    '<p class="tl-view-header__desc">Personalize a sua conta e a forma como envia campanhas.</p>' +
                '</div>' +
                '<button class="tl-btn tl-btn--primary" id="cfg-save-btn">' +
                    '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>' +
                    'Guardar Alterações' +
                '</button>' +
            '</div>';
    }

    function renderSkeleton() {
        var cards = '';
        for (var i = 0; i < 3; i++) {
            cards += '' +
                '<div class="tl-card tl-card--skeleton" style="animation-delay:' + (i * 0.06) + 's">' +
                    '<div class="tl-skeleton tl-skeleton--line tl-skeleton--lg" style="width:40%"></div>' +
                    '<div class="tl-skeleton tl-skeleton--line" style="margin-top:16px"></div>' +
                    '<div class="tl-skeleton tl-skeleton--line tl-skeleton--short"></div>' +
                    '<div class="tl-skeleton tl-skeleton--line"></div>' +
                    '<div class="tl-skeleton tl-skeleton--line tl-skeleton--md"></div>' +
                '</div>';
        }
        return '<div class="tl-cards">' + cards + '</div>';
    }

    function renderProfileForm(p) {
        var nome = (p && p.nome) ? esc(p.nome) : '';
        var empresa = (p && p.empresa) ? esc(p.empresa) : '';
        var telefone = (p && p.telefone) ? esc(p.telefone) : '';
        var timezone = (p && p.timezone) ? esc(p.timezone) : 'Europe/Lisbon';
        var locale = (p && p.locale) ? esc(p.locale) : 'pt-PT';

        var timezones = ['UTC', 'Europe/Lisbon', 'Europe/Madrid', 'Europe/London', 'America/New_York', 'America/Sao_Paulo', 'Asia/Macau'];
        var tzOptions = timezones.map(function(tz) {
            return '<option value="' + tz + '"' + (tz === timezone ? ' selected' : '') + '>' + tz + '</option>';
        }).join('');

        return '' +
            '<div class="tl-card">' +
                '<div class="tl-card__header">' +
                    '<span class="tl-badge tl-badge--blue">Perfil</span>' +
                    '<h2 class="tl-card__title">Perfil</h2>' +
                '</div>' +
                '<div class="tl-card__body">' +
                    '<div class="tl-grid tl-grid--2">' +
                        '<div class="tl-field">' +
                            '<label class="tl-label" for="cfg-nome">Nome</label>' +
                            '<input class="tl-input" type="text" id="cfg-nome" value="' + nome + '" placeholder="O seu nome">' +
                        '</div>' +
                        '<div class="tl-field">' +
                            '<label class="tl-label" for="cfg-empresa">Empresa</label>' +
                            '<input class="tl-input" type="text" id="cfg-empresa" value="' + empresa + '" placeholder="Nome da empresa (opcional)">' +
                        '</div>' +
                    '</div>' +
                    '<div class="tl-grid tl-grid--2">' +
                        '<div class="tl-field">' +
                            '<label class="tl-label" for="cfg-telefone">Telefone</label>' +
                            '<input class="tl-input" type="tel" id="cfg-telefone" value="' + telefone + '" placeholder="+351 ...">' +
                        '</div>' +
                        '<div class="tl-field">' +
                            '<label class="tl-label" for="cfg-locale">Idioma</label>' +
                            '<select class="tl-input tl-input--select" id="cfg-locale">' +
                                '<option value="pt-PT"' + (locale === 'pt-PT' ? ' selected' : '') + '>Português (PT)</option>' +
                                '<option value="en"' + (locale === 'en' ? ' selected' : '') + '>English</option>' +
                                '<option value="es"' + (locale === 'es' ? ' selected' : '') + '>Español</option>' +
                            '</select>' +
                        '</div>' +
                    '</div>' +
                    '<div class="tl-field">' +
                        '<label class="tl-label" for="cfg-timezone">Timezone</label>' +
                        '<select class="tl-input tl-input--select" id="cfg-timezone">' + tzOptions + '</select>' +
                    '</div>' +
                    '<div id="cfg-save-status" style="margin-bottom:16px;"></div>' +
                '</div>' +
            '</div>';
    }

    function renderSMTPForm(p) {
        var host = (p && p.smtp_host) ? esc(p.smtp_host) : '';
        var port = (p && p.smtp_port) ? esc(p.smtp_port) : '587';
        var username = (p && p.smtp_username) ? esc(p.smtp_username) : '';
        var password = (p && p.smtp_password) ? esc(p.smtp_password) : '';
        var secure = (p && p.smtp_secure) ? true : false;
        var fromEmail = (p && p.smtp_from_email) ? esc(p.smtp_from_email) : '';
        var fromName = (p && p.smtp_from_name) ? esc(p.smtp_from_name) : '';
        var smtpStatus = (p && p.smtp_status) ? p.smtp_status : 'not_configured';

        var statusBadge = '';
        if (smtpStatus === 'verified') {
            statusBadge = '<span class="tl-badge tl-badge--green" id="cfg-smtp-status-badge" style="margin-left:8px;font-size:0.75rem;">Ligação verificada</span>';
        } else if (smtpStatus === 'configured') {
            statusBadge = '<span class="tl-badge tl-badge--orange" id="cfg-smtp-status-badge" style="margin-left:8px;font-size:0.75rem;">Configurado</span>';
        } else {
            statusBadge = '<span class="tl-badge tl-badge--red" id="cfg-smtp-status-badge" style="margin-left:8px;font-size:0.75rem;">Não configurado</span>';
        }

        return '' +
            '<div class="tl-card">' +
                '<div class="tl-card__header">' +
                    '<span class="tl-badge tl-badge--blue">SMTP</span>' +
                    '<h2 class="tl-card__title">SMTP Personalizado' + statusBadge + '</h2>' +
                '</div>' +
                '<div class="tl-card__body">' +
                    '<div class="tl-grid tl-grid--2">' +
                        '<div class="tl-field">' +
                            '<label class="tl-label" for="cfg-smtp-host">Host</label>' +
                            '<input class="tl-input" type="text" id="cfg-smtp-host" value="' + host + '" placeholder="smtp.gmail.com">' +
                        '</div>' +
                        '<div class="tl-field">' +
                            '<label class="tl-label" for="cfg-smtp-port">Porta</label>' +
                            '<input class="tl-input" type="number" id="cfg-smtp-port" value="' + port + '" placeholder="587" min="1" max="65535">' +
                        '</div>' +
                    '</div>' +
                    '<div class="tl-field">' +
                        '<label class="tl-label" for="cfg-smtp-username">Username</label>' +
                        '<input class="tl-input" type="text" id="cfg-smtp-username" value="' + username + '" placeholder="seu@email.com">' +
                    '</div>' +
                    '<div class="tl-grid tl-grid--2">' +
                        '<div class="tl-field">' +
                            '<label class="tl-label" for="cfg-smtp-password">Password</label>' +
                            '<input class="tl-input" type="password" id="cfg-smtp-password" value="' + password + '" placeholder="••••••••" autocomplete="current-password">' +
                        '</div>' +
                        '<div class="tl-field">' +
                            '<label class="tl-label">SSL/TLS</label>' +
                            '<div class="tl-checkbox-wrapper">' +
                                '<input type="checkbox" class="tl-checkbox" id="cfg-smtp-secure" ' + (secure ? 'checked' : '') + '>' +
                                '<label class="tl-checkbox-label" for="cfg-smtp-secure">' +
                                    '<span class="tl-checkbox-box">' +
                                        '<svg class="tl-checkbox-check" width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7L6 10L11 4" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
                                    '</span>' +
                                    'Usar SSL/TLS' +
                                '</label>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="tl-grid tl-grid--2">' +
                        '<div class="tl-field">' +
                            '<label class="tl-label" for="cfg-smtp-from-email">Email remetente</label>' +
                            '<input class="tl-input" type="email" id="cfg-smtp-from-email" value="' + fromEmail + '" placeholder="noreply@seudominio.com">' +
                        '</div>' +
                        '<div class="tl-field">' +
                            '<label class="tl-label" for="cfg-smtp-from-name">Nome remetente</label>' +
                            '<input class="tl-input" type="text" id="cfg-smtp-from-name" value="' + fromName + '" placeholder="MailFlow Pro">' +
                        '</div>' +
                    '</div>' +
                    '<div class="tl-field">' +
                        '<label class="tl-label" for="cfg-smtp-test-email">Testar para (email)</label>' +
                        '<input class="tl-input" type="email" id="cfg-smtp-test-email" placeholder="destino@exemplo.com">' +
                    '</div>' +
                    '<div id="cfg-smtp-save-status" style="margin-bottom:16px;"></div>' +
                    '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
                        '<button class="tl-btn tl-btn--primary" id="cfg-smtp-save-btn">' +
                            '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>' +
                            'Guardar SMTP' +
                        '</button>' +
                        '<button class="tl-btn tl-btn--secondary" id="cfg-smtp-test-btn">' +
                            '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>' +
                            'Testar ligação' +
                        '</button>' +
                        '<button class="tl-btn tl-btn--secondary" id="cfg-smtp-send-test-btn">' +
                            '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>' +
                            'Enviar email de teste' +
                        '</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
    }

    function renderAccountInfo(p) {
        var created = (p && p.created_at) ? formatDate(p.created_at) : '—';
        var plan = (p && p.plan) ? esc(p.plan) : 'free';
        var planLabel = plan === 'premium' ? 'Premium' : 'Free';

        return '' +
            '<div class="tl-card">' +
                '<div class="tl-card__header">' +
                    '<span class="tl-badge tl-badge--blue">Conta</span>' +
                    '<h2 class="tl-card__title">Conta</h2>' +
                '</div>' +
                '<div class="tl-card__body">' +
                    '<div class="tl-grid tl-grid--2">' +
                        '<div class="tl-field">' +
                            '<label class="tl-label">Email</label>' +
                            '<input class="tl-input" type="text" value="' + esc(user?.email || '') + '" disabled>' +
                        '</div>' +
                        '<div class="tl-field">' +
                            '<label class="tl-label">Plano</label>' +
                            '<div class="tl-plan-badge">' +
                                '<span class="tl-badge ' + (plan === 'premium' ? 'tl-badge--green' : 'tl-badge--gray') + '">' + planLabel + '</span>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="tl-field">' +
                        '<label class="tl-label">Membro desde</label>' +
                        '<input class="tl-input" type="text" value="' + created + '" disabled>' +
                    '</div>' +
                '</div>' +
            '</div>';
    }

    function renderPreferences(p) {
        var locale = (p && p.locale) ? esc(p.locale) : 'pt-PT';
        var timezone = (p && p.timezone) ? esc(p.timezone) : 'Europe/Lisbon';
        var dateFormat = (p && p.date_format) ? esc(p.date_format) : 'dd/MM/yyyy';
        var theme = (p && p.theme) ? esc(p.theme) : 'light';

        var locales = ['pt-PT', 'en', 'es'];
        var localeOptions = locales.map(function(l) {
            var labels = { 'pt-PT': 'Português (PT)', 'en': 'English', 'es': 'Español' };
            return '<option value="' + l + '"' + (locale === l ? ' selected' : '') + '>' + labels[l] + '</option>';
        }).join('');

        var timezones = ['UTC', 'Europe/Lisbon', 'Europe/Madrid', 'Europe/London', 'America/New_York', 'America/Sao_Paulo', 'Asia/Macau'];
        var tzOptions = timezones.map(function(tz) {
            return '<option value="' + tz + '"' + (timezone === tz ? ' selected' : '') + '>' + tz + '</option>';
        }).join('');

        var dateFormats = ['dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd', 'dd MMM yyyy'];
        var dfOptions = dateFormats.map(function(df) {
            return '<option value="' + df + '"' + (dateFormat === df ? ' selected' : '') + '>' + df + '</option>';
        }).join('');

        return '' +
            '<div class="tl-card">' +
                '<div class="tl-card__header">' +
                    '<span class="tl-badge tl-badge--blue">Preferências</span>' +
                    '<h2 class="tl-card__title">Preferências</h2>' +
                '</div>' +
                '<div class="tl-card__body">' +
                    '<div class="tl-grid tl-grid--2">' +
                        '<div class="tl-field">' +
                            '<label class="tl-label" for="cfg-pref-locale">Idioma</label>' +
                            '<select class="tl-input tl-input--select" id="cfg-pref-locale">' + localeOptions + '</select>' +
                        '</div>' +
                        '<div class="tl-field">' +
                            '<label class="tl-label" for="cfg-pref-timezone">Timezone</label>' +
                            '<select class="tl-input tl-input--select" id="cfg-pref-timezone">' + tzOptions + '</select>' +
                        '</div>' +
                    '</div>' +
                    '<div class="tl-grid tl-grid--2">' +
                        '<div class="tl-field">' +
                            '<label class="tl-label" for="cfg-pref-dateformat">Formato de data</label>' +
                            '<select class="tl-input tl-input--select" id="cfg-pref-dateformat">' + dfOptions + '</select>' +
                        '</div>' +
                        '<div class="tl-field">' +
                            '<label class="tl-label" for="cfg-pref-theme">Tema</label>' +
                            '<select class="tl-input tl-input--select" id="cfg-pref-theme">' +
                                '<option value="light"' + (theme === 'light' ? ' selected' : '') + '>Claro</option>' +
                                '<option value="dark"' + (theme === 'dark' ? ' selected' : '') + '>Escuro</option>' +
                                '<option value="system"' + (theme === 'system' ? ' selected' : '') + '>Sistema</option>' +
                            '</select>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>';
    }

    function renderSecurity(p) {
        var lastAccess = (p && p.last_sign_in_at) ? formatDate(p.last_sign_in_at) : '—';
        return '' +
            '<div class="tl-card">' +
                '<div class="tl-card__header">' +
                    '<span class="tl-badge tl-badge--blue">Segurança</span>' +
                    '<h2 class="tl-card__title">Segurança</h2>' +
                '</div>' +
                '<div class="tl-card__body">' +
                    '<div class="tl-field">' +
                        '<label class="tl-label">Alterar palavra-passe</label>' +
                        '<button class="tl-btn tl-btn--secondary" id="cfg-change-password" disabled>' +
                            'Alterar palavra-passe' +
                        '</button>' +
                    '</div>' +
                    '<div class="tl-grid tl-grid--2">' +
                        '<div class="tl-field">' +
                            '<label class="tl-label">Último acesso</label>' +
                            '<input class="tl-input" type="text" value="' + lastAccess + '" disabled>' +
                        '</div>' +
                        '<div class="tl-field">' +
                            '<label class="tl-label">Dispositivos</label>' +
                            '<div style="padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;font-size:0.8125rem;color:#334155;">' +
                                '1 dispositivo ativo (este navegador)' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>';
    }

    function renderPlan(p) {
        var plan = (p && p.plan) ? esc(p.plan) : 'free';
        var planLabel = plan === 'premium' ? 'Premium' : 'Free';
        var trialEnd = (p && p.trial_ends_at) ? formatDate(p.trial_ends_at) : '—';
        var isTrial = plan === 'trial';

        return '' +
            '<div class="tl-card">' +
                '<div class="tl-card__header">' +
                    '<span class="tl-badge tl-badge--indigo">Plano</span>' +
                    '<h2 class="tl-card__title">Plano Atual</h2>' +
                '</div>' +
                '<div class="tl-card__body">' +
                    '<div class="tl-plan-card">' +
                        '<div class="tl-plan-card__badge">' + planLabel + '</div>' +
                        '<div class="tl-plan-card__details">' +
                            (isTrial ? '<p class="tl-plan-card__trial">Trial ativo — termina em ' + trialEnd + '</p>' : '') +
                            (!isTrial && plan === 'premium' ? '<p style="font-size:.8125rem;color:#64748b;">Aceda a todas as funcionalidades premium.</p>' : '<p style="font-size:.8125rem;color:#64748b;">Funcionalidades básicas da conta gratuita.</p>') +
                        '</div>' +
                        '<button class="tl-btn tl-btn--primary" id="cfg-plan-manage" disabled>' +
                            'Gerir Plano' +
                        '</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
    }

    function renderDangerZone() {
        return '' +
            '<div class="tl-card tl-card--danger">' +
                '<div class="tl-card__header">' +
                    '<span class="tl-badge tl-badge--red">Perigo</span>' +
                    '<h2 class="tl-card__title" style="color:#dc2626;">Sessão</h2>' +
                '</div>' +
                '<div class="tl-card__body">' +
                    '<button class="tl-btn tl-btn--ghost" id="cfg-logout-btn" style="color:#dc2626;border:1px solid #fee2e2;">' +
                        '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>' +
                        'Terminar Sessão' +
                    '</button>' +
                '</div>' +
            '</div>';
    }

    function bindEvents() {
        var saveBtn = document.getElementById('cfg-save-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', async function() {
                var statusEl = document.getElementById('cfg-save-status');
                saveBtn.disabled = true;
                saveBtn.innerHTML = '<svg class="tl-spinner" fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m9.24-2.83l2.83 2.83M2 12h4m16 0h4"/></svg> A guardar...';

                var updates = {
                    nome: (document.getElementById('cfg-nome').value || '').trim(),
                    empresa: (document.getElementById('cfg-empresa').value || '').trim(),
                    telefone: (document.getElementById('cfg-telefone').value || '').trim(),
                    timezone: document.getElementById('cfg-timezone').value,
                    locale: document.getElementById('cfg-locale').value
                };

                var result = await saveProfile(updates);

                if (result.success) {
                    profile = result.profile;
                    statusEl.innerHTML = '<div style="padding:10px 14px;background:#dcfce7;color:#166534;border-radius:8px;font-size:0.8125rem;font-weight:500;">Perfil guardado com sucesso.</div>';
                    if (MailFlowToast && MailFlowToast.success) MailFlowToast.success('Perfil atualizado.');
                    setTimeout(function() { statusEl.innerHTML = ''; }, 3000);
                } else if (result.error !== 'unauthorized') {
                    statusEl.innerHTML = '<div style="padding:10px 14px;background:#fee2e2;color:#dc2626;border-radius:8px;font-size:0.8125rem;font-weight:500;">' + esc(result.error) + '</div>';
                }

                saveBtn.disabled = false;
                saveBtn.innerHTML = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Guardar Alterações';
            });
        }

        var smtpSaveBtn = document.getElementById('cfg-smtp-save-btn');
        if (smtpSaveBtn) {
            smtpSaveBtn.addEventListener('click', async function() {
                var statusEl = document.getElementById('cfg-smtp-save-status');
                smtpSaveBtn.disabled = true;
                smtpSaveBtn.innerHTML = '<svg class="tl-spinner" fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m9.24-2.83l2.83 2.83M2 12h4m16 0h4"/></svg> A guardar...';

                var updates = {
                    smtp_host: (document.getElementById('cfg-smtp-host').value || '').trim(),
                    smtp_port: parseInt(document.getElementById('cfg-smtp-port').value, 10) || 587,
                    smtp_username: (document.getElementById('cfg-smtp-username').value || '').trim(),
                    smtp_password: document.getElementById('cfg-smtp-password').value,
                    smtp_secure: document.getElementById('cfg-smtp-secure').checked,
                    smtp_from_email: (document.getElementById('cfg-smtp-from-email').value || '').trim(),
                    smtp_from_name: (document.getElementById('cfg-smtp-from-name').value || '').trim()
                };

                if (!updates.smtp_host) {
                    statusEl.innerHTML = '<div style="padding:10px 14px;background:#fee2e2;color:#dc2626;border-radius:8px;font-size:0.8125rem;font-weight:500;">Host SMTP é obrigatório.</div>';
                    smtpSaveBtn.disabled = false;
                    smtpSaveBtn.innerHTML = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Guardar Configuração SMTP';
                    return;
                }
                if (isNaN(updates.smtp_port) || updates.smtp_port < 1 || updates.smtp_port > 65535) {
                    statusEl.innerHTML = '<div style="padding:10px 14px;background:#fee2e2;color:#dc2626;border-radius:8px;font-size:0.8125rem;font-weight:500;">Porta SMTP inválida.</div>';
                    smtpSaveBtn.disabled = false;
                    smtpSaveBtn.innerHTML = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Guardar Configuração SMTP';
                    return;
                }

                var result = await saveProfile(updates);

                if (result.success) {
                    profile = result.profile;
                    statusEl.innerHTML = '<div style="padding:10px 14px;background:#dcfce7;color:#166534;border-radius:8px;font-size:0.8125rem;font-weight:500;">SMTP guardado com sucesso.</div>';
                    if (MailFlowToast && MailFlowToast.success) MailFlowToast.success('Configuração SMTP atualizada.');
                    setTimeout(function() { statusEl.innerHTML = ''; }, 3000);
                } else if (result.error !== 'unauthorized') {
                    statusEl.innerHTML = '<div style="padding:10px 14px;background:#fee2e2;color:#dc2626;border-radius:8px;font-size:0.8125rem;font-weight:500;">' + esc(result.error) + '</div>';
                }

                smtpSaveBtn.disabled = false;
                smtpSaveBtn.innerHTML = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Guardar Configuração SMTP';
            });
        }

        var smtpTestBtn = document.getElementById('cfg-smtp-test-btn');
        if (smtpTestBtn) {
            smtpTestBtn.addEventListener('click', async function() {
                var testBtn = smtpTestBtn;
                var statusEl = document.getElementById('cfg-smtp-save-status');

                var testData = {
                    smtp_host: (document.getElementById('cfg-smtp-host').value || '').trim(),
                    smtp_port: parseInt(document.getElementById('cfg-smtp-port').value, 10) || 587,
                    smtp_username: (document.getElementById('cfg-smtp-username').value || '').trim(),
                    smtp_password: document.getElementById('cfg-smtp-password').value,
                    smtp_secure: document.getElementById('cfg-smtp-secure').checked,
                    smtp_from_email: (document.getElementById('cfg-smtp-from-email').value || '').trim(),
                    smtp_from_name: (document.getElementById('cfg-smtp-from-name').value || '').trim()
                };

                if (!testData.smtp_host) {
                    statusEl.innerHTML = '<div style="padding:10px 14px;background:#fee2e2;color:#dc2626;border-radius:8px;font-size:0.8125rem;font-weight:500;">Host SMTP é obrigatório.</div>';
                    return;
                }
                if (isNaN(testData.smtp_port) || testData.smtp_port < 1 || testData.smtp_port > 65535) {
                    statusEl.innerHTML = '<div style="padding:10px 14px;background:#fee2e2;color:#dc2626;border-radius:8px;font-size:0.8125rem;font-weight:500;">Porta SMTP inválida.</div>';
                    return;
                }
                if (!testData.smtp_username) {
                    statusEl.innerHTML = '<div style="padding:10px 14px;background:#fee2e2;color:#dc2626;border-radius:8px;font-size:0.8125rem;font-weight:500;">Username SMTP é obrigatório.</div>';
                    return;
                }
                if (!testData.smtp_password) {
                    statusEl.innerHTML = '<div style="padding:10px 14px;background:#fee2e2;color:#dc2626;border-radius:8px;font-size:0.8125rem;font-weight:500;">Password SMTP é obrigatória.</div>';
                    return;
                }

                testBtn.disabled = true;
                testBtn.innerHTML = '<svg class="tl-spinner" fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m9.24-2.83l2.83 2.83M2 12h4m16 0h4"/></svg> A testar...';

                try {
                    var token = (await sb.auth.getSession()).data.session?.access_token;
                    if (!token) {
                        MailFlowToast.error('Sessão inválida');
                        window.location.href = '/entrar.html';
                        return;
                    }
                    var resp = await fetch('/api/smtp/test', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + token
                        },
                        body: JSON.stringify(testData)
                    });
                    var data = await resp.json();

                    if (resp.ok && data.success) {
                        statusEl.innerHTML = '<div style="padding:10px 14px;background:#dcfce7;color:#166534;border-radius:8px;font-size:0.8125rem;font-weight:500;">Ligação SMTP bem-sucedida!</div>';
                        if (MailFlowToast && MailFlowToast.success) MailFlowToast.success('Ligação SMTP bem-sucedida!');
                        var badgeEl = document.getElementById('cfg-smtp-status-badge');
                        if (badgeEl) {
                            badgeEl.outerHTML = '<span class="tl-badge tl-badge--green" id="cfg-smtp-status-badge" style="margin-left:8px;font-size:0.75rem;">Ligação verificada</span>';
                        }
                    } else {
                        statusEl.innerHTML = '<div style="padding:10px 14px;background:#fee2e2;color:#dc2626;border-radius:8px;font-size:0.8125rem;font-weight:500;">' + esc(data.error || 'Erro ao testar ligação SMTP') + '</div>';
                        if (MailFlowToast && MailFlowToast.error) MailFlowToast.error(data.error || 'Erro ao testar ligação SMTP');
                    }
                    setTimeout(function() { statusEl.innerHTML = ''; }, 5000);
                } catch (err) {
                    console.error('[Config] Erro ao testar SMTP:', err);
                    statusEl.innerHTML = '<div style="padding:10px 14px;background:#fee2e2;color:#dc2626;border-radius:8px;font-size:0.8125rem;font-weight:500;">Erro de rede ao testar ligação.</div>';
                    if (MailFlowToast && MailFlowToast.error) MailFlowToast.error('Erro de rede ao testar ligação');
                } finally {
                    testBtn.disabled = false;
                    testBtn.innerHTML = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg> Testar ligação';
                }
            });
        }

        var smtpSendTestBtn = document.getElementById('cfg-smtp-send-test-btn');
        if (smtpSendTestBtn) {
            smtpSendTestBtn.addEventListener('click', async function() {
                var sendBtn = smtpSendTestBtn;
                var statusEl = document.getElementById('cfg-smtp-save-status');

                var testData = {
                    smtp_host: (document.getElementById('cfg-smtp-host').value || '').trim(),
                    smtp_port: parseInt(document.getElementById('cfg-smtp-port').value, 10) || 587,
                    smtp_username: (document.getElementById('cfg-smtp-username').value || '').trim(),
                    smtp_password: document.getElementById('cfg-smtp-password').value,
                    smtp_secure: document.getElementById('cfg-smtp-secure').checked,
                    smtp_from_email: (document.getElementById('cfg-smtp-from-email').value || '').trim(),
                    smtp_from_name: (document.getElementById('cfg-smtp-from-name').value || '').trim(),
                    test_email: (document.getElementById('cfg-smtp-test-email').value || '').trim()
                };

                if (!testData.smtp_host) {
                    statusEl.innerHTML = '<div style="padding:10px 14px;background:#fee2e2;color:#dc2626;border-radius:8px;font-size:0.8125rem;font-weight:500;">Host SMTP é obrigatório.</div>';
                    return;
                }
                if (isNaN(testData.smtp_port) || testData.smtp_port < 1 || testData.smtp_port > 65535) {
                    statusEl.innerHTML = '<div style="padding:10px 14px;background:#fee2e2;color:#dc2626;border-radius:8px;font-size:0.8125rem;font-weight:500;">Porta SMTP inválida.</div>';
                    return;
                }
                if (!testData.smtp_username) {
                    statusEl.innerHTML = '<div style="padding:10px 14px;background:#fee2e2;color:#dc2626;border-radius:8px;font-size:0.8125rem;font-weight:500;">Username SMTP é obrigatório.</div>';
                    return;
                }
                if (!testData.smtp_password) {
                    statusEl.innerHTML = '<div style="padding:10px 14px;background:#fee2e2;color:#dc2626;border-radius:8px;font-size:0.8125rem;font-weight:500;">Password SMTP é obrigatória.</div>';
                    return;
                }
                if (!testData.test_email) {
                    statusEl.innerHTML = '<div style="padding:10px 14px;background:#fee2e2;color:#dc2626;border-radius:8px;font-size:0.8125rem;font-weight:500;">Email para teste é obrigatório.</div>';
                    return;
                }
                if (!testData.smtp_from_email) {
                    statusEl.innerHTML = '<div style="padding:10px 14px;background:#fee2e2;color:#dc2626;border-radius:8px;font-size:0.8125rem;font-weight:500;">Email remetente é obrigatório.</div>';
                    return;
                }

                sendBtn.disabled = true;
                sendBtn.innerHTML = '<svg class="tl-spinner" fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m9.24-2.83l2.83 2.83M2 12h4m16 0h4"/></svg> A enviar...';

                try {
                    var token = (await sb.auth.getSession()).data.session?.access_token;
                    if (!token) {
                        MailFlowToast.error('Sessão inválida');
                        window.location.href = '/entrar.html';
                        return;
                    }
                    var resp = await fetch('/api/smtp/send-test', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + token
                        },
                        body: JSON.stringify(testData)
                    });
                    var data = await resp.json();

                    if (resp.ok && data.success) {
                        statusEl.innerHTML = '<div style="padding:10px 14px;background:#dcfce7;color:#166534;border-radius:8px;font-size:0.8125rem;font-weight:500;">Email de teste enviado com sucesso!</div>';
                        if (MailFlowToast && MailFlowToast.success) MailFlowToast.success('Email de teste enviado!');
                    } else {
                        statusEl.innerHTML = '<div style="padding:10px 14px;background:#fee2e2;color:#dc2626;border-radius:8px;font-size:0.8125rem;font-weight:500;">' + esc(data.error || 'Erro ao enviar email de teste') + '</div>';
                        if (MailFlowToast && MailFlowToast.error) MailFlowToast.error(data.error || 'Erro ao enviar email de teste');
                    }
                    setTimeout(function() { statusEl.innerHTML = ''; }, 5000);
                } catch (err) {
                    console.error('[Config] Erro ao enviar email de teste:', err);
                    statusEl.innerHTML = '<div style="padding:10px 14px;background:#fee2e2;color:#dc2626;border-radius:8px;font-size:0.8125rem;font-weight:500;">Erro de rede ao enviar email de teste.</div>';
                    if (MailFlowToast && MailFlowToast.error) MailFlowToast.error('Erro de rede ao enviar email de teste');
                } finally {
                    sendBtn.disabled = false;
                    sendBtn.innerHTML = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg> Enviar email de teste';
                }
            });
        }

        var changePwdBtn = document.getElementById('cfg-change-password');
        if (changePwdBtn) {
            changePwdBtn.disabled = false;
            changePwdBtn.addEventListener('click', async function() {
                var newPwd = prompt('Nova palavra-passe:');
                if (!newPwd || newPwd.length < 6) {
                    if (newPwd !== null) MailFlowToast.error('A palavra-passe deve ter pelo menos 6 caracteres.');
                    return;
                }
                try {
                    var { error } = await sb.auth.updateUser({ password: newPwd });
                    if (error) throw error;
                    MailFlowToast.success('Palavra-passe atualizada com sucesso.');
                } catch (err) {
                    console.error('[Config] Erro ao alterar password:', err);
                    MailFlowToast.error('Erro ao alterar palavra-passe.');
                }
            });
        }

        var logoutBtn = document.getElementById('cfg-logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async function() {
                await MailFlowAuth.signOut();
                window.location.href = '/entrar.html';
            });
        }
    }

    async function render(container) {
        currentContainer = container;
        init();

        user = await MailFlowAuth.getUser();
        if (!user) return;

        var html = renderHeader();
        html += '<div class="tl-cards"><div class="tl-card tl-card--skeleton" style="animation-delay:0s"><div class="tl-skeleton tl-skeleton--line tl-skeleton--lg" style="width:40%"></div><div class="tl-skeleton tl-skeleton--line" style="margin-top:16px"></div><div class="tl-skeleton tl-skeleton--line tl-skeleton--short"></div><div class="tl-skeleton tl-skeleton--line"></div></div></div>';
        container.innerHTML = html;

        profile = await fetchProfile();

        var sectionsHtml = '';
        if (profile) {
            sectionsHtml += renderProfileForm(profile);
            sectionsHtml += renderSMTPForm(profile);
            sectionsHtml += renderPreferences(profile);
            sectionsHtml += renderSecurity(profile);
            sectionsHtml += renderAccountInfo(profile);
            sectionsHtml += renderPlan(profile);
            sectionsHtml += renderDangerZone();
        } else {
            sectionsHtml = '<div class="tl-empty"><div class="tl-empty__icon"><svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg></div><h3 class="tl-empty__title">Erro ao carregar configurações</h3><p class="tl-empty__desc">Não foi possível carregar as suas configurações. Tente novamente.</p></div>';
        }

        container.innerHTML = renderHeader() + '<div class="tl-cards">' + sectionsHtml + '</div>';
        bindEvents();
    }

    return { render: render };
})();