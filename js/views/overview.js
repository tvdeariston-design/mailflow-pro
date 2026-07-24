/**
 * MailFlow Pro — Visão Geral (Overview)
 *
 * Objetivo:
 *   Dashboard principal com KPIs, banner, benefícios,
 *   como funciona, ações rápidas e atividade.
 *   Primeira coisa que o utilizador vê ao entrar.
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
 *   - Banner hero
 *   - KPIs com dados reais ou empty states elegantes
 *   - Secção "Porque utilizar"
 *   - Secção "Como funciona"
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

        // Banner hero
        html += renderHero();

        // Help video card
        html += renderHelpCard();

        if (isNewUser) {
            html += renderOnboarding();
        }

        html += renderKPIs(stats);
        html += renderBenefits();
        html += renderHowItWorks();
        html += renderQuickActions();
        html += renderActivity(stats);

        container.innerHTML = html;
        
        // Bind help video button
        var helpBtn = document.getElementById('help-video-btn');
        if (helpBtn) {
            helpBtn.addEventListener('click', openHelpModal);
        }
    }

    function renderHero() {
        return '' +
            '<div class="dashboard-hero" role="region" aria-label="Bem-vindo ao MailFlow Pro">' +
                '<div class="dashboard-hero__content">' +
                    '<h1 class="dashboard-hero__title">Transforme os seus contactos em clientes com campanhas profissionais de email marketing.</h1>' +
                    '<a href="#/campanhas" class="dashboard-hero__btn" role="button">' +
                        '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>' +
                        'Criar a minha primeira campanha' +
                    '</a>' +
                '</div>' +
            '</div>';
    }

    function renderHelpCard() {
        return '' +
            '<div class="help-card" style="margin-bottom:24px;">' +
                '<div class="help-card__icon" aria-hidden="true">🎥</div>' +
                '<div class="help-card__content">' +
                    '<h3 class="help-card__title">Aprenda o MailFlow Pro</h3>' +
                    '<p class="help-card__desc">Veja este vídeo de 45 segundos e aprenda rapidamente a utilizar a plataforma.</p>' +
                '</div>' +
                '<button class="help-card__btn" id="help-video-btn" type="button" aria-label="Ver vídeo tutorial">' +
                    '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/></svg>' +
                    'Ver vídeo' +
                '</button>' +
            '</div>';
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
                '</div>' +
            '</div>';
    }

    function renderKPIs(stats) {
        return '' +
            '<div class="section-header">' +
                '<h2 class="section-header__title">Visão Geral</h2>' +
            '</div>' +
            '<div class="kpi-grid">' +
                '<div class="kpi-card">' +
                    '<div class="kpi-card__top">' +
                        '<div class="kpi-card__icon kpi-card__icon--green">' +
                            '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>' +
                        '</div>' +
                    '</div>' +
                    '<div class="kpi-card__value">' + stats.campanhas + '</div>' +
                    '<div class="kpi-card__label">Campanhas</div>' +
                '</div>' +
                '<div class="kpi-card">' +
                    '<div class="kpi-card__top">' +
                        '<div class="kpi-card__icon kpi-card__icon--amber">' +
                            '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>' +
                        '</div>' +
                    '</div>' +
                    '<div class="kpi-card__value">' + stats.emails.toLocaleString('pt-PT') + '</div>' +
                    '<div class="kpi-card__label">Emails Enviados</div>' +
                '</div>' +
                '<div class="kpi-card">' +
                    '<div class="kpi-card__top">' +
                        '<div class="kpi-card__icon kpi-card__icon--indigo">' +
                            '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>' +
                        '</div>' +
                    '</div>' +
                    '<div class="kpi-card__value">' + stats.contactos + '</div>' +
                    '<div class="kpi-card__label">Contactos</div>' +
                '</div>' +
                '<div class="kpi-card">' +
                    '<div class="kpi-card__top">' +
                        '<div class="kpi-card__icon kpi-card__icon--rose">' +
                            '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z"/></svg>' +
                        '</div>' +
                    '</div>' +
                    '<div class="kpi-card__value">' + stats.templates + '</div>' +
                    '<div class="kpi-card__label">Templates</div>' +
                '</div>' +
            '</div>';
    }

    function renderBenefits() {
        return '' +
            '<div class="section-header section-header--centered">' +
                '<h2 class="section-header__title">Porque utilizar o MailFlow Pro?</h2>' +
                '<p class="section-header__subtitle">Tudo o que precisa para transformar contactos em clientes.</p>' +
            '</div>' +
            '<div class="benefits-grid">' +
                '<div class="benefit-card" style="animation-delay: 0ms">' +
                    '<div class="benefit-card__icon">' +
                        '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>' +
                    '</div>' +
                    '<h3 class="benefit-card__title">Poupe Horas de Trabalho</h3>' +
                    '<p class="benefit-card__desc">Automatize o envio de emails e campanhas em poucos minutos.</p>' +
                '</div>' +
                '<div class="benefit-card" style="animation-delay: 100ms">' +
                    '<div class="benefit-card__icon">' +
                        '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>' +
                    '</div>' +
                    '<h3 class="benefit-card__title">Aumente as Vendas</h3>' +
                    '<p class="benefit-card__desc">Comunique com os seus clientes no momento certo e aumente as conversões.</p>' +
                '</div>' +
                '<div class="benefit-card" style="animation-delay: 200ms">' +
                    '<div class="benefit-card__icon">' +
                        '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2M9 19V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14"/></svg>' +
                    '</div>' +
                    '<h3 class="benefit-card__title">Tudo num Só Local</h3>' +
                    '<p class="benefit-card__desc">Contactos, templates, campanhas, estatísticas e emails organizados num único painel.</p>' +
                '</div>' +
                '<div class="benefit-card" style="animation-delay: 300ms">' +
                    '<div class="benefit-card__icon">' +
                        '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2M9 19V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>' +
                    '</div>' +
                    '<h3 class="benefit-card__title">Estatísticas em Tempo Real</h3>' +
                    '<p class="benefit-card__desc">Acompanhe envios, aberturas, cliques e desempenho das campanhas.</p>' +
                '</div>' +
                '<div class="benefit-card" style="animation-delay: 400ms">' +
                    '<div class="benefit-card__icon">' +
                        '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z"/></svg>' +
                    '</div>' +
                    '<h3 class="benefit-card__title">Simples e Intuitivo</h3>' +
                    '<p class="benefit-card__desc">Interface moderna, rápida e fácil de utilizar, sem conhecimentos técnicos.</p>' +
                '</div>' +
                '<div class="benefit-card" style="animation-delay: 500ms">' +
                    '<div class="benefit-card__icon">' +
                        '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>' +
                    '</div>' +
                    '<h3 class="benefit-card__title">Seguro e Profissional</h3>' +
                    '<p class="benefit-card__desc">Os seus dados são protegidos e a plataforma está preparada para crescer com o seu negócio.</p>' +
                '</div>' +
            '</div>';
    }

    function renderHowItWorks() {
        return '' +
            '<div class="section-header section-header--centered">' +
                '<h2 class="section-header__title">Como funciona?</h2>' +
                '<p class="section-header__subtitle">Quatro passos simples para começar a enviar campanhas profissionais.</p>' +
            '</div>' +
            '<div class="how-grid">' +
                '<div class="how-step">' +
                    '<div class="how-step__number">1</div>' +
                    '<div class="how-step__icon">' +
                        '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>' +
                    '</div>' +
                    '<h3 class="how-step__title">Importe os seus contactos</h3>' +
                    '<p class="how-step__desc">Carregue a sua lista de contactos via CSV ou adicione manualmente.</p>' +
                '</div>' +
                '<div class="how-connector" aria-hidden="true"></div>' +
                '<div class="how-step">' +
                    '<div class="how-step__number">2</div>' +
                    '<div class="how-step__icon">' +
                        '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z"/></svg>' +
                    '</div>' +
                    '<h3 class="how-step__title">Crie ou escolha um template</h3>' +
                    '<p class="how-step__desc">Use o editor visual para criar emails bonitos ou escolha um template pré-feito.</p>' +
                '</div>' +
                '<div class="how-connector" aria-hidden="true"></div>' +
                '<div class="how-step">' +
                    '<div class="how-step__number">3</div>' +
                    '<div class="how-step__icon">' +
                        '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>' +
                    '</div>' +
                    '<h3 class="how-step__title">Envie ou agende a campanha</h3>' +
                    '<p class="how-step__desc">Envie imediatamente ou agende para o melhor horário.</p>' +
                '</div>' +
                '<div class="how-connector" aria-hidden="true"></div>' +
                '<div class="how-step">' +
                    '<div class="how-step__number">4</div>' +
                    '<div class="how-step__icon">' +
                        '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2M9 19V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>' +
                    '</div>' +
                    '<h3 class="how-step__title">Analise os resultados</h3>' +
                    '<p class="how-step__desc">Acompanhe aberturas, cliques e melhore as próximas campanhas.</p>' +
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
                        '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>' +
                    '</div>' +
                    '<div class="quick-card__title">Nova Campanha</div>' +
                    '<div class="quick-card__desc">Crie e envie uma campanha de email marketing para os seus contactos.</div>' +
                '</a>' +
                '<a href="#/contactos" class="quick-card">' +
                    '<div class="quick-card__icon kpi-card__icon--indigo">' +
                        '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>' +
                    '</div>' +
                    '<div class="quick-card__title">Adicionar Contacto</div>' +
                    '<div class="quick-card__desc">Adicione novos contactos manualmente ou importe uma lista CSV.</div>' +
                '</a>' +
                '<a href="#/templates" class="quick-card">' +
                    '<div class="quick-card__icon kpi-card__icon--amber">' +
                        '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z"/></svg>' +
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
    // Help Modal
    // ========================================
    function openHelpModal() {
        var modalHtml = '' +
            '<div class="tl-modal" id="help-video-modal" role="dialog" aria-modal="true" aria-labelledby="help-modal-title">' +
                '<div class="tl-modal__overlay"></div>' +
                '<div class="tl-modal__content" style="max-width:720px;">' +
                    '<div class="tl-modal__header">' +
                        '<h3 class="tl-modal__title" id="help-modal-title">Tutorial: Primeiros Passos no MailFlow Pro</h3>' +
                        '<button class="tl-modal__close" id="help-modal-close" aria-label="Fechar"><svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg></button>' +
                    '</div>' +
                    '<div class="tl-modal__body" style="padding:32px;text-align:center;">' +
                        '<div class="video-placeholder" style="background:#f8fafc;border:2px dashed #e2e8f0;border-radius:16px;padding:60px 40px;">' +
                            '<svg width="64" height="64" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color:#94a3b8;margin-bottom:16px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>' +
                            '<p style="font-size:1.125rem;color:#334155;font-weight:500;margin-bottom:8px;">Em breve: vídeo tutorial do Dashboard</p>' +
                            '<p style="color:#64748b;font-size:0.875rem;">O tutorial em vídeo está a ser preparado. Volte em breve!</p>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>';

        var wrapper = document.createElement('div');
        wrapper.innerHTML = modalHtml;
        document.body.appendChild(wrapper.firstElementChild);

        // Bind close events
        var modal = document.getElementById('help-video-modal');
        var closeBtn = document.getElementById('help-modal-close');
        var overlay = modal ? modal.querySelector('.tl-modal__overlay') : null;

        function closeModal() {
            if (modal) modal.remove();
            document.removeEventListener('keydown', onKeydown);
        }

        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (overlay) overlay.addEventListener('click', closeModal);

        function onKeydown(e) {
            if (e.key === 'Escape') closeModal();
        }
        document.addEventListener('keydown', onKeydown);

        // Focus trap
        setTimeout(function() { if (closeBtn) closeBtn.focus(); }, 50);
    }

    // ========================================
    // Export
    // ========================================
    return { render: render };

})();
