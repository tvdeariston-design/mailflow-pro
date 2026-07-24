/**
 * MailFlow Pro — Campaign Send Engine
 *
 * Motor de envio de campanhas de email marketing.
 * Serviço separado do server.js. Responsável por:
 *   - iniciar envio de campanha
 *   - pausar envio
 *   - retomar envio
 *   - cancelar envio
 *   - reportar progresso
 *
 * Envio por batches configuráveis:
 *   - BATCH_SIZE: 50 emails por batch (default)
 *   - BATCH_DELAY_MS: 2000ms entre batches (default)
 *
 * Estados suportados: draft → sending → sent | paused | cancelled | failed
 *
 * Race conditions evitadas por:
 *   - Verificação de estado antes de cada operação
 *   - Lock por campaign_id (Map de campanhas ativas)
 *   - Atualizações atómicas na base de dados
 *
 * Memory leaks evitados por:
 *   - Cleanup do state quando campanha termina
 *   - Limite máximo de campanhas simultâneas (configurável)
 */

'use strict';

const nodemailer = require('nodemailer');

// ============================================
// Configuração
// ============================================
const BATCH_SIZE = parseInt(process.env.CAMPAIGN_BATCH_SIZE) || 50;
const BATCH_DELAY_MS = parseInt(process.env.CAMPAIGN_BATCH_DELAY_MS) || 2000;
const MAX_CONCURRENT = parseInt(process.env.CAMPAIGN_MAX_CONCURRENT) || 5;

// ============================================
// Transporter (lazy init)
// ============================================
let _transporter = null;

function getTransporter() {
    if (_transporter) return _transporter;

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        return null;
    }

    _transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    return _transporter;
}

// ============================================
// Campanhas ativas (lock por campaign_id)
// ============================================
const activeCampaigns = new Map();

/**
 * Estado de uma campanha ativa:
 * {
 *   campaignId: string,
 *   userId: string,
 *   status: 'sending' | 'paused' | 'cancelled',
 *   abortController: { aborted: boolean },
 *   startedAt: Date,
 *   lastBatchAt: Date,
 *   totalRecipients: number,
 *   sent: number,
 *   failed: number
 * }
 */

// ============================================
// Helpers — merge tags
// ============================================
function renderMergeTags(templateStr, contact) {
    if (!templateStr) return '';
    return templateStr
        .replace(/\{\{nome\}\}/g, contact.nome || '')
        .replace(/\{\{email\}\}/g, contact.email || '')
        .replace(/\{\{empresa\}\}/g, contact.empresa || '')
        .replace(/\{\{telefone\}\}/g, contact.telefone || '')
        .replace(/\{\{data\}\}/g, new Date().toLocaleDateString('pt-PT'));
}

// ============================================
// Helpers — DB updates
// ============================================
async function updateCampaignStatus(supabaseAdmin, campaignId, updates) {
    const { error } = await supabaseAdmin
        .from('campaigns')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', campaignId);

    if (error) {
        console.error(`[CampaignEngine] Erro ao atualizar campanha ${campaignId}:`, error.message);
    }
    return !error;
}

async function updateRecipientStatus(supabaseAdmin, recipientId, updates) {
    const { error } = await supabaseAdmin
        .from('campaign_recipients')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', recipientId);

    if (error) {
        console.error(`[CampaignEngine] Erro ao atualizar recipient ${recipientId}:`, error.message);
    }
    return !error;
}

async function updateCampaignCounters(supabaseAdmin, campaignId) {
    const { data: campaign } = await supabaseAdmin
        .from('campaigns')
        .select('total_recipients')
        .eq('id', campaignId)
        .single();

    const totalRecipients = campaign ? campaign.total_recipients : 0;

    const { data: sentCount } = await supabaseAdmin
        .from('campaign_recipients')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .eq('status', 'sent');

    const { data: failedCount } = await supabaseAdmin
        .from('campaign_recipients')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .eq('status', 'failed');

    const sent = sentCount || 0;
    const failed = failedCount || 0;
    const progress = totalRecipients > 0 ? Math.round(((sent + failed) / totalRecipients) * 100) : 0;

    await updateCampaignStatus(supabaseAdmin, campaignId, {
        total_sent: sent,
        total_failed: failed,
        progress_percent: Math.min(progress, 100)
    });
}

// ============================================
// Helpers — sleep
// ============================================
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================

// ============================================
// Helpers — Tracking (pixel + link rewriting)
// ============================================
function getTrackingBase() {
    const url = process.env.TRACKING_URL || process.env.RENDER_EXTERNAL_URL || '';
    if (!url) return '';
    return url.startsWith('http') ? url : 'https://' + url;
}

