var OverviewView = (function() {
    'use strict';

    var sb = null;
    var user = null;
    var currentContainer = null;
    var resizeHandler = null;

    function init() { sb = window.supabaseClient; }

    function esc(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function formatNum(n) {
        if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
        return String(n);
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function formatShortDate(dateStr) {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
    }

    function formatPct(num, den) {
        if (!den) return '0%';
        return Math.round((num / den) * 100) + '%';
    }

    function timeAgo(dateStr) {
        if (!dateStr) return '';
        var now = new Date();
        var d = new Date(dateStr);
        var diff = Math.floor((now - d) / 1000);
        if (diff < 60) return 'agora';
        if (diff < 3600) return Math.floor(diff / 60) + 'm';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h';
        if (diff < 2592000) return Math.floor(diff / 86400) + 'd';
        return formatDate(dateStr);
    }

    function svgIcon(name) {
        var icons = {
            users: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>',
            campaign: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>',
            sent: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>',
            open: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>',
            click: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5"/>',
            contact: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>',
            automation: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>',
            clock: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>',
            activity: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>'
        };
        return '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24">' + (icons[name] || icons.activity) + '</svg>';
    }

    function statusBadge(status) {
        var map = {
            draft: 'dp-badge--gray', scheduled: 'dp-badge--blue',
            sending: 'dp-badge--yellow', sent: 'dp-badge--green',
            paused: 'dp-badge--orange', cancelled: 'dp-badge--red', failed: 'dp-badge--red'
        };
        var labels = {
            draft: 'Rascunho', scheduled: 'Agendada', sending: 'A enviar',
            sent: 'Enviada', paused: 'Pausada', cancelled: 'Cancelada', failed: 'Falhou'
        };
        return '<span class="dp-badge ' + (map[status] || 'dp-badge--gray') + '">' + (labels[status] || esc(status)) + '</span>';
    }

    function updateBadge(id, count) {
        var el = document.getElementById(id);
        if (el) el.textContent = count;
    }

    // ========================================
    // Data
    // ========================================

    async function fetchDashboardData(userId) {
        if (!sb) return null;
        try {
            var results = await Promise.all([
                sb.from('campaigns')
                    .select('id, nome, assunto, status, total_recipients, total_sent, total_opened, total_clicked, total_failed, created_at')
                    .eq('user_id', userId).is('deleted_at', null).order('created_at', { ascending: false }),
                sb.from('contacts').select('id', { count: 'exact', head: true }).eq('user_id', userId),
                sb.from('contacts').select('id, nome, email, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(5),
                sb.from('automations').select('id, name, trigger_type, trigger_config, status, created_at').eq('user_id', userId).order('created_at', { ascending: false }),
                sb.from('campaigns')
                    .select('id, nome, status, total_recipients, total_sent, created_at')
                    .eq('user_id', userId).is('deleted_at', null).in('status', ['sent']).order('created_at', { ascending: false }).limit(5),
                sb.from('templates').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('deleted_at', null)
            ]);

            return {
                campaigns: results[0].data || [],
                contactsCount: results[1].count || 0,
                recentContacts: results[2].data || [],
                automations: results[3].data || [],
                recentSends: results[4].data || [],
                templatesCount: results[5].count || 0
            };
        } catch (err) {
            console.error('[Overview] Erro ao buscar dados:', err);
            return null;
        }
    }

    function computeKPIs(data) {
        if (!data) return { contacts: 0, campaigns: 0, emailsSent: 0, openRate: 0, clickRate: 0 };
        var sent = 0, opened = 0, clicked = 0;
        data.campaigns.forEach(function(c) {
            sent += c.total_sent || 0;
            opened += c.total_opened || 0;
            clicked += c.total_clicked || 0;
        });
        return {
            contacts: data.contactsCount,
            campaigns: data.campaigns.length,
            templates: data.templatesCount,
            emailsSent: sent,
            openRate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
            clickRate: sent > 0 ? Math.round((clicked / sent) * 100) : 0
        };
    }

    function generateDailyData(campaigns) {
        var map = {};
        var now = new Date();
        for (var i = 29; i >= 0; i--) {
            var d = new Date(now);
            d.setDate(d.getDate() - i);
            var key = d.toISOString().split('T')[0];
            map[key] = { date: key, sent: 0, opened: 0, clicked: 0 };
        }
        campaigns.forEach(function(c) {
            if (!c.created_at) return;
            var key = c.created_at.split('T')[0];
            if (map[key]) {
                map[key].sent += c.total_sent || 0;
                map[key].opened += c.total_opened || 0;
                map[key].clicked += c.total_clicked || 0;
            }
        });
        return Object.keys(map).sort().map(function(k) { return map[k]; });
    }

    function getActiveCampaigns(campaigns) {
        return campaigns.filter(function(c) {
            return c.status === 'sending' || c.status === 'paused';
        });
    }

    // ========================================
    // Skeleton
    // ========================================

    function renderSkeleton() {
        return '<div class="dp-skeleton">' +
            '<div class="dp-skeleton-grid">' +
                '<div class="dp-skeleton-card"></div>'.repeat(5) +
            '</div>' +
            '<div class="dp-skeleton-chart"></div>' +
            '<div class="dp-skeleton-grid dp-skeleton-grid--2">' +
                '<div class="dp-skeleton-card dp-skeleton-card--tall"></div>'.repeat(2) +
            '</div>' +
        '</div>';
    }

    // ========================================
    // KPI Cards
    // ========================================

    function renderKPIs(kpis) {
        var cards = [
            { label: 'Contactos', value: formatNum(kpis.contacts), icon: 'users', color: 'indigo' },
            { label: 'Campanhas', value: formatNum(kpis.campaigns), icon: 'campaign', color: 'green' },
            { label: 'Emails Enviados', value: formatNum(kpis.emailsSent), icon: 'sent', color: 'amber' },
            { label: 'Taxa Abertura', value: kpis.openRate + '%', icon: 'open', color: 'rose' },
            { label: 'Taxa Cliques', value: kpis.clickRate + '%', icon: 'click', color: 'purple' }
        ];

        var html = '<div class="dp-kpi-grid">';
        cards.forEach(function(k) {
            html += '' +
                '<div class="dp-kpi-card">' +
                    '<div class="dp-kpi-card__top">' +
                        '<div class="dp-kpi-card__icon dp-kpi-card__icon--' + k.color + '">' + svgIcon(k.icon) + '</div>' +
                    '</div>' +
                    '<div class="dp-kpi-card__value">' + k.value + '</div>' +
                    '<div class="dp-kpi-card__label">' + k.label + '</div>' +
                '</div>';
        });
        html += '</div>';
        return html;
    }

    // ========================================
    // Chart
    // ========================================

    function renderChart(dailyData) {
        var hasData = dailyData.some(function(d) { return d.sent > 0 || d.opened > 0 || d.clicked > 0; });
        if (!hasData) return '';

        var html = '<div class="section-header">' +
            '<h2 class="section-header__title">Evolução (Últimos 30 Dias)</h2>' +
            '<div class="dp-chart-legend">' +
                '<span class="dp-legend-item"><span class="dp-legend-dot" style="background:#6366f1;"></span>Enviados</span>' +
                '<span class="dp-legend-item"><span class="dp-legend-dot" style="background:#10b981;"></span>Aberturas</span>' +
                '<span class="dp-legend-item"><span class="dp-legend-dot" style="background:#f59e0b;"></span>Cliques</span>' +
            '</div>' +
        '</div>' +
        '<div class="dp-chart-wrapper">' +
            '<canvas id="dp-chart" width="800" height="220"></canvas>' +
        '</div>';
        return html;
    }

    function drawChart(canvas, dailyData) {
        if (!canvas || !dailyData || dailyData.length === 0) return;
        var ctx = canvas.getContext('2d');
        var dpr = window.devicePixelRatio || 1;
        var rect = canvas.parentElement.getBoundingClientRect();
        var W = Math.max(rect.width, 200);
        var H = 220;
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        ctx.scale(dpr, dpr);

        var pad = { top: 16, right: 16, bottom: 32, left: 44 };
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

        ctx.strokeStyle = '#f1f5f9';
        ctx.lineWidth = 1;
        var gridLines = 4;
        for (var i = 0; i <= gridLines; i++) {
            var y = pad.top + (gH / gridLines) * i;
            ctx.beginPath();
            ctx.moveTo(pad.left, y);
            ctx.lineTo(W - pad.right, y);
            ctx.stroke();
            ctx.fillStyle = '#94a3b8';
            ctx.font = '10px Inter, system-ui, sans-serif';
            ctx.textAlign = 'right';
            var val = Math.round(maxVal - (maxVal / gridLines) * i);
            ctx.fillText(formatNum(val), pad.left - 8, y + 3);
        }

        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        var step = Math.max(1, Math.ceil(dailyData.length / 8));
        for (var j = 0; j < dailyData.length; j += step) {
            var xPos = pad.left + (gW / (dailyData.length - 1 || 1)) * j;
            ctx.fillText(formatShortDate(dailyData[j].date), xPos, H - 6);
        }

        function drawSeries(data, key, color, alpha) {
            if (data.length === 0) return;
            ctx.beginPath();
            ctx.moveTo(pad.left, pad.top + gH);
            data.forEach(function(d, idx) {
                var x = pad.left + (gW / (data.length - 1 || 1)) * idx;
                var y = pad.top + gH - ((d[key] / maxVal) * gH);
                ctx.lineTo(x, y);
            });
            ctx.lineTo(pad.left + gW, pad.top + gH);
            ctx.closePath();
            ctx.fillStyle = color.replace(')', ', ' + alpha + ')').replace('rgb', 'rgba');
            ctx.fill();

            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            data.forEach(function(d, idx) {
                var x = pad.left + (gW / (data.length - 1 || 1)) * idx;
                var y = pad.top + gH - ((d[key] / maxVal) * gH);
                if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.stroke();

            data.forEach(function(d, idx) {
                var x = pad.left + (gW / (data.length - 1 || 1)) * idx;
                var y = pad.top + gH - ((d[key] / maxVal) * gH);
                ctx.beginPath();
                ctx.arc(x, y, 2.5, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            });
        }

        drawSeries(dailyData, 'sent', 'rgb(99, 102, 241)', 0.06);
        drawSeries(dailyData, 'opened', 'rgb(16, 185, 129)', 0.05);
        drawSeries(dailyData, 'clicked', 'rgb(245, 158, 11)', 0.04);
    }

    // ========================================
    // Recent Activity
    // ========================================

    function renderRecentActivity(data) {
        var html = '<div class="section-header"><h2 class="section-header__title">Atividade Recente</h2></div>';

        var totalItems = (data.recentContacts.length || 0) + (data.recentSends.length || 0);
        if (totalItems === 0) {
            html += '<div class="dp-card dp-card--empty">' +
                '<div class="dp-empty-icon">' + svgIcon('activity') + '</div>' +
                '<p class="dp-empty-text">Ainda não existe atividade. Comece por criar uma campanha.</p>' +
                '<a href="#/campanhas" class="dp-empty-btn">Criar Campanha</a>' +
            '</div>';
            return html;
        }

        html += '<div class="dp-activity-grid">';

        if (data.recentContacts.length > 0) {
            html += '<div class="dp-activity-group">' +
                '<div class="dp-activity-group__title">Últimos Contactos</div>';
            data.recentContacts.forEach(function(c) {
                html += '<div class="dp-activity-item">' +
                    '<div class="dp-activity-item__icon dp-activity-item__icon--indigo">' + svgIcon('contact') + '</div>' +
                    '<div class="dp-activity-item__info">' +
                        '<div class="dp-activity-item__title">' + esc(c.nome || c.email || 'Sem nome') + '</div>' +
                        '<div class="dp-activity-item__sub">' + esc(c.email || '') + '</div>' +
                    '</div>' +
                    '<div class="dp-activity-item__time">' + timeAgo(c.created_at) + '</div>' +
                '</div>';
            });
            html += '</div>';
        }

        if (data.recentSends.length > 0) {
            html += '<div class="dp-activity-group">' +
                '<div class="dp-activity-group__title">Últimos Envios</div>';
            data.recentSends.forEach(function(c) {
                html += '<div class="dp-activity-item">' +
                    '<div class="dp-activity-item__icon dp-activity-item__icon--green">' + svgIcon('sent') + '</div>' +
                    '<div class="dp-activity-item__info">' +
                        '<div class="dp-activity-item__title">' + esc(c.nome || c.assunto || 'Sem nome') + '</div>' +
                        '<div class="dp-activity-item__sub">' + (c.total_sent || 0) + ' enviados</div>' +
                    '</div>' +
                    '<div class="dp-activity-item__time">' + timeAgo(c.created_at) + '</div>' +
                '</div>';
            });
            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    // ========================================
    // Active Campaigns
    // ========================================

    function renderActiveCampaigns(active) {
        if (active.length === 0) return '';

        var html = '<div class="dp-section-card">' +
            '<div class="section-header" style="margin-bottom:16px;">' +
                '<h2 class="section-header__title">Campanhas em Execução</h2>' +
            '</div>';

        active.forEach(function(c) {
            var pct = c.total_recipients > 0 ? Math.round(((c.total_sent || 0) / c.total_recipients) * 100) : 0;
            html += '<div class="dp-campaign-progress">' +
                '<div class="dp-campaign-progress__header">' +
                    '<span class="dp-campaign-progress__name">' + esc(c.nome || c.assunto || 'Sem nome') + '</span>' +
                    statusBadge(c.status) +
                '</div>' +
                '<div class="dp-campaign-progress__bar-wrap">' +
                    '<div class="dp-campaign-progress__bar" style="width:' + pct + '%;"></div>' +
                '</div>' +
                '<div class="dp-campaign-progress__stats">' +
                    '<span>' + (c.total_sent || 0) + ' / ' + (c.total_recipients || 0) + ' enviados</span>' +
                    '<span>' + pct + '%</span>' +
                '</div>' +
            '</div>';
        });

        html += '</div>';
        return html;
    }

    // ========================================
    // Upcoming Automations
    // ========================================

    function renderAutomations(automations) {
        var active = automations.filter(function(a) { return a.status === 'active'; });
        if (active.length === 0) return '';

        var html = '<div class="dp-section-card">' +
            '<div class="section-header" style="margin-bottom:16px;">' +
                '<h2 class="section-header__title">Automações Ativas</h2>' +
            '</div>';

        active.forEach(function(a) {
            var triggerLabel = 'Automático';
            if (a.trigger_type === 'immediate') triggerLabel = 'Imediato';
            else if (a.trigger_type === 'scheduled') triggerLabel = 'Agendado';
            else if (a.trigger_type === 'contact_created') triggerLabel = 'Novo Contacto';

            var timeLeft = '';
            if (a.trigger_type === 'scheduled' && a.trigger_config) {
                try {
                    var cfg = typeof a.trigger_config === 'string' ? JSON.parse(a.trigger_config) : a.trigger_config;
                    if (cfg && cfg.scheduled_at) {
                        var diff = new Date(cfg.scheduled_at) - new Date();
                        if (diff > 0) {
                            var days = Math.floor(diff / 86400000);
                            var hours = Math.floor((diff % 86400000) / 3600000);
                            timeLeft = days + 'd ' + hours + 'h restante' + (days > 1 ? 's' : '');
                        } else {
                            timeLeft = 'Pendente';
                        }
                    }
                } catch(e) {}
            }

            html += '<div class="dp-automation-item">' +
                '<div class="dp-automation-item__icon">' + svgIcon('automation') + '</div>' +
                '<div class="dp-automation-item__info">' +
                    '<div class="dp-automation-item__name">' + esc(a.name || 'Sem nome') + '</div>' +
                    '<div class="dp-automation-item__trigger">' + triggerLabel + '</div>' +
                '</div>' +
                (timeLeft ? '<div class="dp-automation-item__time">' + svgIcon('clock') + '<span>' + timeLeft + '</span></div>' : '') +
            '</div>';
        });

        html += '</div>';
        return html;
    }

    // ========================================
    // Onboarding Checklist
    // ========================================

    function computeOnboardingSteps(data, kpis) {
        return [
            { label: 'Criar primeiro contacto', done: data.contactsCount > 0, href: '#/contactos' },
            { label: 'Criar primeira campanha', done: data.campaigns.length > 0, href: '#/campanhas' },
            { label: 'Enviar primeiro email', done: (kpis.emailsSent || 0) > 0, href: '#/campanhas' },
            { label: 'Criar primeira automação', done: data.automations.length > 0, href: '#/automacoes' }
        ];
    }

    function renderOnboardingChecklist(steps) {
        var done = steps.filter(function(s) { return s.done; }).length;
        var pct = (done / steps.length) * 100;

        var itemsHtml = '';
        steps.forEach(function(s) {
            var cls = 'onboarding__item' + (s.done ? ' onboarding__item--done' : '');
            var checkCls = 'onboarding__item-check' + (s.done ? ' onboarding__item-check--done' : '');
            itemsHtml += '' +
                '<a href="' + s.href + '" class="' + cls + '">' +
                    '<span class="' + checkCls + '">' +
                        '<svg width="12" height="12" fill="none" stroke="white" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>' +
                    '</span>' +
                    '<span class="onboarding__item-label">' + esc(s.label) + '</span>' +
                '</a>';
        });

        return '' +
            '<div class="onboarding" id="onboarding-checklist">' +
                '<div class="onboarding__title">Bem-vindo ao MailFlow Pro! 👋</div>' +
                '<div class="onboarding__desc">Vamos configurar a sua conta em menos de 5 minutos.</div>' +
                '<div class="onboarding__progress">' +
                    '<div class="onboarding__progress-bar">' +
                        '<div class="onboarding__progress-fill" style="width:' + pct + '%;"></div>' +
                    '</div>' +
                    '<span class="onboarding__progress-text">' + done + '/' + steps.length + ' concluído' + (done !== 1 ? 's' : '') + '</span>' +
                '</div>' +
                '<div class="onboarding__items">' + itemsHtml + '</div>' +
            '</div>';
    }

    function renderOnboardingCelebration() {
        return '' +
            '<div class="onboarding" id="onboarding-celebration">' +
                '<div class="onboarding__celebration">' +
                    '<div class="onboarding__celebration-icon">🎉</div>' +
                    '<div class="onboarding__celebration-title">Parabéns!</div>' +
                    '<div class="onboarding__celebration-desc">Já conhece as principais funcionalidades do MailFlow Pro.</div>' +
                    '<a href="#/" class="onboarding__celebration-btn">Explorar Dashboard</a>' +
                '</div>' +
            '</div>';
    }

    async function checkOnboardingStatus(userId) {
        if (!sb) return false;
        try {
            var { data } = await sb.from('profiles').select('onboarding_done').eq('id', userId).single();
            return data && data.onboarding_done === true;
        } catch(e) { return false; }
    }

    async function saveOnboardingDone(userId) {
        if (!sb) return;
        try {
            await sb.from('profiles').update({ onboarding_done: true }).eq('id', userId);
        } catch(e) { /* silent */ }
    }

    // ========================================
    // Render Entry
    // ========================================

    async function refetchOnboardingData(userId) {
        if (!sb) return null;
        try {
            var results = await Promise.all([
                sb.from('contacts').select('id', { count: 'exact', head: true }).eq('user_id', userId),
                sb.from('campaigns').select('id, total_sent').eq('user_id', userId).is('deleted_at', null),
                sb.from('automations').select('id').eq('user_id', userId)
            ]);
            var contactsCount = results[0].count || 0;
            var campaigns = results[1].data || [];
            var automations = results[2].data || [];
            var emailsSent = campaigns.reduce(function(sum, c) { return sum + (c.total_sent || 0); }, 0);
            return { contactsCount: contactsCount, campaignsCount: campaigns.length, emailsSent: emailsSent, automationsCount: automations.length };
        } catch(e) { return null; }
    }

    async function handleChecklistUpdate() {
        if (!user || !document.getElementById('onboarding-checklist')) return;
        var od = await refetchOnboardingData(user.id);
        if (!od) return;
        var steps = [
            { label: 'Criar primeiro contacto', done: od.contactsCount > 0, href: '#/contactos' },
            { label: 'Criar primeira campanha', done: od.campaignsCount > 0, href: '#/campanhas' },
            { label: 'Enviar primeiro email', done: od.emailsSent > 0, href: '#/campanhas' },
            { label: 'Criar primeira automação', done: od.automationsCount > 0, href: '#/automacoes' }
        ];
        var allDone = steps.every(function(s) { return s.done; });
        if (allDone) {
            var container = document.getElementById('onboarding-checklist');
            if (container) {
                container.outerHTML = renderOnboardingCelebration();
                saveOnboardingDone(user.id);
            }
            return;
        }
        var done = steps.filter(function(s) { return s.done; }).length;
        var pct = (done / steps.length) * 100;
        var fill = document.querySelector('.onboarding__progress-fill');
        var text = document.querySelector('.onboarding__progress-text');
        if (fill) fill.style.width = pct + '%';
        if (text) text.textContent = done + '/' + steps.length + ' concluído' + (done !== 1 ? 's' : '');
        steps.forEach(function(s, i) {
            var items = document.querySelectorAll('.onboarding__item');
            if (items[i]) {
                items[i].className = 'onboarding__item' + (s.done ? ' onboarding__item--done' : '');
                var check = items[i].querySelector('.onboarding__item-check');
                if (check) check.className = 'onboarding__item-check' + (s.done ? ' onboarding__item-check--done' : '');
            }
        });
    }

    async function render(container) {
        currentContainer = container;
        init();

        user = await MailFlowAuth.getUser();
        if (!user) return;

        container.innerHTML = renderSkeleton();

        var onboardingDone = await checkOnboardingStatus(user.id);

        var data = await fetchDashboardData(user.id);
        if (!data) {
            container.innerHTML = '<div class="empty-state"><div class="empty-state__icon empty-state__icon--indigo">' + svgIcon('activity') + '</div><h3 class="empty-state__title">Erro ao carregar dados</h3><p class="empty-state__desc">Tente recarregar a página.</p></div>';
            return;
        }

        var kpis = computeKPIs(data);
        updateBadge('badge-campanhas', kpis.campaigns);
        updateBadge('badge-contactos', kpis.contacts);
        updateBadge('badge-templates', kpis.templates);

        var html = '';

        if (!onboardingDone) {
            var steps = computeOnboardingSteps(data, kpis);
            var allDone = steps.every(function(s) { return s.done; });

            if (allDone) {
                html += renderOnboardingCelebration();
                saveOnboardingDone(user.id);
            } else {
                html += renderOnboardingChecklist(steps);
            }
        }

        html += renderKPIs(kpis);

        var dailyData = generateDailyData(data.campaigns);
        var activeCampaigns = getActiveCampaigns(data.campaigns);

        var chartHtml = renderChart(dailyData);
        if (chartHtml) html += '<div class="dp-chart-section">' + chartHtml + '</div>';

        html += '<div class="dp-bottom-grid">' +
            '<div class="dp-bottom-left">';
        html += renderRecentActivity(data);
        html += renderActiveCampaigns(activeCampaigns);
        html += '</div><div class="dp-bottom-right">';
        html += renderAutomations(data.automations);
        html += '</div></div>';

        container.innerHTML = html;

        window.removeEventListener('mailflow:checklist-update', handleChecklistUpdate);
        window.addEventListener('mailflow:checklist-update', handleChecklistUpdate);

        requestAnimationFrame(function() {
            var canvas = document.getElementById('dp-chart');
            if (canvas) drawChart(canvas, dailyData);
        });

        if (resizeHandler) window.removeEventListener('resize', resizeHandler);
        resizeHandler = function() {
            clearTimeout(resizeHandler._timer);
            resizeHandler._timer = setTimeout(function() {
                var canvas = document.getElementById('dp-chart');
                if (canvas) drawChart(canvas, dailyData);
            }, 200);
        };
        window.addEventListener('resize', resizeHandler);
    }

    return { render: render };
})();
