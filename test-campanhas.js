const fs = require('fs');
const path = require('path');
const http = require('http');
const ROOT = __dirname;
let passed = 0, failed = 0;

function ok(c, m) { if (c) { console.log(`  ✅ ${m}`); passed++; } else { console.log(`  ❌ ${m}`); failed++; } }
function readFile(r) { return fs.readFileSync(path.join(ROOT, r), 'utf8'); }

function testSyntax() {
    console.log('\n🔧 1. Syntax Checks');
    ['server.js','js/views/campanhas.js','js/dashboard.js','css/dashboard.css'].forEach(f => {
        try { require('child_process').execSync('node -c ' + f, { cwd: ROOT, stdio: 'pipe' }); ok(true, f+' valid'); }
        catch { ok(false, f+' INVALID'); }
    });
}

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
    ok(sql.includes('ON DELETE SET NULL'), 'SET NULL on template delete');
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

function testEndpoints() {
    console.log('\n🔌 3. Backend Endpoints');
    const s = readFile('server.js');
    ok(s.includes("app.get('/api/campaigns'"), 'GET /api/campaigns');
    ok(s.includes("app.get('/api/campaigns/:id'"), 'GET /api/campaigns/:id');
    ok(s.includes("app.post('/api/campaigns'"), 'POST /api/campaigns');
    ok(s.includes("app.put('/api/campaigns/:id'"), 'PUT /api/campaigns/:id');
    ok(s.includes("app.delete('/api/campaigns/:id'"), 'DELETE /api/campaigns/:id');
    ok(s.includes("app.get('/api/campaigns/:id/recipients'"), 'GET recipients');
    ok(s.includes("app.post('/api/campaigns/:id/recipients'"), 'POST recipients');
    ok(s.includes("app.delete('/api/campaigns/:id/recipients/:contactId'"), 'DELETE recipient');

    const section = s.substring(s.indexOf('CAMPAIGNS API'));
    const routes = section.match(/app\.(get|post|put|delete)\('\/api\/campaigns/g) || [];
    const withAuth = routes.filter(r => section.substring(section.indexOf(r), section.indexOf(r)+200).includes('authMiddleware'));
    ok(withAuth.length === routes.length, `All ${routes.length} routes use authMiddleware`);

    ok(section.includes('deleted_at'), 'Soft delete in campaigns');
    ok(!section.includes(".from('campaigns').delete()"), 'No hard delete in campaigns');
}

function testFrontend() {
    console.log('\n🎨 4. Frontend');
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

    ok(html.includes('campanhas.js'), 'campanhas.js in dashboard.html');
    ok((html.match(/campanhas\.js/g)||[]).length === 1, 'campanhas.js loaded once');
    ok(dash.includes("window.CampanhasView"), 'CampanhasView wired');
}

function testCSS() {
    console.log('\n🎨 5. CSS');
    const css = readFile('css/dashboard.css');
    ok(css.includes('.cp-stepper'), 'cp-stepper');
    ok(css.includes('.cp-modal'), 'cp-modal');
    ok(css.includes('.cp-card--selected'), 'cp-card selection');
    ok(css.includes('.tl-badge--blue'), 'badge blue');
    ok(css.includes('.tl-badge--yellow'), 'badge yellow');
    ok(css.includes('.tl-badge--orange'), 'badge orange');
}

function testSoftDelete() {
    console.log('\n🗑️ 6. Soft Delete');
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

function testRouteOrdering() {
    console.log('\n🔀 7. Route Ordering');
    const s = readFile('server.js');
    const lines = s.split('\n');
    const routes = [];
    lines.forEach((l, i) => {
        if (l.match(/app\.(get|post|put|delete)\('\/api\/campaigns/)) routes.push({ line: i+1, raw: l.trim() });
    });
    ok(routes.length === 8, `8 campaign routes (${routes.length})`);

    // Static before param: /recipients before /:id
    const recipientsGet = routes.findIndex(r => r.raw.includes("get('/api/campaigns/:id/recipients'"));
    const paramGet = routes.findIndex(r => r.raw.includes("get('/api/campaigns/:id'") && !r.raw.includes("recipients"));
    ok(recipientsGet >= 0 && paramGet >= 0 && recipientsGet < paramGet, 'GET /recipients before GET /:id');

    const recipientsPost = routes.findIndex(r => r.raw.includes("post('/api/campaigns/:id/recipients'"));
    ok(recipientsPost >= 0, 'POST /recipients exists');
}

function testNoDeadCode() {
    console.log('\n🧹 8. Dead Code Check');
    const s = readFile('server.js');
    const start = s.indexOf('CAMPAIGNS API');
    const end = s.indexOf('CRIAR CHECKOUT');
    const section = s.substring(start, end);

    ok(!section.includes("sendMail"), 'No sendMail in campaigns section');
    ok(!section.includes("transporter"), 'No transporter in campaigns section');
    ok(!section.includes("nodemailer"), 'No nodemailer in campaigns section');

    const js = readFile('js/views/campanhas.js');
    ok(!js.includes("sendMail"), 'No sendMail in frontend');
    ok(!js.includes("agendar"), 'No scheduling in frontend (not yet)');
}

function testServer() {
    console.log('\n🖥️ 9. Server Boot');
    return new Promise((resolve) => {
        const srv = require('child_process').spawn('node', ['server.js'], {
            cwd: ROOT, stdio: 'pipe', env: { ...process.env, PORT: '3097' }
        });
        setTimeout(() => {
            http.get('http://127.0.0.1:3097/health', (res) => {
                let b = ''; res.on('data', c => b += c);
                res.on('end', () => {
                    ok(res.statusCode === 200, 'Health 200');
                    http.get('http://127.0.0.1:3097/api/campaigns', (r2) => {
                        let b2 = ''; r2.on('data', c => b2 += c);
                        r2.on('end', () => { ok(r2.statusCode === 401, 'GET /api/campaigns -> 401'); srv.kill(); resolve(); });
                    }).on('error', () => { srv.kill(); resolve(); });
                });
            }).on('error', () => { srv.kill(); resolve(); });
        }, 2000);
    });
}

async function run() {
    console.log('🧪 MailFlow Pro — Campanhas Module Tests\n');
    testSyntax(); testMigration(); testEndpoints(); testFrontend();
    testCSS(); testSoftDelete(); testRouteOrdering(); testNoDeadCode();
    await testServer();
    console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
}
run().catch(e => { console.error('Fatal:', e); process.exit(1); });