function injectTrackingPixel(html, recipientId) {
    const base = getTrackingBase();
    if (!base || !html) return html;
    const pixel = '<img src="' + base + '/track/open/' + recipientId + '" width="1" height="1" style="display:none" alt="" />';
    // Insert before </body> if present, otherwise append
    if (html.indexOf('</body>') !== -1) {
        return html.replace('</body>', pixel + '</body>');
    }
    return html + pixel;
}

function rewriteLinks(html, recipientId) {
    const base = getTrackingBase();
    if (!base || !html) return html;
    // Rewrite href="http..." and href="https..."
    return html.replace(/href="(https?:\/\/[^"\s>]+)"/gi, function(match, url) {
        return 'href="' + base + '/track/click/' + recipientId + '?url=' + encodeURIComponent(url) + '"';
    });
}

// Helpers — batch sender
// ============================================
async function sendSingleEmail(transporter, campaign, template, contact, recipientId) {
    const subject = renderMergeTags(template.subject || campaign.assunto, contact);
    const preheader = renderMergeTags(template.preheader || '', contact);
    let html = renderMergeTags(template.html || '', contact);
    const text = renderMergeTags(template.text_version || '', contact);

    // Injetar tracking pixel e reescrever links
    if (recipientId) {
        html = injectTrackingPixel(html, recipientId);
        html = rewriteLinks(html, recipientId);
    }

    const fromName = campaign.from_name || 'MailFlow Pro';
    const fromEmail = campaign.from_email || process.env.EMAIL_USER || 'noreply@mailflowpro.com';
    const replyTo = campaign.reply_to || fromEmail;

    const mailOptions = {
        from: `"${fromName}" <${fromEmail}>`,
        to: contact.email,
        subject: subject,
        replyTo: replyTo
    };

    if (preheader) {
        const preheaderTag = '<span style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">' + preheader + '</span>';
        mailOptions.html = preheaderTag + html;
    } else {
        mailOptions.html = html || undefined;
    }

    if (text) {
        mailOptions.text = text;
    }

    const info = await transporter.sendMail(mailOptions);
    return info.messageId || null;
}

// ============================================
// Motor principal
// ============================================
async function startCampaign(supabaseAdmin, campaignId, userId) {
    // Verificar se já está ativa
    if (activeCampaigns.has(campaignId)) {
        return { success: false, error: 'Campanha ja esta em envio' };
    }

    // Verificar limite de concorrência
    if (activeCampaigns.size >= MAX_CONCURRENT) {
        return { success: false, error: 'Limite de campanhas simultaneas atingido' };
    }

    // Verificar transporter
    const transporter = getTransporter();
    if (!transporter) {
        return { success: false, error: 'Servico de email nao configurado' };
    }

    // Buscar campanha
    const { data: campaign, error: campErr } = await supabaseAdmin
        .from('campaigns')
        .select('*')
        .eq('id', campaignId)
        .eq('user_id', userId)
        .is('deleted_at', null)
        .single();

    if (campErr || !campaign) {
        return { success: false, error: 'Campanha nao encontrada' };
    }

    if (campaign.status !== 'draft' && campaign.status !== 'paused' && campaign.status !== 'failed') {
        return { success: false, error: 'Estado da campanha nao permite envio: ' + campaign.status };
    }

    // Verificar template
    if (!campaign.template_id) {
        return { success: false, error: 'Campanha nao tem template associado' };
    }

    const { data: template, error: tplErr } = await supabaseAdmin
        .from('templates')
        .select('*')
        .eq('id', campaign.template_id)
        .is('deleted_at', null)
        .single();

    if (tplErr || !template) {
        return { success: false, error: 'Template nao encontrado' };
    }

    // Verificar recipients
    const { data: recipients, error: recErr, count: totalRecipients } = await supabaseAdmin
        .from('campaign_recipients')
        .select('*, contacts!inner(id, nome, email, empresa, telefone)', { count: 'exact' })
        .eq('campaign_id', campaignId)
        .eq('status', 'pending');

    if (recErr) {
        return { success: false, error: 'Erro ao buscar destinatarios' };
    }

    if (!recipients || recipients.length === 0) {
        return { success: false, error: 'Nenhum destinatario pendente' };
    }

    // Criar estado da campanha
    const abortController = { aborted: false };
    const campaignState = {
        campaignId,
        userId,
        status: 'sending',
        abortController,
        startedAt: new Date(),
        lastBatchAt: null,
        totalRecipients: totalRecipients || recipients.length,
        sent: 0,
        failed: 0
    };

    activeCampaigns.set(campaignId, campaignState);

    // Atualizar status no DB
    await updateCampaignStatus(supabaseAdmin, campaignId, {
        status: 'sending',
        started_at: new Date().toISOString(),
        last_error: null
    });

    // Reset recipients pendentes para pending (retomar de paused)
    await supabaseAdmin
        .from('campaign_recipients')
        .update({ status: 'pending', error_message: null, updated_at: new Date().toISOString() })
        .eq('campaign_id', campaignId)
        .in('status', ['sending', 'failed']);

    // Atualizar total_recipients
    await updateCampaignStatus(supabaseAdmin, campaignId, {
        total_recipients: campaignState.totalRecipients
    });

    // Iniciar envio em background
    sendInBatches(supabaseAdmin, campaignState, campaign, template, recipients).catch(err => {
        console.error(`[CampaignEngine] Erro fatal na campanha ${campaignId}:`, err.message);
        activeCampaigns.delete(campaignId);
    });

    return {
        success: true,
        message: 'Campanha iniciada',
        totalRecipients: campaignState.totalRecipients
    };
}

