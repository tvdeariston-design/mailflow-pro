/**
 * MailFlow Pro — View: Automações
 *
 * CRUD de regras de automação (trigger: novo contacto).
 * Em execução posterior: engine de automações.
 */

var AutomationsView = (function() {
    'use strict';

    var sb = null;
    var user = null;
    var currentContainer = null;
    var state = {
        automations: [],
        total: 0,
        page: 1,
        limit: 20,
        search: '',
        campaigns: [],
        loading: false,
        activeTab: 'automations',
        jobs: [],
        jobsTotal: 0,
        jobsPage: 1,
        jobsLimit: 20
    };

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

    function triggerLabel(trigger) {
        var map = { 'contact_created': 'Novo contacto' };
        return map[trigger] || trigger;
    }

    function delayLabel(minutes) {
        if (!minutes || minutes === 0) return 'Imediato';
        if (minutes < 60) return minutes + ' min';
        var h = Math.floor(minutes / 60);
        var m = minutes % 60;
        return h + 'h' + (m ? ' ' + m + 'min' : '');
    }

    function statusBadge(enabled) {
        return enabled
            ? '<span class="tl-badge tl-badge--green">Ativa</span>'
            : '<span class="tl-badge tl-badge--gray">Inativa</span>';
    }

    function getAPIBase() {
        var cfg = window.MailFlowAPI;
        if (cfg && cfg.email && cfg.email.send !== undefined) {
            return cfg.email.send.replace('/api/email/send', '');
        }
        return '';
    }

    async function getAccessToken() {
        try {
            var session = await MailFlowAuth.getSession();
            if (session && session.access_token) return session.access_token;
        } catch (e) { /* ignore */ }
        return null;
    }

    async function apiCall(method, path, body) {
        var token = await getAccessToken();
        if (!token) { MailFlowToast.error('Sessão expirada.'); return null; }
        var opts = {
            method: method,
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
        };
        if (body) opts.body = JSON.stringify(body);
        var resp = await fetch(getAPIBase() + path, opts);
        return resp.json();
    }

    // ========================================
    // Fetch
    // ========================================
    async function fetchAutomations() {
        if (!sb || !user) return { data: [], count: 0 };
        state.loading = true;
        try {
            var query = sb.from('automation_rules')
                .select('*, campaign:campaigns(id,nome)', { count: 'exact' })
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (state.search) {
                query = query.ilike('name', '%' + state.search + '%');
            }

            var from = (state.page - 1) * state.limit;
            query = query.range(from, from + state.limit - 1);

            var result = await query;
            state.automations = result.data || [];
            state.total = result.count || 0;
            state.loading = false;
            return { data: state.automations, count: state.total };
        } catch (err) {
            console.error('[Automations] Erro ao buscar:', err);
            state.loading = false;
            return { data: [], count: 0 };
        }
    }

    async function fetchCampaigns() {
        if (!sb || !user) return [];
        try {
            var r = await sb.from('campaigns')
                .select('id,nome')
                .eq('user_id', user.id)
                .is('deleted_at', null)
                .eq('status', 'sent')
                .order('created_at', { ascending: false });
            state.campaigns = r.data || [];
            return state.campaigns;
        } catch { return []; }
    }

    async function fetchJobs() {
        if (!sb || !user) return { data: [], count: 0 };
        state.loading = true;
        try {
            var from = (state.jobsPage - 1) * state.jobsLimit;
            var query = sb.from('automation_jobs')
                .select('*, automation:automation_rules(id,name), contact:contacts(id,nome,email), campaign:campaigns(id,nome)', { count: 'exact' })
                .eq('automation.user_id', user.id)
                .order('created_at', { ascending: false })
                .range(from, from + state.jobsLimit - 1);
            var result = await query;
            state.jobs = result.data || [];
            state.jobsTotal = result.count || 0;
            state.loading = false;
            return { data: state.jobs, count: state.jobsTotal };
        } catch (err) {
            console.error('[Automations] Erro ao buscar jobs:', err);
            state.loading = false;
            return { data: [], count: 0 };
        }
    }

    // ========================================
    // Render
    // ========================================
    function buildHTML(automations, total) {
        var isJobsTab = state.activeTab === 'jobs';

        if (isJobsTab) {
            return buildJobsHTML();
        }

        var rows = automations.map(function(a) {
            var campaignName = (a.campaign && a.campaign.nome) ? esc(a.campaign.nome) : '—';
            return '' +
                '<tr>' +
                    '<td><strong>' + esc(a.name) + '</strong></td>' +
                    '<td>' + triggerLabel(a.trigger_type) + '</td>' +
                    '<td>' + delayLabel(a.delay_minutes) + '</td>' +
                    '<td>' + campaignName + '</td>' +
                    '<td>' + statusBadge(a.enabled) + '</td>' +
                    '<td style="width:120px">' +
                        '<div class="tl-actions">' +
                            '<button class="tl-btn tl-btn--ghost tl-btn--sm" data-edit="' + a.id + '" title="Editar"><svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>' +
                            '<button class="tl-btn tl-btn--ghost tl-btn--sm" data-toggle="' + a.id + '" data-enabled="' + a.enabled + '" title="' + (a.enabled ? 'Desativar' : 'Ativar') + '">' +
                                (a.enabled
                                    ? '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'
                                    : '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>') +
                            '</button>' +
                            '<button class="tl-btn tl-btn--ghost tl-btn--sm tl-btn--danger" data-delete="' + a.id + '" title="Eliminar"><svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>' +
                        '</div>' +
                    '</td>' +
                '</tr>';
        }).join('');

        var totalPages = Math.ceil(total / state.limit);

        var pagination = '' +
            '<div class="tl-pagination">' +
                '<span class="tl-pagination__info">Página ' + state.page + ' de ' + totalPages + '</span>' +
                '<div class="tl-pagination__btns">' +
                    '<button class="tl-btn tl-btn--ghost tl-btn--sm" id="at-page-prev"' + (state.page <= 1 ? ' disabled' : '') + '>&larr; Anterior</button>' +
                    '<button class="tl-btn tl-btn--ghost tl-btn--sm" id="at-page-next"' + (state.page >= totalPages ? ' disabled' : '') + '>Próxima &rarr;</button>' +
                '</div>' +
            '</div>';

        if (automations.length === 0) {
            return renderEmpty() + pagination;
        }

        return '' +
            '<div class="ct-table-wrap"><table class="ct-table"><thead>' +
                '<tr><th>Nome</th><th>Trigger</th><th>Delay</th><th>Campanha</th><th>Estado</th><th style="width:120px">Ações</th></tr>' +
            '</thead><tbody>' + rows + '</tbody></table></div>' + pagination;

    function buildJobsHTML() {
        var jobs = state.jobs;
        var total = state.jobsTotal;
        var totalPages = Math.ceil(total / state.jobsLimit);

        var rows = jobs.map(function(j) {
            var automationName = (j.automation && j.automation.name) ? esc(j.automation.name) : '—';
            var contactName = (j.contact && j.contact.nome) ? esc(j.contact.nome) : '—';
            var contactEmail = (j.contact && j.contact.email) ? esc(j.contact.email) : '';
            var campaignName = (j.campaign && j.campaign.nome) ? esc(j.campaign.nome) : '—';
            var statusBadge = '';
            if (j.status === 'pending') statusBadge = '<span class="tl-badge tl-badge--yellow">Pendente</span>';
            else if (j.status === 'sent') statusBadge = '<span class="tl-badge tl-badge--green">Enviado</span>';
            else if (j.status === 'failed') statusBadge = '<span class="tl-badge tl-badge--red">Falhou</span>';
            else if (j.status === 'skipped') statusBadge = '<span class="tl-badge tl-badge--gray">Ignorado</span>';
            else statusBadge = '<span class="tl-badge tl-badge--gray">' + j.status + '</span>';
            var createdAt = j.created_at ? new Date(j.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

            return '' +
                '<tr>' +
                    '<td>' + createdAt + '</td>' +
                    '<td>' + automationName + '</td>' +
                    '<td>' + contactName + (contactEmail ? ' <' + contactEmail + '>' : '') + '</td>' +
                    '<td>' + campaignName + '</td>' +
                    '<td>' + statusBadge + '</td>' +
                '</tr>';
        }).join('');

        var pagination = '' +
            '<div class="tl-pagination">' +
                '<span class="tl-pagination__info">Página ' + state.jobsPage + ' de ' + totalPages + '</span>' +
                '<div class="tl-pagination__btns">' +
                    '<button class="tl-btn tl-btn--ghost tl-btn--sm" id="at-jobs-page-prev"' + (state.jobsPage <= 1 ? ' disabled' : '') + '>&larr; Anterior</button>' +
                    '<button class="tl-btn tl-btn--ghost tl-btn--sm" id="at-jobs-page-next"' + (state.jobsPage >= totalPages ? ' disabled' : '') + '>Próxima &rarr;</button>' +
                '</div>' +
            '</div>';

        if (jobs.length === 0) {
            return '' +
                '<div class="tl-empty">' +
                    '<div class="tl-empty__icon"><svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg></div>' +
                    '<h3 class="tl-empty__title">Nenhuma execução</h3>' +
                    '<p class="tl-empty__desc">As execuções de automações aparecerão aqui quando contactos forem adicionados.</p>' +
                '</div>' + pagination;
        }

        return '' +
            '<div class="ct-table-wrap"><table class="ct-table"><thead>' +
                '<tr><th>Data</th><th>Automação</th><th>Contacto</th><th>Campanha</th><th>Estado</th></tr>' +
            '</thead><tbody>' + rows + '</tbody></table></div>' + pagination;
    }
    }

    function renderEmpty() {
        return '' +
            '<div class="tl-empty">' +
                '<div class="tl-empty__icon"><svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg></div>' +
                '<h3 class="tl-empty__title">Ainda não tem automações</h3>' +
                '<p class="tl-empty__desc">Crie regras para enviar campanhas automaticamente quando um contacto é adicionado.</p>' +
                '<button class="tl-btn tl-btn--primary" id="at-btn-add-empty"><svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>Nova Automação</button>' +
            '</div>';
    }

    function renderEditor(automation) {
        var isEdit = !!automation;
        var delays = [
            { value: 0, label: 'Imediato' },
            { value: 5, label: '5 minutos' },
            { value: 30, label: '30 minutos' },
            { value: 60, label: '1 hora' },
            { value: 1440, label: '1 dia' }
        ];

        var delayOptions = delays.map(function(d) {
            return '<option value="' + d.value + '"' + (automation && automation.delay_minutes === d.value ? ' selected' : '') + '>' + d.label + '</option>';
        }).join('');

        var campaignOptions = state.campaigns.map(function(c) {
            return '<option value="' + c.id + '"' + (automation && automation.campaign_id === c.id ? ' selected' : '') + '>' + esc(c.nome) + '</option>';
        }).join('');

        var name = isEdit ? esc(automation.name) : '';
        var enabled = isEdit ? automation.enabled : false;
        var trigger = isEdit ? automation.trigger_type : 'contact_created';
        var delay = isEdit ? automation.delay_minutes : 0;
        var campaign = isEdit ? automation.campaign_id : '';

        return '' +
            '<div class="tl-modal" id="at-modal-editor" role="dialog" aria-modal="true">' +
                '<div class="tl-modal__overlay"></div>' +
                '<div class="tl-modal__content" style="max-width:560px;">' +
                    '<div class="tl-modal__header">' +
                        '<h3 class="tl-modal__title">' + (isEdit ? 'Editar Automação' : 'Nova Automação') + '</h3>' +
                        '<button class="tl-modal__close" id="at-modal-close" aria-label="Fechar"><svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg></button>' +
                    '</div>' +
                    '<div class="tl-modal__body">' +
                        '<div class="tl-field">' +
                            '<label class="tl-label" for="at-name">Nome</label>' +
                            '<input class="tl-input" type="text" id="at-name" value="' + name + '" placeholder="Ex: Boas-vindas para novos contactos" required>' +
                        '</div>' +
                        '<div class="tl-field">' +
                            '<label class="tl-label" for="at-trigger">Trigger</label>' +
                            '<select class="tl-input tl-input--select" id="at-trigger" disabled>' +
                                '<option value="contact_created"' + (trigger === 'contact_created' ? ' selected' : '') + '>Novo contacto</option>' +
                            '</select>' +
                            '<p class="tl-field__hint">Apenas "Novo contacto" disponível por enquanto.</p>' +
                        '</div>' +
                        '<div class="tl-field">' +
                            '<label class="tl-label" for="at-delay">Delay</label>' +
                            '<select class="tl-input tl-input--select" id="at-delay">' + delayOptions + '</select>' +
                        '</div>' +
                        '<div class="tl-field">' +
                            '<label class="tl-label" for="at-campaign">Campanha a enviar</label>' +
                            '<select class="tl-input tl-input--select" id="at-campaign" required>' +
                                '<option value="">Selecione uma campanha...</option>' + campaignOptions +
                            '</select>' +
                        '</div>' +
                        '<div class="tl-field">' +
                            '<label class="tl-label">Estado</label>' +
                            '<div class="tl-checkbox-wrapper">' +
                                '<input type="checkbox" class="tl-checkbox" id="at-enabled"' + (enabled ? ' checked' : '') + '>' +
                                '<label class="tl-checkbox-label" for="at-enabled">' +
                                    '<span class="tl-checkbox-box">' +
                                        '<svg class="tl-checkbox-check" width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7L6 10L11 4" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
                                    '</span>' +
                                    'Ativa' +
                                '</label>' +
                            '</div>' +
                        '</div>' +
                        '<div id="at-editor-status" style="margin-bottom:16px;"></div>' +
                        '<div class="tl-modal__actions">' +
                            '<button class="tl-btn tl-btn--ghost" id="at-btn-cancel">Cancelar</button>' +
                            '<button class="tl-btn tl-btn--primary" id="at-btn-save"><svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>' + (isEdit ? 'Guardar Alterações' : 'Criar Automação') + '</button>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>';
    }

    // ========================================
    // Actions
    // ========================================
    async function createAutomation(data) {
        var result = await apiCall('POST', '/api/automations', data);
        if (result && result.success) {
            MailFlowToast.success('Automação criada com sucesso.');
            closeModal();
            refresh();
        } else {
            MailFlowToast.error(result ? result.error : 'Erro ao criar automação.');
        }
    }

    async function updateAutomation(id, data) {
        var result = await apiCall('PUT', '/api/automations/' + id, data);
        if (result && result.success) {
            MailFlowToast.success('Automação atualizada.');
            closeModal();
            refresh();
        } else {
            MailFlowToast.error(result ? result.error : 'Erro ao atualizar automação.');
        }
    }

    async function toggleAutomation(id, enabled) {
        var result = await apiCall('PUT', '/api/automations/' + id, { enabled: enabled });
        if (result && result.success) {
            MailFlowToast.success(enabled ? 'Automação ativada.' : 'Automação desativada.');
            refresh();
        } else {
            MailFlowToast.error(result ? result.error : 'Erro ao alterar estado.');
        }
    }

    async function deleteAutomation(id) {
        if (!confirm('Eliminar esta automação?')) return;
        var result = await apiCall('DELETE', '/api/automations/' + id);
        if (result && result.success) {
            MailFlowToast.success('Automação eliminada.');
            refresh();
        } else {
            MailFlowToast.error(result ? result.error : 'Erro ao eliminar automação.');
        }
    }

    function openEditor(automation) {
        var modalHtml = renderEditor(automation);
        var wrapper = document.createElement('div');
        wrapper.innerHTML = modalHtml;
        document.body.appendChild(wrapper.firstElementChild);
        bindEditorEvents(automation);
    }

    function closeModal() {
        var modal = document.getElementById('at-modal-editor');
        if (modal) modal.remove();
    }

    function bindEditorEvents(automation) {
        var isEdit = !!automation;

        var closeBtn = document.getElementById('at-modal-close');
        var cancelBtn = document.getElementById('at-btn-cancel');
        var saveBtn = document.getElementById('at-btn-save');
        var overlay = document.querySelector('#at-modal-editor .tl-modal__overlay');

        [closeBtn, cancelBtn, overlay].forEach(function(el) {
            if (el) el.addEventListener('click', closeModal);
        });

        if (saveBtn) {
            saveBtn.addEventListener('click', async function() {
                var statusEl = document.getElementById('at-editor-status');
                var name = (document.getElementById('at-name').value || '').trim();
                var delay = parseInt(document.getElementById('at-delay').value, 10) || 0;
                var campaign = document.getElementById('at-campaign').value;
                var enabled = document.getElementById('at-enabled').checked;

                if (!name) {
                    statusEl.innerHTML = '<div style="padding:10px 14px;background:#fee2e2;color:#dc2626;border-radius:8px;font-size:.8125rem;font-weight:500;">Nome é obrigatório.</div>';
                    return;
                }
                if (!campaign) {
                    statusEl.innerHTML = '<div style="padding:10px 14px;background:#fee2e2;color:#dc2626;border-radius:8px;font-size:.8125rem;font-weight:500;">Selecione uma campanha.</div>';
                    return;
                }

                saveBtn.disabled = true;
                saveBtn.innerHTML = '<svg class="tl-spinner" fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m9.24-2.83l2.83 2.83M2 12h4m16 0h4"/></svg> A guardar...';

                var data = { name: name, trigger_type: 'contact_created', delay_minutes: delay, campaign_id: campaign, enabled: enabled };

                if (isEdit) {
                    await updateAutomation(automation.id, data);
                } else {
                    await createAutomation(data);
                }

                saveBtn.disabled = false;
                saveBtn.innerHTML = '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>' + (isEdit ? 'Guardar Alterações' : 'Criar Automação');
            });
        }
    }

    // ========================================
    // Events
    // ========================================
    function bindEvents() {
        var addBtn = document.getElementById('at-btn-add');
        var addEmpty = document.getElementById('at-btn-add-empty');
        var searchInput = document.getElementById('at-search');
        var prevBtn = document.getElementById('at-page-prev');
        var nextBtn = document.getElementById('at-page-next');

        if (addBtn) addBtn.addEventListener('click', function() { openEditor(null); });
        if (addEmpty) addEmpty.addEventListener('click', function() { openEditor(null); });

        if (searchInput) {
            var dt; searchInput.addEventListener('input', function() {
                clearTimeout(dt); var v = this.value;
                dt = setTimeout(function() { state.search = v; state.page = 1; refresh(); }, 300);
            });
        }

        if (prevBtn) prevBtn.addEventListener('click', function() { state.page--; refresh(); });
        if (nextBtn) nextBtn.addEventListener('click', function() { state.page++; refresh(); });

        // Delegate action buttons
        var tbody = document.querySelector('.ct-table tbody');
        if (tbody) {
            tbody.addEventListener('click', function(e) {
                var btn = e.target.closest('button');
                if (!btn) return;
                var editId = btn.getAttribute('data-edit');
                var toggleId = btn.getAttribute('data-toggle');
                var deleteId = btn.getAttribute('data-delete');
                var enabled = btn.getAttribute('data-enabled');

                if (editId) { openEditor(state.automations.find(function(a) { return a.id === editId; })); }
                else if (toggleId) { toggleAutomation(toggleId, enabled !== 'true'); }
                else if (deleteId) { deleteAutomation(deleteId); }
            });
        }
    }

    // ========================================
    // Refresh
    // ========================================
    async function refresh() {
        if (!currentContainer) return;
        var result = await fetchAutomations();
        currentContainer.innerHTML = buildHTML(result.data, result.count);
        bindEvents();
    }

    // ========================================
    // Public
    // ========================================
    async function render(container) {
        currentContainer = container;
        init();

        user = await MailFlowAuth.getUser();
        if (!user) return;

        container.innerHTML = '<div style="text-align:center;padding:60px;color:#9ca3af;font-size:.875rem;">A carregar automações...</div>';

        await fetchCampaigns();

        var automationsResult = await fetchAutomations();
        var jobsResult = await fetchJobs();
        container.innerHTML = buildHTML(automationsResult.data, automationsResult.count);
        bindEvents();
    }

    return { render: render };
})();
