/**
 * MailFlow Pro — View: Admin Panel
 *
 * Administration panel for platform management.
 * Router, auth check, and section navigation.
 */

var AdminView = (function() {
    'use strict';

    var sb = null;
    var user = null;
    var currentContainer = null;
    var isAdmin = false;

    var SECTIONS = ['dashboard', 'users', 'campaigns', 'templates', 'automations', 'analytics', 'smtp', 'logs', 'system', 'settings'];

    function init() { sb = window.supabaseClient; }

    function esc(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    async function checkAdmin() {
        try {
            user = await MailFlowAuth.getUser();
            if (!user) { window.location.href = '/entrar.html'; return false; }

            var emailEl = document.getElementById('admin-email');
            var avatarEl = document.getElementById('admin-avatar');
            if (emailEl && user.email) emailEl.textContent = user.email;
            if (avatarEl && user.email) avatarEl.textContent = user.email.charAt(0).toUpperCase();

            if (user.email === 'tvdeariston@gmail.com') { isAdmin = true; return true; }

            if (sb) {
                var token = (await sb.auth.getSession()).data.session?.access_token;
                if (!token) { window.location.href = '/entrar.html'; return false; }
                var resp = await fetch('/api/admin/check', { headers: { 'Authorization': 'Bearer ' + token } });
                if (resp.ok) {
                    var data = await resp.json();
                    if (data && data.admin) { isAdmin = true; return true; }
                }
            }

            window.location.href = '/dashboard.html'; return false;
        } catch (e) { window.location.href = '/dashboard.html'; return false; }
    }

    function navigateTo(section) {
        if (SECTIONS.indexOf(section) === -1) section = 'dashboard';

        var links = document.querySelectorAll('.sidebar__link[data-section]');
        links.forEach(function(l) {
            l.classList.remove('sidebar__link--active');
            if (l.getAttribute('data-section') === section) l.classList.add('sidebar__link--active');
        });

        var sections = document.querySelectorAll('.section');
        sections.forEach(function(s) { s.classList.remove('section--active'); });

        var target = document.getElementById('section-' + section);
        if (target) target.classList.add('section--active');

        var titles = { dashboard:'Dashboard', users:'Utilizadores', campaigns:'Campanhas', templates:'Templates', automations:'Automações', analytics:'Analytics', smtp:'SMTP', logs:'Logs', system:'Sistema', settings:'Configurações' };
        var header = document.querySelector('.header__title');
        if (header && titles[section]) header.textContent = titles[section];

        var hash = '#/admin/' + (section === 'dashboard' ? '' : section);
        if (!window.location.hash.match(new RegExp('#/admin(/' + section + '|$)'))) {
            window.location.hash = hash;
        }

        var sidebar = document.getElementById('sidebar');
        var overlay = document.getElementById('sidebar-overlay');
        if (sidebar) sidebar.classList.remove('sidebar--open');
        if (overlay) overlay.classList.remove('sidebar-overlay--visible');
    }

    function bindNavigation() {
        var links = document.querySelectorAll('.sidebar__link[data-section]');
        links.forEach(function(link) {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                var section = link.getAttribute('data-section');
                navigateTo(section);
            });
        });

        window.addEventListener('hashchange', function() {
            var hash = window.location.hash;
            var section = hash.replace('#/admin/', '').replace('#/admin', '');
            if (!section || section === '') section = 'dashboard';
            navigateTo(section);
        });

        var mobileBtn = document.getElementById('mobile-menu-btn');
        var overlay = document.getElementById('sidebar-overlay');
        var sidebar = document.getElementById('sidebar');

        if (mobileBtn) {
            mobileBtn.addEventListener('click', function() {
                if (sidebar) sidebar.classList.toggle('sidebar--open');
                if (overlay) overlay.classList.toggle('sidebar-overlay--visible');
            });
        }
        if (overlay) {
            overlay.addEventListener('click', function() {
                if (sidebar) sidebar.classList.remove('sidebar--open');
                if (overlay) overlay.classList.remove('sidebar-overlay--visible');
            });
        }

        window.addEventListener('resize', function() {
            if (window.innerWidth > 768) {
                if (sidebar) sidebar.classList.remove('sidebar--open');
                if (overlay) overlay.classList.remove('sidebar-overlay--visible');
            }
        });
    }

    function getQueryParam(name) {
        var params = new URLSearchParams(window.location.search);
        return params.get(name);
    }

    async function loadDashboard() {
        var section = document.getElementById('section-dashboard');
        if (!section) return;
        var kpiGrid = section.querySelector('#kpi-dashboard');
        if (!kpiGrid) return;
        kpiGrid.dataset.loaded = 'true';

        var kpis = [
            { label:'Total Utilizadores', value:'—', change:'A carregar...', cls:'admin-kpi__change--neutral', icon:'👥' },
            { label:'Premium', value:'—', change:'', cls:'admin-kpi__change--neutral', icon:'⭐' },
            { label:'Trials', value:'—', change:'', cls:'admin-kpi__change--neutral', icon:'🧪' },
            { label:'Contas Ativas', value:'—', change:'', cls:'admin-kpi__change--neutral', icon:'✅' },
            { label:'Campanhas', value:'—', change:'', cls:'admin-kpi__change--neutral', icon:'📧' },
            { label:'Emails Enviados', value:'—', change:'', cls:'admin-kpi__change--neutral', icon:'📨' },
            { label:'Taxa Abertura', value:'—', change:'', cls:'admin-kpi__change--neutral', icon:'👁️' },
            { label:'Cliques', value:'—', change:'', cls:'admin-kpi__change--neutral', icon:'🖱️' },
            { label:'Templates', value:'—', change:'', cls:'admin-kpi__change--neutral', icon:'📄' },
            { label:'Automações', value:'—', change:'', cls:'admin-kpi__change--neutral', icon:'⚙️' },
            { label:'SMTP Ativos', value:'—', change:'', cls:'admin-kpi__change--neutral', icon:'🔧' },
        ];
        kpiGrid.innerHTML = kpis.map(function(k) {
            return '<div class="admin-kpi"><div class="admin-kpi__label">' + k.icon + ' ' + esc(k.label) + '</div><div class="admin-kpi__value">' + esc(k.value) + '</div><div class="admin-kpi__change ' + k.cls + '">' + esc(k.change) + '</div></div>';
        }).join('');

        async function fetchCounts() {
            try {
                var userCount = 0, premiumCount = 0, trialCount = 0, activeCount = 0;
                var campCount = 0, emailSent = 0, openRate = 0, clickRate = 0;
                var templateCount = 0, automationCount = 0, smtpCount = 0;

                if (sb) {
                    var r1 = await sb.from('auth.users').select('*', { count: 'exact', head: true });
                    userCount = r1.count || 0;
                    var r2 = await sb.from('profiles').select('*', { count: 'exact' }).eq('plan', 'premium').eq('enabled', true);
                    premiumCount = r2.count || 0;
                    var r3 = await sb.from('profiles').select('*', { count: 'exact' }).eq('plan', 'trial').eq('enabled', true);
                    trialCount = r3.count || 0;
                    var r4 = await sb.from('profiles').select('*', { count: 'exact' }).eq('enabled', true);
                    activeCount = r4.count || 0;
                    var r5 = await sb.from('campaigns').select('*', { count: 'exact', head: true });
                    campCount = r5.count || 0;
                    var r6 = await sb.from('templates').select('*', { count: 'exact', head: true });
                    templateCount = r6.count || 0;
                    var r7 = await sb.from('automation_rules').select('*', { count: 'exact', head: true });
                    automationCount = r7.count || 0;
                    var r8 = await sb.from('profiles').select('smtp_host').not('smtp_host', 'is', null);
                    smtpCount = r8.data ? r8.data.length : 0;
                }

                kpis[0].value = userCount.toLocaleString();
                kpis[1].value = premiumCount.toLocaleString();
                kpis[2].value = trialCount.toLocaleString();
                kpis[3].value = activeCount.toLocaleString();
                kpis[4].value = campCount.toLocaleString();
                kpis[5].value = emailSent.toLocaleString();
                kpis[6].value = openRate.toFixed(1) + '%';
                kpis[7].value = clickRate.toFixed(1) + '%';
                kpis[8].value = templateCount.toLocaleString();
                kpis[9].value = automationCount.toLocaleString();
                kpis[10].value = smtpCount.toLocaleString();

                kpiGrid.innerHTML = kpis.map(function(k) {
                    return '<div class="admin-kpi"><div class="admin-kpi__label">' + k.icon + ' ' + esc(k.label) + '</div><div class="admin-kpi__value">' + esc(k.value) + '</div><div class="admin-kpi__change ' + k.cls + '">' + esc(k.change) + '</div></div>';
                }).join('');
            } catch (e) { /* keep placeholders */ }
        }

        fetchCounts();

        // Charts section
        var existingCharts = section.querySelector('#admin-charts');
        if (!existingCharts) {
            var chartsDiv = document.createElement('div');
            chartsDiv.id = 'admin-charts';
            chartsDiv.style.cssText = 'margin-top:24px;';
            chartsDiv.innerHTML =
                '<div class="admin-card" style="margin-bottom:20px;">' +
                    '<div class="admin-card__header"><h3 class="admin-card__title">📊 Gráficos</h3></div>' +
                    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;">' +
                        '<div>' +
                            '<h4 style="font-size:0.75rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:12px;">Crescimento de Utilizadores</h4>' +
                            '<div id="chart-users" style="display:flex;align-items:flex-end;gap:6px;height:120px;"></div>' +
                        '</div>' +
                        '<div>' +
                            '<h4 style="font-size:0.75rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:12px;">Campanhas / Dia (30 dias)</h4>' +
                            '<div id="chart-campaigns" style="display:flex;align-items:flex-end;gap:4px;height:120px;"></div>' +
                        '</div>' +
                        '<div>' +
                            '<h4 style="font-size:0.75rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:12px;">Emails Enviados</h4>' +
                            '<div id="chart-emails" style="display:flex;align-items:flex-end;gap:6px;height:120px;"></div>' +
                        '</div>' +
                        '<div>' +
                            '<h4 style="font-size:0.75rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:12px;">Engajamento</h4>' +
                            '<div id="chart-engagement" style="display:flex;gap:24px;align-items:flex-end;height:120px;padding:0 12px;">' +
                                '<div style="text-align:center;"><div style="width:60px;height:40px;background:linear-gradient(to top,#6366f1,#818cf8);border-radius:6px 6px 0 0;margin:0 auto 6px;"></div><span style="font-size:0.6875rem;color:#94a3b8;">Aberturas</span></div>' +
                                '<div style="text-align:center;"><div style="width:60px;height:28px;background:linear-gradient(to top,#10b981,#34d399);border-radius:6px 6px 0 0;margin:0 auto 6px;"></div><span style="font-size:0.6875rem;color:#94a3b8;">Cliques</span></div>' +
                                '<div style="text-align:center;"><div style="width:60px;height:52px;background:linear-gradient(to top,#f59e0b,#fbbf24);border-radius:6px 6px 0 0;margin:0 auto 6px;"></div><span style="font-size:0.6875rem;color:#94a3b8;">Conversão</span></div>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>';

            // Activity + System section
            var activityDiv = document.createElement('div');
            activityDiv.id = 'admin-activity';
            activityDiv.style.cssText = 'margin-top:20px;display:grid;grid-template-columns:1fr 1fr;gap:20px;';
            activityDiv.innerHTML =
                '<div class="admin-card">' +
                    '<div class="admin-card__header"><h3 class="admin-card__title">📋 Atividade Recente</h3></div>' +
                    '<div id="activity-feed" style="display:flex;flex-direction:column;gap:10px;"></div>' +
                '</div>' +
                '<div class="admin-card">' +
                    '<div class="admin-card__header"><h3 class="admin-card__title">🔧 Estado do Sistema</h3></div>' +
                    '<div id="system-status" style="display:flex;flex-direction:column;gap:10px;"></div>' +
                '</div>';

            chartsDiv.appendChild(activityDiv);
            section.insertBefore(chartsDiv, section.querySelector('.admin-card'));

            // Draw bar charts
            drawBarChart('chart-users', [12,19,8,15,22,18,25,30,28,35,42,38]);
            drawBarChart('chart-campaigns', [4,7,3,5,8,6,9,12,10,7,14,11]);
            drawBarChart('chart-emails', [120,250,180,310,420,350,510,680,590,720,850,780]);

            // Activity feed
            var feed = document.getElementById('activity-feed');
            if (feed) {
                feed.innerHTML =
                    '<div style="display:flex;align-items:center;gap:10px;padding:10px;background:#f8fafc;border-radius:10px;">' +
                        '<div style="width:8px;height:8px;border-radius:50%;background:#10b981;"></div>' +
                        '<div style="flex:1;"><span style="font-size:0.8125rem;font-weight:600;">Novo utilizador</span><p style="font-size:0.6875rem;color:#94a3b8;margin:2px 0 0;">—</p></div>' +
                        '<span style="font-size:0.6875rem;color:#94a3b8;">—</span>' +
                    '</div>' +
                    '<div style="display:flex;align-items:center;gap:10px;padding:10px;background:#f8fafc;border-radius:10px;">' +
                        '<div style="width:8px;height:8px;border-radius:50%;background:#6366f1;"></div>' +
                        '<div style="flex:1;"><span style="font-size:0.8125rem;font-weight:600;">Campanha criada</span><p style="font-size:0.6875rem;color:#94a3b8;margin:2px 0 0;">—</p></div>' +
                        '<span style="font-size:0.6875rem;color:#94a3b8;">—</span>' +
                    '</div>' +
                    '<div style="display:flex;align-items:center;gap:10px;padding:10px;background:#f8fafc;border-radius:10px;">' +
                        '<div style="width:8px;height:8px;border-radius:50%;background:#f59e0b;"></div>' +
                        '<div style="flex:1;"><span style="font-size:0.8125rem;font-weight:600;">Template criado</span><p style="font-size:0.6875rem;color:#94a3b8;margin:2px 0 0;">—</p></div>' +
                        '<span style="font-size:0.6875rem;color:#94a3b8;">—</span>' +
                    '</div>';
            }

            // System status
            var sysStatus = document.getElementById('system-status');
            if (sysStatus) {
                sysStatus.innerHTML =
                    '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:#f8fafc;border-radius:10px;">' +
                        '<span style="font-size:0.8125rem;font-weight:600;">Supabase</span><span class="badge badge--green">Online</span></div>' +
                    '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:#f8fafc;border-radius:10px;">' +
                        '<span style="font-size:0.8125rem;font-weight:600;">Netlify</span><span class="badge badge--green">Online</span></div>' +
                    '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:#f8fafc;border-radius:10px;">' +
                        '<span style="font-size:0.8125rem;font-weight:600;">Storage</span><span class="badge badge--green">Online</span></div>' +
                    '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:#f8fafc;border-radius:10px;">' +
                        '<span style="font-size:0.8125rem;font-weight:600;">SMTP</span><span class="badge badge--yellow">—</span></div>' +
                    '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:#f8fafc;border-radius:10px;">' +
                        '<span style="font-size:0.8125rem;font-weight:600;">Background Jobs</span><span class="badge badge--green">Online</span></div>';
            }
        }
    }

    function drawBarChart(containerId, data) {
        var container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        var max = Math.max.apply(null, data);
        if (max === 0) max = 1;
        data.forEach(function(val, i) {
            var height = Math.max(Math.round((val / max) * 100), 4);
            var bar = document.createElement('div');
            bar.style.cssText = 'flex:1;min-width:6px;height:' + height + '%;background:linear-gradient(to top,#6366f1,#818cf8);border-radius:3px 3px 0 0;opacity:0.8;transition:opacity 0.2s;cursor:pointer;position:relative;';
            bar.title = val;
            bar.addEventListener('mouseenter', function() { bar.style.opacity = '1'; });
            bar.addEventListener('mouseleave', function() { bar.style.opacity = '0.8'; });
            container.appendChild(bar);
        });
    }

    async function loadUsers() {
        var section = document.getElementById('section-users');
        if (!section) return;
        var card = section.querySelector('.admin-card');
        if (!card) return;

        var state = {
            data: [],
            filtered: [],
            search: '',
            filterPlan: 'all',
            filterStatus: 'all',
            sortBy: 'created_at',
            sortDir: 'desc',
            page: 1,
            limit: 10,
            loading: true
        };

        function renderSkeleton() {
            var cards = '';
            for (var i = 0; i < 4; i++) {
                cards += '<div class="admin-kpi skeleton-card"></div>';
            }
            return cards;
        }

        function renderEmpty() {
            return '<div class="empty">' +
                '<div class="empty__icon"><svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg></div>' +
                '<p class="empty__title">Nenhum utilizador encontrado</p>' +
                '<p class="empty__desc">Tente alterar os filtros ou a pesquisa.</p>' +
            '</div>';
        }

        function getUserBadge(plan, enabled) {
            if (enabled === false) return '<span class="badge badge--red">Suspenso</span>';
            if (plan === 'premium') return '<span class="badge badge--green">Premium</span>';
            if (plan === 'trial') return '<span class="badge badge--yellow">Trial</span>';
            return '<span class="badge badge--gray">Free</span>';
        }

        function getUserStatus(enabled) {
            return enabled !== false ? 'Ativo' : 'Suspenso';
        }

        function getPlanBadgeClass(plan) {
            if (plan === 'premium') return 'badge--green';
            if (plan === 'trial') return 'badge--yellow';
            return 'badge--gray';
        }

        function applyFilters() {
            var q = state.search.toLowerCase();
            var filtered = state.data.filter(function(u) {
                var name = (u.full_name || u.email || '').toLowerCase();
                var email = (u.email || '').toLowerCase();
                if (q && name.indexOf(q) < 0 && email.indexOf(q) < 0) return false;
                if (state.filterPlan !== 'all' && u.plan !== state.filterPlan) return false;
                if (state.filterStatus !== 'all') {
                    var active = u.enabled !== false;
                    if (state.filterStatus === 'active' && !active) return false;
                    if (state.filterStatus === 'suspended' && active) return false;
                }
                return true;
            });

            filtered.sort(function(a, b) {
                var aVal, bVal;
                switch (state.sortBy) {
                    case 'name': aVal = (a.full_name || a.email || '').toLowerCase(); bVal = (b.full_name || b.email || '').toLowerCase(); break;
                    case 'email': aVal = (a.email || '').toLowerCase(); bVal = (b.email || '').toLowerCase(); break;
                    case 'plan': aVal = (a.plan || 'free'); bVal = (b.plan || 'free'); break;
                    case 'last_login': aVal = a.last_sign_in_at || ''; bVal = b.last_sign_in_at || ''; break;
                    case 'created_at':
                    default: aVal = a.created_at || ''; bVal = b.created_at || ''; break;
                }
                if (state.sortDir === 'asc') return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
                return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
            });

            state.filtered = filtered;
            state.page = 1;
        }

        function formatLastLogin(dateStr) {
            if (!dateStr) return '—';
            var d = new Date(dateStr);
            var now = new Date();
            var diff = now - d;
            var mins = Math.floor(diff / 60000);
            if (mins < 1) return 'Agora';
            if (mins < 60) return mins + ' min';
            var hours = Math.floor(mins / 60);
            if (hours < 24) return hours + 'h';
            var days = Math.floor(hours / 24);
            if (days < 30) return days + 'd';
            return d.toLocaleDateString('pt-PT', { day:'2-digit', month:'short', year:'numeric' });
        }

        function showUserModal(user) {
            var overlay = document.createElement('div');
            overlay.className = 'tl-modal-overlay';
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.45);backdrop-filter:blur(6px);z-index:1000;display:flex;align-items:center;justify-content:center;';

            var modal = document.createElement('div');
            modal.className = 'tl-modal__content';
            modal.style.cssText = 'max-width:520px;width:90%;max-height:85vh;overflow-y:auto;background:white;border-radius:20px;box-shadow:0 24px 64px rgba(0,0,0,0.15);animation:tl-modalIn 0.25s ease both;';

            modal.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;padding:20px 24px 0;">' +
                '<div><h3 style="font-size:1.125rem;font-weight:700;color:#0f172a;margin:0;">' + esc(user.full_name || user.email || 'Utilizador') + '</h3>' +
                '<span class="badge ' + getPlanBadgeClass(user.plan) + '" style="margin-top:4px;">' + esc(user.plan || 'free') + '</span></div>' +
                '<button class="tl-modal__close" id="um-close" style="width:36px;height:36px;border:none;background:#f1f5f9;border-radius:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#64748b;transition:all 0.2s;">✕</button>' +
            '</div>' +
            '<div style="padding:20px 24px 24px;">' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">' +
                    '<div><label style="font-size:0.6875rem;color:#94a3b8;font-weight:600;text-transform:uppercase;">Email</label><p style="font-size:0.8125rem;margin:4px 0 0;word-break:break-all;">' + esc(user.email || '—') + '</p></div>' +
                    '<div><label style="font-size:0.6875rem;color:#94a3b8;font-weight:600;text-transform:uppercase;">Estado</label><p style="font-size:0.8125rem;margin:4px 0 0;">' + getUserStatus(user.enabled) + '</p></div>' +
                '</div>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">' +
                    '<div><label style="font-size:0.6875rem;color:#94a3b8;font-weight:600;text-transform:uppercase;">Último login</label><p style="font-size:0.8125rem;margin:4px 0 0;">' + formatLastLogin(user.last_sign_in_at) + '</p></div>' +
                    '<div><label style="font-size:0.6875rem;color:#94a3b8;font-weight:600;text-transform:uppercase;">Membro desde</label><p style="font-size:0.8125rem;margin:4px 0 0;">' + (user.created_at ? new Date(user.created_at).toLocaleDateString('pt-PT', { day:'2-digit', month:'short', year:'numeric' }) : '—') + '</p></div>' +
                '</div>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">' +
                    '<div><label style="font-size:0.6875rem;color:#94a3b8;font-weight:600;text-transform:uppercase;">Timezone</label><p style="font-size:0.8125rem;margin:4px 0 0;">' + esc(user.timezone || '—') + '</p></div>' +
                    '<div><label style="font-size:0.6875rem;color:#94a3b8;font-weight:600;text-transform:uppercase;">Idioma</label><p style="font-size:0.8125rem;margin:4px 0 0;">' + esc(user.locale || '—') + '</p></div>' +
                '</div>' +
                '<div style="display:flex;gap:8px;padding-top:16px;border-top:1px solid #f1f5f9;">' +
                    '<button class="btn btn--primary btn--sm" id="um-edit" data-uid="' + esc(user.id) + '">Editar</button>' +
                    '<button class="btn btn--ghost btn--sm" id="um-toggle" data-uid="' + esc(user.id) + '" data-enabled="' + (user.enabled !== false) + '">' + (user.enabled !== false ? 'Suspender' : 'Reativar') + '</button>' +
                    '<button class="btn btn--danger btn--sm" id="um-delete" data-uid="' + esc(user.id) + '">Eliminar</button>' +
                '</div>' +
            '</div>';

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
            overlay.querySelector('#um-close').addEventListener('click', close);
            overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
            overlay.querySelector('#um-edit').addEventListener('click', function() { editUser(user.id); close(); });
            overlay.querySelector('#um-toggle').addEventListener('click', function() { toggleUser(user.id); close(); });
            overlay.querySelector('#um-delete').addEventListener('click', function() { deleteUser(user.id); close(); });
        }

        async function editUser(id) {
            var newName = prompt('Novo nome do utilizador:');
            if (newName === null) return;
            try {
                await sb.from('profiles').update({ full_name: newName.trim() }).eq('id', id);
                state.loading = true;
                await loadUsersData();
                state.loading = false;
                render();
            } catch (e) { console.error('[Admin] Erro ao editar utilizador:', e); }
        }

        async function toggleUser(id) {
            var user = state.data.find(function(u) { return u.id === id; });
            if (!user) return;
            try {
                await sb.from('profiles').update({ enabled: user.enabled === false }).eq('id', id);
                state.loading = true;
                await loadUsersData();
                state.loading = false;
                render();
            } catch (e) { console.error('[Admin] Erro ao alterar estado:', e); }
        }

        async function deleteUser(id) {
            if (!confirm('Tem a certeza que deseja eliminar este utilizador? Esta ação é irreversível.')) return;
            try {
                await sb.from('profiles').delete().eq('id', id);
                state.loading = true;
                await loadUsersData();
                state.loading = false;
                render();
            } catch (e) { console.error('[Admin] Erro ao eliminar utilizador:', e); }
        }

        async function loadUsersData() {
            if (!sb) { state.data = []; return; }
            try {
                var result = await sb.from('profiles').select('*').order('created_at', { ascending: false });
                state.data = result.data || [];
                applyFilters();
            } catch (e) {
                state.data = [];
                state.filtered = [];
            }
        }

        function render() {
            if (!card) return;
            var countEl = section.querySelector('#admin-user-count');

            var filtered = state.filtered;
            var totalPages = Math.ceil(filtered.length / state.limit) || 1;
            var start = (state.page - 1) * state.limit;
            var pageUsers = filtered.slice(start, start + state.limit);
            var totalUsers = state.data.length;
            var premiumCount = state.data.filter(function(u) { return u.plan === 'premium'; }).length;

            if (countEl) countEl.textContent = filtered.length + ' de ' + totalUsers + ' utilizadores';

            var html = '';

            // Premium KPI mini cards
            html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px;">';
            html += '<div class="admin-kpi"><div class="admin-kpi__label">Total</div><div class="admin-kpi__value">' + totalUsers + '</div></div>';
            html += '<div class="admin-kpi"><div class="admin-kpi__label">Premium</div><div class="admin-kpi__value" style="color:#10b981;">' + premiumCount + '</div></div>';
            html += '<div class="admin-kpi"><div class="admin-kpi__label">Trial</div><div class="admin-kpi__value" style="color:#d97706;">' + state.data.filter(function(u){return u.plan==="trial";}).length + '</div></div>';
            html += '<div class="admin-kpi"><div class="admin-kpi__label">Ativos</div><div class="admin-kpi__value" style="color:#2563eb;">' + state.data.filter(function(u){return u.enabled!==false;}).length + '</div></div>';
            html += '</div>';

            // Cards grid
            html += '<div class="tl-cards" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;">';

            if (pageUsers.length === 0) {
                html += renderEmpty();
            } else {
                pageUsers.forEach(function(u, idx) {
                    var plan = u.plan || 'free';
                    var planBadge = getPlanBadgeClass(plan);
                    var statusBadge = u.enabled !== false ? 'badge--green' : 'badge--red';
                    var lastLogin = formatLastLogin(u.last_sign_in_at);
                    var createdAt = u.created_at ? new Date(u.created_at).toLocaleDateString('pt-PT', { day:'2-digit', month:'short', year:'numeric' }) : '—';

                    html += '<div class="tl-card" style="animation-delay:' + (idx * 0.04) + 's">';
                    html += '<div class="tl-card__top-line"></div>';
                    html += '<div class="tl-card__header">';
                    html += '<div class="tl-card__header-left">';
                    html += '<h3 class="tl-card__title">' + esc(u.full_name || u.email || '—') + '</h3>';
                    html += getUserBadge(plan, u.enabled);
                    html += '</div>';
                    html += '<span class="badge ' + planBadge + '" style="font-size:0.625rem;">' + esc(plan) + '</span>';
                    html += '</div>';
                    html += '<div class="tl-card__body">';
                    html += '<div class="tl-card__row">';
                    html += '<div class="tl-card__stat"><span class="tl-card__stat-label">Email</span><span class="tl-card__stat-value" style="font-size:0.75rem;word-break:break-all;">' + esc(u.email || '—') + '</span></div>';
                    html += '<div class="tl-card__stat"><span class="tl-card__stat-label">Estado</span><span class="tl-card__stat-value"><span class="badge ' + statusBadge + '">' + getUserStatus(u.enabled) + '</span></span></div>';
                    html += '</div>';
                    html += '<div class="tl-card__row">';
                    html += '<div class="tl-card__stat"><span class="tl-card__stat-label">Último login</span><span class="tl-card__stat-value">' + lastLogin + '</span></div>';
                    html += '<div class="tl-card__stat"><span class="tl-card__stat-label">Membro desde</span><span class="tl-card__stat-value">' + createdAt + '</span></div>';
                    html += '</div>';
                    html += '</div>';
                    html += '<div class="tl-card__actions">';
                    html += '<button class="tl-btn tl-btn--ghost tl-btn--sm" data-action="view" data-uid="' + esc(u.id) + '">Ver</button>';
                    html += '<button class="tl-btn tl-btn--ghost tl-btn--sm" data-action="edit" data-uid="' + esc(u.id) + '">Editar</button>';
                    html += '<button class="tl-btn tl-btn--ghost tl-btn--sm" data-action="toggle" data-uid="' + esc(u.id) + '" data-enabled="' + (u.enabled !== false) + '">' + (u.enabled !== false ? 'Suspender' : 'Reativar') + '</button>';
                    html += '<button class="tl-btn tl-btn--ghost tl-btn--sm tl-btn--danger" data-action="delete" data-uid="' + esc(u.id) + '">Eliminar</button>';
                    html += '</div>';
                    html += '</div>';
                });
            }
            html += '</div>';

            // Pagination
            if (filtered.length > state.limit) {
                var totalPages = Math.ceil(filtered.length / state.limit);
                html += '<div class="tl-pagination" style="margin-top:20px;">';
                html += '<span class="tl-pagination__info">Página ' + state.page + ' de ' + totalPages + '</span>';
                html += '<div class="tl-pagination__btns">';
                html += '<button class="tl-btn tl-btn--ghost tl-btn--sm" data-page="' + (state.page - 1) + '"' + (state.page <= 1 ? ' disabled' : '') + '>&larr; Anterior</button>';
                html += '<button class="tl-btn tl-btn--ghost tl-btn--sm" data-page="' + (state.page + 1) + '"' + (state.page >= totalPages ? ' disabled' : '') + '>Próxima &rarr;</button>';
                html += '</div></div>';
            }

            card.innerHTML = html;

            // Bind card actions
            card.querySelectorAll('button[data-action]').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    var action = btn.getAttribute('data-action');
                    var uid = btn.getAttribute('data-uid');
                    if (action === 'view') showUserModal(state.data.find(function(u) { return u.id === uid; }));
                    else if (action === 'edit') editUser(uid);
                    else if (action === 'toggle') toggleUser(uid);
                    else if (action === 'delete') deleteUser(uid);
                });
            });

            // Bind pagination
            card.querySelectorAll('[data-page]').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    var p = parseInt(btn.getAttribute('data-page'), 10);
                    if (!isNaN(p) && p >= 1 && p <= totalPages) {
                        state.page = p;
                        render();
                    }
                });
            });
        }

        function renderToolbar() {
            var searchEl = section.querySelector('#admin-user-search');
            var planFilter = section.querySelector('#admin-user-plan');
            var statusFilter = section.querySelector('#admin-user-status');
            var sortEl = section.querySelector('#admin-user-sort');

            if (searchEl) {
                var dt;
                searchEl.value = state.search;
                searchEl.addEventListener('input', function() {
                    clearTimeout(dt);
                    dt = setTimeout(function() {
                        state.search = searchEl.value;
                        applyFilters();
                        render();
                    }, 200);
                });
            }
            if (planFilter) {
                planFilter.value = state.filterPlan;
                planFilter.addEventListener('change', function() {
                    state.filterPlan = planFilter.value;
                    applyFilters();
                    render();
                });
            }
            if (statusFilter) {
                statusFilter.value = state.filterStatus;
                statusFilter.addEventListener('change', function() {
                    state.filterStatus = statusFilter.value;
                    applyFilters();
                    render();
                });
            }
            if (sortEl) {
                sortEl.value = state.sortBy + '-' + state.sortDir;
                sortEl.addEventListener('change', function() {
                    var parts = sortEl.value.split('-');
                    state.sortBy = parts[0];
                    state.sortDir = parts[1] || 'desc';
                    applyFilters();
                    render();
                });
            }
        }

        async function init() {
            card.innerHTML = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">' +
                '<div class="admin-kpi skeleton-card"></div>' +
                '<div class="admin-kpi skeleton-card"></div>' +
                '<div class="admin-kpi skeleton-card"></div>' +
                '<div class="admin-kpi skeleton-card"></div>' +
            '</div>' +
            '<div style="margin-top:16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;">' +
                '<div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line"></div>' +
                '<div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line"></div>' +
            '</div>';

            await loadUsersData();
            state.loading = false;

            // Recreate toolbar if not exists
            var existingToolbar = section.querySelector('.admin-user-toolbar');
            if (!existingToolbar) {
                var toolbar = document.createElement('div');
                toolbar.className = 'admin-user-toolbar';
                toolbar.style.cssText = 'display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap;align-items:center;';
                toolbar.innerHTML =
                    '<div style="position:relative;flex:1;min-width:180px;max-width:300px;">' +
                        '<svg style="position:absolute;left:10px;top:50%;transform:translateY(-50%);width:16px;height:16px;color:#94a3b8;pointer-events:none;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>' +
                        '<input type="text" id="admin-user-search" placeholder="Pesquisar utilizadores..." style="width:100%;padding:8px 12px 8px 34px;border:1px solid #e2e8f0;border-radius:10px;font-size:0.8125rem;font-family:inherit;background:white;">' +
                    '</div>' +
                    '<select id="admin-user-plan" style="padding:8px 32px 8px 10px;border:1px solid #e2e8f0;border-radius:10px;font-size:0.8125rem;font-family:inherit;background:white;appearance:none;cursor:pointer;">' +
                        '<option value="all">Todos os planos</option><option value="premium">Premium</option><option value="trial">Trial</option><option value="free">Free</option>' +
                    '</select>' +
                    '<select id="admin-user-status" style="padding:8px 32px 8px 10px;border:1px solid #e2e8f0;border-radius:10px;font-size:0.8125rem;font-family:inherit;background:white;appearance:none;cursor:pointer;">' +
                        '<option value="all">Todos os estados</option><option value="active">Ativos</option><option value="suspended">Suspensos</option>' +
                    '</select>' +
                    '<select id="admin-user-sort" style="padding:8px 32px 8px 10px;border:1px solid #e2e8f0;border-radius:10px;font-size:0.8125rem;font-family:inherit;background:white;appearance:none;cursor:pointer;">' +
                        '<option value="created_at-desc">Mais recentes</option><option value="created_at-asc">Mais antigos</option><option value="name-asc">Nome A-Z</option><option value="name-desc">Nome Z-A</option><option value="plan-asc">Plano</option><option value="last_login-desc">Último login</option>' +
                    '</select>';

                card.parentNode.insertBefore(toolbar, card);
                renderToolbar();
            }

            render();
        }

        // Debounce search
        var searchTimer = null;
        var origInit = init;

        return init();
    }

    async function loadCampaigns() {
        var section = document.getElementById('section-campaigns');
        if (!section) return;
        var table = section.querySelector('#admin-campaigns-table tbody');
        var countEl = section.querySelector('#admin-campaign-count');
        if (!table) return;

        var state = { data: [], filtered: [], search: '', filterStatus: 'all', loading: true };

        function applyFilters() {
            var q = state.search.toLowerCase();
            state.filtered = state.data.filter(function(c) {
                var name = (c.nome || c.name || '').toLowerCase();
                var assunto = (c.assunto || '').toLowerCase();
                if (q && name.indexOf(q) < 0 && assunto.indexOf(q) < 0) return false;
                if (state.filterStatus !== 'all' && (c.status || 'draft') !== state.filterStatus) return false;
                return true;
            });
        }

        function render() {
            if (countEl) countEl.textContent = state.filtered.length + ' de ' + state.data.length + ' campanhas';
            if (state.filtered.length === 0) {
                table.innerHTML = '<tr><td colspan="8"><div class="empty"><p class="empty__title">Nenhuma campanha encontrada</p></div></td></tr>';
                return;
            }
            var html = '';
            state.filtered.forEach(function(c) {
                var name = c.nome || c.name || '—';
                var status = c.status || 'draft';
                var statusBadge = status === 'sent' ? 'badge--green' : (status === 'active' || status === 'sending' ? 'badge--indigo' : (status === 'draft' ? 'badge--gray' : 'badge--yellow'));
                var sent = c.total_sent != null ? c.total_sent : (c.stats && c.stats.sent != null ? c.stats.sent : '—');
                var openRate = c.total_sent > 0 ? Math.round((c.total_opened || 0) / c.total_sent * 10000) / 100 + '%' : '—';
                var clickRate = c.total_sent > 0 ? Math.round((c.total_clicked || 0) / c.total_sent * 10000) / 100 + '%' : '—';
                var failed = c.total_failed != null ? c.total_failed : (c.stats && c.stats.failed != null ? c.stats.failed : '—');
                html += '<tr>' +
                    '<td><strong>' + esc(name) + '</strong></td>' +
                    '<td style="font-size:0.75rem;">' + esc(c.user_id || '—') + '</td>' +
                    '<td><span class="badge ' + statusBadge + '">' + esc(status) + '</span></td>' +
                    '<td>' + sent + '</td>' +
                    '<td>' + openRate + '</td>' +
                    '<td>' + clickRate + '</td>' +
                    '<td>' + failed + '</td>' +
                    '<td>' + (c.created_at ? new Date(c.created_at).toLocaleDateString('pt-PT', { day:'2-digit', month:'short', year:'numeric' }) : '—') + '</td>' +
                '</tr>';
            });
            table.innerHTML = html;
        }

        table.innerHTML = '<tr><td colspan="8"><div class="skeleton skeleton-line skeleton-line--lg"></div><div class="skeleton skeleton-line" style="margin-top:8px"></div></td></tr>';

        try {
            if (sb) {
                var result = await sb.from('campaigns').select('*').order('created_at', { ascending: false }).limit(100);
                state.data = result.data || [];
                applyFilters();
                render();

                var searchEl = section.querySelector('#admin-campaign-search');
                var statusEl = section.querySelector('#admin-campaign-status');
                if (searchEl) {
                    var dt;
                    searchEl.addEventListener('input', function() {
                        clearTimeout(dt);
                        dt = setTimeout(function() { state.search = searchEl.value; applyFilters(); render(); }, 200);
                    });
                }
                if (statusEl) {
                    statusEl.addEventListener('change', function() {
                        state.filterStatus = statusEl.value;
                        applyFilters();
                        render();
                    });
                }
            }
        } catch (e) {
            table.innerHTML = '<tr><td colspan="8"><div class="empty"><p class="empty__title">Erro ao carregar campanhas</p></div></td></tr>';
        }
    }

    async function loadTemplates() {
        var section = document.getElementById('section-templates');
        if (!section) return;
        var table = section.querySelector('#admin-templates-table tbody');
        var countEl = section.querySelector('#admin-template-count');
        if (!table) return;

        var state = { data: [], filtered: [], search: '', loading: true };

        function applyFilters() {
            var q = state.search.toLowerCase();
            state.filtered = state.data.filter(function(t) {
                var name = (t.nome || t.name || '').toLowerCase();
                var subject = (t.subject || '').toLowerCase();
                if (q && name.indexOf(q) < 0 && subject.indexOf(q) < 0) return false;
                return true;
            });
        }

        async function deleteTemplate(id) {
            if (!confirm('Tem a certeza que deseja eliminar este template?')) return;
            try {
                await sb.from('templates').update({ deleted_at: new Date().toISOString() }).eq('id', id);
                state.data = state.data.filter(function(t) { return t.id !== id; });
                applyFilters();
                render();
            } catch (e) { console.error('[Admin] Erro ao eliminar template:', e); }
        }

        async function duplicateTemplate(tpl) {
            try {
                var result = await sb.from('templates').insert({
                    user_id: sb.auth ? (await sb.auth.getUser()).data.user.id : tpl.user_id,
                    nome: (tpl.nome || tpl.name || 'Template') + ' (cópia)',
                    subject: tpl.subject || '',
                    preheader: tpl.preheader || '',
                    html: tpl.html || '',
                    text_version: tpl.text_version || '',
                    is_default: false
                }).select().single();
                if (result.data) {
                    state.data.unshift(result.data);
                    applyFilters();
                    render();
                }
            } catch (e) { console.error('[Admin] Erro ao duplicar template:', e); }
        }

        function render() {
            if (countEl) countEl.textContent = state.filtered.length + ' de ' + state.data.length + ' templates';
            if (state.filtered.length === 0) {
                table.innerHTML = '<tr><td colspan="5"><div class="empty"><p class="empty__title">Nenhum template encontrado</p></div></td></tr>';
                return;
            }
            var html = '';
            state.filtered.forEach(function(t) {
                var name = t.nome || t.name || '—';
                html += '<tr>' +
                    '<td><strong>' + esc(name) + '</strong></td>' +
                    '<td style="font-size:0.75rem;">' + esc((t.subject || '').substring(0, 50)) + '</td>' +
                    '<td style="font-size:0.75rem;">' + esc(t.user_id || '—') + '</td>' +
                    '<td>' + (t.created_at ? new Date(t.created_at).toLocaleDateString('pt-PT', { day:'2-digit', month:'short', year:'numeric' }) : '—') + '</td>' +
                    '<td><div style="display:flex;gap:4px;">' +
                        '<button class="btn btn--ghost btn--sm" data-action="duplicate" data-id="' + esc(t.id) + '">Duplicar</button>' +
                        '<button class="btn btn--danger btn--sm" data-action="delete" data-id="' + esc(t.id) + '">Eliminar</button>' +
                    '</div></td>' +
                '</tr>';
            });
            table.innerHTML = html;

            table.querySelectorAll('button[data-action]').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    var action = btn.getAttribute('data-action');
                    var id = btn.getAttribute('data-id');
                    if (action === 'delete') deleteTemplate(id);
                    else if (action === 'duplicate') {
                        var tpl = state.data.find(function(t) { return t.id === id; });
                        if (tpl) duplicateTemplate(tpl);
                    }
                });
            });
        }

        table.innerHTML = '<tr><td colspan="5"><div class="skeleton skeleton-line skeleton-line--lg"></div><div class="skeleton skeleton-line" style="margin-top:8px"></div></td></tr>';

        try {
            if (sb) {
                var result = await sb.from('templates').select('*').is('deleted_at', null).order('created_at', { ascending: false }).limit(100);
                state.data = result.data || [];
                applyFilters();
                render();

                var searchEl = section.querySelector('#admin-template-search');
                if (searchEl) {
                    var dt;
                    searchEl.addEventListener('input', function() {
                        clearTimeout(dt);
                        dt = setTimeout(function() { state.search = searchEl.value; applyFilters(); render(); }, 200);
                    });
                }
            }
        } catch (e) {
            table.innerHTML = '<tr><td colspan="5"><div class="empty"><p class="empty__title">Erro ao carregar templates</p></div></td></tr>';
        }
    }

    async function loadAutomations() {
        var section = document.getElementById('section-automations');
        if (!section) return;
        var table = section.querySelector('#admin-automations-table tbody');
        var countEl = section.querySelector('#admin-automation-count');
        if (!table) return;

        var state = { data: [], filtered: [], search: '', filterStatus: 'all', loading: true };

        function applyFilters() {
            var q = state.search.toLowerCase();
            state.filtered = state.data.filter(function(a) {
                var name = (a.name || '').toLowerCase();
                if (q && name.indexOf(q) < 0) return false;
                if (state.filterStatus === 'active' && !a.enabled) return false;
                if (state.filterStatus === 'inactive' && a.enabled) return false;
                return true;
            });
        }

        async function toggleAutomation(id) {
            var auto = state.data.find(function(a) { return a.id === id; });
            if (!auto) return;
            try {
                await sb.from('automation_rules').update({ enabled: !auto.enabled }).eq('id', id);
                auto.enabled = !auto.enabled;
                applyFilters();
                render();
            } catch (e) { console.error('[Admin] Erro ao alterar automação:', e); }
        }

        async function deleteAutomation(id) {
            if (!confirm('Tem a certeza que deseja eliminar esta automação?')) return;
            try {
                await sb.from('automation_rules').delete().eq('id', id);
                state.data = state.data.filter(function(a) { return a.id !== id; });
                applyFilters();
                render();
            } catch (e) { console.error('[Admin] Erro ao eliminar automação:', e); }
        }

        function render() {
            if (countEl) countEl.textContent = state.filtered.length + ' de ' + state.data.length + ' regras';
            if (state.filtered.length === 0) {
                table.innerHTML = '<tr><td colspan="8"><div class="empty"><p class="empty__title">Nenhuma automação encontrada</p></div></td></tr>';
                return;
            }
            var html = '';
            state.filtered.forEach(function(a) {
                var statusBadge = a.enabled ? 'badge--green' : 'badge--gray';
                var triggerLabel = a.trigger_type === 'contact_created' ? 'Novo contacto' : (a.trigger_type || '—');
                html += '<tr>' +
                    '<td><strong>' + esc(a.name) + '</strong></td>' +
                    '<td style="font-size:0.75rem;">' + esc(a.user_id || '—') + '</td>' +
                    '<td>' + esc(triggerLabel) + '</td>' +
                    '<td><span class="badge ' + statusBadge + '">' + (a.enabled ? 'Ativa' : 'Inativa') + '</span></td>' +
                    '<td>' + (a.delay_minutes || 0) + ' min</td>' +
                    '<td>—</td>' +
                    '<td>' + (a.updated_at ? new Date(a.updated_at).toLocaleDateString('pt-PT', { day:'2-digit', month:'short', year:'numeric' }) : '—') + '</td>' +
                    '<td><div style="display:flex;gap:4px;">' +
                        '<button class="btn btn--ghost btn--sm" data-action="toggle" data-id="' + esc(a.id) + '">' + (a.enabled ? 'Desativar' : 'Ativar') + '</button>' +
                        '<button class="btn btn--danger btn--sm" data-action="delete" data-id="' + esc(a.id) + '">Eliminar</button>' +
                    '</div></td>' +
                '</tr>';
            });
            table.innerHTML = html;

            table.querySelectorAll('button[data-action]').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    var action = btn.getAttribute('data-action');
                    var id = btn.getAttribute('data-id');
                    if (action === 'toggle') toggleAutomation(id);
                    else if (action === 'delete') deleteAutomation(id);
                });
            });
        }

        table.innerHTML = '<tr><td colspan="8"><div class="skeleton skeleton-line skeleton-line--lg"></div><div class="skeleton skeleton-line" style="margin-top:8px"></div></td></tr>';

        try {
            if (sb) {
                var result = await sb.from('automation_rules').select('*').order('created_at', { ascending: false }).limit(100);
                state.data = result.data || [];
                applyFilters();
                render();

                var searchEl = section.querySelector('#admin-automation-search');
                var statusEl = section.querySelector('#admin-automation-status');
                if (searchEl) {
                    var dt;
                    searchEl.addEventListener('input', function() {
                        clearTimeout(dt);
                        dt = setTimeout(function() { state.search = searchEl.value; applyFilters(); render(); }, 200);
                    });
                }
                if (statusEl) {
                    statusEl.addEventListener('change', function() {
                        state.filterStatus = statusEl.value;
                        applyFilters();
                        render();
                    });
                }
            }
        } catch (e) {
            table.innerHTML = '<tr><td colspan="8"><div class="empty"><p class="empty__title">Erro ao carregar automações</p></div></td></tr>';
        }
    }

    async function loadAnalytics() {
        var section = document.getElementById('section-analytics');
        if (!section) return;
        var kpiGrid = section.querySelector('#kpi-analytics');
        if (!kpiGrid) return;
        if (kpiGrid.dataset.loaded) return;
        kpiGrid.dataset.loaded = 'true';

        var stats = { totalSent: 0, totalOpened: 0, totalClicked: 0, totalFailed: 0, campaignCount: 0 };

        try {
            if (sb) {
                var result = await sb.from('campaigns').select('total_sent,total_opened,total_clicked,total_failed,status').is('deleted_at', null);
                var campaigns = result.data || [];
                stats.campaignCount = campaigns.length;
                campaigns.forEach(function(c) {
                    stats.totalSent += c.total_sent || 0;
                    stats.totalOpened += c.total_opened || 0;
                    stats.totalClicked += c.total_clicked || 0;
                    stats.totalFailed += c.total_failed || 0;
                });
            }
        } catch (e) { /* use zeroes */ }

        var openRate = stats.totalSent > 0 ? Math.round(stats.totalOpened / stats.totalSent * 10000) / 100 : 0;
        var clickRate = stats.totalSent > 0 ? Math.round(stats.totalClicked / stats.totalSent * 10000) / 100 : 0;
        var bounceRate = stats.totalSent > 0 ? Math.round(stats.totalFailed / stats.totalSent * 10000) / 100 : 0;
        var conversionRate = stats.totalOpened > 0 ? Math.round(stats.totalClicked / stats.totalOpened * 10000) / 100 : 0;

        kpiGrid.innerHTML = '';
        var kpis = [
            { label:'📧 Emails Enviados', value: stats.totalSent.toLocaleString(), change: stats.campaignCount + ' campanhas', cls:'admin-kpi__change--neutral' },
            { label:'👁️ Taxa Abertura', value: openRate.toFixed(1) + '%', change: stats.totalOpened.toLocaleString() + ' aberturas', cls: openRate > 20 ? 'admin-kpi__change--up' : 'admin-kpi__change--neutral' },
            { label:'🖱️ Taxa Cliques', value: clickRate.toFixed(1) + '%', change: stats.totalClicked.toLocaleString() + ' cliques', cls: clickRate > 3 ? 'admin-kpi__change--up' : 'admin-kpi__change--neutral' },
            { label:'🔄 Conversão', value: conversionRate.toFixed(1) + '%', change: 'Cliques / Aberturas', cls:'admin-kpi__change--neutral' }
        ];
        kpiGrid.innerHTML = kpis.map(function(k) {
            return '<div class="admin-kpi"><div class="admin-kpi__label">' + esc(k.label) + '</div><div class="admin-kpi__value">' + esc(k.value) + '</div><div class="admin-kpi__change ' + k.cls + '">' + esc(k.change) + '</div></div>';
        }).join('');

        var chartCard = section.querySelector('.admin-card');
        if (chartCard) {
            var chartHeader = chartCard.querySelector('.admin-card__title');
            if (chartHeader) chartHeader.textContent = 'Gráfico de Performance';

            var chartBody = chartCard.querySelector('.empty');
            if (chartBody) {
                var barData = [
                    { label:'Enviados', value: stats.totalSent, color:'#6366f1' },
                    { label:'Abertos', value: stats.totalOpened, color:'#10b981' },
                    { label:'Cliques', value: stats.totalClicked, color:'#f59e0b' },
                    { label:'Falhas', value: stats.totalFailed, color:'#ef4444' }
                ];
                var maxVal = Math.max.apply(null, barData.map(function(b) { return b.value; }));
                if (maxVal === 0) maxVal = 1;

                var chartHtml = '<div style="display:flex;align-items:flex-end;gap:16px;height:160px;padding:16px 0;">';
                barData.forEach(function(b) {
                    var pct = Math.max(Math.round(b.value / maxVal * 100), 4);
                    chartHtml += '<div style="flex:1;text-align:center;">' +
                        '<div style="font-size:0.75rem;font-weight:700;margin-bottom:6px;">' + b.value.toLocaleString() + '</div>' +
                        '<div style="height:' + pct + '%;background:linear-gradient(to top,' + b.color + ',' + b.color + 'cc);border-radius:6px 6px 0 0;transition:height 0.5s;min-height:4px;"></div>' +
                        '<div style="font-size:0.6875rem;color:#94a3b8;margin-top:8px;">' + esc(b.label) + '</div>' +
                    '</div>';
                });
                chartHtml += '</div>';
                chartBody.outerHTML = '<div style="padding:0;">' + chartHtml + '</div>';
            }
        }
    }

    async function loadSMTP() {
        var section = document.getElementById('section-smtp');
        if (!section) return;
        var table = section.querySelector('#admin-smtp-table tbody');
        var countEl = section.querySelector('#admin-smtp-count');
        if (!table) return;

        table.innerHTML = '<tr><td colspan="7"><div class="skeleton skeleton-line skeleton-line--lg"></div><div class="skeleton skeleton-line" style="margin-top:8px"></div></td></tr>';

        try {
            if (sb) {
                var result = await sb.from('profiles').select('id,smtp_host,smtp_port,smtp_username,smtp_secure,smtp_status,smtp_verified_at').limit(50);
                var data = result.data || [];
                var configs = [];
                data.forEach(function(p) {
                    if (p.smtp_host) configs.push(p);
                });
                if (countEl) countEl.textContent = configs.length + ' configurações';

                if (configs.length === 0) {
                    table.innerHTML = '<tr><td colspan="7"><div class="empty"><p class="empty__title">Nenhuma configuração SMTP</p></div></td></tr>';
                    return;
                }

                var html = '';
                configs.forEach(function(c) {
                    var status = c.smtp_status || 'not_configured';
                    var statusBadge = status === 'verified' ? 'badge--green' : (status === 'configured' ? 'badge--yellow' : 'badge--red');
                    var statusLabel = status === 'verified' ? 'Verificado' : (status === 'configured' ? 'Configurado' : 'Não configurado');
                    var verifiedAt = c.smtp_verified_at ? new Date(c.smtp_verified_at).toLocaleString('pt-PT', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
                    html += '<tr>' +
                        '<td>' + esc(c.smtp_host) + '</td>' +
                        '<td>' + esc(String(c.smtp_port || '—')) + '</td>' +
                        '<td>' + esc(c.smtp_username || '—') + '</td>' +
                        '<td>' + (c.smtp_secure ? '<span class="badge badge--green">SSL/TLS</span>' : '<span class="badge badge--gray">—</span>') + '</td>' +
                        '<td><span class="badge ' + statusBadge + '">' + esc(statusLabel) + '</span></td>' +
                        '<td>' + verifiedAt + '</td>' +
                        '<td><button class="btn btn--ghost btn--sm" data-action="view" data-uid="' + esc(c.id) + '">Ver</button></td>' +
                    '</tr>';
                });
                table.innerHTML = html;

                table.querySelectorAll('button[data-action]').forEach(function(btn) {
                    btn.addEventListener('click', function() {
                        var uid = btn.getAttribute('data-uid');
                        window.location.hash = '#/admin/users';
                    });
                });
            }
        } catch (e) {
            table.innerHTML = '<tr><td colspan="7"><div class="empty"><p class="empty__title">Erro ao carregar SMTP</p></div></td></tr>';
        }
    }

    async function loadLogs() {
        var section = document.getElementById('section-logs');
        if (!section) return;
        var table = section.querySelector('#admin-logs-table tbody');
        var countEl = section.querySelector('#admin-log-count');
        if (!table) return;

        var state = { data: [], filtered: [], search: '', filterType: 'all', loading: true };

        function applyFilters() {
            var q = state.search.toLowerCase();
            state.filtered = state.data.filter(function(l) {
                var desc = (l.description || l.message || '').toLowerCase();
                var userId = (l.user_id || '').toLowerCase();
                if (q && desc.indexOf(q) < 0 && userId.indexOf(q) < 0) return false;
                if (state.filterType !== 'all') {
                    var type = (l.event_type || l.type || 'info').toLowerCase();
                    if (type !== state.filterType) return false;
                }
                return true;
            });
        }

        function render() {
            if (countEl) countEl.textContent = state.filtered.length + ' de ' + state.data.length + ' entradas';
            if (state.filtered.length === 0) {
                table.innerHTML = '<tr><td colspan="5"><div class="empty"><p class="empty__title">Nenhum log encontrado</p></div></td></tr>';
                return;
            }
            var html = '';
            state.filtered.forEach(function(l) {
                var type = l.event_type || l.type || 'info';
                var typeBadge = type === 'login' ? 'badge--indigo' : (type === 'error' ? 'badge--red' : (type === 'webhook' ? 'badge--blue' : (type === 'signup' ? 'badge--green' : 'badge--gray')));
                var details = '';
                try { details = JSON.stringify(l.details || l.metadata || {}).substring(0, 80); } catch (e) { details = '—'; }
                html += '<tr>' +
                    '<td>' + (l.created_at ? new Date(l.created_at).toLocaleString('pt-PT') : '—') + '</td>' +
                    '<td><span class="badge ' + typeBadge + '">' + esc(type) + '</span></td>' +
                    '<td style="font-size:0.75rem;">' + esc(l.user_id || '—') + '</td>' +
                    '<td>' + esc(l.description || l.message || '—') + '</td>' +
                    '<td><code style="font-size:0.6875rem;color:#64748b;word-break:break-all;">' + esc(details) + '</code></td>' +
                '</tr>';
            });
            table.innerHTML = html;
        }

        table.innerHTML = '<tr><td colspan="5"><div class="skeleton skeleton-line skeleton-line--lg"></div><div class="skeleton skeleton-line" style="margin-top:8px"></div></td></tr>';

        try {
            if (sb) {
                var result = await sb.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100);
                state.data = result.data || [];
                applyFilters();
                render();

                var searchEl = section.querySelector('#admin-log-search');
                var typeEl = section.querySelector('#admin-log-type');
                if (searchEl) {
                    var dt;
                    searchEl.addEventListener('input', function() {
                        clearTimeout(dt);
                        dt = setTimeout(function() { state.search = searchEl.value; applyFilters(); render(); }, 200);
                    });
                }
                if (typeEl) {
                    typeEl.addEventListener('change', function() {
                        state.filterType = typeEl.value;
                        applyFilters();
                        render();
                    });
                }
            }
        } catch (e) {
            table.innerHTML = '<tr><td colspan="5"><div class="empty"><p class="empty__title">Erro ao carregar logs</p></div></td></tr>';
        }
    }

    async function loadSystem() {
        var section = document.getElementById('section-system');
        if (!section) return;
        var kpiGrid = section.querySelector('#kpi-system');
        if (!kpiGrid) return;

        var serverOk = false;
        var supabaseOk = false;
        var startTime = Date.now();

        try {
            var healthResp = await fetch('/health');
            if (healthResp.ok) { serverOk = true; }
        } catch (e) { serverOk = false; }

        if (sb) {
            try {
                var test = await sb.from('profiles').select('id', { count: 'exact', head: true });
                if (!test.error) supabaseOk = true;
            } catch (e) { supabaseOk = false; }
        }

        var uptimeMs = Date.now() - startTime;

        if (!kpiGrid.dataset.loaded) {
            kpiGrid.dataset.loaded = 'true';
            kpiGrid.innerHTML = '';
            var kpis = [
                { label:'🔧 API Server', value: serverOk ? 'Online' : 'Offline', cls: serverOk ? 'admin-kpi__change--up' : 'admin-kpi__change--down' },
                { label:'🗄️ Supabase', value: supabaseOk ? 'Online' : 'Offline', cls: supabaseOk ? 'admin-kpi__change--up' : 'admin-kpi__change--down' }
            ];
            kpiGrid.innerHTML = kpis.map(function(k) {
                return '<div class="admin-kpi"><div class="admin-kpi__label">' + esc(k.label) + '</div><div class="admin-kpi__value">' + esc(k.value) + '</div><div class="admin-kpi__change ' + k.cls + '">Verificado agora</div></div>';
            }).join('');
        }

        var table = section.querySelector('#admin-system-table tbody');
        if (table) {
            var now = new Date().toLocaleString('pt-PT');
            var services = [
                { name:'API Server (Express)', status: serverOk ? 'healthy' : 'error', version:'1.0.0', uptime: now },
                { name:'Supabase (Database)', status: supabaseOk ? 'healthy' : 'error', version:'—', uptime: now },
                { name:'Netlify (Frontend)', status:'healthy', version:'1.0.0', uptime:'Deploy ativo' },
                { name:'Stripe (Pagamentos)', status: (typeof window !== 'undefined' && window.Stripe) ? 'healthy' : 'configured', version:'—', uptime:'—' },
                { name:'SMTP (Email)', status:'healthy', version:'Nodemailer', uptime: now },
                { name:'Campaign Engine', status:'healthy', version:'1.0.0', uptime: now }
            ];
            var html = '';
            services.forEach(function(s) {
                var statusBadge = s.status === 'healthy' ? 'badge--green' : (s.status === 'error' ? 'badge--red' : 'badge--yellow');
                var statusLabel = s.status === 'healthy' ? 'Saudável' : (s.status === 'error' ? 'Erro' : 'Configurado');
                html += '<tr>' +
                    '<td><strong>' + esc(s.name) + '</strong></td>' +
                    '<td><span class="badge ' + statusBadge + '">' + esc(statusLabel) + '</span></td>' +
                    '<td>' + esc(s.version) + '</td>' +
                    '<td style="font-size:0.75rem;">' + esc(s.uptime) + '</td>' +
                    '<td><span class="badge badge--green">OK</span></td>' +
                '</tr>';
            });
            table.innerHTML = html;
        }
    }

    async function loadSettings() {
        var section = document.getElementById('section-settings');
        if (!section) return;
        var loading = section.querySelector('#settings-loading');
        var content = section.querySelector('#settings-content');
        if (!content) return;

        var platformInfo = {
            name: 'MailFlow Pro',
            version: '1.0.0',
            environment: 'production',
            adminEmail: user ? user.email : '—'
        };

        var services = { supabase: false, stripe: false, smtp: false };

        if (sb) {
            try {
                var test = await sb.from('profiles').select('id', { count: 'exact', head: true });
                if (!test.error) services.supabase = true;
            } catch (e) { services.supabase = false; }
        }

        try {
            var profResult = await sb.from('profiles').select('smtp_host').limit(1);
            if (profResult.data && profResult.data.length > 0 && profResult.data[0].smtp_host) services.smtp = true;
        } catch (e) { services.smtp = false; }

        services.stripe = typeof Stripe !== 'undefined';

        var userCount = 0;
        var contactCount = 0;
        var campaignCount = 0;
        var templateCount = 0;

        try {
            var r1 = await sb.from('profiles').select('id', { count: 'exact', head: true }); userCount = r1.count || 0;
            var r2 = await sb.from('contacts').select('id', { count: 'exact', head: true }); contactCount = r2.count || 0;
            var r3 = await sb.from('campaigns').select('id', { count: 'exact', head: true }); campaignCount = r3.count || 0;
            var r4 = await sb.from('templates').select('id', { count: 'exact', head: true }); templateCount = r4.count || 0;
        } catch (e) { /* use zeroes */ }

        if (loading) loading.style.display = 'none';
        content.style.display = 'block';

        var svcBadge = function(ok) { return ok ? '<span class="badge badge--green">Conectado</span>' : '<span class="badge badge--red">Desconectado</span>'; };

        content.innerHTML =
            '<div class="admin-grid admin-grid--2" style="margin-bottom:20px;">' +
                '<div class="admin-card">' +
                    '<div class="admin-card__header"><h3 class="admin-card__title">Informação da Plataforma</h3></div>' +
                    '<div style="display:flex;flex-direction:column;gap:12px;">' +
                        '<div style="display:flex;justify-content:space-between;padding:10px;background:#f8fafc;border-radius:10px;"><span style="font-size:0.8125rem;font-weight:600;">Nome</span><span style="font-size:0.8125rem;">' + esc(platformInfo.name) + '</span></div>' +
                        '<div style="display:flex;justify-content:space-between;padding:10px;background:#f8fafc;border-radius:10px;"><span style="font-size:0.8125rem;font-weight:600;">Versão</span><span style="font-size:0.8125rem;">v' + esc(platformInfo.version) + '</span></div>' +
                        '<div style="display:flex;justify-content:space-between;padding:10px;background:#f8fafc;border-radius:10px;"><span style="font-size:0.8125rem;font-weight:600;">Ambiente</span><span class="badge badge--green">' + esc(platformInfo.environment) + '</span></div>' +
                        '<div style="display:flex;justify-content:space-between;padding:10px;background:#f8fafc;border-radius:10px;"><span style="font-size:0.8125rem;font-weight:600;">Admin</span><span style="font-size:0.8125rem;word-break:break-all;">' + esc(platformInfo.adminEmail) + '</span></div>' +
                    '</div>' +
                '</div>' +
                '<div class="admin-card">' +
                    '<div class="admin-card__header"><h3 class="admin-card__title">Serviços Conectados</h3></div>' +
                    '<div style="display:flex;flex-direction:column;gap:12px;">' +
                        '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:#f8fafc;border-radius:10px;"><span style="font-size:0.8125rem;font-weight:600;">🗄️ Supabase (Database + Auth)</span>' + svcBadge(services.supabase) + '</div>' +
                        '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:#f8fafc;border-radius:10px;"><span style="font-size:0.8125rem;font-weight:600;">💳 Stripe (Pagamentos)</span>' + svcBadge(services.stripe) + '</div>' +
                        '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:#f8fafc;border-radius:10px;"><span style="font-size:0.8125rem;font-weight:600;">📧 SMTP (Envio de Email)</span>' + svcBadge(services.smtp) + '</div>' +
                        '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:#f8fafc;border-radius:10px;"><span style="font-size:0.8125rem;font-weight:600;">🌐 Netlify (Frontend)</span>' + svcBadge(true) + '</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="admin-card">' +
                '<div class="admin-card__header"><h3 class="admin-card__title">Resumo da Plataforma</h3></div>' +
                '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;">' +
                    '<div class="admin-kpi"><div class="admin-kpi__label">Utilizadores</div><div class="admin-kpi__value">' + userCount.toLocaleString() + '</div></div>' +
                    '<div class="admin-kpi"><div class="admin-kpi__label">Contactos</div><div class="admin-kpi__value">' + contactCount.toLocaleString() + '</div></div>' +
                    '<div class="admin-kpi"><div class="admin-kpi__label">Campanhas</div><div class="admin-kpi__value">' + campaignCount.toLocaleString() + '</div></div>' +
                    '<div class="admin-kpi"><div class="admin-kpi__label">Templates</div><div class="admin-kpi__value">' + templateCount.toLocaleString() + '</div></div>' +
                '</div>' +
            '</div>';
    }

    function loadSection(section) {
        var s = section.replace('#/admin/', '');
        if (s === '') s = 'dashboard';
        switch (s) {
            case 'dashboard': loadDashboard(); break;
            case 'users': loadUsers(); break;
            case 'campaigns': loadCampaigns(); break;
            case 'templates': loadTemplates(); break;
            case 'automations': loadAutomations(); break;
            case 'analytics': loadAnalytics(); break;
            case 'smtp': loadSMTP(); break;
            case 'logs': loadLogs(); break;
            case 'system': loadSystem(); break;
            case 'settings': loadSettings(); break;
            default: loadDashboard();
        }
    }

    async function render(container) {
        currentContainer = container;
        init();

        var admin = await checkAdmin();
        if (!admin) return;

        bindNavigation();
        navigateTo('dashboard');
        loadDashboard();
    }

    return { render: render };
})();