async function sendInBatches(supabaseAdmin, campaignState, campaign, template, allRecipients) {
    const { campaignId } = campaignState;
    const transporter = getTransporter();

    try {
        let offset = 0;
        const batchSize = BATCH_SIZE;

        while (offset < campaignState.totalRecipients) {
            // Verificar se foi pausada ou cancelada
            if (campaignState.abortController.aborted) {
                break;
            }

            // Buscar recipients pendentes do batch atual
            const { data: batchRecipients } = await supabaseAdmin
                .from('campaign_recipients')
                .select('*, contacts!inner(id, nome, email, empresa, telefone)')
                .eq('campaign_id', campaignId)
                .eq('status', 'pending')
                .range(offset, offset + batchSize - 1);

            if (!batchRecipients || batchRecipients.length === 0) {
                break;
            }

            // Enviar batch
            for (const recipient of batchRecipients) {
                if (campaignState.abortController.aborted) break;

                const contact = recipient.contacts;
                if (!contact || !contact.email) {
                    await updateRecipientStatus(supabaseAdmin, recipient.id, {
                        status: 'skipped',
                        error_message: 'Contacto sem email valido'
                    });
                    campaignState.failed++;
                    continue;
                }

                try {
                    // Marcar como sending
                    await updateRecipientStatus(supabaseAdmin, recipient.id, { status: 'sending' });

                    // Enviar
                    const messageId = await sendSingleEmail(transporter, campaign, template, contact, recipient.id);

                    // Marcar como sent
                    await updateRecipientStatus(supabaseAdmin, recipient.id, {
                        status: 'sent',
                        sent_at: new Date().toISOString(),
                        message_id: messageId,
                        error_message: null
                    });

                    campaignState.sent++;
                } catch (sendErr) {
                    console.error(`[CampaignEngine] Erro ao enviar para ${contact.email}:`, sendErr.message);

                    await updateRecipientStatus(supabaseAdmin, recipient.id, {
                        status: 'failed',
                        error_message: sendErr.message || 'Erro ao enviar'
                    });

                    campaignState.failed++;
                }
            }

            // Atualizar contadores e progresso
            const totalProcessed = campaignState.sent + campaignState.failed;
            const progress = campaignState.totalRecipients > 0
                ? Math.round((totalProcessed / campaignState.totalRecipients) * 100)
                : 0;

            await updateCampaignStatus(supabaseAdmin, campaignId, {
                total_sent: campaignState.sent,
                total_failed: campaignState.failed,
                progress_percent: Math.min(progress, 100)
            });

            offset += batchSize;

            // Esperar entre batches (se não foi cancelado/pausado)
            if (offset < campaignState.totalRecipients && !campaignState.abortController.aborted) {
                campaignState.lastBatchAt = new Date();
                await sleep(BATCH_DELAY_MS);
            }
        }

        // Finalizar
        if (campaignState.abortController.aborted) {
            // Foi pausado ou cancelado durante o envio
            if (campaignState.status === 'cancelled') {
                await updateCampaignStatus(supabaseAdmin, campaignId, {
                    status: 'cancelled',
                    finished_at: new Date().toISOString(),
                    last_error: null
                });
            } else {
                await updateCampaignStatus(supabaseAdmin, campaignId, {
                    status: 'paused',
                    last_error: null
                });
            }
        } else {
            // Envio concluído
            await updateCampaignStatus(supabaseAdmin, campaignId, {
                status: 'sent',
                finished_at: new Date().toISOString(),
                progress_percent: 100,
                last_error: null
            });
        }
    } catch (err) {
        console.error(`[CampaignEngine] Erro no batch da campanha ${campaignId}:`, err.message);

        await updateCampaignStatus(supabaseAdmin, campaignId, {
            status: 'failed',
            finished_at: new Date().toISOString(),
            last_error: err.message
        });
    } finally {
        // Cleanup — remover do mapa de ativas
        activeCampaigns.delete(campaignId);
    }
}

