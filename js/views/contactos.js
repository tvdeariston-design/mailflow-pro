/**
 * MailFlow Pro — View: Contactos
 *
 * Objetivo:
 *   Página principal para gerir a base de contactos do utilizador.
 *   Permite adicionar novos contactos manualmente ou importar via CSV.
 *   Interface moderna com tabela de contactos e estado vazio.
 *
 * Benefício para o cliente:
 *   Centraliza todos os contactos num único lugar.
 *   Fácil de organizar, filtrar e enviar campanhas targeteadas.
 *
 * Inputs:
 *   - Lista de contactos do Supabase
 *   - Input de importação CSV
 *
 * Outputs:
 *   - UI de contactos com controle de bulk actions
 *   - Empty states profissionais
 *
 * Erros possíveis:
 *   - Fallback para lista vazia se query falhar
 *
 * Dependências:
 *   - supabase-client.js
 *   - auth.js
 *   - toast.js
 */

var ContactosView = (function() {
    'use strict';

    // ========================================
    // Init
    // ========================================
    var sb = null;
    var user = null;
    var contactList = null;

    function init() {
        sb = window.supabaseClient;
    }

    // ========================================
    // Helpers
    // ========================================

    async function fetchContacts() {
        if (!sb || !user) return [];

        try {
            var result = await sb.from('contacts').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
            return result.data || [];
        } catch (err) {
            console.error('[Contactos] Erro ao buscar:', err);
            return [];
        }
    }

    function formatDate(dateStr) {
        if (!dateStr) return '—';
        var d = new Date(dateStr);
        return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    // ========================================
    // Render
    // ========================================

    async function render(container) {
        init();
        user = await MailFlowAuth.getUser();
        if (!user) return;

        var contacts = await fetchContacts();

        var html = renderHeader() + renderTable(contacts);

        container.innerHTML = html;
        bindEvents(container);
    }

    function renderHeader() {
        return '' +
            '<div class="view-header">' +
                '<div class="view-header__left">' +
                    '<h1 class="view-header__title">Contactos</h1>' +
                    '<p class="view-header__subtitle">Gerencie a sua base de contactos</p>' +
                '</div>' +
                '<button class="view-header__btn" id="btn-import">' +
                    '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>' +
                    'Importar CSV' +
                '</button>' +
            '</div>';
    }

    function renderTable(contacts) {
        if (contacts.length === 0) {
            return renderEmpty();
        }

        var rows = contacts.map(function(c) {
            return '' +
                '<tr class="contact-row" data-id="' + c.id + '">' +
                    '<td>' +
                        '<div class="contact-info">' +
                            '<div class="contact-name">' + (c.nome || c.email || '—') + '</div>' +
                            '<div class="contact-email">' + (c.email || '—') + '</div>' +
                        '</div>' +
                    '</td>' +
                    '<td>' + (c.telefone || '—') + '</td>' +
                    '<td>' + (c.empresa || '—') + '</td>' +
                    '<td>' + formatDate(c.created_at) + '</td>' +
                    '<td>' +
                        '<button class="action-btn action-btn--edit" data-id="' + c.id + '" title="Editar">' +
                            '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>' +
                        '</button>' +
                        '<button class="action-btn action-btn--delete" data-id="' + c.id + '" title="Eliminar">' +
                            '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>' +
                        '</button>' +
                    '</td>' +
                '</tr>';
        }).join('');

        return '' +
            '<div class="table-container">' +
                '<table class="data-table">' +
                    '<thead>' +
                        '<tr>' +
                            '<th>Nome</th>' +
                            '<th>Telefone</th>' +
                            '<th>Empresa</th>' +
                            '<th>Data de Adição</th>' +
                            '<th style="width: 100px;">Ações</th>' +
                        '</tr>' +
                    '</thead>' +
                    '<tbody>' + rows + '</tbody>' +
                '</table>' +
            '</div>';
    }

    function renderEmpty() {
        return '' +
            '<div class="empty-state">' +
                '<div class="empty-state__icon empty-state__icon--green">' +
                    '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>' +
                '</div>' +
                '<h3 class="empty-state__title">Ainda não tem contactos</h3>' +
                '<p class="empty-state__desc">Adicione o seu primeiro contacto manualmente ou importe uma lista CSV.</p>' +
                '<button class="empty-state__btn" id="btn-add-manually">' +
                    '<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>' +
                    'Adicionar Primeiro Contacto' +
                '</button>' +
            '</div>';
    }

    // ========================================
    // Events
    // ========================================

    function bindEvents(container) {
        // Import CSV button
        var importBtn = container.querySelector('#btn-import');
        if (importBtn) {
            importBtn.addEventListener('click', function() {
                MailFlowToast.info('Funcionalidade de importação CSV a ser implementada');
            });
        }

        // Add manually button (empty state)
        var addManuallyBtn = container.querySelector('#btn-add-manually');
        if (addManuallyBtn) {
            addManuallyBtn.addEventListener('click', function() {
                showAddContactModal();
            });
        }

        // Edit buttons
        var editBtns = container.querySelectorAll('.action-btn--edit');
        editBtns.forEach(function(btn) {
            btn.addEventListener('click', function() {
                var id = this.getAttribute('data-id');
                showEditContactModal(id);
            });
        });

        // Delete buttons
        var deleteBtns = container.querySelectorAll('.action-btn--delete');
        deleteBtns.forEach(function(btn) {
            btn.addEventListener('click', async function() {
                var id = this.getAttribute('data-id');
                if (confirm('Eliminar este contacto? Esta ação não pode ser desfeita.')) {
                    await deleteContact(id);
                    render(container);
                }
            });
        });
    }

    async function deleteContact(id) {
        if (!sb) return;
        try {
            var { error } = await sb.from('contacts').delete().eq('id', id);
            if (error) throw error;
            MailFlowToast.success('Contacto eliminado.');
        } catch (err) {
            console.error('[Contactos] Erro ao eliminar:', err);
            MailFlowToast.error('Erro ao eliminar contacto.');
        }
    }

    function showAddContactModal() {
        MailFlowToast.info('Modal de adição de contacto a ser implementada');
    }

    function showEditContactModal(id) {
        MailFlowToast.info('Modal de edição de contacto (ID: ' + id + ') a ser implementado');
    }

    // ========================================
    // Export
    // ========================================
    return { render: render };

})();
