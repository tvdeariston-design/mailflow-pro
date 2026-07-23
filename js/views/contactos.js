/**
 * MailFlow Pro — View: Contactos
 *
 * Objetivo:
 *   Página principal para gerir a base de contactos do utilizador.
 *   Permite adicionar, editar, eliminar, importar via CSV e exportar contactos.
 *
 * Benefício para o cliente:
 *   Centraliza todos os contactos num único lugar.
 *   Fácil de organizar, filtrar e enviar campanhas targeteadas.
 *
 * Dependências:
 *   - supabase-client.js
 *   - auth.js
 *   - toast.js
 */

var ContactosView = (function() {
    'use strict';

    // ========================================
    // State
    // ========================================
    var sb = null;
    var user = null;
    var currentContainer = null;
    var state = {
        contacts: [],
        total: 0,
        page: 1,
        limit: 20,
        search: '',
        loading: false
    };

    // ========================================
    // Init
    // ========================================
    function init() {
        sb = window.supabaseClient;
    }

    // ========================================
    // Helpers
    // ========================================
    function esc(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function validateEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function formatDate(dateStr) {
        if (!dateStr) return '—';
        var d = new Date(dateStr);
        return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    async function fetchContacts() {
        if (!sb || !user) return { data: [], count: 0 };

        state.loading = true;
        try {
            var query = sb
                .from('contacts')
                .select('*', { count: 'exact' })
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (state.search) {
                query = query.or('nome.ilike.%' + state.search + '%,email.ilike.%' + state.search + '%,empresa.ilike.%' + state.search + '%');
            }

            var from = (state.page - 1) * state.limit;
            var to = from + state.limit - 1;
            query = query.range(from, to);

            var result = await query;
            state.contacts = result.data || [];
            state.total = result.count || 0;
            state.loading = false;
            return { data: state.contacts, count: state.total };
        } catch (err) {
            console.error('[Contactos] Erro ao buscar:', err);
            state.loading = false;
            return { data: [], count: 0 };
        }
    }

    // ========================================
    // Render
    // ========================================
    async function render(container) {
        init();
        currentContainer = container;
        user = await MailFlowAuth.getUser();
        if (!user) return;

        state.page = 1;
        state.search = '';

        var result = await fetchContacts();
        container.innerHTML = buildHTML(result.data, result.count);
        bindEvents();
        updateBadge(result.count);
    }

    function buildHTML(contacts, total) {
        return renderToolbar(total) +
            (contacts.length === 0 && !state.search ? renderEmpty() : renderTable(contacts, total));
    }

    function renderToolbar(total) {
        var totalPages = Math.ceil(total / state.limit);
        return '' +
            '<div class="ct-toolbar">' +
                '<div class="ct-toolbar__left">' +
                    '<h2 class="ct-toolbar__title">Contactos <span class="ct-toolbar__count">(' + total + ')</span></h2>' +
                '</div>' +
                '<div class="ct-toolbar__right">' +
                    '<div class="ct-search">' +
                        '<svg class="ct-search__icon" width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>' +
                        '<input type="text" class="ct-search__input" id="ct-search" placeholder="Pesquisar contacto..." value="' + esc(state.search) + '">' +
                    '</div>' +
                    '<button class="ct-btn ct-btn--secondary" id="ct-btn-export">' +
                        '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>' +
                        'Exportar CSV' +
                    '</button>' +
                    '<button class="ct-btn ct-btn--secondary" id="ct-btn-import">' +
                        '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>' +
                        'Importar CSV' +
                    '</button>' +
                    '<button class="ct-btn ct-btn--primary" id="ct-btn-add">' +
                        '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>' +
                        'Adicionar Contacto' +
                    '</button>' +
                '</div>' +
            '</div>';
    }

    function renderTable(contacts, total) {
        var totalPages = Math.ceil(total / state.limit);
        var rows = contacts.map(function(c) {
            var tags = '';
            if (c.tags && c.tags.length > 0) {
                tags = '<div class="ct-tags">' + c.tags.slice(0, 3).map(function(t) {
                    return '<span class="ct-tag">' + esc(t) + '</span>';
                }).join('') + (c.tags.length > 3 ? '<span class="ct-tag ct-tag--more">+' + (c.tags.length - 3) + '</span>' : '') + '</div>';
            }
            return '' +
                '<tr class="ct-row">' +
                    '<td class="ct-row__name">' +
                        '<div class="ct-row__avatar">' + esc((c.nome || '?')[0]).toUpperCase() + '</div>' +
                        '<div class="ct-row__info">' +
                            '<div class="ct-row__title">' + esc(c.nome || '—') + '</div>' +
                            '<div class="ct-row__subtitle">' + esc(c.email || '—') + '</div>' +
                        '</div>' +
                    '</td>' +
                    '<td>' + esc(c.telefone || '—') + '</td>' +
                    '<td>' + esc(c.empresa || '—') + '</td>' +
                    '<td>' + tags + '</td>' +
                    '<td>' + formatDate(c.created_at) + '</td>' +
                    '<td class="ct-row__actions">' +
                        '<button class="ct-action ct-action--edit" data-id="' + c.id + '" title="Editar">' +
                            '<svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>' +
                        '</button>' +
                        '<button class="ct-action ct-action--delete" data-id="' + c.id + '" title="Eliminar">' +
                            '<svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>' +
                        '</button>' +
                    '</td>' +
                '</tr>';
        }).join('');

        var pagination = '';
        if (totalPages > 1) {
            var prevDisabled = state.page <= 1 ? ' disabled' : '';
            var nextDisabled = state.page >= totalPages ? ' disabled' : '';
            pagination = '' +
                '<div class="ct-pagination">' +
                    '<span class="ct-pagination__info">Página ' + state.page + ' de ' + totalPages + '</span>' +
                    '<div class="ct-pagination__btns">' +
                        '<button class="ct-btn ct-btn--ghost ct-btn--sm" id="ct-page-prev"' + prevDisabled + '>← Anterior</button>' +
                        '<button class="ct-btn ct-btn--ghost ct-btn--sm" id="ct-page-next"' + nextDisabled + '>Próxima →</button>' +
                    '</div>' +
                '</div>';
        }

        return '' +
            '<div class="ct-table-wrap">' +
                '<table class="ct-table">' +
                    '<thead>' +
                        '<tr>' +
                            '<th>Nome / Email</th>' +
                            '<th>Telefone</th>' +
                            '<th>Empresa</th>' +
                            '<th>Tags</th>' +
                            '<th>Adicionado</th>' +
                            '<th style="width:80px">Ações</th>' +
                        '</tr>' +
                    '</thead>' +
                    '<tbody>' + rows + '</tbody>' +
                '</table>' +
            '</div>' +
            pagination;
    }

    function renderEmpty() {
        return '' +
            '<div class="ct-empty">' +
                '<div class="ct-empty__icon">' +
                    '<svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>' +
                '</div>' +
                '<h3 class="ct-empty__title">Ainda não tem contactos</h3>' +
                '<p class="ct-empty__desc">Adicione contactos manualmente ou importe uma lista CSV para começar a criar campanhas.</p>' +
                '<div class="ct-empty__actions">' +
                    '<button class="ct-btn ct-btn--primary" id="ct-btn-add-empty">' +
                        '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>' +
                        'Adicionar Contacto' +
                    '</button>' +
                    '<button class="ct-btn ct-btn--secondary" id="ct-btn-import-empty">' +
                        '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>' +
                        'Importar CSV' +
                    '</button>' +
                '</div>' +
            '</div>';
    }

    // ========================================
    // Events
    // ========================================
    function bindEvents() {
        var addBtn = document.getElementById('ct-btn-add');
        if (addBtn) addBtn.addEventListener('click', function() { showContactModal(null); });

        var addEmptyBtn = document.getElementById('ct-btn-add-empty');
        if (addEmptyBtn) addEmptyBtn.addEventListener('click', function() { showContactModal(null); });

        var importBtn = document.getElementById('ct-btn-import');
        if (importBtn) importBtn.addEventListener('click', showImportModal);

        var importEmptyBtn = document.getElementById('ct-btn-import-empty');
        if (importEmptyBtn) importEmptyBtn.addEventListener('click', showImportModal);

        var exportBtn = document.getElementById('ct-btn-export');
        if (exportBtn) exportBtn.addEventListener('click', exportCSV);

        var searchInput = document.getElementById('ct-search');
        if (searchInput) {
            var debounceTimer;
            searchInput.addEventListener('input', function() {
                clearTimeout(debounceTimer);
                var val = this.value;
                debounceTimer = setTimeout(function() {
                    state.search = val;
                    state.page = 1;
                    refresh();
                }, 300);
            });
        }

        var prevBtn = document.getElementById('ct-page-prev');
        if (prevBtn) prevBtn.addEventListener('click', function() { state.page--; refresh(); });

        var nextBtn = document.getElementById('ct-page-next');
        if (nextBtn) nextBtn.addEventListener('click', function() { state.page++; refresh(); });

        document.querySelectorAll('.ct-action--edit').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var id = this.getAttribute('data-id');
                var contact = state.contacts.find(function(c) { return c.id === id; });
                if (contact) showContactModal(contact);
            });
        });

        document.querySelectorAll('.ct-action--delete').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var id = this.getAttribute('data-id');
                var contact = state.contacts.find(function(c) { return c.id === id; });
                if (contact && confirm('Eliminar contacto "' + (contact.nome || contact.email) + '"?\nEsta ação não pode ser desfeita.')) {
                    deleteContact(id);
                }
            });
        });
    }

    // ========================================
    // CRUD
    // ========================================
    async function deleteContact(id) {
        if (!sb) return;
        try {
            var { error } = await sb.from('contacts').delete().eq('id', id);
            if (error) throw error;
            MailFlowToast.success('Contacto eliminado.');
            refresh();
        } catch (err) {
            console.error('[Contactos] Erro ao eliminar:', err);
            MailFlowToast.error('Erro ao eliminar contacto.');
        }
    }

    async function saveContact(data, existingId) {
        if (!sb || !user) return false;

        var payload = {
            user_id: user.id,
            nome: (data.nome || '').trim(),
            email: (data.email || '').trim().toLowerCase(),
            telefone: (data.telefone || '').trim(),
            empresa: (data.empresa || '').trim(),
            tags: data.tags ? data.tags.split(',').map(function(t) { return t.trim(); }).filter(Boolean) : []
        };

        if (!payload.email || !validateEmail(payload.email)) {
            MailFlowToast.error('Email inválido.');
            return false;
        }
        if (!payload.nome) payload.nome = payload.email.split('@')[0];

        try {
            var result;
            if (existingId) {
                result = await sb.from('contacts').update({
                    nome: payload.nome,
                    telefone: payload.telefone,
                    empresa: payload.empresa,
                    tags: payload.tags
                }).eq('id', existingId).eq('user_id', user.id);
            } else {
                result = await sb.from('contacts').insert(payload);
            }
            if (result.error) throw result.error;
            MailFlowToast.success(existingId ? 'Contacto atualizado.' : 'Contacto adicionado.');
            return true;
        } catch (err) {
            console.error('[Contactos] Erro ao guardar:', err);
            if (err.code === '23505') {
                MailFlowToast.error('Já existe um contacto com este email.');
            } else {
                MailFlowToast.error('Erro ao guardar contacto.');
            }
            return false;
        }
    }

    // ========================================
    // Modal: Add / Edit Contact
    // ========================================
    function showContactModal(contact) {
        var isEdit = !!contact;
        var title = isEdit ? 'Editar Contacto' : 'Novo Contacto';
        var tags = contact && contact.tags ? contact.tags.join(', ') : '';

        var html = '' +
            '<div class="ct-modal-overlay" id="ct-modal-overlay">' +
                '<div class="ct-modal">' +
                    '<div class="ct-modal__header">' +
                        '<h3 class="ct-modal__title">' + title + '</h3>' +
                        '<button class="ct-modal__close" id="ct-modal-close">' +
                            '<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>' +
                        '</button>' +
                    '</div>' +
                    '<div class="ct-modal__body">' +
                        '<div class="ct-field">' +
                            '<label class="ct-label">Nome *</label>' +
                            '<input type="text" class="ct-input" id="ct-f-name" placeholder="Nome do contacto" value="' + esc(contact ? contact.nome : '') + '">' +
                        '</div>' +
                        '<div class="ct-field">' +
                            '<label class="ct-label">Email *</label>' +
                            '<input type="email" class="ct-input" id="ct-f-email" placeholder="email@exemplo.com" value="' + esc(contact ? contact.email : '') + '"' + (isEdit ? ' readonly' : '') + '>' +
                        '</div>' +
                        '<div class="ct-field-row">' +
                            '<div class="ct-field">' +
                                '<label class="ct-label">Telefone</label>' +
                                '<input type="text" class="ct-input" id="ct-f-phone" placeholder="+351 912 345 678" value="' + esc(contact ? contact.telefone : '') + '">' +
                            '</div>' +
                            '<div class="ct-field">' +
                                '<label class="ct-label">Empresa</label>' +
                                '<input type="text" class="ct-input" id="ct-f-company" placeholder="Nome da empresa" value="' + esc(contact ? contact.empresa : '') + '">' +
                            '</div>' +
                        '</div>' +
                        '<div class="ct-field">' +
                            '<label class="ct-label">Tags</label>' +
                            '<input type="text" class="ct-input" id="ct-f-tags" placeholder="separadas por vírgula (ex: vip, newsletter)" value="' + esc(tags) + '">' +
                            '<span class="ct-field__hint">Separadas por vírgula. Útil para segmentação de campanhas.</span>' +
                        '</div>' +
                    '</div>' +
                    '<div class="ct-modal__footer">' +
                        '<button class="ct-btn ct-btn--ghost" id="ct-modal-cancel">Cancelar</button>' +
                        '<button class="ct-btn ct-btn--primary" id="ct-modal-save">' +
                            (isEdit ? 'Guardar Alterações' : 'Adicionar Contacto') +
                        '</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        document.body.insertAdjacentHTML('beforeend', html);

        var overlay = document.getElementById('ct-modal-overlay');
        var closeBtn = document.getElementById('ct-modal-close');
        var cancelBtn = document.getElementById('ct-modal-cancel');
        var saveBtn = document.getElementById('ct-modal-save');

        function closeModal() { overlay.remove(); }
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        overlay.addEventListener('click', function(e) { if (e.target === overlay) closeModal(); });

        saveBtn.addEventListener('click', async function() {
            var data = {
                nome: document.getElementById('ct-f-name').value,
                email: document.getElementById('ct-f-email').value,
                telefone: document.getElementById('ct-f-phone').value,
                empresa: document.getElementById('ct-f-company').value,
                tags: document.getElementById('ct-f-tags').value
            };

            this.disabled = true;
            this.textContent = 'A guardar...';

            var ok = await saveContact(data, isEdit ? contact.id : null);
            if (ok) {
                closeModal();
                refresh();
            } else {
                this.disabled = false;
                this.textContent = isEdit ? 'Guardar Alterações' : 'Adicionar Contacto';
            }
        });
    }

    // ========================================
    // Modal: Import CSV
    // ========================================
    function showImportModal() {
        var html = '' +
            '<div class="ct-modal-overlay" id="ct-modal-overlay">' +
                '<div class="ct-modal ct-modal--lg">' +
                    '<div class="ct-modal__header">' +
                        '<h3 class="ct-modal__title">Importar Contactos de CSV</h3>' +
                        '<button class="ct-modal__close" id="ct-modal-close">' +
                            '<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>' +
                        '</button>' +
                    '</div>' +
                    '<div class="ct-modal__body">' +
                        '<div class="ct-import-info">' +
                            '<p><strong>Formato esperado:</strong> CSV com cabeçalho na primeira linha.</p>' +
                            '<p><strong>Colunas aceites:</strong> <code>email</code> (obrigatório), <code>nome</code>, <code>telefone</code>, <code>empresa</code>, <code>tags</code> (separadas por <code>;</code>).</p>' +
                        '</div>' +
                        '<div class="ct-field">' +
                            '<label class="ct-label">Ficheiro CSV</label>' +
                            '<div class="ct-dropzone" id="ct-dropzone">' +
                                '<svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>' +
                                '<p>Arraste o ficheiro aqui ou clique para selecionar</p>' +
                                '<input type="file" id="ct-file-input" accept=".csv,text/csv" style="display:none">' +
                            '</div>' +
                            '<div class="ct-file-info" id="ct-file-info" style="display:none"></div>' +
                        '</div>' +
                        '<div class="ct-field" id="ct-csv-preview-wrap" style="display:none">' +
                            '<label class="ct-label">Pré-visualização</label>' +
                            '<pre class="ct-csv-preview" id="ct-csv-preview"></pre>' +
                        '</div>' +
                    '</div>' +
                    '<div class="ct-modal__footer">' +
                        '<button class="ct-btn ct-btn--ghost" id="ct-modal-cancel">Cancelar</button>' +
                        '<button class="ct-btn ct-btn--primary" id="ct-modal-import" disabled>Importar</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        document.body.insertAdjacentHTML('beforeend', html);

        var overlay = document.getElementById('ct-modal-overlay');
        var closeBtn = document.getElementById('ct-modal-close');
        var cancelBtn = document.getElementById('ct-modal-cancel');
        var importBtn = document.getElementById('ct-modal-import');
        var dropzone = document.getElementById('ct-dropzone');
        var fileInput = document.getElementById('ct-file-input');
        var fileInfo = document.getElementById('ct-file-info');
        var previewWrap = document.getElementById('ct-csv-preview-wrap');
        var preview = document.getElementById('ct-csv-preview');
        var csvContent = '';

        function closeModal() { overlay.remove(); }
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        overlay.addEventListener('click', function(e) { if (e.target === overlay) closeModal(); });

        dropzone.addEventListener('click', function() { fileInput.click(); });
        dropzone.addEventListener('dragover', function(e) { e.preventDefault(); dropzone.classList.add('ct-dropzone--active'); });
        dropzone.addEventListener('dragleave', function() { dropzone.classList.remove('ct-dropzone--active'); });
        dropzone.addEventListener('drop', function(e) {
            e.preventDefault();
            dropzone.classList.remove('ct-dropzone--active');
            if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
        });
        fileInput.addEventListener('change', function() { if (this.files.length) handleFile(this.files[0]); });

        function handleFile(file) {
            if (!file.name.endsWith('.csv')) {
                MailFlowToast.error('Por favor selecione um ficheiro CSV.');
                return;
            }
            var reader = new FileReader();
            reader.onload = function(e) {
                csvContent = e.target.result;
                var lines = csvContent.trim().split('\n');
                fileInfo.style.display = 'block';
                fileInfo.innerHTML = '<strong>' + esc(file.name) + '</strong> — ' + (lines.length - 1) + ' linhas de dados';
                previewWrap.style.display = 'block';
                preview.textContent = lines.slice(0, 6).join('\n') + (lines.length > 6 ? '\n... (' + (lines.length - 1) + ' contactos no total)' : '');
                importBtn.disabled = false;
            };
            reader.readAsText(file);
        }

        importBtn.addEventListener('click', async function() {
            if (!csvContent) return;
            this.disabled = true;
            this.textContent = 'A importar...';

            try {
                var resp = await fetch('/api/contacts/import', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + (await sb.auth.getSession()).data.session.access_token
                    },
                    body: JSON.stringify({ csv: csvContent })
                });

                var result = await resp.json();
                if (result.success) {
                    MailFlowToast.success('Importados: ' + result.imported + (result.skipped ? ' | Ignorados: ' + result.skipped : ''));
                    closeModal();
                    refresh();
                } else {
                    MailFlowToast.error(result.error || 'Erro na importação.');
                    this.disabled = false;
                    this.textContent = 'Importar';
                }
            } catch (err) {
                console.error('[Contactos] Erro import:', err);
                MailFlowToast.error('Erro ao comunicar com o servidor.');
                this.disabled = false;
                this.textContent = 'Importar';
            }
        });
    }

    // ========================================
    // Export CSV
    // ========================================
    async function exportCSV() {
        try {
            var token = (await sb.auth.getSession()).data.session.access_token;
            var resp = await fetch('/api/contacts/export', {
                headers: { 'Authorization': 'Bearer ' + token }
            });

            if (!resp.ok) throw new Error('Export failed');

            var blob = await resp.blob();
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'contactos-' + new Date().toISOString().split('T')[0] + '.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            MailFlowToast.success('CSV exportado com sucesso.');
        } catch (err) {
            console.error('[Contactos] Erro export:', err);
            MailFlowToast.error('Erro ao exportar contactos.');
        }
    }

    // ========================================
    // Refresh helper
    // ========================================
    async function refresh() {
        if (!currentContainer) return;
        var result = await fetchContacts();
        currentContainer.innerHTML = buildHTML(result.data, result.count);
        bindEvents();
        updateBadge(result.count);
    }

    function updateBadge(total) {
        var badge = document.getElementById('badge-contactos');
        if (badge) badge.textContent = total || 0;
    }

    // ========================================
    // Export
    // ========================================
    return { render: render };
})();
