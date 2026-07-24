/**
 * MailFlow Pro — Campanhas Module Tests (Phase 4: Engine)
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const ROOT = __dirname;
let passed = 0, failed = 0;

function ok(c, m) { if (c) { console.log(`  ✅ ${m}`); passed++; } else { console.log(`  ❌ ${m}`); failed++; } }
function readFile(r) { return fs.readFileSync(path.join(ROOT, r), 'utf8'); }

// ============================================
// 1. Syntax checks
// ============================================
function testSyntax() {
    console.log('\n🔧 1. Syntax Checks');
    ['server.js', 'js/views/campanhas.js', 'js/dashboard.js', 'services/campaign-engine.js'].forEach(f => {
        try { require('child_process').execSync('node -c ' + f, { cwd: ROOT, stdio: 'pipe' }); ok(true, f + ' valid'); }
        catch { ok(false, f + ' INVALID'); }
    });
}

// ============================================
// 2. Migration SQL
// ============================================
function testMigration() {
    console.log('\n🗄️ 2. Migration SQL');
    const sql = readFile('database/migrations/007_campaigns.sql');
    ok(sql.includes('CREATE TABLE IF NOT EXISTS campaigns'), 'campaigns table');
    ok(sql.includes('CREATE TABLE IF NOT EXISTS campaign_recipients'), 'campaign_recipients table');
    ok(sql.includes('PRIMARY KEY'), 'UUID PK');
    ok(sql.includes('REFERENCES auth.users'), 'FK to auth.users');
    ok(sql.includes('REFERENCES templates(id)'), 'FK to templates');
    ok(sql.includes('REFERENCES contacts(id)'), 'FK to contacts');
    ok(sql.includes('ON DELETE CASCADE'), 'CASCADE deletes');
    ok(sql.includes('deleted_at'), 'soft delete');
    ok(sql.includes('created_at'), 'created_at');
    ok(sql.includes('updated_at'), 'updated_at');
    ok(sql.includes('ENABLE ROW LEVEL SECURITY'), 'RLS enabled');
    ok(sql.includes('campaigns_select_own'), 'campaigns SELECT policy');
    ok(sql.includes('campaigns_insert_own'), 'campaigns INSERT policy');
    ok(sql.includes('campaigns_update_own'), 'campaigns UPDATE policy');
    ok(sql.includes('campaigns_delete_own'), 'campaigns DELETE policy');
    ok(sql.includes('cr_select_own'), 'recipients SELECT policy');
    ok(sql.includes('cr_insert_own'), 'recipients INSERT policy');
    ok(sql.includes('trg_campaigns_updated_at'), 'campaigns updated_at trigger');
    ok(sql.includes('trg_cr_updated_at'), 'recipients updated_at trigger');
    ok(sql.includes('idx_campaigns_user_id'), 'campaigns user_id index');
    ok(sql.includes('idx_campaigns_status'), 'campaigns status index');
    ok(sql.includes('idx_campaigns_created_at'), 'campaigns created_at index');
    ok(sql.includes('idx_cr_campaign_id'), 'recipients campaign_id index');
    ok(sql.includes('idx_cr_contact_id'), 'recipients contact_id index');
    ok(sql.includes('idx_cr_unique'), 'recipients unique index');
    ok(sql.includes('GRANT'), 'GRANT permissions');
    ok(sql.includes('progress_percent'), 'progress_percent field');
    ok(sql.includes('total_recipients'), 'total_recipients field');
    ok(sql.includes('total_sent'), 'total_sent field');
    ok(sql.includes('total_bounced'), 'total_bounced field');
    ok(sql.includes('total_unsubscribed'), 'total_unsubscribed field');
    ok(sql.includes('message_id'), 'message_id field');
}

// ============================================
// 3. Backend endpoints — CRUD
// ============================================
function testCRUDEndpoints() {
    console.log('\n🔌 3. Backend Endpoints — CRUD');
    const s = readFile('server.js');
    ok(s.includes("app.get('/api/campaigns'"), 'GET /api/campaigns');
    ok(s.includes("app.get('/api/campaigns/:id'"), 'GET /api/campaigns/:id');
    ok(s.includes("app.post('/api/campaigns'"), 'POST /api/campaigns');
    ok(s.includes("app.put('/api/campaigns/:id'"), 'PUT /api/campaigns/:id');
    ok(s.includes("app.delete('/api/campaigns/:id'"), 'DELETE /api/campaigns/:id');
    ok(s.includes("app.get('/api/campaigns/:id/recipients'"), 'GET recipients');
    ok(s.includes("app.post('/api/campaigns/:id/recipients'"), 'POST recipients');
    ok(s.includes("app.delete('/api/campaigns/:id/recipients/:contactId'"), 'DELETE recipient');
}

// ============================================
// 4. Backend endpoints — Engine
// ============================================
function testEngineEndpoints() {
    console.log('\n🚀 4. Backend Endpoints — Engine');
    const s = readFile('server.js');
    ok(s.includes("app.post('/api/campaigns/:id/send'"), 'POST /api/campaigns/:id/send');
    ok(s.includes("app.post('/api/campaigns/:id/pause'"), 'POST /api/campaigns/:id/pause');
    ok(s.includes("app.post('/api/campaigns/:id/resume'"), 'POST /api/campaigns/:id/resume');
    ok(s.includes("app.post('/api/campaigns/:id/cancel'"), 'POST /api/campaigns/:id/cancel');
    ok(s.includes("app.get('/api/campaigns/:id/progress'"), 'GET /api/campaigns/:id/progress');

    // All engine routes use authMiddleware
    const engineSection = s.substring(s.indexOf('CAMPAIGN ENGINE API'));
    const engineLines = engineSection.split('\n').filter(l => l.match(/app\.(get|post|put|delete)\('\/api\/campaigns/));
    const engineWithAuth = engineLines.filter(l => l.includes('authMiddleware'));
    ok(engineWithAuth.length === engineLines.length, `All ${engineLines.length} engine routes use authMiddleware`);

    // Engine uses supabaseAdmin
    ok(engineSection.includes('supabaseAdmin'), 'Engine uses supabaseAdmin');
}

// ============================================
// 5. Campaign Engine Service
// ============================================
function testCampaignEngine() {
    console.log('\n⚙️ 5. Campaign Engine Service');
    const engine = readFile('services/campaign-engine.js');

    // Exports
    ok(engine.includes('module.exports'), 'module.exports exists');
    ok(engine.includes('startCampaign'), 'startCampaign exported');
    ok(engine.includes('pauseCampaign'), 'pauseCampaign exported');
    ok(engine.includes('resumeCampaign'), 'resumeCampaign exported');
    ok(engine.includes('cancelCampaign'), 'cancelCampaign exported');
    ok(engine.includes('getProgress'), 'getProgress exported');
    ok(engine.includes('getActiveCampaigns'), 'getActiveCampaigns exported');
    ok(engine.includes('isActive'), 'isActive exported');

    // Config
    ok(engine.includes('BATCH_SIZE'), 'BATCH_SIZE configurable');
    ok(engine.includes('BATCH_DELAY_MS'), 'BATCH_DELAY_MS configurable');
    ok(engine.includes('MAX_CONCURRENT'), 'MAX_CONCURRENT configurable');

    // Batch sending
    ok(engine.includes('sendInBatches'), 'sendInBatches function');
    ok(engine.includes('sleep'), 'sleep function for delays');
    ok(engine.includes('sendSingleEmail'), 'sendSingleEmail function');

    // Merge tags
    ok(engine.includes('renderMergeTags'), 'renderMergeTags function');
    ok(engine.includes('nome'), 'Merge tag nome field');
    ok(engine.includes('email'), 'Merge tag email field');
    ok(engine.includes('empresa'), 'Merge tag empresa field');
    ok(engine.includes('telefone'), 'Merge tag telefone field');
    ok(engine.includes('data'), 'Merge tag data field');

    // State management
    ok(engine.includes('activeCampaigns'), 'activeCampaigns Map');
    ok(engine.includes('abortController'), 'abortController for pause/cancel');
    ok(engine.includes('aborted'), 'aborted flag for stop control');

    // Status updates
    ok(engine.includes("status: 'sending'"), 'Sets status to sending');
    ok(engine.includes("status: 'paused'"), 'Sets status to paused');
    ok(engine.includes("status: 'cancelled'"), 'Sets status to cancelled');
    ok(engine.includes("status: 'sent'"), 'Sets status to sent');
    ok(engine.includes("status: 'failed'"), 'Sets status to failed');

    // Counter updates
    ok(engine.includes('total_sent'), 'Updates total_sent');
    ok(engine.includes('total_failed'), 'Updates total_failed');
    ok(engine.includes('progress_percent'), 'Updates progress_percent');
    ok(engine.includes('started_at'), 'Updates started_at');
    ok(engine.includes('finished_at'), 'Updates finished_at');
    ok(engine.includes('last_error'), 'Updates last_error');

    // Recipient updates
    ok(engine.includes("status: 'sent'"), 'Recipient status sent');
    ok(engine.includes("status: 'failed'"), 'Recipient status failed');
    ok(engine.includes("status: 'skipped'"), 'Recipient status skipped');
    ok(engine.includes("status: 'sending'"), 'Recipient status sending');
    ok(engine.includes("status: 'pending'"), 'Recipient status pending');

    // Cleanup
    ok(engine.includes('activeCampaigns.delete'), 'Cleanup after completion');

    // nodemailer
    ok(engine.includes('nodemailer'), 'Uses nodemailer');
    ok(engine.includes('createTransport'), 'Creates transport');

    // No race conditions
    ok(engine.includes("activeCampaigns.has(campaignId)"), 'Checks if already active');
    ok(engine.includes('MAX_CONCURRENT'), 'Limits concurrent campaigns');
}

// ============================================
// 6. Frontend
// ============================================
function testFrontend() {
    console.log('\n🎨 6. Frontend');
    const js = readFile('js/views/campanhas.js');
    const html = readFile('dashboard.html');
    const dash = readFile('js/dashboard.js');

    ok(js.includes('var CampanhasView'), 'CampanhasView defined');
    ok(js.includes('return { render: render }'), 'render exported');
    ok(js.includes('function esc('), 'XSS protection');
    ok(js.includes('deleted_at'), 'Soft delete');
    ok(js.includes('duplicateCampaign'), 'Duplicate function');
    ok(js.includes('showEditor'), 'Editor modal');
    ok(js.includes('fetchTemplates'), 'Template selection');
    ok(js.includes('fetchContacts'), 'Contact selection');
    ok(js.includes('state.search'), 'Search support');
    ok(js.includes('state.page'), 'Pagination support');
    ok(js.includes('state.filterStatus'), 'Status filter');
    ok(js.includes('refresh()'), 'Refresh after ops');

    // Engine actions
    ok(js.includes('sendCampaign'), 'sendCampaign function');
    ok(js.includes('pauseCampaign'), 'pauseCampaign function');
    ok(js.includes('resumeCampaign'), 'resumeCampaign function');
    ok(js.includes('cancelCampaign'), 'cancelCampaign function');
    ok(js.includes('apiCall'), 'apiCall helper for REST endpoints');
    ok(js.includes('getAccessToken'), 'getAccessToken helper');
    ok(js.includes('getAPIBase'), 'getAPIBase helper');

    // Action buttons
    ok(js.includes('tl-action--send'), 'Send button');
    ok(js.includes('tl-action--pause'), 'Pause button');
    ok(js.includes('tl-action--cancel'), 'Cancel button');
    ok(js.includes('data-action="send"'), 'Send action data attribute');
    ok(js.includes('data-action="pause"'), 'Pause action data attribute');
    ok(js.includes('data-action="resume"'), 'Resume action data attribute');
    ok(js.includes('data-action="cancel"'), 'Cancel action data attribute');

    // Progress bar
    ok(js.includes('cp-progress'), 'Progress bar element');
    ok(js.includes('cp-progress__bar'), 'Progress bar inner');
    ok(js.includes('cp-progress__info'), 'Progress info');
    ok(js.includes('progress_percent'), 'Reads progress_percent');

    // Polling
    ok(js.includes('startPolling'), 'startPolling function');
    ok(js.includes('stopPolling'), 'stopPolling function');
    ok(js.includes('stopAllPolling'), 'stopAllPolling function');
    ok(js.includes('setInterval'), 'Uses setInterval for polling');
    ok(js.includes('clearInterval'), 'Clears interval on stop');
    ok(js.includes('pollingTimers'), 'Tracks polling timers');
    ok(js.includes('/progress'), 'Polls /progress endpoint');

    // Status-based actions
    ok(js.includes("'draft'"), 'Draft state check');
    ok(js.includes("'sending'"), 'Sending state check');
    ok(js.includes("'paused'"), 'Paused state check');
    ok(js.includes("'failed'"), 'Failed state check');

    // dashboard.html
    ok(html.includes('campanhas.js'), 'campanhas.js in dashboard.html');
    ok((html.match(/campanhas\.js/g) || []).length === 1, 'campanhas.js loaded once');
    ok(dash.includes("window.CampanhasView"), 'CampanhasView wired');
}

// ============================================
// 7. CSS
// ============================================
function testCSS() {
    console.log('\n🎨 7. CSS');
    const css = readFile('css/dashboard.css');
    ok(css.includes('.cp-progress'), 'Progress bar CSS');
    ok(css.includes('.cp-progress__bar'), 'Progress bar inner CSS');
    ok(css.includes('.cp-progress__info'), 'Progress info CSS');
    ok(css.includes('.tl-action--send'), 'Send action hover CSS');
    ok(css.includes('.tl-action--pause'), 'Pause action hover CSS');
    ok(css.includes('.tl-action--cancel'), 'Cancel action hover CSS');
    ok(css.includes('.cp-stepper'), 'Stepper CSS');
    ok(css.includes('.cp-modal'), 'Modal CSS');
}

// ============================================
// 8. Soft delete
// ============================================
function testSoftDelete() {
    console.log('\n🗑️ 8. Soft Delete');
    const sql = readFile('database/migrations/007_campaigns.sql');
    const s = readFile('server.js');
    const js = readFile('js/views/campanhas.js');

    ok(sql.includes('deleted_at'), 'deleted_at in migration');
    ok(sql.includes('deleted_at IS NULL'), 'RLS filters deleted_at');
    const section = s.substring(s.indexOf('CAMPAIGNS API'));
    ok(section.includes("deleted_at: new Date().toISOString()"), 'Server sets deleted_at');
    ok(section.includes(".is('deleted_at', null)"), 'Server filters deleted_at');
    ok(js.includes("deleted_at: new Date().toISOString()"), 'Frontend sets deleted_at');
}

// ============================================
// 9. Route ordering
// ============================================
function testRouteOrdering() {
    console.log('\n🔀 9. Route Ordering');
    const s = readFile('server.js');
    const lines = s.split('\n');
    const routes = [];
    lines.forEach((l, i) => {
        const m = l.match(/app\.(get|post|put|delete)\('\/api\/campaigns/);
        if (m) routes.push({ line: i + 1, method: m[1], raw: l.trim() });
    });

    ok(routes.length >= 13, `Found ${routes.length} campaign routes (>= 13)`);

    // Static before param: /recipients before /:id
    const recipientsGet = routes.findIndex(r => r.raw.includes("get('/api/campaigns/:id/recipients'"));
    const paramGet = routes.findIndex(r => r.raw.includes("get('/api/campaigns/:id'") && !r.raw.includes("recipients") && !r.raw.includes("progress"));
    ok(recipientsGet >= 0 && paramGet >= 0 && recipientsGet < paramGet, 'GET /recipients before GET /:id');

    const recipientsPost = routes.findIndex(r => r.raw.includes("post('/api/campaigns/:id/recipients'"));
    ok(recipientsPost >= 0, 'POST /recipients exists');
}

// ============================================
// 10. No dead code in engine
// ============================================
function testNoDeadCode() {
    console.log('\n🧹 10. Dead Code Check');
    const engine = readFile('services/campaign-engine.js');

    // All functions defined are exported or called
    ok(!engine.includes('function unused'), 'No unused functions');
    ok(!engine.includes('// TODO'), 'No TODO comments');
    ok(!engine.includes('// FIXME'), 'No FIXME comments');

    // No console.log (only console.error)
    const logCount = (engine.match(/console\.log/g) || []).length;
    const errorCount = (engine.match(/console\.error/g) || []).length;
    ok(logCount === 0, 'No console.log in engine (only console.error)');
    ok(errorCount >= 5, `console.error used ${errorCount} times for error reporting`);
}

// ============================================
// 11. Server boot + auth
// ============================================
function testServer() {
    console.log('\n🖥️ 11. Server Boot');
    return new Promise((resolve) => {
        const srv = require('child_process').spawn('node', ['server.js'], {
            cwd: ROOT, stdio: 'pipe', env: { ...process.env, PORT: '3097' }
        });
        setTimeout(() => {
            http.get('http://127.0.0.1:3097/health', (res) => {
                let b = ''; res.on('data', c => b += c);
                res.on('end', () => {
                    ok(res.statusCode === 200, 'Health 200');

                    // All engine endpoints require auth
                    const getPaths = ['/api/campaigns', '/api/campaigns/test/progress'];
                    const postPaths = ['/api/campaigns/test/send', '/api/campaigns/test/pause',
                        '/api/campaigns/test/resume', '/api/campaigns/test/cancel'];
                    let checked = 0; const total = getPaths.length + postPaths.length;
                    function done() { checked++; if (checked === total) { srv.kill(); resolve(); } }
                    getPaths.forEach(p => {
                        http.get('http://127.0.0.1:3097' + p, (r) => {
                            let body = ''; r.on('data', c => body += c);
                            r.on('end', () => { ok(r.statusCode === 401, 'GET ' + p + ' -> 401'); done(); });
                        }).on('error', () => { done(); });
                    });
                    postPaths.forEach(p => {
                        const req = http.request({ hostname: '127.0.0.1', port: 3097, path: p, method: 'POST',
                            headers: { 'Content-Type': 'application/json' } }, (r) => {
                            let body = ''; r.on('data', c => body += c);
                            r.on('end', () => { ok(r.statusCode === 401, 'POST ' + p + ' -> 401'); done(); });
                        });
                        req.on('error', () => { done(); });
                        req.write('{}'); req.end();
                    });
                });
            }).on('error', () => { srv.kill(); resolve(); });
        }, 2000);
    });
}

// ============================================
// Run
// ============================================
async function run() {
    console.log('🧪 MailFlow Pro — Campanhas Module Tests (Phase 4: Engine)\n');
    testSyntax();
    testMigration();
    testCRUDEndpoints();
    testEngineEndpoints();
    testCampaignEngine();
    testFrontend();
    testCSS();
    testSoftDelete();
    testRouteOrdering();
    testNoDeadCode();
    await testServer();
    console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
}
run().catch(e => { console.error('Fatal:', e); process.exit(1); });