// ============================================
// Pausar campanha
// ============================================
function pauseCampaign(campaignId) {
    const state = activeCampaigns.get(campaignId);
    if (!state) {
        return { success: false, error: 'Campanha nao esta em envio' };
    }

    state.status = 'paused';
    state.abortController.aborted = true;

    return { success: true, message: 'Campanha pausada' };
}

// ============================================
// Retomar campanha (re-inicia do ponto em que parou)
// ============================================
async function resumeCampaign(supabaseAdmin, campaignId, userId) {
    const state = activeCampaigns.get(campaignId);
    if (state) {
        return { success: false, error: 'Campanha ja esta em envio' };
    }

    // Verificar se a campanha está pausada
    const { data: campaign } = await supabaseAdmin
        .from('campaigns')
        .select('status')
        .eq('id', campaignId)
        .eq('user_id', userId)
        .is('deleted_at', null)
        .single();

    if (!campaign || campaign.status !== 'paused') {
        return { success: false, error: 'Apenas campanhas pausadas podem ser retomadas' };
    }

    // Re-iniciar (retoma recipients pendentes)
    return startCampaign(supabaseAdmin, campaignId, userId);
}

// ============================================
// Cancelar campanha
// ============================================
function cancelCampaign(campaignId) {
    const state = activeCampaigns.get(campaignId);
    if (state) {
        state.status = 'cancelled';
        state.abortController.aborted = true;
    }
    // Se não está ativa, retorna erro (só pode cancelar as que estão em envio)
    if (!state) {
        return { success: false, error: 'Campanha nao esta em envio' };
    }

    return { success: true, message: 'Campanha cancelada' };
}

// ============================================
// Progresso
// ============================================
async function getProgress(supabaseAdmin, campaignId, userId) {
    const { data: campaign, error } = await supabaseAdmin
        .from('campaigns')
        .select('id, status, progress_percent, total_recipients, total_sent, total_failed, started_at, finished_at, last_error')
        .eq('id', campaignId)
        .eq('user_id', userId)
        .is('deleted_at', null)
        .single();

    if (error || !campaign) {
        return { success: false, error: 'Campanha nao encontrada' };
    }

    const isActive = activeCampaigns.has(campaignId);

    return {
        success: true,
        campaign: {
            id: campaign.id,
            status: campaign.status,
            progress_percent: campaign.progress_percent,
            total_recipients: campaign.total_recipients,
            total_sent: campaign.total_sent,
            total_failed: campaign.total_failed,
            started_at: campaign.started_at,
            finished_at: campaign.finished_at,
            last_error: campaign.last_error,
            is_active: isActive
        }
    };
}

// ============================================
// Utilitários
// ============================================
function getActiveCampaigns() {
    const result = [];
    activeCampaigns.forEach((state, id) => {
        result.push({
            campaignId: id,
            status: state.status,
            sent: state.sent,
            failed: state.failed,
            totalRecipients: state.totalRecipients
        });
    });
    return result;
}

function isActive(campaignId) {
    return activeCampaigns.has(campaignId);
}


// ============================================
// Recuperar campanhas presas em 'sending' (boot)
// ============================================
async function recoverStuckCampaigns(supabaseAdmin) {
    try {
        const { data: stuck, error } = await supabaseAdmin
            .from('campaigns')
            .select('id, nome')
            .eq('status', 'sending')
            .is('deleted_at', null);

        if (error) {
            console.error('[CampaignEngine] Erro ao buscar campanhas presas:', error.message);
            return 0;
        }

        if (!stuck || stuck.length === 0) return 0;

        const { error: updateError } = await supabaseAdmin
            .from('campaigns')
            .update({ status: 'paused', updated_at: new Date().toISOString() })
            .eq('status', 'sending')
            .is('deleted_at', null);

        if (updateError) {
            console.error('[CampaignEngine] Erro ao recuperar campanhas:', updateError.message);
            return 0;
        }

        console.log('[CampaignEngine] Recovered ' + stuck.length + ' stuck campaign(s)');
        return stuck.length;
    } catch (err) {
        console.error('[CampaignEngine] Erro inesperado na recuperacao:', err.message);
        return 0;
    }
}

module.exports = {
    startCampaign,
    pauseCampaign,
    resumeCampaign,
    cancelCampaign,
    getProgress,
    getActiveCampaigns,
    isActive,
    recoverStuckCampaigns,
    // Exportados para testes
    BATCH_SIZE,
    BATCH_DELAY_MS,
    MAX_CONCURRENT
};
