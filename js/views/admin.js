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
        var container = document.getElementById('admin-content');
        if (!container) return;
        var section = document.getElementById('section-dashboard');
        if (!section) return;

        var kpiGrid = section.querySelector('#kpi-dashboard');
        if (kpiGrid && !kpiGrid.dataset.loaded) {
            kpiGrid.dataset.loaded = 'true';
            kpiGrid.innerHTML = '';

            var kpis = [
                { label:'Total Utilizadores', value:'—', change:'loading', cls:'' },
                { label:'Premium', value:'—', change:'loading', cls:'' },
                { label:'Campanhas', value:'—', change:'loading', cls:'' },
                { label:'Emails Enviados', value:'—', change:'loading', cls:'' }
            ];

            try {
                if (sb) {
                    var countResp = await sb.from('auth.users').select('*', { count: 'exact', head: true });
                    var totalUsers = countResp.count || 0;
                    var premiumResp = await sb.from('profiles').select('*', { count: 'exact', head: true }).eq('plan', 'premium');
                    var premiumUsers = premiumResp.count || 0;
                    var campResp = await sb.from('campaigns').select('*', { count: 'exact', head: true });
                    var totalCampaigns = campResp.count || 0;
                    kpis[0].value = totalUsers.toLocaleString();
                    kpis[1].value = premiumUsers.toLocaleString();
                    kpis[2].value = totalCampaigns.toLocaleString();
                    kpis[3].value = '-';
                }
            } catch (e) { /* keep placeholder */ }

            kpis.forEach(function(k) {
                var changeClass = k.change === 'loading' ? 'admin-kpi__change--neutral' : (k.change.indexOf('up') >= 0 ? 'admin-kpi__change--up' : 'admin-kpi__change--down');
                var card = document.createElement('div');
                card.className = 'admin-kpi';
                card.innerHTML = '<div class="admin-kpi__label">' + esc(k.label) + '</div><div class="admin-kpi__value">' + esc(k.value) + '</div><div class="admin-kpi__change ' + changeClass + '">' + esc(k.change) + '</div>';
                kpiGrid.appendChild(card);
            });
        }
    }

    async function loadUsers() {
        var section = document.getElementById('section-users');
        if (!section) return;
        var table = section.querySelector('#admin-users-table tbody');
        var countEl = section.querySelector('#admin-user-count');
        if (!table) return;

        table.innerHTML = '<tr><td colspan="6"><div class="skeleton skeleton-line skeleton-line--lg"></div><div class="skeleton skeleton-line" style="margin-top:8px"></div><div class="skeleton skeleton-line skeleton-line--sm"></div></td></tr>';

        try {
            if (sb) {
                var result = await sb.from('profiles').select('*').order('created_at', { ascending: false }).limit(50);
                var data = result.data || [];
                if (countEl) countEl.textContent = data.length + ' utilizadores';

                if (data.length === 0) {
                    table.innerHTML = '<tr><td colspan="6"><div class="empty"><div class="empty__icon"><svg width="40" height="40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg></div><p class="empty__title">Nenhum utilizador</p></div></td></tr>';
                    return;
                }

                var html = '';
                data.forEach(function(u) {
                    var plan = u.plan || 'free';
                    var planBadge = plan === 'premium' ? 'badge--green' : (plan === 'trial' ? 'badge--yellow' : 'badge--gray');
                    var statusBadge = u.enabled !== false ? 'badge--green' : 'badge--red';
                    var lastLogin = u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString('pt-PT', { day:'2-digit', month:'short', year:'numeric' }) : '—';
                    html += '<tr>' +
                        '<td><strong>' + esc(u.full_name || u.email || '—') + '</strong></td>' +
                        '<td>' + esc(u.email || '—') + '</td>' +
                        '<td><span class="badge ' + planBadge + '">' + esc(plan) + '</span></td>' +
                        '<td>' + lastLogin + '</td>' +
                        '<td><span class="badge ' + statusBadge + '">' + (u.enabled !== false ? 'Ativo' : 'Suspenso') + '</span></td>' +
                        '<td><div style="display:flex;gap:4px;flex-wrap:wrap;">' +
                            '<button class="btn btn--ghost btn--sm" data-action="view" data-id="' + esc(u.id) + '">Ver</button>' +
                            '<button class="btn btn--ghost btn--sm" data-action="edit" data-id="' + esc(u.id) + '">Editar</button>' +
                            '<button class="btn btn--danger btn--sm" data-action="delete" data-id="' + esc(u.id) + '">Eliminar</button>' +
                        '</div></td>' +
                    '</tr>';
                });
                table.innerHTML = html;

                table.addEventListener('click', function(e) {
                    var btn = e.target.closest('button');
                    if (!btn) return;
                    var action = btn.getAttribute('data-action');
                    var id = btn.getAttribute('data-id');
                    if (action === 'view') { console.log('View user:', id); }
                    else if (action === 'edit') { console.log('Edit user:', id); }
                    else if (action === 'delete') {
                        if (confirm('Eliminar este utilizador?')) { console.log('Delete user:', id); }
                    }
                });
            }
        } catch (e) {
            table.innerHTML = '<tr><td colspan="6"><div class="empty"><p class="empty__title">Erro ao carregar utilizadores</p></div></td></tr>';
        }
    }

    async function loadCampaigns() {
        var section = document.getElementById('section-campaigns');
        if (!section) return;
        var table = section.querySelector('#admin-campaigns-table tbody');
        var countEl = section.querySelector('#admin-campaign-count');
        if (!table) return;

        table.innerHTML = '<tr><td colspan="8"><div class="skeleton skeleton-line skeleton-line--lg"></div><div class="skeleton skeleton-line" style="margin-top:8px"></div></td></tr>';

        try {
            if (sb) {
                var result = await sb.from('campaigns').select('*').order('created_at', { ascending: false }).limit(50);
                var data = result.data || [];
                if (countEl) countEl.textContent = data.length + ' campanhas';

                if (data.length === 0) {
                    table.innerHTML = '<tr><td colspan="8"><div class="empty"><p class="empty__title">Nenhuma campanha</p></div></td></tr>';
                    return;
                }

                var html = '';
                data.forEach(function(c) {
                    var status = c.status || 'draft';
                    var statusBadge = status === 'sent' ? 'badge--green' : (status === 'active' ? 'badge--indigo' : (status === 'draft' ? 'badge--gray' : 'badge--yellow'));
                    var openRate = c.stats && c.stats.open_rate != null ? c.stats.open_rate + '%' : '—';
                    var clickRate = c.stats && c.stats.click_rate != null ? c.stats.click_rate + '%' : '—';
                    html += '<tr>' +
                        '<td><strong>' + esc(c.name) + '</strong></td>' +
                        '<td>' + esc(c.owner_id || '—') + '</td>' +
                        '<td><span class="badge ' + statusBadge + '">' + esc(status) + '</span></td>' +
                        '<td>' + (c.stats && c.stats.sent != null ? c.stats.sent : '—') + '</td>' +
                        '<td>' + openRate + '</td>' +
                        '<td>' + clickRate + '</td>' +
                        '<td>' + (c.stats && c.stats.failed != null ? c.stats.failed : '—') + '</td>' +
                        '<td>' + (c.created_at ? new Date(c.created_at).toLocaleDateString('pt-PT', { day:'2-digit', month:'short', year:'numeric' }) : '—') + '</td>' +
                    '</tr>';
                });
                table.innerHTML = html;
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

        table.innerHTML = '<tr><td colspan="4"><div class="skeleton skeleton-line skeleton-line--lg"></div><div class="skeleton skeleton-line" style="margin-top:8px"></div></td></tr>';

        try {
            if (sb) {
                var result = await sb.from('templates').select('*').order('created_at', { ascending: false }).limit(50);
                var data = result.data || [];
                if (countEl) countEl.textContent = data.length + ' templates';

                if (data.length === 0) {
                    table.innerHTML = '<tr><td colspan="4"><div class="empty"><p class="empty__title">Nenhum template</p></div></td></tr>';
                    return;
                }

                var html = '';
                data.forEach(function(t) {
                    html += '<tr>' +
                        '<td><strong>' + esc(t.name) + '</strong></td>' +
                        '<td>' + esc(t.user_id || '—') + '</td>' +
                        '<td>' + (t.created_at ? new Date(t.created_at).toLocaleDateString('pt-PT', { day:'2-digit', month:'short', year:'numeric' }) : '—') + '</td>' +
                        '<td><div style="display:flex;gap:4px;"><button class="btn btn--ghost btn--sm" data-action="duplicate" data-id="' + esc(t.id) + '">Duplicar</button><button class="btn btn--danger btn--sm" data-action="delete" data-id="' + esc(t.id) + '">Eliminar</button></div></td>' +
                    '</tr>';
                });
                table.innerHTML = html;

                table.addEventListener('click', function(e) {
                    var btn = e.target.closest('button');
                    if (!btn) return;
                    var action = btn.getAttribute('data-action');
                    var id = btn.getAttribute('data-id');
                    console.log(action + ' template:', id);
                });
            }
        } catch (e) {
            table.innerHTML = '<tr><td colspan="4"><div class="empty"><p class="empty__title">Erro ao carregar templates</p></div></td></tr>';
        }
    }

    async function loadAutomations() {
        var section = document.getElementById('section-automations');
        if (!section) return;
        var table = section.querySelector('#admin-automations-table tbody');
        var countEl = section.querySelector('#admin-automation-count');
        if (!table) return;

        table.innerHTML = '<tr><td colspan="8"><div class="skeleton skeleton-line skeleton-line--lg"></div><div class="skeleton skeleton-line" style="margin-top:8px"></div></td></tr>';

        try {
            if (sb) {
                var result = await sb.from('automation_rules').select('*').order('created_at', { ascending: false }).limit(50);
                var data = result.data || [];
                if (countEl) countEl.textContent = data.length + ' regras';

                if (data.length === 0) {
                    table.innerHTML = '<tr><td colspan="8"><div class="empty"><p class="empty__title">Nenhuma automação</p></div></td></tr>';
                    return;
                }

                var html = '';
                data.forEach(function(a) {
                    var statusBadge = a.enabled ? 'badge--green' : 'badge--gray';
                    var triggerLabel = a.trigger_type === 'contact_created' ? 'Novo contacto' : (a.trigger_type || '—');
                    html += '<tr>' +
                        '<td><strong>' + esc(a.name) + '</strong></td>' +
                        '<td>' + esc(a.user_id || '—') + '</td>' +
                        '<td>' + esc(triggerLabel) + '</td>' +
                        '<td><span class="badge ' + statusBadge + '">' + (a.enabled ? 'Ativa' : 'Inativa') + '</span></td>' +
                        '<td>—</td><td>—</td><td>—</td>' +
                        '<td><button class="btn btn--ghost btn--sm" data-action="view" data-id="' + esc(a.id) + '">Ver</button></td>' +
                    '</tr>';
                });
                table.innerHTML = html;

                table.addEventListener('click', function(e) {
                    var btn = e.target.closest('button');
                    if (!btn) return;
                    var action = btn.getAttribute('data-action');
                    var id = btn.getAttribute('data-id');
                    console.log(action + ' automation:', id);
                });
            }
        } catch (e) {
            table.innerHTML = '<tr><td colspan="8"><div class="empty"><p class="empty__title">Erro ao carregar automações</p></div></td></tr>';
        }
    }

    async function loadAnalytics() {
        var section = document.getElementById('section-analytics');
        if (!section) return;
        var kpiGrid = section.querySelector('#kpi-analytics');
        if (kpiGrid && !kpiGrid.dataset.loaded) {
            kpiGrid.dataset.loaded = 'true';
            kpiGrid.innerHTML = '';
            var kpis = [
                { label:'Taxa Abertura', value:'—', change:'—' },
                { label:'Taxa Cliques', value:'—', change:'—' },
                { label:'Taxa Conversão', value:'—', change:'—' },
                { label:'Bounce Rate', value:'—', change:'—' }
            ];
            kpis.forEach(function(k) {
                var card = document.createElement('div');
                card.className = 'admin-kpi';
                card.innerHTML = '<div class="admin-kpi__label">' + esc(k.label) + '</div><div class="admin-kpi__value">' + esc(k.value) + '</div><div class="admin-kpi__change admin-kpi__change--neutral">' + esc(k.change) + '</div>';
                kpiGrid.appendChild(card);
            });
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
                var result = await sb.from('profiles').select('smtp_host,smtp_port,smtp_username,smtp_secure,smtp_status').limit(20);
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
                    html += '<tr>' +
                        '<td>' + esc(c.smtp_host) + '</td>' +
                        '<td>' + esc(c.smtp_port) + '</td>' +
                        '<td>' + esc(c.smtp_username || '—') + '</td>' +
                        '<td>' + (c.smtp_secure ? 'SSL/TLS' : '—') + '</td>' +
                        '<td><span class="badge ' + statusBadge + '">' + esc(status) + '</span></td>' +
                        '<td>—</td>' +
                        '<td><button class="btn btn--ghost btn--sm" data-action="test" data-host="' + esc(c.smtp_host) + '">Testar</button><button class="btn btn--danger btn--sm">Eliminar</button></td>' +
                    '</tr>';
                });
                table.innerHTML = html;

                table.addEventListener('click', function(e) {
                    var btn = e.target.closest('button');
                    if (!btn) return;
                    var action = btn.getAttribute('data-action');
                    var host = btn.getAttribute('data-host');
                    if (action === 'test') console.log('Test SMTP:', host);
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

        table.innerHTML = '<tr><td colspan="5"><div class="skeleton skeleton-line skeleton-line--lg"></div><div class="skeleton skeleton-line" style="margin-top:8px"></div></td></tr>';

        try {
            if (sb) {
                var result = await sb.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(50);
                var data = result.data || [];
                if (countEl) countEl.textContent = data.length + ' entradas';

                if (data.length === 0) {
                    table.innerHTML = '<tr><td colspan="5"><div class="empty"><p class="empty__title">Nenhum log</p></div></td></tr>';
                    return;
                }

                var html = '';
                data.forEach(function(l) {
                    var type = l.event_type || l.type || 'info';
                    var typeBadge = type === 'login' ? 'badge--indigo' : (type === 'error' ? 'badge--red' : (type === 'webhook' ? 'badge--blue' : 'badge--gray'));
                    html += '<tr>' +
                        '<td>' + (l.created_at ? new Date(l.created_at).toLocaleString('pt-PT') : '—') + '</td>' +
                        '<td><span class="badge ' + typeBadge + '">' + esc(type) + '</span></td>' +
                        '<td>' + esc(l.user_id || '—') + '</td>' +
                        '<td>' + esc(l.description || l.message || '—') + '</td>' +
                        '<td><code style="font-size:0.75rem;color:#64748b;">' + esc(JSON.stringify(l.details || l.metadata || {}).substring(0, 60)) + '</code></td>' +
                    '</tr>';
                });
                table.innerHTML = html;
            }
        } catch (e) {
            table.innerHTML = '<tr><td colspan="5"><div class="empty"><p class="empty__title">Erro ao carregar logs</p></div></td></tr>';
        }
    }

    async function loadSystem() {
        var section = document.getElementById('section-system');
        if (!section) return;
        var kpiGrid = section.querySelector('#kpi-system');
        if (kpiGrid && !kpiGrid.dataset.loaded) {
            kpiGrid.dataset.loaded = 'true';
            kpiGrid.innerHTML = '';
            var kpis = [
                { label:'Versão', value:'1.0.0', change:'Stable' },
                { label:'Uptime', value:'—', change:'—' },
                { label:'Supabase', value:'—', change:'—' },
                { label:'Netlify', value:'—', change:'—' }
            ];
            kpis.forEach(function(k) {
                var card = document.createElement('div');
                card.className = 'admin-kpi';
                card.innerHTML = '<div class="admin-kpi__label">' + esc(k.label) + '</div><div class="admin-kpi__value">' + esc(k.value) + '</div><div class="admin-kpi__change admin-kpi__change--neutral">' + esc(k.change) + '</div>';
                kpiGrid.appendChild(card);
            });
        }

        var table = section.querySelector('#admin-system-table tbody');
        if (table && !table.dataset.loaded) {
            table.dataset.loaded = 'true';
            table.innerHTML = '';
            var services = [
                { name:'Supabase', status:'healthy', version:'—', uptime:'—' },
                { name:'Netlify', status:'healthy', version:'—', uptime:'—' },
                { name:'Storage', status:'healthy', version:'—', uptime:'—' },
                { name:'Cron Jobs', status:'healthy', version:'—', uptime:'—' },
                { name:'Background Workers', status:'healthy', version:'—', uptime:'—' }
            ];
            var html = '';
            services.forEach(function(s) {
                var statusBadge = s.status === 'healthy' ? 'badge--green' : 'badge--red';
                html += '<tr>' +
                    '<td><strong>' + esc(s.name) + '</strong></td>' +
                    '<td><span class="badge ' + statusBadge + '">' + esc(s.status) + '</span></td>' +
                    '<td>' + esc(s.version) + '</td>' +
                    '<td>' + esc(s.uptime) + '</td>' +
                    '<td><code style="font-size:0.75rem;">OK</code></td>' +
                '</tr>';
            });
            table.innerHTML = html;
        }
    }

    function loadSettings() {
        var section = document.getElementById('section-settings');
        if (!section) return;
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