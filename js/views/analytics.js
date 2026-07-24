/**
 * MailFlow Pro — View: Analytics (Premium)
 *
 * Dashboard de analytics avançado com gráficos canvas,
 * filtros temporais, KPIs avançados, tabela ordenável
 * com pesquisa e paginação, e loading skeleton.
 */

var AnalyticsView = (function() {
    'use strict';

    // ========================================
    // State
    // ========================================
    var sb = null;
    var user = null;
    var currentContainer = null;
    var allCampaigns = [];
    var filteredCampaigns = [];
    var filter = '30d';
    var customFrom = '';
    var customTo = '';
    var tableSort = { key: 'created_at', dir: 'desc' };
    var tableSearch = '';
    var tablePage = 1;
    var tableLimit = 10;

    function init() { sb = window.supabaseClient; }

    // ========================================
    // Helpers
    // ========================================
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

    function formatShortDate(dateStr) {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
    }

    function formatPct(num, den) {
        if (!den) return '0%';
        return Math.round((num / den) * 10000) / 100 + '%';
    }

    function formatNum(n) {
        if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
        return String(n);
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

    function svgIcon(name) {
        var icons = {
            sent: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>',
            opened: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>',
            clicked: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5"/>',
            openRate: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>',
            clickRate: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14"/>',
            campaign: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>',
            contacts: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>',
            trophy: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/>',
            trend: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>'
        };
        return '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24">' + (icons[name] || icons.sent) + '</svg>';
    }

    // ========================================
    // Data
    // ========================================
    async function fetchAll(userId) {
        if (!sb) return [];
        try {
            var { data, error } = await sb
                .from('campaigns')
                .select('id, nome, assunto, status, total_recipients, total_sent, total_failed, total_opened, total_clicked, created_at')
                .eq('user_id', userId)
                .is('deleted_at', null)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error('[Analytics] Erro ao buscar dados:', err);
            return [];
        }
    }

    async function fetchContactsCount(userId) {
        if (!sb) return 0;
        try {
            var { count } = await sb.from('contacts').select('id', { count: 'exact', head: true }).eq('user_id', userId);
            return count || 0;
        } catch (e) { return 0; }
    }

    // ========================================
    // Filtering
    // ========================================
    function getFilterRange() {
        var now = new Date();
        var start;
        switch (filter) {
            case 'today':
                start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                break;
            case '7d':
                start = new Date(now); start.setDate(start.getDate() - 7);
                break;
            case '30d':
                start = new Date(now); start.setDate(start.getDate() - 30);
                break;
            case 'month':
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            case 'custom':
                if (customFrom) return { from: new Date(customFrom), to: customTo ? new Date(customTo + 'T23:59:59') : now };
                start = new Date(now); start.setDate(start.getDate() - 30);
                break;
            default:
                start = new Date(now); start.setDate(start.getDate() - 30);
        }
        return { from: start, to: now };
    }

    function applyFilter() {
        var range = getFilterRange();
        filteredCampaigns = allCampaigns.filter(function(c) {
            var d = new Date(c.created_at);
            return d >= range.from && d <= range.to;
        });
    }

    // ========================================
    // Analytics Computations
    // ========================================
    function computeTotals(campaigns) {
        var t = { sent: 0, opened: 0, clicked: 0, failed: 0, count: campaigns.length, contacts: 0 };
        campaigns.forEach(function(c) {
            t.sent += c.total_sent || 0;
            t.opened += c.total_opened || 0;
            t.clicked += c.total_clicked || 0;
            t.failed += c.total_failed || 0;
            t.contacts += c.total_recipients || 0;
        });
        t.openRate = formatPct(t.opened, t.sent);
        t.clickRate = formatPct(t.clicked, t.sent);
        return t;
    }

    function computeBestWorst(campaigns) {
        var sentOnly = campaigns.filter(function(c) { return c.status === 'sent' && (c.total_sent || 0) > 0; });
        if (sentOnly.length === 0) return { best: null, worst: null };

        var best = sentOnly[0], worst = sentOnly[0];
        var bestRate = 0, worstRate = 100;

        sentOnly.forEach(function(c) {
            var rate = ((c.total_opened || 0) / c.total_sent) * 100;
            if (rate >= bestRate) { bestRate = rate; best = c; }
            if (rate < worstRate) { worstRate = rate; worst = c; }
        });
        return { best: best, worst: worst, bestRate: bestRate, worstRate: worstRate };
    }

    function getDailyData(campaigns) {
        var map = {};
        campaigns.forEach(function(c) {
            var key = c.created_at ? c.created_at.split('T')[0] : 'unknown';
            if (!map[key]) map[key] = { date: key, sent: 0, opened: 0, clicked: 0 };
            map[key].sent += c.total_sent || 0;
            map[key].opened += c.total_opened || 0;
            map[key].clicked += c.total_clicked || 0;
        });
        var arr = Object.keys(map).sort().map(function(k) { return map[k]; });
        return arr;
    }

    // ========================================
    // Skeleton Loading
    // ========================================
    function renderSkeleton() {
        var skel = '<div class="an-skeleton-grid an-fade-in">';
        for (var i = 0; i < 6; i++) {
            skel += '<div class="an-skeleton-card"><div class="an-skeleton-bar an-skeleton-bar--sm"></div><div class="an-skeleton-bar an-skeleton-bar--lg"></div><div class="an-skeleton-bar an-skeleton-bar--md"></div></div>';
        }
        skel += '</div>';
        skel += '<div class="an-skeleton-chart an-skeleton-card an-fade-in" style="margin-bottom:32px;height:280px;"></div>';
        skel += '<div class="an-skeleton-table an-skeleton-card an-fade-in" style="height:300px;"></div>';
        return skel;
    }

    // ========================================
    // Filter Bar
    // ========================================
    function renderFilterBar() {
        var filters = [
            { key: 'today', label: 'Hoje' },
            { key: '7d', label: '7 dias' },
            { key: '30d', label: '30 dias' },
            { key: 'month', label: 'Este mês' },
            { key: 'custom', label: 'Personalizado' }
        ];

        var html = '<div class="an-filter-bar">';
        filters.forEach(function(f) {
            var active = filter === f.key ? ' an-filter-btn--active' : '';
            html += '<button class="an-filter-btn' + active + '" data-filter="' + f.key + '">' + f.label + '</button>';
        });
        html += '</div>';

        if (filter === 'custom') {
            html += '<div class="an-custom-range">' +
                '<div class="tl-field" style="margin-bottom:0;">' +
                    '<label class="tl-label" style="font-size:0.75rem;">De</label>' +
                    '<input class="tl-input" type="date" id="an-from" value="' + esc(customFrom) + '" style="padding:8px 12px;font-size:0.8125rem;">' +
                '</div>' +
                '<div class="tl-field" style="margin-bottom:0;">' +
                    '<label class="tl-label" style="font-size:0.75rem;">Até</label>' +
                    '<input class="tl-input" type="date" id="an-to" value="' + esc(customTo) + '" style="padding:8px 12px;font-size:0.8125rem;">' +
                '</div>' +
                '<button class="tl-btn tl-btn--primary tl-btn--sm" id="an-apply-custom" style="align-self:flex-end;">Aplicar</button>' +
            '</div>';
        }

        return html;
    }

    // ========================================
    // KPI Cards
    // ========================================
    function renderKPICards(totals, bw) {
        var cards = [
            { label: 'Emails Enviados', value: formatNum(totals.sent), icon: 'sent', color: 'indigo' },
            { label: 'Taxa de Abertura', value: totals.openRate, icon: 'openRate', color: 'green' },
            { label: 'Taxa de Clique', value: totals.clickRate, icon: 'clickRate', color: 'amber' },
            { label: 'Média Aberturas', value: totals.count > 0 ? Math.round(totals.opened / totals.count) : 0, icon: 'opened', color: 'rose' },
            { label: 'Média Cliques', value: totals.count > 0 ? Math.round(totals.clicked / totals.count) : 0, icon: 'clicked', color: 'indigo' },
            { label: 'Campanhas', value: totals.count, icon: 'campaign', color: 'green' }
        ];

        var html = '<div class="an-kpi-grid">';
        cards.forEach(function(k) {
            html += '' +
                '<div class="an-kpi an-fade-in">' +
                    '<div class="an-kpi__top">' +
                        '<div class="an-kpi__icon an-kpi__icon--' + k.color + '">' + svgIcon(k.icon) + '</div>' +
                    '</div>' +
                    '<div class="an-kpi__value">' + k.value + '</div>' +
                    '<div class="an-kpi__label">' + k.label + '</div>' +
                '</div>';
        });
        html += '</div>';

        return html;
    }

    // ========================================
    // Advanced Stats (Best / Worst / Contacts)
    // ========================================
    function renderAdvancedStats(bw, totalContacts) {
        var html = '<div class="an-kpi-grid an-kpi-grid--3">';

        html += '<div class="an-kpi an-kpi--featured an-fade-in">' +
            '<div class="an-kpi__top"><div class="an-kpi__icon an-kpi__icon--green">' + svgIcon('trophy') + '</div></div>' +
            '<div class="an-kpi__value" style="font-size:1.25rem;">' +
                (bw.best ? esc(bw.best.nome || bw.best.assunto || '—') : '—') +
            '</div>' +
            '<div class="an-kpi__label">Melhor Campanha (' + (bw.best ? Math.round(bw.bestRate) + '% abertura' : '—') + ')</div>' +
        '</div>';

        html += '<div class="an-kpi an-kpi--featured an-fade-in">' +
            '<div class="an-kpi__top"><div class="an-kpi__icon an-kpi__icon--rose">' + svgIcon('trend') + '</div></div>' +
            '<div class="an-kpi__value" style="font-size:1.25rem;">' +
                (bw.worst ? esc(bw.worst.nome || bw.worst.assunto || '—') : '—') +
            '</div>' +
            '<div class="an-kpi__label">Pior Campanha (' + (bw.worst ? Math.round(bw.worstRate) + '% abertura' : '—') + ')</div>' +
        '</div>';

        html += '<div class="an-kpi an-kpi--featured an-fade-in">' +
            '<div class="an-kpi__top"><div class="an-kpi__icon an-kpi__icon--amber">' + svgIcon('contacts') + '</div></div>' +
            '<div class="an-kpi__value">' + formatNum(totalContacts) + '</div>' +
            '<div class="an-kpi__label">Total de Contactos</div>' +
        '</div>';

        html += '</div>';
        return html;
    }

    // ========================================
    // Chart (Canvas)
    // ========================================
    function renderChartSection(dailyData) {
        var html = '<div class="an-chart-wrapper an-fade-in">' +
            '<div class="section-header">' +
                '<h2 class="section-header__title">Evolução Diária</h2>' +
                '<div class="an-chart-legend">' +
                    '<span class="an-legend-item"><span class="an-legend-dot" style="background:#6366f1;"></span>Enviados</span>' +
                    '<span class="an-legend-item"><span class="an-legend-dot" style="background:#10b981;"></span>Aberturas</span>' +
                    '<span class="an-legend-item"><span class="an-legend-dot" style="background:#f59e0b;"></span>Cliques</span>' +
                '</div>' +
            '</div>' +
            '<div class="an-chart-container">' +
                '<canvas id="an-chart" width="800" height="260"></canvas>' +
            '</div>' +
        '</div>';
        return html;
    }

    function drawChart(canvas, dailyData) {
        if (!canvas || !dailyData || dailyData.length === 0) return;
        var ctx = canvas.getContext('2d');
        var dpr = window.devicePixelRatio || 1;
        var rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = 260 * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = '260px';
        ctx.scale(dpr, dpr);

        var W = rect.width, H = 260;
        var pad = { top: 20, right: 20, bottom: 40, left: 50 };
        var gW = W - pad.left - pad.right;
        var gH = H - pad.top - pad.bottom;

        var maxVal = 1;
        dailyData.forEach(function(d) {
            if (d.sent > maxVal) maxVal = d.sent;
            if (d.opened > maxVal) maxVal = d.opened;
            if (d.clicked > maxVal) maxVal = d.clicked;
        });
        maxVal = Math.ceil(maxVal * 1.15) || 1;

        ctx.clearRect(0, 0, W, H);

        // Grid lines
        ctx.strokeStyle = '#f1f5f9';
        ctx.lineWidth = 1;
        var gridLines = 5;
        for (var i = 0; i <= gridLines; i++) {
            var y = pad.top + (gH / gridLines) * i;
            ctx.beginPath();
            ctx.moveTo(pad.left, y);
            ctx.lineTo(W - pad.right, y);
            ctx.stroke();

            ctx.fillStyle = '#94a3b8';
            ctx.font = '11px Inter, system-ui, sans-serif';
            ctx.textAlign = 'right';
            var val = Math.round(maxVal - (maxVal / gridLines) * i);
            ctx.fillText(formatNum(val), pad.left - 10, y + 4);
        }

        // X labels
        ctx.fillStyle = '#94a3b8';
        ctx.font = '11px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        var step = Math.max(1, Math.ceil(dailyData.length / 10));
        for (var j = 0; j < dailyData.length; j += step) {
            var xPos = pad.left + (gW / (dailyData.length - 1 || 1)) * j;
            ctx.fillText(formatShortDate(dailyData[j].date), xPos, H - 10);
        }

        function drawLine(data, key, color, alpha) {
            if (data.length === 0) return;

            // Area fill
            ctx.beginPath();
            ctx.moveTo(pad.left, pad.top + gH);
            data.forEach(function(d, idx) {
                var x = pad.left + (gW / (data.length - 1 || 1)) * idx;
                var y = pad.top + gH - ((d[key] / maxVal) * gH);
                if (idx === 0) ctx.lineTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.lineTo(pad.left + gW, pad.top + gH);
            ctx.closePath();
            ctx.fillStyle = color.replace(')', ', ' + alpha + ')').replace('rgb', 'rgba');
            ctx.fill();

            // Line
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2.5;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            data.forEach(function(d, idx) {
                var x = pad.left + (gW / (data.length - 1 || 1)) * idx;
                var y = pad.top + gH - ((d[key] / maxVal) * gH);
                if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.stroke();

            // Dots
            data.forEach(function(d, idx) {
                var x = pad.left + (gW / (data.length - 1 || 1)) * idx;
                var y = pad.top + gH - ((d[key] / maxVal) * gH);
                ctx.beginPath();
                ctx.arc(x, y, 3, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            });
        }

        drawLine(dailyData, 'sent', 'rgb(99, 102, 241)', 0.06);
        drawLine(dailyData, 'opened', 'rgb(16, 185, 129)', 0.05);
        drawLine(dailyData, 'clicked', 'rgb(245, 158, 11)', 0.04);
    }

    // ========================================
    // Table (sortable, searchable, paginated)
    // ========================================
    function getTableData() {
        var data = filteredCampaigns.filter(function(c) { return c.status === 'sent'; });

        if (tableSearch) {
            var q = tableSearch.toLowerCase();
            data = data.filter(function(c) {
                return (c.nome || '').toLowerCase().indexOf(q) !== -1 ||
                       (c.assunto || '').toLowerCase().indexOf(q) !== -1;
            });
        }

        data.sort(function(a, b) {
            var va = a[tableSort.key] || 0;
            var vb = b[tableSort.key] || 0;
            if (tableSort.key === 'nome') {
                va = (va || '').toLowerCase();
                vb = (vb || '').toLowerCase();
                return tableSort.dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
            }
            if (tableSort.key === 'openRate') {
                va = a.total_sent ? (a.total_opened || 0) / a.total_sent : 0;
                vb = b.total_sent ? (b.total_opened || 0) / b.total_sent : 0;
            } else if (tableSort.key === 'clickRate') {
                va = a.total_sent ? (a.total_clicked || 0) / a.total_sent : 0;
                vb = b.total_sent ? (b.total_clicked || 0) / b.total_sent : 0;
            }
            return tableSort.dir === 'asc' ? (va - vb) : (vb - va);
        });

        return data;
    }

    function renderTableSection() {
        var data = getTableData();
        var totalPages = Math.max(1, Math.ceil(data.length / tableLimit));
        if (tablePage > totalPages) tablePage = totalPages;
        var start = (tablePage - 1) * tableLimit;
        var pageData = data.slice(start, start + tableLimit);

        var html = '<div class="an-table-section an-fade-in">' +
            '<div class="section-header">' +
                '<h2 class="section-header__title">Top Campanhas</h2>' +
                '<div class="an-table-search">' +
                    '<svg class="an-table-search__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>' +
                    '<input class="tl-input an-table-search__input" type="text" id="an-table-search" placeholder="Pesquisar campanha..." value="' + esc(tableSearch) + '">' +
                '</div>' +
            '</div>';

        if (data.length === 0) {
            html += '<div class="empty-state">' +
                '<div class="empty-state__icon empty-state__icon--indigo">' + svgIcon('campaign') + '</div>' +
                '<h3 class="empty-state__title">Nenhuma campanha enviada</h3>' +
                '<p class="empty-state__desc">Quando enviar campanhas, os dados de desempenho aparecerão aqui.</p>' +
                '<a href="#/campanhas" class="empty-state__btn">Criar Campanha</a>' +
            '</div>';
        } else {
            html += '<div class="ct-table-wrap"><table class="ct-table"><thead><tr>';
            var cols = [
                { key: 'nome', label: 'Campanha' },
                { key: 'total_sent', label: 'Enviados' },
                { key: 'total_opened', label: 'Aberturas' },
                { key: 'openRate', label: 'Taxa Abertura' },
                { key: 'total_clicked', label: 'Cliques' },
                { key: 'clickRate', label: 'Taxa Clique' },
                { key: 'created_at', label: 'Data' }
            ];

            cols.forEach(function(col) {
                var arrow = '';
                if (tableSort.key === col.key) {
                    arrow = tableSort.dir === 'asc' ? ' ▲' : ' ▼';
                }
                html += '<th class="an-sortable" data-sort="' + col.key + '">' + col.label + arrow + '</th>';
            });

            html += '</tr></thead><tbody>';
            pageData.forEach(function(c) {
                var sent = c.total_sent || 0;
                html += '<tr>' +
                    '<td><strong>' + esc(c.nome || c.assunto || 'Sem nome') + '</strong></td>' +
                    '<td>' + sent + '</td>' +
                    '<td>' + (c.total_opened || 0) + '</td>' +
                    '<td>' + formatPct(c.total_opened || 0, sent) + '</td>' +
                    '<td>' + (c.total_clicked || 0) + '</td>' +
                    '<td>' + formatPct(c.total_clicked || 0, sent) + '</td>' +
                    '<td>' + formatDate(c.created_at) + '</td>' +
                '</tr>';
            });
            html += '</tbody></table></div>';

            // Pagination
            html += '<div class="tl-pagination">' +
                '<span class="tl-pagination__info">A mostrar ' + (start + 1) + '–' + Math.min(start + tableLimit, data.length) + ' de ' + data.length + '</span>' +
                '<div class="tl-pagination__btns">' +
                    '<button class="tl-btn tl-btn--ghost tl-btn--sm" id="an-prev" ' + (tablePage <= 1 ? 'disabled' : '') + '>Anterior</button>' +
                    '<button class="tl-btn tl-btn--ghost tl-btn--sm" id="an-next" ' + (tablePage >= totalPages ? 'disabled' : '') + '>Seguinte</button>' +
                '</div>' +
            '</div>';
        }

        html += '</div>';
        return html;
    }

    // ========================================
    // Empty State
    // ========================================
    function renderEmptyState() {
        return '<div class="empty-state">' +
            '<div class="empty-state__icon empty-state__icon--indigo">' + svgIcon('sent') + '</div>' +
            '<h3 class="empty-state__title">Sem dados para este período</h3>' +
            '<p class="empty-state__desc">Tente selecionar um intervalo de tempo diferente ou aguarde até ter campanhas enviadas.</p>' +
            '<a href="#/campanhas" class="empty-state__btn">Criar Campanha</a>' +
        '</div>';
    }

    // ========================================
    // Events
    // ========================================
    function bindEvents() {
        // Filter buttons
        document.querySelectorAll('.an-filter-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                filter = this.getAttribute('data-filter');
                tablePage = 1;
                refreshView();
            });
        });

        // Custom date apply
        var applyBtn = document.getElementById('an-apply-custom');
        if (applyBtn) {
            applyBtn.addEventListener('click', function() {
                customFrom = document.getElementById('an-from').value;
                customTo = document.getElementById('an-to').value;
                tablePage = 1;
                refreshView();
            });
        }

        // Table search
        var searchInput = document.getElementById('an-table-search');
        if (searchInput) {
            var debounce;
            searchInput.addEventListener('input', function() {
                clearTimeout(debounce);
                var val = this.value;
                debounce = setTimeout(function() {
                    tableSearch = val;
                    tablePage = 1;
                    refreshTable();
                }, 300);
            });
        }

        // Table sort
        document.querySelectorAll('.an-sortable').forEach(function(th) {
            th.addEventListener('click', function() {
                var key = this.getAttribute('data-sort');
                if (tableSort.key === key) {
                    tableSort.dir = tableSort.dir === 'asc' ? 'desc' : 'asc';
                } else {
                    tableSort.key = key;
                    tableSort.dir = key === 'created_at' ? 'desc' : 'desc';
                }
                tablePage = 1;
                refreshTable();
            });
        });

        // Pagination
        var prevBtn = document.getElementById('an-prev');
        var nextBtn = document.getElementById('an-next');
        if (prevBtn) prevBtn.addEventListener('click', function() { tablePage = Math.max(1, tablePage - 1); refreshTable(); });
        if (nextBtn) nextBtn.addEventListener('click', function() { tablePage++; refreshTable(); });
    }

    function refreshTable() {
        var tableSection = document.querySelector('.an-table-section');
        if (!tableSection) return;
        var tmp = document.createElement('div');
        tmp.innerHTML = renderTableSection();
        var newSection = tmp.firstElementChild;
        tableSection.parentNode.replaceChild(newSection, tableSection);
        bindTableEvents();
    }

    function bindTableEvents() {
        var searchInput = document.getElementById('an-table-search');
        if (searchInput) {
            var debounce;
            searchInput.addEventListener('input', function() {
                clearTimeout(debounce);
                var val = this.value;
                debounce = setTimeout(function() {
                    tableSearch = val;
                    tablePage = 1;
                    refreshTable();
                }, 300);
            });
        }
        document.querySelectorAll('.an-sortable').forEach(function(th) {
            th.addEventListener('click', function() {
                var key = this.getAttribute('data-sort');
                if (tableSort.key === key) {
                    tableSort.dir = tableSort.dir === 'asc' ? 'desc' : 'asc';
                } else {
                    tableSort.key = key;
                    tableSort.dir = 'desc';
                }
                tablePage = 1;
                refreshTable();
            });
        });
        var prevBtn = document.getElementById('an-prev');
        var nextBtn = document.getElementById('an-next');
        if (prevBtn) prevBtn.addEventListener('click', function() { tablePage = Math.max(1, tablePage - 1); refreshTable(); });
        if (nextBtn) nextBtn.addEventListener('click', function() { tablePage++; refreshTable(); });
    }

    // ========================================
    // Full Refresh
    // ========================================
    function refreshView() {
        applyFilter();
        var totals = computeTotals(filteredCampaigns);
        var bw = computeBestWorst(filteredCampaigns);
        var dailyData = getDailyData(filteredCampaigns);

        var html = renderFilterBar();
        html += renderKPICards(totals, bw);
        html += renderAdvancedStats(bw, 0);
        html += renderChartSection(dailyData);
        html += renderTableSection();

        currentContainer.innerHTML = html;
        bindEvents();

        // Draw chart after DOM render
        requestAnimationFrame(function() {
            var canvas = document.getElementById('an-chart');
            if (canvas) drawChart(canvas, dailyData);
        });

        // Redraw chart on resize
        var resizeTimer;
        window.addEventListener('resize', function() {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function() {
                var canvas = document.getElementById('an-chart');
                if (canvas) drawChart(canvas, dailyData);
            }, 200);
        });
    }

    // ========================================
    // Render Entry
    // ========================================
    async function render(container) {
        currentContainer = container;
        init();

        user = await MailFlowAuth.getUser();
        if (!user) return;

        // Show skeleton
        container.innerHTML = renderSkeleton();

        // Fetch data in parallel
        var results = await Promise.all([fetchAll(user.id), fetchContactsCount(user.id)]);
        allCampaigns = results[0];
        var totalContacts = results[1];

        applyFilter();
        var totals = computeTotals(filteredCampaigns);
        var bw = computeBestWorst(filteredCampaigns);
        var dailyData = getDailyData(filteredCampaigns);

        var html = renderFilterBar();
        html += renderKPICards(totals, bw);

        // Update contacts count in advanced stats
        html += renderAdvancedStats(bw, totalContacts);

        if (filteredCampaigns.length === 0) {
            html += renderEmptyState();
        } else {
            html += renderChartSection(dailyData);
            html += renderTableSection();
        }

        container.innerHTML = html;
        bindEvents();

        // Draw chart
        requestAnimationFrame(function() {
            var canvas = document.getElementById('an-chart');
            if (canvas) drawChart(canvas, dailyData);
        });

        // Resize handler
        var resizeTimer;
        window.addEventListener('resize', function() {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function() {
                var canvas = document.getElementById('an-chart');
                if (canvas) drawChart(canvas, getDailyData(filteredCampaigns));
            }, 200);
        });
    }

    return { render: render };
})();
