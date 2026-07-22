/**
 * MailFlow Pro — Visão Geral (Overview)
 *
 * Objetivo:
 *   Dashboard principal com KPIs, ações rápidas e atividade
 *   recente. Primeira coisa que o utilizador vê ao entrar.
 *   Mesmo vazio, deve parecer um produto profissional.
 *
 * Benefício para o cliente:
 *   Vista instantânea do estado do negócio. Em segundos
 *   sabe quantos contactos tem, campanhas enviadas, e
 *   taxa de abertura. Sem precisar de navegar em vários sítios.
 *
 * Inputs:
 *   - Profile do utilizador (Supabase)
 *   - Contagens de contactos, campanhas, templates (Supabase)
 *
 * Outputs:
 *   - KPIs com dados reais ou empty states elegantes
 *   - Ações rápidas para começar a usar o produto
 *   - Feed de atividade recente
 *
 * Erros possíveis:
 *   - Fallback para zeros se queries falharem
 *
 * Dependências:
 *   - supabase-client.js
 *   - auth.js
 */

var OverviewView = (function() {
    'use strict';

    // ========================================
    // Init
    // ========================================
    var sb = null;

    function init() {
        sb = window.supabaseClient;
    }

    // ========================================
    // Helpers
    // ========================================

    async function fetchStats(userId) {
        if (!sb) return { campanhas: 0, contactos: 0, templates: 0, emails: 0 };

        try {
            var results = await Promise.all([
                sb.from('campaigns').select('id', { count: 'exact', head: true }).eq('user_id', userId),
                sb.from('contacts').select('id', { count: 'exact', head: true }).eq('user_id', userId),
                sb.from('templates').select('id', { count: 'exact', head: true }).eq('user_id', userId),
                sb.from('campaigns').select('total_sent').eq('user_id', userId).eq('status', 'sent')
            ]);

            var totalEmails = 0;
            if (results[3].data) {
                results[3].data.forEach(function(c) { totalEmails += (c.total_sent || 0); });
            }

            return {
                campanhas: results[0].count || 0,
                contactos: results[1].count || 0,
                templates: results[2].count || 0,
                emails: totalEmails
            };
        } catch (err) {
            console.error('[Overview] Erro ao buscar stats:', err);
            return { campanhas: 0, contactos: 0, templates: 0, emails: 0 };
        }
    }

    function getInitials(nome) {
        if (!nome) return '—';
        return nome.split(' ').map(function(w) { return w[0]; }).join('').toUpperCase().slice(0, 2);
    }

    // ========================================
    // Render
    // ========================================

    async function render(container) {
        init();

        var user = await MailFlowAuth.getUser();
        if (!user) return;

        var profile = null;
        if (sb) {
            var result = await sb.from('profiles').select('*').eq('id', user.id).single();
            profile = result.data;
        }

        var nome = (profile && profile.nome) ? profile.nome : user.email.split('@')[0];
        var email = user.email;
        var stats = await fetchStats(user.id);

        // Atualizar sidebar
        var nameEl = document.getElementById('user-name');
        var emailEl = document.getElementById('user-email');
        var avatarEl = document.getElementById('user-avatar');
        if (nameEl) nameEl.textContent = nome;
        if (emailEl) emailEl.textContent = email;
        if (avatarEl) avatarEl.textContent = getInitials(nome);

        // Atualizar badges
        updateBadge('badge-campanhas', stats.campanhas);
        updateBadge('badge-contactos', stats.contactos);
        updateBadge('badge-templates', stats.templates);

        var isNewUser = stats.campanhas === 0 && stats.contactos === 0 && stats.templates === 0;

        var html = '';

        if (isNewUser) {
            html += renderOnboarding();
        }

        html += renderKPIs(stats);
        html += renderQuickActions();
        html += renderActivity(stats);

        container.innerHTML = html;
    }

    function renderOnboarding() {
        return '' +
            '<div class="onboarding">' +
                '<div class="onboarding__title">Bem-vindo ao MailFlow Pro</div>' +
                '<div class="onboarding__desc">Comece por criar o seu primeiro template e adicionando contactos. Em poucos minutos está pronto para enviar a sua primeira campanha.</div>' +
                '<div class="onboarding__steps">' +
                    '<a href="#/templates" class="onboarding__step">' +
                        '<span class="onboarding__step-num">1</span>' +
                        'Criar Template' +
                    '</a>' +
                    '<a href="#/contactos" class="onboarding__step">' +
                        '<span class="onboarding__step-num">2</span>' +
                        'Adicionar Contactos' +
                    '</a>' +
                    '<a href="#/campanhas" class="onboarding__step">' +
                        '<span class="onboarding__step-num">3</span>' +
                        'Criar Campanha' +
                    '</a>' +
                '</div>' +
            '</div>';
    }

    function renderKPIs(stats) {
        return '' +
            '<div class="kpi-grid">' +
                '<div class="kpi-card">' +
                    '<div class="kpi-card__top">' +
                        '<div class="kpi-card__icon kpi-card__icon--indigo">' +
                            '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>' +
                        '</div>' +
                    '</div>' +
                    '<div class="kpi-card__value">' + stats.contactos.toLocaleString('pt-PT') + '</div>' +
                    '<div class="kpi-card__label">Contactos</div>' +
                '</div>' +
                '<div class="kpi-card">' +
                    '<div class="kpi-card__top">' +
                        '<div class="kpi-card__icon kpi-card__icon--green">' +
                            '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>' +
                        '</div>' +
                    '</div>' +
                    '<div class="kpi-card__value">' + stats.campanhas + '</div>' +
                    '<div class="kpi-card__label">Campanhas</div>' +
                '</div>' +
                '<div class="kpi-card">' +
                    '<div class="kpi-card__top">' +
                        '<div class="kpi-card__icon kpi-card__icon--amber">' +
                            '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>' +
                        '</div>' +
                    '</div>' +
                    '<div class="kpi-card__value">' + stats.emails.toLocaleString('pt-PT') + '</div>' +
                    '<div class="kpi-card__label">Emails Enviados</div>' +
                '</div>' +
                '<div class="kpi-card">' +
                    '<div class="kpi-card__top">' +
                        '<div class="kpi-card__icon kpi-card__icon--rose">' +
                            '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z"/></svg>' +
                        '</div>' +
                    '</div>' +
                    '<div class="kpi-card__value">' + stats.templates + '</div>' +
                    '<div class="kpi-card__label">Templates</div>' +
                '</div>' +
            '</div>';
    }

    function renderQuickActions() {
        return '' +
            '<div class="section-header">' +
                '<h2 class="section-header__title">Ações Rápidas</h2>' +
            '</div>' +
            '<div class="quick-grid">' +
                '<a href="#/campanhas" class="quick-card">' +
                    '<div class="quick-card__icon kpi-card__icon--green">' +
                        '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>' +
                    '</div>' +
                    '<div class="quick-card__title">Nova Campanha</div>' +
                    '<div class="quick-card__desc">Crie e envie uma campanha de email marketing para os seus contactos.</div>' +
                '</a>' +
                '<a href="#/contactos" class="quick-card">' +
                    '<div class="quick-card__icon kpi-card__icon--indigo">' +
                        '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>' +
                    '</div>' +
                    '<div class="quick-card__title">Adicionar Contacto</div>' +
                    '<div class="quick-card__desc">Adicione novos contactos manualmente ou importe uma lista CSV.</div>' +
                '</a>' +
                '<a href="#/templates" class="quick-card">' +
                    '<div class="quick-card__icon kpi-card__icon--amber">' +
                        '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z"/></svg>' +
                    '</div>' +
                    '<div class="quick-card__title">Criar Template</div>' +
                    '<div class="quick-card__desc">Crie templates reutilizáveis para manter consistência nas suas campanhas.</div>' +
                '</a>' +
            '</div>';
    }

    function renderActivity(stats) {
        return '' +
            '<div class="section-header">' +
                '<h2 class="section-header__title">Atividade Recente</h2>' +
            '</div>' +
            '<div class="activity-feed">' +
                (stats.campanhas === 0 && stats.contactos === 0
                    ? '<div class="activity-feed__empty">Ainda não existe atividade. Comece por criar um template ou adicionar contactos.</div>'
                    : '<div class="activity-feed__empty">A atividade aparecerá aqui à medida que usar o MailFlow Pro.</div>'
                ) +
            '</div>';
    }

    function updateBadge(id, count) {
        var el = document.getElementById(id);
        if (el) el.textContent = count;
    }

    // ========================================
    // Export
    // ========================================
    return { render: render };

})();
