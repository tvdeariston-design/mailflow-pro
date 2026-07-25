'use strict';

var passed = 0;
var failed = 0;

function ok(condition, msg) {
    if (condition) {
        passed++;
        console.log('  \u2705 ' + msg);
    } else {
        failed++;
        console.log('  \u274c ' + msg);
    }
}

// Setup env
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://cpwdtknrcupxmtrjpxey.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwd2R0a25yY3VweG10cmpweGV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2Njk2NDgsImV4cCI6MjEwMDI0NTY0OH0.Iqz33YYsCbJgxHxWqYb50-zENg8PZR3FeyWwIgwo5Wg';

var campaignEngine = require('./services/campaign-engine');
var express = require('express');
var { createClient } = require('@supabase/supabase-js');

// ============================================
// Test 1: getTransporter() returns null when no SMTP configured
// ============================================
console.log('\n\uD83D\uDD12 1. Transporter without SMTP config');
var transporter = campaignEngine.getTransporter();
ok(transporter === null, 'getTransporter() returns null when EMAIL_USER/EMAIL_PASS not set');

// ============================================
// Test 2: sendSingleEmail is a function
// ============================================
console.log('\n\uD83D\uDD12 2. sendSingleEmail export');
ok(typeof campaignEngine.sendSingleEmail === 'function', 'sendSingleEmail is exported as a function');

// ============================================
// Test 3: sendSingleEmail handles missing transporter
// ============================================
console.log('\n\uD83D\uDD12 3. sendSingleEmail with null transporter');
var nullTransporter = null;
var fakeCampaign = { from_name: 'Test', from_email: 'test@test.com', reply_to: 'test@test.com', assunto: 'Test' };
var fakeTemplate = { subject: 'Test Subject', preheader: '', html: '<p>Hello</p>', text_version: '' };
var fakeContact = { nome: 'Test', email: 'test@test.com' };

campaignEngine.sendSingleEmail(nullTransporter, fakeCampaign, fakeTemplate, fakeContact, null)
    .then(function() {
        ok(false, 'sendSingleEmail should throw with null transporter');
    })
    .catch(function(err) {
        ok(err !== null, 'sendSingleEmail throws when transporter is null');
    })
    .then(function() {
        // ============================================
        // Test 4: Route imports correctly
        // ============================================
        console.log('\n\uD83D\uDD12 4. Route definition check');
        var app = express();
        var routeRegistered = false;
        var origPost = express.application.post;
        express.application.post = function(path) {
            if (path === '/api/automations/:id/run') {
                routeRegistered = true;
            }
            return origPost.apply(this, arguments);
        };
        // Reload to check the entire server route registration
        delete require.cache[require.resolve('./server.js')];
        require('./server.js');
        express.application.post = origPost;

        ok(routeRegistered, 'POST /api/automations/:id/run is registered');

        // ============================================
        // Test 5: sendSingleEmail builds correct mailOptions
        // ============================================
        console.log('\n\uD83D\uDD12 5. sendSingleEmail builds correct mailOptions');

        var capturedMailOptions = null;
        var mockTransporter = {
            sendMail: function(opts) {
                capturedMailOptions = opts;
                return Promise.resolve({ messageId: 'test-message-id-123' });
            }
        };

        var campaign = {
            from_name: 'Minha Empresa',
            from_email: 'noreply@minhaempresa.com',
            reply_to: 'suporte@minhaempresa.com',
            assunto: 'Oferta Especial'
        };
        var template = {
            subject: '{{nome}}, veja esta oferta!',
            preheader: 'Nao perca esta oportunidade',
            html: '<h1>Ola {{nome}}</h1><p>O seu email e {{email}}</p>',
            text_version: 'Ola {{nome}}, o seu email e {{email}}'
        };
        var contact = {
            nome: 'Joao Silva',
            email: 'joao@example.com',
            empresa: 'Exemplo Lda',
            telefone: '912345678'
        };

        campaignEngine.sendSingleEmail(mockTransporter, campaign, template, contact, null)
            .then(function(messageId) {
                ok(messageId === 'test-message-id-123', 'sendSingleEmail returns the messageId');

                ok(capturedMailOptions !== null, 'sendMail was called');
                if (capturedMailOptions) {
                    ok(capturedMailOptions.from === '"Minha Empresa" <noreply@minhaempresa.com>', 'from is correct: ' + capturedMailOptions.from);
                    ok(capturedMailOptions.to === 'joao@example.com', 'to is correct: ' + capturedMailOptions.to);
                    ok(capturedMailOptions.subject === 'Joao Silva, veja esta oferta!', 'subject has merge tags rendered: ' + capturedMailOptions.subject);
                    ok(capturedMailOptions.replyTo === 'suporte@minhaempresa.com', 'replyTo is correct: ' + capturedMailOptions.replyTo);
                    ok(capturedMailOptions.html.indexOf('Ola Joao Silva') !== -1, 'html has merge tags rendered');
                    ok(capturedMailOptions.text === 'Ola Joao Silva, o seu email e joao@example.com', 'text has merge tags rendered');
                }

                // ============================================
                // Test 6: sendSingleEmail handles tracking pixel (with recipientId)
                // ============================================
                console.log('\n\uD83D\uDD12 6. Tracking with recipientId');
                // Reset
                capturedMailOptions = null;

                // Set tracking URL
                process.env.TRACKING_URL = 'https://track.example.com';

                var recipientId = 'recip-123';
                return campaignEngine.sendSingleEmail(mockTransporter, campaign, template, contact, recipientId);
            })
            .then(function() {
                if (capturedMailOptions && capturedMailOptions.html) {
                    ok(capturedMailOptions.html.indexOf('track.example.com/track/open/recip-123') !== -1, 'tracking pixel injected');
                } else {
                    ok(false, 'html should contain tracking pixel');
                }

                // ============================================
                // Test 7: sendSingleEmail handles errors correctly
                // ============================================
                console.log('\n\uD83D\uDD12 7. Error handling');
                var errorTransporter = {
                    sendMail: function() {
                        return Promise.reject(new Error('SMTP connection refused'));
                    }
                };

                return campaignEngine.sendSingleEmail(errorTransporter, campaign, template, contact, null);
            })
            .then(function() {
                ok(false, 'sendSingleEmail should reject on sendMail error');
            })
            .catch(function(err) {
                ok(err.message === 'SMTP connection refused', 'sendSingleEmail propagates SMTP error: ' + err.message);
            })
            .then(function() {
                // Cleanup tracking URL
                delete process.env.TRACKING_URL;

                // Print final summary
                console.log('\n========================================');
                console.log('  Automation Module Tests');
                console.log('========================================');
                console.log('  Results: ' + passed + ' passed, ' + failed + ' failed');
                console.log('========================================\n');
                process.exit(failed > 0 ? 1 : 0);
            })
            .catch(function(err) {
                console.error('Unexpected error:', err);
                process.exit(1);
            });
    });
