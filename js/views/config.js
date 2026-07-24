/**
 * MailFlow Pro — View: Configurações
 *
 * Pagina de configuracoes do utilizador.
 * Edição de perfil (nome, empresa, telefone, timezone),
 * info da conta, e ações de logout.
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
        if (!sb) return null;
        try {
            var result = await sb.from('profiles').select('*').eq('id', user.id).single();
            return result.data || null;
        } catch (err) {
            console.error('[Config] Erro ao buscar perfil:', err);
            return null;
        }
    }

    async function saveProfile(updates) {
        if (!sb) return { success: false, error: 'Cliente indisponível' };
        try {
            updates.updated_at = new Date().toISOString();
            var result = await sb.from('profiles').update(updates).eq('id', user.id).select().single();
            if (result.error) throw result.error;
            return { success: true, profile: result.data };
        } catch (err) {
            console.error('[Config] Erro ao guardar perfil:', err);
            return { success: false, error: err.message || 'Erro ao guardar' };
        }
    }

    function renderProfileForm(p) {
        var nome = (p && p.nome) ? esc(p.nome) : '';
        var empresa = (p && p.empresa) ? esc(p.empresa) : '';
        var telefone = (p && p.telefone) ? esc(p.telefone) : '';
        var timezone = (p && p.timezone) ? esc(p.timezone) : 'UTC';
        var locale = (p && p.locale) ? esc(p.locale) : 'pt-PT';

        var timezones = ['UTC', 'Europe/Lisbon', 'Europe/Madrid', 'Europe/London', 'America/New_York', 'America/Sao_Paulo', 'Asia/Macau'];
        var tzOptions = '';
        timezones.forEach(function(tz) {
            tzOptions += '<option value="' + tz + '"' + (tz === timezone ? ' selected' : '') + '>' + tz + '</option>';
        });

        return '' +
            '<div class="section-header">' +
                '<h2 class="section-header__title">Perfil</h2>' +
            '</div>' +
            '<div style="max-width:560px;">' +
                '<div class="tl-field">' +
                    '<label class="tl-label" for="cfg-nome">Nome</label>' +
                    '<input class="tl-input" type="text" id="cfg-nome" value="' + nome + '" placeholder="O seu nome">' +
                '</div>' +
                '<div class="tl-field">' +
                    '<label class="tl-label" for="cfg-empresa">Empresa</label>' +
                    '<input class="tl-input" type="text" id="cfg-empresa" value="' + empresa + '" placeholder="Nome da empresa (opcional)">' +
                '</div>' +
                '<div class="tl-field">' +
                    '<label class="tl-label" for="cfg-telefone">Telefone</label>' +
                    '<input class="tl-input" type="tel" id="cfg-telefone" value="' + telefone + '" placeholder="+351 ...">' +
                '</div>' +
                '<div class="tl-field">' +
                    '<label class="tl-label" for="cfg-timezone">Timezone</label>' +
                    '<select class="tl-input tl-input--select" id="cfg-timezone">' + tzOptions + '</select>' +
                '</div>' +
                '<div class="tl-field">' +
                    '<label class="tl-label" for="cfg-locale">Idioma</label>' +
                    '<select class="tl-input tl-input--select" id="cfg-locale">' +
                        '<option value="pt-PT"' + (locale === 'pt-PT' ? ' selected' : '') + '>Português (PT)</option>' +
                        '<option value="en"' + (locale === 'en' ? ' selected' : '') + '>English</option>' +
                        '<option value="es"' + (locale === 'es' ? ' selected' : '') + '>Español</option>' +
                    '</select>' +
                '</div>' +
                '<div id="cfg-save-status" style="margin-bottom:16px;"></div>' +
                '<button class="tl-btn tl-btn--primary" id="cfg-save-btn">' +
                    '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>' +
                    'Guardar Alterações' +
                '</button>' +
            '</div>';
    }

    function renderAccountInfo(p) {
        var created = (p && p.created_at) ? formatDate(p.created_at) : '—';
        var plan = (p && p.plan) ? esc(p.plan) : 'free';
        var planLabel = plan === 'premium' ? 'Premium' : 'Free';

        return '' +
            '<div class="section-header" style="margin-top:40px;">' +
                '<h2 class="section-header__title">Conta</h2>' +
            '</div>' +
            '<div style="max-width:560px;">' +
                '<div class="tl-field">' +
                    '<label class="tl-label">Email</label>' +
                    '<input class="tl-input" type="text" value="' + esc(user.email) + '" disabled style="opacity:0.6;">' +
                '</div>' +
                '<div class="tl-field">' +
                    '<label class="tl-label">Plano</label>' +
                    '<div style="padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;font-size:0.8125rem;">' +
                        '<span class="tl-badge ' + (plan === 'premium' ? 'tl-badge--green' : 'tl-badge--gray') + '">' + planLabel + '</span>' +
                    '</div>' +
                '</div>' +
                '<div class="tl-field">' +
                    '<label class="tl-label">Membro desde</label>' +
                    '<input class="tl-input" type="text" value="' + created + '" disabled style="opacity:0.6;">' +
                '</div>' +
            '</div>';
    }

    function renderDangerZone() {
        return '' +
            '<div class="section-header" style="margin-top:40px;">' +
                '<h2 class="section-header__title" style="color:#dc2626;">Sessão</h2>' +
            '</div>' +
            '<div style="max-width:560px;">' +
                '<button class="tl-btn tl-btn--ghost" id="cfg-logout-btn" style="color:#dc2626;border:1px solid #fee2e2;">' +
                    '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>' +
                    'Terminar Sessão' +
                '</button>' +
            '</div>';
    }

    function bindEvents() {
        var saveBtn = document.getElementById('cfg-save-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', async function() {
                var statusEl = document.getElementById('cfg-save-status');
                saveBtn.disabled = true;
                saveBtn.textContent = 'A guardar...';

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
                } else {
                    statusEl.innerHTML = '<div style="padding:10px 14px;background:#fee2e2;color:#dc2626;border-radius:8px;font-size:0.8125rem;font-weight:500;">' + esc(result.error || 'Erro ao guardar.') + '</div>';
                }

                saveBtn.disabled = false;
                saveBtn.innerHTML = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Guardar Alterações';
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

    // ========================================
    // Render
    // ========================================

    async function render(container) {
        currentContainer = container;
        init();

        user = await MailFlowAuth.getUser();
        if (!user) return;

        container.innerHTML = '<div style="text-align:center;padding:60px;color:#9ca3af;font-size:0.875rem;">A carregar configurações...</div>';

        profile = await fetchProfile();

        var html = renderProfileForm(profile);
        html += renderAccountInfo(profile);
        html += renderDangerZone();

        container.innerHTML = html;
        bindEvents();
    }

    return { render: render };
})();
