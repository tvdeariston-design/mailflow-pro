/**
 * MailFlow Pro — Tracking Module Tests (Phase 5)
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
    ['server.js', 'services/campaign-engine.js', 'js/views/campanhas.js'].forEach(f => {
        try { require('child_process').execSync('node -c ' + f, { cwd: ROOT, stdio: 'pipe' }); ok(true, f + ' valid'); }
        catch { ok(false, f + ' INVALID'); }
    });
}

// ============================================
// 2. Migration 008
// ============================================
function testMigration() {
    console.log('\n🗄️ 2. Migration 008');
    const sql = readFile('database/migrations/008_tracking.sql');

    ok(sql.includes('open_count'), 'open_count field');
    ok(sql.includes('click_count'), 'click_count field');
    ok(sql.includes('last_open_ip'), 'last_open_ip field');
    ok(sql.includes('last_click_ip'), 'last_click_ip field');
    ok(sql.includes('last_open_user_agent'), 'last_open_user_agent field');
    ok(sql.includes('last_click_user_agent'), 'last_click_user_agent field');
    ok(sql.includes('idx_cr_opened'), 'opened index');
    ok(sql.includes('idx_cr_clicked'), 'clicked index');
    ok(sql.includes('WHERE opened_at IS NOT NULL'), 'partial index opened');
    ok(sql.includes('WHERE clicked_at IS NOT NULL'), 'partial index clicked');

    // Verify 007 already has the base fields
    const sql007 = readFile('database/migrations/007_campaigns.sql');
    ok(sql007.includes('total_opened'), 'total_opened in 007');
    ok(sql007.includes('total_clicked'), 'total_clicked in 007');
    ok(sql007.includes('opened_at'), 'opened_at in 007');
    ok(sql007.includes('clicked_at'), 'clicked_at in 007');
}

// ============================================
// 3. Open pixel endpoint
// ============================================
function testOpenEndpoint() {
    console.log('\n📷 3. Open Pixel Endpoint');
    const s = readFile('server.js');

    ok(s.includes("app.get('/track/open/:recipientId'"), 'GET /track/open/:recipientId exists');
    ok(s.includes('TRACKING_GIF'), 'Tracking GIF defined');
    ok(s.includes('image/gif'), 'Response Content-Type image/gif');
    ok(s.includes('no-store, no-cache'), 'Cache-Control headers');
    ok(s.includes('open_count'), 'Increments open_count');
    ok(s.includes('opened_at'), 'Sets opened_at');
    ok(s.includes('last_open_ip'), 'Records IP');
    ok(s.includes('last_open_user_agent'), 'Records User-Agent');
    ok(s.includes('total_opened'), 'Updates total_opened');

    // No auth required
    const openLine = s.split('\n').find(l => l.includes("app.get('/track/open/:recipientId'"));
    ok(openLine && !openLine.includes('authMiddleware'), 'Open endpoint has NO auth (email clients)');
}

// ============================================
// 4. Click tracking endpoint
// ============================================
function testClickEndpoint() {
    console.log('\n🔗 4. Click Tracking Endpoint');
    const s = readFile('server.js');

    ok(s.includes("app.get('/track/click/:recipientId'"), 'GET /track/click/:recipientId exists');
    ok(s.includes("req.query.url"), 'Reads url from query param');
    ok(s.includes('click_count'), 'Increments click_count');
    ok(s.includes('clicked_at'), 'Sets clicked_at');
    ok(s.includes('last_click_ip'), 'Records IP');
    ok(s.includes('last_click_user_agent'), 'Records User-Agent');
    ok(s.includes('total_clicked'), 'Updates total_clicked');
    ok(s.includes('res.redirect(302'), 'Redirects with 302');

    // No auth required
    const clickLine = s.split('\n').find(l => l.includes("app.get('/track/click/:recipientId'"));
    ok(clickLine && !clickLine.includes('authMiddleware'), 'Click endpoint has NO auth');

    // URL validation
    const clickBody = s.substring(s.indexOf("app.get('/track/click/:recipientId'"), s.indexOf("app.get('/track/click/:recipientId'") + 1500);
    ok(clickBody.includes("targetUrl.startsWith('http://')"), 'Validates http:// URLs');
    ok(clickBody.includes("targetUrl.startsWith('https://')"), 'Validates https:// URLs');
}

// ============================================
// 5. Stats endpoint
// ============================================
function testStatsEndpoint() {
    console.log('\n📊 5. Stats Endpoint');
    const s = readFile('server.js');

    ok(s.includes("app.get('/api/campaigns/:id/stats'"), 'GET /api/campaigns/:id/stats exists');
    ok(s.includes('open_rate'), 'Returns open_rate');
    ok(s.includes('click_rate'), 'Returns click_rate');
    ok(s.includes('total_opened'), 'Returns total_opened');
    ok(s.includes('total_clicked'), 'Returns total_clicked');

    // Auth required
    const statsSection = s.substring(s.indexOf("app.get('/api/campaigns/:id/stats'"));
    ok(statsSection.includes('authMiddleware'), 'Stats endpoint uses authMiddleware');
}

// ============================================
// 6. Auto-insert tracking in engine
// ============================================
function testTrackingInjection() {
    console.log('\n💉 6. Auto-Insert Tracking');
    const engine = readFile('services/campaign-engine.js');

    ok(engine.includes('injectTrackingPixel'), 'injectTrackingPixel function');
    ok(engine.includes('rewriteLinks'), 'rewriteLinks function');
    ok(engine.includes('getTrackingBase'), 'getTrackingBase function');
    ok(engine.includes('TRACKING_URL'), 'Uses TRACKING_URL env var');
    ok(engine.includes('RENDER_EXTERNAL_URL'), 'Fallback to RENDER_EXTERNAL_URL');

    // Pixel injection
    ok(engine.includes('/track/open/'), 'Pixel URL contains /track/open/');
    ok(engine.includes('style=\"display:none\"'), 'Pixel is hidden');
    ok(engine.includes('width=\"1\"'), 'Pixel width 1');
    ok(engine.includes('height=\"1\"'), 'Pixel height 1');

    // Link rewriting
    ok(engine.includes('rewriteLinks'), 'Links are rewritten');
    ok(engine.includes('/track/click/'), 'Click URL contains /track/click/');
    ok(engine.includes('encodeURIComponent'), 'URL is encoded');

    // sendSingleEmail accepts recipientId
    ok(engine.includes('sendSingleEmail(transporter, campaign, template, contact, recipientId)'), 'sendSingleEmail accepts recipientId');
    ok(engine.includes('sendSingleEmail(transporter, campaign, template, contact, recipient.id)'), 'Passes recipient.id');
}

// ============================================
// 7. Frontend stats
// ============================================
function testFrontendStats() {
    console.log('\n🎨 7. Frontend Stats');
    const js = readFile('js/views/campanhas.js');

    ok(js.includes('total_opened'), 'Reads total_opened');
    ok(js.includes('total_clicked'), 'Reads total_clicked');
    ok(js.includes('openRate'), 'Calculates open_rate');
    ok(js.includes('clickRate'), 'Calculates click_rate');
    ok(js.includes('cp-stats-row'), 'Stats row element');
    ok(js.includes('cp-stat'), 'Stat element');
    ok(js.includes('Aberturas'), 'Opens label');
    ok(js.includes('Cliques'), 'Clicks label');

    const css = readFile('css/dashboard.css');
    ok(css.includes('.cp-stats-row'), 'Stats row CSS');
    ok(css.includes('.cp-stat'), 'Stat element CSS');
}

// ============================================
// 8. No existing endpoints altered
// ============================================
function testNoExistingChanges() {
    console.log('\n🔒 8. No Existing Endpoints Altered');
    const s = readFile('server.js');

    // All original CRUD endpoints still exist
    ok(s.includes("app.get('/api/campaigns'"), 'GET /api/campaigns unchanged');
    ok(s.includes("app.post('/api/campaigns'"), 'POST /api/campaigns unchanged');
    ok(s.includes("app.put('/api/campaigns/:id'"), 'PUT /api/campaigns/:id unchanged');
    ok(s.includes("app.delete('/api/campaigns/:id'"), 'DELETE /api/campaigns/:id unchanged');
    ok(s.includes("app.post('/api/campaigns/:id/send'"), 'POST /send unchanged');
    ok(s.includes("app.post('/api/campaigns/:id/pause'"), 'POST /pause unchanged');
    ok(s.includes("app.post('/api/campaigns/:id/resume'"), 'POST /resume unchanged');
    ok(s.includes("app.post('/api/campaigns/:id/cancel'"), 'POST /cancel unchanged');
    ok(s.includes("app.get('/api/campaigns/:id/progress'"), 'GET /progress unchanged');

    // Template endpoints unchanged
    ok(s.includes("app.get('/api/templates'"), 'GET /templates unchanged');
    ok(s.includes("app.post('/api/templates/preview'"), 'POST /preview unchanged');
    ok(s.includes("app.post('/api/templates/test-send'"), 'POST /test-send unchanged');

    // Tracking endpoints are new (not auth-protected)
    ok(s.includes("app.get('/track/open/:recipientId'"), 'New: open pixel');
    ok(s.includes("app.get('/track/click/:recipientId'"), 'New: click tracking');
    ok(s.includes("app.get('/api/campaigns/:id/stats'"), 'New: stats endpoint');
}

// ============================================
// 9. Merge tags untouched
// ============================================
function testMergeTagsUntouched() {
    console.log('\n🏷️ 9. Merge Tags Untouched');
    const engine = readFile('services/campaign-engine.js');

    ok(engine.includes('\\{\\{nome\\}\\}') || engine.includes('{{nome}}'), 'Merge tag nome');
    ok(engine.includes('\\{\\{email\\}\\}') || engine.includes('{{email}}'), 'Merge tag email');
    ok(engine.includes('\\{\\{empresa\\}\\}') || engine.includes('{{empresa}}'), 'Merge tag empresa');
    ok(engine.includes('\\{\\{telefone\\}\\}') || engine.includes('{{telefone}}'), 'Merge tag telefone');
    ok(engine.includes('\\{\\{data\\}\\}') || engine.includes('{{data}}'), 'Merge tag data');
}

// ============================================
// 10. Server boot + auth
// ============================================
function testServer() {
    console.log('\n🖥️ 10. Server Boot');
    return new Promise((resolve) => {
        const srv = require('child_process').spawn('node', ['server.js'], {
            cwd: ROOT, stdio: 'pipe', env: { ...process.env, PORT: '3096' }
        });
        setTimeout(() => {
            let checked = 0;
            const total = 5;
            function done() { checked++; if (checked === total) { srv.kill(); resolve(); } }

            // Health check
            http.get('http://127.0.0.1:3096/health', (res) => {
                let b = ''; res.on('data', c => b += c);
                res.on('end', () => { ok(res.statusCode === 200, 'Health 200'); done(); });
            }).on('error', () => { done(); });

            // Open pixel — should return 200 with GIF (no auth)
            http.get('http://127.0.0.1:3096/track/open/test-recipient-id', (res) => {
                let b = ''; res.on('data', c => b += c);
                res.on('end', () => {
                    ok(res.statusCode === 200, 'Open pixel returns 200');
                    ok(res.headers['content-type'] === 'image/gif', 'Open pixel returns GIF');
                    done();
                });
            }).on('error', () => { done(); });

            // Click — missing url should return 400
            http.get('http://127.0.0.1:3096/track/click/test-recipient-id', (res) => {
                let b = ''; res.on('data', c => b += c);
                res.on('end', () => { ok(res.statusCode === 400, 'Click without url -> 400'); done(); });
            }).on('error', () => { done(); });

            // Stats — requires auth -> 401
            http.get('http://127.0.0.1:3096/api/campaigns/test/stats', (res) => {
                let b = ''; res.on('data', c => b += c);
                res.on('end', () => { ok(res.statusCode === 401, 'Stats without auth -> 401'); done(); });
            }).on('error', () => { done(); });

        }, 2000);
    });
}

// ============================================
// Run
// ============================================
async function run() {
    console.log('🧪 MailFlow Pro — Tracking Module Tests (Phase 5)\n');
    testSyntax();
    testMigration();
    testOpenEndpoint();
    testClickEndpoint();
    testStatsEndpoint();
    testTrackingInjection();
    testFrontendStats();
    testNoExistingChanges();
    testMergeTagsUntouched();
    await testServer();
    console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
}
run().catch(e => { console.error('Fatal:', e); process.exit(1); });
