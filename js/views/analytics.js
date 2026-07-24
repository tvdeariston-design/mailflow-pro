/**
 * MailFlow Pro — View: Analytics
 *
 * Dashboard de analytics com metricas agregadas de campanhas,
 * taxa de abertura, taxa de clique, e desempenho por campanha.
 */

var AnalyticsView = (function() {
    'use strict';

    var sb = null;
    var user = null;
    var currentContainer = null;

    function init() { sb = window.supabaseClient; }

    function esc(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function formatDate(dateStr) {
        if (!dateStr) return '—';
        return new Date(dateStr).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function pct(num, den) {
        if (!den) return '0%';
        return Math.round((num / den) * 10000) / 100 + '%';
    }

    function statusBadge(status) {
        var map = {
            draft: 'tl-badge--gray', scheduled: 'tl-badge--blue',
            sending: 'tl-badge--yellow', sent: 'tl-badge--green',
            paused: 'tl-badge--orange', cancelled: 'tl-badge--red', failed: 'tl-badge--red'
        };
        var labels = {
            draft: 'Rascunho', scheduled: 'Agendada', sending: 'A enviar',
            sent: 'Enviada', paused: 'Pausada', cancelled: 'Cancelada', failed: 'Falhou'
        };
        return '<span class="tl-badge ' + (map[status] || 'tl-badge--gray') + '">' + (labels[status] || esc(status)) + '</span>';
    }

    async function fetchAnalytics(userId) {
        if (!sb) return { totals: defaultTotals(), campaigns: [] };

        try {
            var { data: campaigns, error } = await sb
                .from('campaigns')
                .select('id, nome, assunto, status, total_recipients, total_sent, total_failed, total_opened, total_clicked, created_at')
                .eq('user_id', userId)
                .is('deleted_at', null)
                .order('created_at', { ascending: false });

            if (error) throw error;

            var totals = { sent: 0, opened: 0, clicked: 0, failed: 0, count: 0, sentCampaigns: 0 };

            (campaigns || []).forEach(function(c) {
                totals.sent += c.total_sent || 0;
                totals.opened += c.total_opened || 0;
                totals.clicked += c.total_clicked || 0;
                totals.failed += c.total_failed || 0;
                totals.count++;
                if (c.status === 'sent') totals.sentCampaigns++;
            });

            return { totals: totals, campaigns: campaigns || [] };
        } catch (err) {
            console.error('[Analytics] Erro ao buscar dados:', err);
            return { totals: defaultTotals(), campaigns: [] };
        }
    }

    function defaultTotals() {
        return { sent: 0, opened: 0, clicked: 0, failed: 0, count: 0, sentCampaigns: 0 };
    }

    function renderKPIs(totals) {
        var kpis = [
            { label: 'Campanhas', value: totals.count, icon: 'kpi-card__icon--indigo', svg: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>' },
            { label: 'Emails Enviados', value: totals.sent, icon: 'kpi-card__icon--green', svg: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>' },
            { label: 'Total Aberturas', value: totals.opened, icon: 'kpi-card__icon--amber', svg: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>' },
            { label: 'Taxa de Abertura', value: pct(totals.opened, totals.sent), icon: 'kpi-card__icon--rose', svg: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>' },
            { label: 'Total Cliques', value: totals.clicked, icon: 'kpi-card__icon--indigo', svg: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5"/></svg>' },
            { label: 'Taxa de Clique', value: pct(totals.clicked, totals.sent), icon: 'kpi-card__icon--green', svg: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14"/></svg>' }
        ];

        var html = '<div class="kpi-grid">';
        kpis.forEach(function(k) {
            html +=
                '<div class="kpi-card">' +
                    '<div class="kpi-card__top">' +
                        '<div class="kpi-card__icon ' + k.icon + '">' + k.svg + '</div>' +
                        '<div class="kpi-card__label">' + k.label + '</div>' +
                    '</div>' +
                    '<div class="kpi-card__value">' + k.value + '</div>' +
                '</div>';
        });
        html += '</div>';
        return html;
    }

    function renderTable(campaigns) {
        var sentOnly = campaigns.filter(function(c) { return c.status === 'sent'; });

        if (sentOnly.length === 0) {
            return '' +
                '<div class="section-header">' +
                    '<h2 class="section-header__title">Desempenho por Campanha</h2>' +
                '</div>' +
                '<div class="empty-state">' +
                    '<div class="empty-state__icon empty-state__icon--indigo">' +
                        '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14"/></svg>' +
                    '</div>' +
                    '<h3 class="empty-state__title">Ainda sem dados</h3>' +
                    '<p class="empty-state__desc">Envie campanhas para ver estatísticas detalhadas aqui.</p>' +
                    '<a href="#/campanhas" class="empty-state__btn">Criar Campanha</a>' +
                '</div>';
        }

        var html = '' +
            '<div class="section-header">' +
                '<h2 class="section-header__title">Desempenho por Campanha</h2>' +
            '</div>' +
            '<div class="ct-table-wrap">' +
                '<table class="ct-table">' +
                    '<thead>' +
                        '<tr>' +
                            '<th>Campanha</th>' +
                            '<th>Enviados</th>' +
                            '<th>Aberturas</th>' +
                            '<th>Taxa Abertura</th>' +
                            '<th>Cliques</th>' +
                            '<th>Taxa Clique</th>' +
                            '<th>Data</th>' +
                        '</tr>' +
                    '</thead>' +
                    '<tbody>';

        sentOnly.forEach(function(c) {
            var sent = c.total_sent || 0;
            html += '' +
                '<tr>' +
                    '<td><strong>' + esc(c.nome || c.assunto || 'Sem nome') + '</strong></td>' +
                    '<td>' + sent + '</td>' +
                    '<td>' + (c.total_opened || 0) + '</td>' +
                    '<td>' + pct(c.total_opened || 0, sent) + '</td>' +
                    '<td>' + (c.total_clicked || 0) + '</td>' +
                    '<td>' + pct(c.total_clicked || 0, sent) + '</td>' +
                    '<td>' + formatDate(c.created_at) + '</td>' +
                '</tr>';
        });

        html += '</tbody></table></div>';
        return html;
    }

    function renderAllCampaignsSummary(campaigns) {
        if (campaigns.length === 0) return '';

        var byStatus = {};
        campaigns.forEach(function(c) {
            byStatus[c.status] = (byStatus[c.status] || 0) + 1;
        });

        var html = '' +
            '<div class="section-header">' +
                '<h2 class="section-header__title">Resumo de Estado</h2>' +
            '</div>' +
            '<div class="kpi-grid">' +
                '<div class="kpi-card">' +
                    '<div class="kpi-card__top">' +
                        '<div class="kpi-card__icon kpi-card__icon--gray"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg></div>' +
                        '<div class="kpi-card__label">Rascunhos</div>' +
                    '</div>' +
                    '<div class="kpi-card__value">' + (byStatus.draft || 0) + '</div>' +
                '</div>' +
                '<div class="kpi-card">' +
                    '<div class="kpi-card__top">' +
                        '<div class="kpi-card__icon kpi-card__icon--amber"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>' +
                        '<div class="kpi-card__label">Agendadas</div>' +
                    '</div>' +
                    '<div class="kpi-card__value">' + (byStatus.scheduled || 0) + '</div>' +
                '</div>' +
                '<div class="kpi-card">' +
                    '<div class="kpi-card__top">' +
                        '<div class="kpi-card__icon kpi-card__icon--green"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg></div>' +
                        '<div class="kpi-card__label">Enviadas</div>' +
                    '</div>' +
                    '<div class="kpi-card__value">' + (byStatus.sent || 0) + '</div>' +
                '</div>' +
                '<div class="kpi-card">' +
                    '<div class="kpi-card__top">' +
                        '<div class="kpi-card__icon kpi-card__icon--rose"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg></div>' +
                        '<div class="kpi-card__label">Canceladas / Falhadas</div>' +
                    '</div>' +
                    '<div class="kpi-card__value">' + ((byStatus.cancelled || 0) + (byStatus.failed || 0)) + '</div>' +
                '</div>' +
            '</div>';

        return html;
    }

    // ========================================
    // Render
    // ========================================

    async function render(container) {
        currentContainer = container;
        init();

        user = await MailFlowAuth.getUser();
        if (!user) return;

        container.innerHTML = '<div style="text-align:center;padding:60px;color:#9ca3af;font-size:0.875rem;">A carregar analytics...</div>';

        var data = await fetchAnalytics(user.id);
        var html = '';

        html += renderKPIs(data.totals);
        html += renderAllCampaignsSummary(data.campaigns);
        html += renderTable(data.campaigns);

        container.innerHTML = html;
    }

    return { render: render };
})();
