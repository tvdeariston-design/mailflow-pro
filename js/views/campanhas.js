/**
 * MailFlow Pro — View: Campanhas
 *
 * Gestao de campanhas de email marketing.
 * CRUD + motor de envio (send, pause, resume, cancel).
 * Progress bar com polling.
 */

var CampanhasView = (function() {
    'use strict';

    var sb = null;
    var user = null;
    var currentContainer = null;
    var state = {
        campaigns: [],
        total: 0,
        page: 1,
        limit: 20,
        search: '',
        filterStatus: '',
        loading: false
    };
    var pollingTimers = {};

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
        return '<span class="tl-badge ' + (map[status] || 'tl-badge--gray') + '">' + (labels[status] || status) + '</span>';
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
        if (!token) { MailFlowToast.error('Sessao expirada.'); return null; }
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
    async function fetchCampaigns() {
        if (!sb || !user) return { data: [], count: 0 };
        state.loading = true;
        try {
            var query = sb.from('campaigns').select('*', { count: 'exact' })
                .eq('user_id', user.id).is('deleted_at', null)
                .order('created_at', { ascending: false });

            if (state.search) {
                query = query.or('nome.ilike.%' + state.search + '%,assunto.ilike.%' + state.search + '%');
            }
            if (state.filterStatus) {
                query = query.eq('status', state.filterStatus);
            }

            var from = (state.page - 1) * state.limit;
            query = query.range(from, from + state.limit - 1);

            var result = await query;
            state.campaigns = result.data || [];
            state.total = result.count || 0;
            state.loading = false;
            return { data: state.campaigns, count: state.total };
        } catch (err) {
            console.error('[Campanhas] Erro ao buscar:', err);
            state.loading = false;
            return { data: [], count: 0 };
        }
    }

    async function fetchTemplates() {
        if (!sb || !user) return [];
        try {
            var r = await sb.from('templates').select('id, nome, subject').eq('user_id', user.id).is('deleted_at', null).order('created_at', { ascending: false });
            return r.data || [];
        } catch { return []; }
    }

    async function fetchContacts() {
        if (!sb || !user) return [];
        try {
            var r = await sb.from('contacts').select('id, nome, email, tags').eq('user_id', user.id).order('created_at', { ascending: false });
            return r.data || [];
        } catch { return []; }
    }

    // ========================================
    // Polling
    // ========================================
    function startPolling(campaignId) {
        if (pollingTimers[campaignId]) return;
        pollingTimers[campaignId] = setInterval(async function() {
            var result = await apiCall('GET', '/api/campaigns/' + campaignId + '/progress');
            if (result && result.success) {
                var c = result.campaign;
                // Update progress bar in DOM
                var bar = document.getElementById('cp-progress-' + campaignId);
                if (bar) {
                    bar.style.width = (c.progress_percent || 0) + '%';
                    bar.textContent = (c.progress_percent || 0) + '%';
                }
                var info = document.getElementById('cp-progress-info-' + campaignId);
                if (info) {
                    info.textContent = (c.total_sent || 0) + ' / ' + (c.total_recipients || 0) + ' enviados';
                }
                // Update status badge if changed
                var badge = document.getElementById('cp-status-' + campaignId);
                if (badge) {
                    badge.outerHTML = statusBadge(c.status);
                    badge.id = 'cp-status-' + campaignId;
                }
                // Stop polling if finished
                if (c.status !== 'sending') {
                    stopPolling(campaignId);
                    // Update action buttons
                    updateActionButtons(campaignId, c.status);
                    // Refresh list
                    refresh();
                }
            }
        }, 2000);
    }

    function stopPolling(campaignId) {
        if (pollingTimers[campaignId]) {
            clearInterval(pollingTimers[campaignId]);
            delete pollingTimers[campaignId];
        }
    }

    function stopAllPolling() {
        Object.keys(pollingTimers).forEach(stopPolling);
    }

    function updateActionButtons(campaignId, status) {
        var actions = document.querySelector('[data-actions="' + campaignId + '"]');
        if (actions) {
            actions.innerHTML = getActionButtons(campaignId, status);
            bindActionButtons(campaignId, status);
        }
    }

    // ========================================
    // Render
    // ========================================
    async function render(container) {
        stopAllPolling();
        init();
        currentContainer = container;
        user = await MailFlowAuth.getUser();
        if (!user) return;
        state.page = 1; state.search = ''; state.filterStatus = '';
        var result = await fetchCampaigns();
        container.innerHTML = buildHTML(result.data, result.count);
        bindEvents();
        updateBadge(result.count);
        // Start polling for active campaigns
        result.data.forEach(function(c) {
            if (c.status === 'sending') startPolling(c.id);
        });
    }

    function getActionButtons(id, status) {
        var btns = '';
        if (status === 'draft') {
            btns += '<button class="tl-action tl-action--send" data-action="send" data-id="' + id + '" title="Enviar"><svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg></button>';
            btns += '<button class="tl-action tl-action--edit" data-action="edit" data-id="' + id + '" title="Editar"><svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>';
        } else if (status === 'sending') {
            btns += '<button class="tl-action tl-action--pause" data-action="pause" data-id="' + id + '" title="Pausar"><svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></button>';
        } else if (status === 'paused') {
            btns += '<button class="tl-action tl-action--send" data-action="resume" data-id="' + id + '" title="Retomar"><svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></button>';
            btns += '<button class="tl-action tl-action--cancel" data-action="cancel" data-id="' + id + '" title="Cancelar"><svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg></button>';
        } else if (status === 'failed') {
            btns += '<button class="tl-action tl-action--send" data-action="resume" data-id="' + id + '" title="Tentar novamente"><svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg></button>';
        }
        btns += '<button class="tl-action tl-action--duplicate" data-action="duplicate" data-id="' + id + '" title="Duplicar"><svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg></button>';
        btns += '<button class="tl-action tl-action--delete" data-action="delete" data-id="' + id + '" title="Eliminar"><svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>';
        return btns;
    }

    function renderProgressBar(c) {
        if (c.status !== 'sending' && c.status !== 'paused') return '';
        var pct = c.progress_percent || 0;
        return '' +
            '<div class="cp-progress">' +
                '<div class="cp-progress__bar" id="cp-progress-' + c.id + '" style="width:' + pct + '%">' + pct + '%</div>' +
            '</div>' +
            '<div class="cp-progress__info" id="cp-progress-info-' + c.id + '">' + (c.total_sent || 0) + ' / ' + (c.total_recipients || 0) + ' enviados</div>';
    }

    function buildHTML(campaigns, total) {
        return renderToolbar(total) +
            (campaigns.length === 0 && !state.search && !state.filterStatus ? renderEmpty() : renderTable(campaigns, total));
    }

    function renderToolbar(total) {
        var statuses = ['', 'draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled', 'failed'];
        var statusLabels = { '': 'Todos', draft: 'Rascunho', scheduled: 'Agendada', sending: 'A enviar', sent: 'Enviada', paused: 'Pausada', cancelled: 'Cancelada', failed: 'Falhou' };
        var opts = statuses.map(function(s) {
            var sel = state.filterStatus === s ? ' selected' : '';
            return '<option value="' + s + '"' + sel + '>' + statusLabels[s] + '</option>';
        }).join('');

        return '' +
            '<div class="tl-toolbar">' +
                '<div class="tl-toolbar__left">' +
                    '<h2 class="tl-toolbar__title">Campanhas <span class="tl-toolbar__count">(' + total + ')</span></h2>' +
                '</div>' +
                '<div class="tl-toolbar__right">' +
                    '<div class="tl-search">' +
                        '<svg class="tl-search__icon" width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>' +
                        '<input type="text" class="tl-search__input" id="cp-search" placeholder="Pesquisar campanha..." value="' + esc(state.search) + '">' +
                    '</div>' +
                    '<select class="tl-input tl-input--select" id="cp-filter-status" style="width:140px;padding:8px 12px;">' + opts + '</select>' +
                    '<button class="tl-btn tl-btn--primary" id="cp-btn-add">' +
                        '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>' +
                        'Nova Campanha' +
                    '</button>' +
                '</div>' +
            '</div>';
    }

    function renderTable(campaigns, total) {
        var totalPages = Math.ceil(total / state.limit);
        var rows = campaigns.map(function(c) {
            return '' +
                '<tr class="ct-row">' +
                    '<td>' +
                        '<div class="ct-row__info">' +
                            '<div class="ct-row__title">' + esc(c.nome || 'Sem nome') + '</div>' +
                            '<div class="ct-row__subtitle">' + esc(c.assunto || 'Sem assunto') + '</div>' +
                            renderProgressBar(c) +
                        '</div>' +
                    '</td>' +
                    '<td id="cp-status-' + c.id + '">' + statusBadge(c.status) + '</td>' +
                    '<td>' + (c.total_recipients || 0) + '</td>' +
                    '<td>' + formatDate(c.created_at) + '</td>' +
                    '<td class="ct-row__actions" data-actions="' + c.id + '">' +
                        getActionButtons(c.id, c.status) +
                    '</td>' +
                '</tr>';
        }).join('');

        var pagination = '';
        if (totalPages > 1) {
            pagination = '<div class="tl-pagination"><span class="tl-pagination__info">Pagina ' + state.page + ' de ' + totalPages + '</span><div class="tl-pagination__btns"><button class="tl-btn tl-btn--ghost tl-btn--sm" id="cp-page-prev"' + (state.page <= 1 ? ' disabled' : '') + '>&larr; Anterior</button><button class="tl-btn tl-btn--ghost tl-btn--sm" id="cp-page-next"' + (state.page >= totalPages ? ' disabled' : '') + '>Proxima &rarr;</button></div></div>';
        }

        return '<div class="ct-table-wrap"><table class="ct-table"><thead><tr><th>Nome / Assunto</th><th>Estado</th><th>Destinatarios</th><th>Criada</th><th style="width:140px">Acoes</th></tr></thead><tbody>' + rows + '</tbody></table></div>' + pagination;
    }

    function renderEmpty() {
        return '' +
            '<div class="tl-empty">' +
                '<div class="tl-empty__icon"><svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg></div>' +
                '<h3 class="tl-empty__title">Ainda nao tem campanhas</h3>' +
                '<p class="tl-empty__desc">Crie a sua primeira campanha de email marketing.</p>' +
                '<button class="tl-btn tl-btn--primary" id="cp-btn-add-empty"><svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>Nova Campanha</button>' +
            '</div>';
    }

    // ========================================
    // Campaign Actions
    // ========================================
    async function sendCampaign(id) {
        var result = await apiCall('POST', '/api/campaigns/' + id + '/send');
        if (result && result.success) {
            MailFlowToast.success('Campanha iniciada!');
            startPolling(id);
            refresh();
        } else {
            MailFlowToast.error(result ? result.error : 'Erro ao enviar campanha.');
        }
    }

    async function pauseCampaign(id) {
        var result = await apiCall('POST', '/api/campaigns/' + id + '/pause');
        if (result && result.success) {
            MailFlowToast.success('Campanha pausada.');
            stopPolling(id);
            refresh();
        } else {
            MailFlowToast.error(result ? result.error : 'Erro ao pausar campanha.');
        }
    }

    async function resumeCampaign(id) {
        var result = await apiCall('POST', '/api/campaigns/' + id + '/resume');
        if (result && result.success) {
            MailFlowToast.success('Campanha retomada!');
            startPolling(id);
            refresh();
        } else {
            MailFlowToast.error(result ? result.error : 'Erro ao retomar campanha.');
        }
    }

    async function cancelCampaign(id) {
        if (!confirm('Cancelar esta campanha? Os emails pendentes nao serao enviados.')) return;
        var result = await apiCall('POST', '/api/campaigns/' + id + '/cancel');
        if (result && result.success) {
            MailFlowToast.success('Campanha cancelada.');
            stopPolling(id);
            refresh();
        } else {
            MailFlowToast.error(result ? result.error : 'Erro ao cancelar campanha.');
        }
    }

    // ========================================
    // Events
    // ========================================
    function bindEvents() {
        var addBtn = document.getElementById('cp-btn-add');
        if (addBtn) addBtn.addEventListener('click', function() { showEditor(null); });
        var addEmpty = document.getElementById('cp-btn-add-empty');
        if (addEmpty) addEmpty.addEventListener('click', function() { showEditor(null); });

        var searchInput = document.getElementById('cp-search');
        if (searchInput) {
            var dt; searchInput.addEventListener('input', function() {
                clearTimeout(dt); var v = this.value;
                dt = setTimeout(function() { state.search = v; state.page = 1; refresh(); }, 300);
            });
        }

        var filterSelect = document.getElementById('cp-filter-status');
        if (filterSelect) filterSelect.addEventListener('change', function() { state.filterStatus = this.value; state.page = 1; refresh(); });

        var prev = document.getElementById('cp-page-prev');
        if (prev) prev.addEventListener('click', function() { state.page--; refresh(); });
        var next = document.getElementById('cp-page-next');
        if (next) next.addEventListener('click', function() { state.page++; refresh(); });

        // Bind action buttons
        document.querySelectorAll('[data-actions]').forEach(function(td) {
            var campaignId = td.getAttribute('data-actions');
            var campaign = state.campaigns.find(function(x) { return x.id === campaignId; });
            if (campaign) bindActionButtons(campaignId, campaign.status);
        });
    }

    function bindActionButtons(campaignId, status) {
        document.querySelectorAll('[data-action][data-id="' + campaignId + '"]').forEach(function(btn) {
            var action = btn.getAttribute('data-action');
            btn.addEventListener('click', function() {
                if (action === 'send') sendCampaign(campaignId);
                else if (action === 'pause') pauseCampaign(campaignId);
                else if (action === 'resume') resumeCampaign(campaignId);
                else if (action === 'cancel') cancelCampaign(campaignId);
                else if (action === 'duplicate') duplicateCampaign(campaignId);
                else if (action === 'delete') {
                    var c = state.campaigns.find(function(x) { return x.id === campaignId; });
                    if (c && confirm('Eliminar campanha "' + c.nome + '"?\nEsta acao nao pode ser desfeita.')) {
                        deleteCampaign(campaignId);
                    }
                } else if (action === 'edit') {
                    var c = state.campaigns.find(function(x) { return x.id === campaignId; });
                    if (c) showEditor(c);
                }
            });
        });
    }

    // ========================================
    // CRUD
    // ========================================
    async function duplicateCampaign(id) {
        if (!sb || !user) return;
        try {
            var { data: orig } = await sb.from('campaigns').select('*').eq('id', id).eq('user_id', user.id).single();
            if (!orig) throw new Error('Campanha nao encontrada');

            var { error } = await sb.from('campaigns').insert({
                user_id: user.id, created_by: user.id,
                nome: '(Copia) ' + orig.nome, assunto: orig.assunto,
                template_id: orig.template_id, from_name: orig.from_name,
                from_email: orig.from_email, reply_to: orig.reply_to, status: 'draft'
            });
            if (error) throw error;

            var { data: recipients } = await sb.from('campaign_recipients').select('contact_id').eq('campaign_id', id);
            if (recipients && recipients.length > 0) {
                var { data: newCamp } = await sb.from('campaigns').select('id').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).single();
                if (newCamp) {
                    var inserts = recipients.map(function(r) { return { campaign_id: newCamp.id, contact_id: r.contact_id }; });
                    await sb.from('campaign_recipients').insert(inserts);
                    await sb.from('campaigns').update({ total_recipients: recipients.length }).eq('id', newCamp.id);
                }
            }

            MailFlowToast.success('Campanha duplicada.');
            refresh();
        } catch (err) {
            console.error('[Campanhas] Erro ao duplicar:', err);
            MailFlowToast.error('Erro ao duplicar campanha.');
        }
    }

    async function deleteCampaign(id) {
        if (!sb || !user) return;
        try {
            var { error } = await sb.from('campaigns').update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('user_id', user.id);
            if (error) throw error;
            MailFlowToast.success('Campanha eliminada.');
            refresh();
        } catch (err) {
            console.error('[Campanhas] Erro ao eliminar:', err);
            MailFlowToast.error('Erro ao eliminar campanha.');
        }
    }

    async function saveCampaign(data, existingId) {
        if (!sb || !user) return false;
        var payload = {
            nome: (data.nome || '').trim(),
            assunto: (data.assunto || '').trim(),
            template_id: data.template_id || null,
            from_name: (data.from_name || '').trim(),
            from_email: (data.from_email || '').trim(),
            reply_to: (data.reply_to || '').trim()
        };
        if (!payload.nome) { MailFlowToast.error('Nome e obrigatorio.'); return false; }

        try {
            var result;
            if (existingId) {
                result = await sb.from('campaigns').update(payload).eq('id', existingId).eq('user_id', user.id);
            } else {
                payload.user_id = user.id;
                payload.created_by = user.id;
                payload.status = 'draft';
                result = await sb.from('campaigns').insert(payload);
            }
            if (result.error) throw result.error;
            MailFlowToast.success(existingId ? 'Campanha atualizada.' : 'Campanha criada.');
            return true;
        } catch (err) {
            console.error('[Campanhas] Erro ao guardar:', err);
            MailFlowToast.error('Erro ao guardar campanha.');
            return false;
        }
    }

    // ========================================
    // Editor Modal (Step-by-step)
    // ========================================
    function showEditor(campaign) {
        var isEdit = !!campaign;
        var templates = [];
        var contacts = [];
        var selectedContacts = campaign ? [] : [];
        var selectedTemplate = campaign ? campaign.template_id : null;
        var step = 1;

        var html = '' +
            '<div class="cp-modal-overlay" id="cp-modal-overlay">' +
                '<div class="cp-modal cp-modal--lg">' +
                    '<div class="cp-modal__header">' +
                        '<h3 class="cp-modal__title">' + (isEdit ? 'Editar Campanha' : 'Nova Campanha') + '</h3>' +
                        '<button class="cp-modal__close" id="cp-close"><svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg></button>' +
                    '</div>' +
                    '<div class="cp-stepper" id="cp-stepper">' +
                        '<div class="cp-step cp-step--active" data-step="1">1. Detalhes</div>' +
                        '<div class="cp-step" data-step="2">2. Template</div>' +
                        '<div class="cp-step" data-step="3">3. Contactos</div>' +
                    '</div>' +
                    '<div class="cp-modal__body" id="cp-body"></div>' +
                    '<div class="cp-modal__footer">' +
                        '<button class="tl-btn tl-btn--ghost" id="cp-cancel">Cancelar</button>' +
                        '<button class="tl-btn tl-btn--ghost" id="cp-prev" style="display:none">&larr; Voltar</button>' +
                        '<button class="tl-btn tl-btn--primary" id="cp-next">Proximo &rarr;</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        document.body.insertAdjacentHTML('beforeend', html);
        var overlay = document.getElementById('cp-modal-overlay');
        var body = document.getElementById('cp-body');

        function closeModal() { overlay.remove(); }
        document.getElementById('cp-close').addEventListener('click', closeModal);
        document.getElementById('cp-cancel').addEventListener('click', closeModal);
        overlay.addEventListener('click', function(e) { if (e.target === overlay) closeModal(); });

        function renderStep() {
            document.querySelectorAll('.cp-step').forEach(function(s) {
                s.classList.toggle('cp-step--active', parseInt(s.getAttribute('data-step')) <= step);
            });
            document.getElementById('cp-prev').style.display = step > 1 ? '' : 'none';
            document.getElementById('cp-next').textContent = step === 3 ? (isEdit ? 'Guardar' : 'Criar Campanha') : 'Proximo \u2192';

            if (step === 1) {
                body.innerHTML = '' +
                    '<div class="tl-field"><label class="tl-label">Nome da Campanha *</label>' +
                    '<input type="text" class="tl-input" id="cp-f-name" placeholder="Ex: Campanha Verao 2026" value="' + esc(campaign ? campaign.nome : '') + '"></div>' +
                    '<div class="tl-field"><label class="tl-label">Assunto do Email</label>' +
                    '<input type="text" class="tl-input" id="cp-f-assunto" placeholder="Ex: Ofertas especiais, {{nome}}!" value="' + esc(campaign ? campaign.assunto : '') + '">' +
                    '<span class="tl-field__hint">Suporta merge tags: {{nome}}, {{email}}, {{empresa}}</span></div>' +
                    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
                    '<div class="tl-field"><label class="tl-label">Nome do Remetente</label>' +
                    '<input type="text" class="tl-input" id="cp-f-fromname" placeholder="Ex: Minha Empresa" value="' + esc(campaign ? campaign.from_name : '') + '"></div>' +
                    '<div class="tl-field"><label class="tl-label">Email do Remetente</label>' +
                    '<input type="text" class="tl-input" id="cp-f-fromemail" placeholder="Ex: noreply@empresa.com" value="' + esc(campaign ? campaign.from_email : '') + '"></div>' +
                    '</div>' +
                    '<div class="tl-field"><label class="tl-label">Email de Resposta</label>' +
                    '<input type="text" class="tl-input" id="cp-f-replyto" placeholder="Ex: suporte@empresa.com" value="' + esc(campaign ? campaign.reply_to : '') + '"></div>';
            } else if (step === 2) {
                body.innerHTML = '<div class="tl-field"><label class="tl-label">Selecionar Template</label><div id="cp-templates-grid" class="tl-grid" style="margin-top:8px"><div style="text-align:center;padding:20px;color:#9ca3af">A carregar templates...</div></div></div>';
                loadTemplates();
            } else if (step === 3) {
                body.innerHTML = '<div class="tl-field"><label class="tl-label">Selecionar Contactos</label><div id="cp-contacts-grid" style="margin-top:8px"><div style="text-align:center;padding:20px;color:#9ca3af">A carregar contactos...</div></div></div>';
                loadContacts();
            }
        }

        async function loadTemplates() {
            templates = await fetchTemplates();
            var grid = document.getElementById('cp-templates-grid');
            if (!grid) return;
            if (templates.length === 0) {
                grid.innerHTML = '<div style="text-align:center;padding:40px;color:#9ca3af;grid-column:1/-1">Nenhum template disponivel. Crie um primeiro.</div>';
                return;
            }
            grid.innerHTML = templates.map(function(t) {
                var sel = selectedTemplate === t.id ? ' cp-card--selected' : '';
                return '<div class="tl-card cp-card' + sel + '" data-tid="' + t.id + '" style="cursor:pointer">' +
                    '<div class="tl-card__header"><div class="tl-card__title">' + esc(t.nome) + '</div></div>' +
                    '<div class="tl-card__subject">' + esc(t.subject || 'Sem assunto') + '</div></div>';
            }).join('');

            grid.querySelectorAll('.cp-card').forEach(function(card) {
                card.addEventListener('click', function() {
                    grid.querySelectorAll('.cp-card').forEach(function(c) { c.classList.remove('cp-card--selected'); });
                    card.classList.add('cp-card--selected');
                    selectedTemplate = card.getAttribute('data-tid');
                });
            });
        }

        async function loadContacts() {
            contacts = await fetchContacts();
            var grid = document.getElementById('cp-contacts-grid');
            if (!grid) return;
            if (contacts.length === 0) {
                grid.innerHTML = '<div style="text-align:center;padding:40px;color:#9ca3af">Nenhum contacto disponivel. Adicione contactos primeiro.</div>';
                return;
            }
            var html2 = '<div style="margin-bottom:8px"><input type="text" class="tl-input" id="cp-contact-search" placeholder="Pesquisar contacto..." style="width:100%"></div>' +
                '<div style="max-height:300px;overflow-y:auto;border:1px solid var(--border-color);border-radius:8px">' +
                contacts.map(function(c) {
                    var checked = selectedContacts.indexOf(c.id) >= 0 ? ' checked' : '';
                    return '<label class="cp-contact-row" style="display:flex;align-items:center;padding:8px 12px;border-bottom:1px solid var(--border-subtle);cursor:pointer;gap:8px">' +
                        '<input type="checkbox" class="cp-contact-cb" value="' + c.id + '"' + checked + '>' +
                        '<div><div style="font-weight:600">' + esc(c.nome || c.email) + '</div>' +
                        '<div style="font-size:0.75rem;color:#9ca3af">' + esc(c.email) + '</div></div></label>';
                }).join('') + '</div>' +
                '<div style="margin-top:8px;font-size:0.75rem;color:#6b7280" id="cp-contacts-count">' + selectedContacts.length + ' contactos selecionados</div>';

            grid.innerHTML = html2;

            grid.querySelectorAll('.cp-contact-cb').forEach(function(cb) {
                cb.addEventListener('change', function() {
                    var cid = this.value;
                    if (this.checked) { if (selectedContacts.indexOf(cid) < 0) selectedContacts.push(cid); }
                    else { selectedContacts = selectedContacts.filter(function(x) { return x !== cid; }); }
                    var cnt = document.getElementById('cp-contacts-count');
                    if (cnt) cnt.textContent = selectedContacts.length + ' contactos selecionados';
                });
            });

            var searchEl = document.getElementById('cp-contact-search');
            if (searchEl) {
                searchEl.addEventListener('input', function() {
                    var q = this.value.toLowerCase();
                    grid.querySelectorAll('.cp-contact-row').forEach(function(row) {
                        row.style.display = row.textContent.toLowerCase().indexOf(q) >= 0 ? '' : 'none';
                    });
                });
            }
        }

        document.getElementById('cp-next').addEventListener('click', async function() {
            if (step === 1) {
                var nome = document.getElementById('cp-f-name').value;
                if (!nome.trim()) { MailFlowToast.error('Nome e obrigatorio.'); return; }
                if (!isEdit) {
                    campaign = campaign || {};
                    campaign.nome = nome.trim();
                    campaign.assunto = document.getElementById('cp-f-assunto').value.trim();
                    campaign.from_name = document.getElementById('cp-f-fromname').value.trim();
                    campaign.from_email = document.getElementById('cp-f-fromemail').value.trim();
                    campaign.reply_to = document.getElementById('cp-f-replyto').value.trim();
                } else {
                    campaign.nome = nome.trim();
                    campaign.assunto = document.getElementById('cp-f-assunto').value.trim();
                    campaign.from_name = document.getElementById('cp-f-fromname').value.trim();
                    campaign.from_email = document.getElementById('cp-f-fromemail').value.trim();
                    campaign.reply_to = document.getElementById('cp-f-replyto').value.trim();
                }
                step = 2;
            } else if (step === 2) {
                campaign.template_id = selectedTemplate;
                step = 3;
            } else if (step === 3) {
                this.disabled = true; this.textContent = 'A guardar...';
                var ok = await saveCampaign(campaign, isEdit ? campaign.id : null);
                if (ok) {
                    var campId = campaign.id;
                    if (!campId) {
                        var { data: last } = await sb.from('campaigns').select('id').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).single();
                        if (last) campId = last.id;
                    }
                    if (campId && selectedContacts.length > 0) {
                        if (isEdit) {
                            await sb.from('campaign_recipients').delete().eq('campaign_id', campId);
                        }
                        var inserts = selectedContacts.map(function(cid) { return { campaign_id: campId, contact_id: cid }; });
                        await sb.from('campaign_recipients').insert(inserts);
                        await sb.from('campaigns').update({ total_recipients: selectedContacts.length }).eq('id', campId);
                    }
                    closeModal();
                    refresh();
                } else {
                    this.disabled = false; this.textContent = 'Criar Campanha';
                }
                return;
            }
            renderStep();
        });

        document.getElementById('cp-prev').addEventListener('click', function() {
            if (step > 1) { step--; renderStep(); }
        });

        renderStep();
    }

    async function refresh() {
        if (!currentContainer) return;
        var result = await fetchCampaigns();
        currentContainer.innerHTML = buildHTML(result.data, result.count);
        bindEvents();
        updateBadge(result.count);
        // Restart polling for active campaigns
        result.data.forEach(function(c) {
            if (c.status === 'sending' && !pollingTimers[c.id]) startPolling(c.id);
        });
    }

    function updateBadge(total) {
        var badge = document.getElementById('badge-campanhas');
        if (badge) badge.textContent = total || 0;
    }

    return { render: render };
})();
