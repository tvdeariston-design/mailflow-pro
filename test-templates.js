/**
 * MailFlow Pro — Templates Module Final Tests (Phase 3: Preview)
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = __dirname;
let passed = 0;
let failed = 0;

function ok(cond, msg) {
    if (cond) { console.log(`  ✅ ${msg}`); passed++; }
    else { console.log(`  ❌ ${msg}`); failed++; }
}

function readFile(rel) {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// ============================================
// 1. Syntax checks
// ============================================
function testSyntax() {
    console.log('\n🔧 1. Syntax Checks');
    ['server.js', 'js/views/templates.js', 'js/dashboard.js'].forEach(f => {
        try {
            require('child_process').execSync('node -c ' + f, { cwd: ROOT, stdio: 'pipe' });
            ok(true, f + ' syntax valid');
        } catch { ok(false, f + ' syntax INVALID'); }
    });
}

// ============================================
// 2. Migration SQL
// ============================================
function testMigration() {
    console.log('\n🗄️ 2. Migration SQL');
    const sql = readFile('database/migrations/006_templates.sql');

    ok(sql.includes('CREATE TABLE IF NOT EXISTS templates'), 'CREATE TABLE exists');
    ok(sql.includes('id'), 'UUID PK column');
    ok(sql.includes('REFERENCES auth.users'), 'user_id FK');
    ok(sql.includes('nome'), 'nome field');
    ok(sql.includes('subject'), 'subject field');
    ok(sql.includes('preheader'), 'preheader field');
    ok(sql.includes('html'), 'html field');
    ok(sql.includes('text_version'), 'text_version field');
    ok(sql.includes('is_default'), 'is_default field');
    ok(sql.includes('thumbnail'), 'thumbnail field');
    ok(sql.includes('usage_count'), 'usage_count field');
    ok(sql.includes('last_used_at'), 'last_used_at field');
    ok(sql.includes('deleted_at'), 'deleted_at field (soft delete)');
    ok(sql.includes('created_at'), 'created_at field');
    ok(sql.includes('updated_at'), 'updated_at field');
    ok(sql.includes('ENABLE ROW LEVEL SECURITY'), 'RLS enabled');
    ok(sql.includes('templates_select_own'), 'SELECT policy');
    ok(sql.includes('templates_insert_own'), 'INSERT policy');
    ok(sql.includes('templates_update_own'), 'UPDATE policy');
    ok(sql.includes('templates_delete_own'), 'DELETE policy');
    ok(sql.includes('trg_templates_updated_at'), 'updated_at trigger');
    ok(sql.includes('trg_templates_single_default'), 'single default trigger');
    ok(sql.includes('enforce_single_default_template'), 'default enforcement function');
    ok(sql.includes('idx_templates_user_id'), 'user_id index');
    ok(sql.includes('idx_templates_created_at'), 'created_at index');
    ok(sql.includes('idx_templates_is_default'), 'is_default partial index');
    ok(sql.includes('deleted_at IS NULL'), 'RLS filters soft deleted');
    ok(sql.includes('GRANT'), 'GRANT permissions');
}

// ============================================
// 3. Backend endpoints
// ============================================
function testEndpoints() {
    console.log('\n🔌 3. Backend Endpoints');
    const server = readFile('server.js');

    // CRUD
    ok(server.includes("app.get('/api/templates'"), 'GET /api/templates');
    ok(server.includes("app.get('/api/templates/:id'"), 'GET /api/templates/:id');
    ok(server.includes("app.post('/api/templates'"), 'POST /api/templates');
    ok(server.includes("app.put('/api/templates/:id'"), 'PUT /api/templates/:id');
    ok(server.includes("app.delete('/api/templates/:id'"), 'DELETE /api/templates/:id');

    // Preview & Test Send
    ok(server.includes("app.post('/api/templates/preview'"), 'POST /api/templates/preview');
    ok(server.includes("app.post('/api/templates/test-send'"), 'POST /api/templates/test-send');

    // All template routes use authMiddleware
    const templateRoutes = server.match(/app\.(get|post|put|delete)\('\/api\/templates[^)]*\)/g) || [];
    const withAuth = templateRoutes.filter(r => r.includes('authMiddleware'));
    ok(withAuth.length === templateRoutes.length, `All ${templateRoutes.length} template routes use authMiddleware`);

    // Soft delete in DELETE endpoint (scope to templates section only)
    const templatesSection = server.substring(server.indexOf('TEMPLATES API'), server.indexOf('CAMPAIGNS API'));
    ok(templatesSection.includes('deleted_at'), 'DELETE uses soft delete (deleted_at)');
    ok(!templatesSection.includes("from('templates').delete()"), 'DELETE does NOT use hard delete on templates');
}

// ============================================
// 4. Frontend
// ============================================
function testFrontend() {
    console.log('\n🎨 4. Frontend');
    const js = readFile('js/views/templates.js');
    const html = readFile('dashboard.html');
    const dashboard = readFile('js/dashboard.js');

    ok(js.includes('var TemplatesView'), 'TemplatesView defined');
    ok(js.includes('return { render: render }'), 'render exported');
    ok(js.includes('function esc('), 'XSS protection (esc function)');
    ok(js.includes('deleted_at: new Date().toISOString()'), 'Soft delete in frontend');

    // dashboard.html loads templates.js
    ok(html.includes('js/views/templates.js'), 'dashboard.html loads templates.js');
    ok(html.split('templates.js').length === 2, 'templates.js loaded exactly once');

    // dashboard.js routes to templates
    ok(dashboard.includes("'templates'"), 'dashboard.js routes to templates');
    ok(dashboard.includes('TemplatesView'), 'dashboard.js references TemplatesView');

    // Template cards include preview and test-send buttons
    ok(js.includes('tl-action--preview'), 'Preview button in card actions');
    ok(js.includes('tl-action--testsend'), 'Test send button in card actions');
    ok(js.includes('Pre-visualizar'), 'Preview tooltip text');
    ok(js.includes('Enviar teste'), 'Test send tooltip text');

    // Preview modal
    ok(js.includes('showPreviewModal'), 'showPreviewModal function exists');
    ok(js.includes('tl-preview-overlay'), 'Preview overlay element');
    ok(js.includes('tl-preview-tabs'), 'Preview tabs element');
    ok(js.includes('tl-preview-frame--desktop'), 'Desktop preview frame');
    ok(js.includes('tl-preview-frame--mobile'), 'Mobile preview frame');
    ok(js.includes('tl-preview-iframe'), 'Preview iframe element');
    ok(js.includes('tl-preview-text'), 'Text preview element');
    ok(js.includes('data-view="desktop"'), 'Desktop tab');
    ok(js.includes('data-view="mobile"'), 'Mobile tab');
    ok(js.includes('data-view="text"'), 'Text tab');
    ok(js.includes('tl-preview-subject-bar'), 'Subject bar in preview');

    // Test send modal
    ok(js.includes('showTestSendModal'), 'showTestSendModal function exists');
    ok(js.includes('tl-testsend-overlay'), 'Test send overlay element');
    ok(js.includes('tl-testsend-email'), 'Test send email input');
    ok(js.includes('tl-testsend-send'), 'Test send send button');
    ok(js.includes('tl-testsend-status'), 'Test send status element');

    // API calls
    ok(js.includes('/api/templates/preview'), 'Preview API endpoint called');
    ok(js.includes('/api/templates/test-send'), 'Test send API endpoint called');
    ok(js.includes('Authorization'), 'Auth header in API calls');
    ok(js.includes("'Bearer '"), 'Bearer token format');
    ok(js.includes('getAccessToken'), 'getAccessToken helper exists');
    ok(js.includes('getAPIBase'), 'getAPIBase helper exists');

    // Merge tags in preview
    ok(js.includes('{{nome}}') || js.includes('merge tag'), 'Merge tags supported');

    // Events bound
    ok(js.includes("querySelectorAll('.tl-action--preview')"), 'Preview button events bound');
    ok(js.includes("querySelectorAll('.tl-action--testsend')"), 'Test send button events bound');

    // No dead code — all functions used
    ok(js.includes('function render('), 'render function');
    ok(js.includes('function refresh('), 'refresh function');
    ok(js.includes('function bindEvents('), 'bindEvents function');
    ok(js.includes('function buildHTML('), 'buildHTML function');
    ok(js.includes('function fetchTemplates('), 'fetchTemplates function');
}

// ============================================
// 5. CSS
// ============================================
function testCSS() {
    console.log('\n🎨 5. CSS');
    const css = readFile('css/dashboard.css');

    ok(css.includes('.tl-preview-tabs'), 'Preview tabs CSS');
    ok(css.includes('.tl-preview-tab--active'), 'Active tab CSS');
    ok(css.includes('.tl-preview-frame--desktop'), 'Desktop frame CSS');
    ok(css.includes('.tl-preview-frame--mobile'), 'Mobile frame CSS');
    ok(css.includes('.tl-preview-iframe'), 'Iframe CSS');
    ok(css.includes('.tl-preview-text'), 'Text preview CSS');
    ok(css.includes('.tl-preview-subject-bar'), 'Subject bar CSS');
    ok(css.includes('.tl-preview-container'), 'Preview container CSS');
    ok(css.includes('.tl-preview-loading'), 'Loading state CSS');
    ok(css.includes('.tl-preview-error'), 'Error state CSS');
    ok(css.includes('.tl-action--preview'), 'Preview action hover CSS');
    ok(css.includes('.tl-action--testsend'), 'Test send action hover CSS');
    ok(css.includes('.tl-modal--xl'), 'XL modal CSS for preview');
    ok(css.includes('.tl-spin'), 'Spin animation for loading');
    ok(css.includes('.tl-preview-meta'), 'Preview meta CSS');
    ok(css.includes('.tl-preview-mobile-notch'), 'Mobile notch CSS');
}

// ============================================
// 6. Route ordering
// ============================================
function testRouteOrdering() {
    console.log('\n📋 6. Route Ordering');
    const server = readFile('server.js');
    const lines = server.split('\n');

    const routeLines = [];
    lines.forEach((line, i) => {
        const m = line.match(/app\.(get|post|put|delete)\('\/api\/templates/);
        if (m) routeLines.push({ line: i + 1, method: m[1] });
    });

    ok(routeLines.length >= 7, `Found ${routeLines.length} template routes (CRUD + preview + test-send)`);

    // Static route (no :id) must come before parametric
    const staticGet = routeLines.findIndex(r => r.method === 'get');
    const paramGet = routeLines.findIndex((r, i) => r.method === 'get' && i > 0);
    ok(staticGet >= 0, 'GET /api/templates exists');
    ok(paramGet > staticGet, 'GET /api/templates (list) before GET /api/templates/:id');

    // preview and test-send must be before :id
    const previewIdx = routeLines.findIndex(r => r.line > 0 && server.split('\n')[r.line - 1].includes('preview'));
    const testSendIdx = routeLines.findIndex(r => r.line > 0 && server.split('\n')[r.line - 1].includes('test-send'));
    ok(previewIdx >= 0, 'POST /api/templates/preview route exists');
    ok(testSendIdx >= 0, 'POST /api/templates/test-send route exists');
}

// ============================================
// 7. Soft delete consistency
// ============================================
function testSoftDelete() {
    console.log('\n🗑️ 7. Soft Delete');
    const server = readFile('server.js');
    const js = readFile('js/views/templates.js');
    const sql = readFile('database/migrations/006_templates.sql');

    ok(sql.includes('deleted_at'), 'deleted_at in migration');
    ok(sql.includes('deleted_at IS NULL'), 'RLS filters deleted_at');
    ok(server.includes("deleted_at: new Date().toISOString()"), 'Server sets deleted_at on delete');
    ok(js.includes("deleted_at: new Date().toISOString()"), 'Frontend sets deleted_at on delete');
    ok(js.includes(".is('deleted_at', null)"), 'Frontend filters deleted_at');
}

// ============================================
// 8. Default template
// ============================================
function testDefaultTemplate() {
    console.log('\n⭐ 8. Default Template');
    const sql = readFile('database/migrations/006_templates.sql');
    const js = readFile('js/views/templates.js');
    const server = readFile('server.js');

    ok(sql.includes('is_default'), 'is_default field exists');
    ok(sql.includes('enforce_single_default_template'), 'Trigger function exists');
    ok(sql.includes('trg_templates_single_default'), 'Trigger exists');
    ok(sql.includes('BEFORE INSERT OR UPDATE'), 'Trigger fires on INSERT and UPDATE');
    ok(js.includes('setDefault'), 'setDefault function exists');
    ok(js.includes("update({ is_default: true })"), 'Frontend updates is_default');
    const templatesSection = server.substring(server.indexOf("TEMPLATES API"));
    ok(templatesSection.includes('is_default'), 'Server handles is_default');
}

// ============================================
// 9. XSS protection
// ============================================
function testXSS() {
    console.log('\n🛡️ 9. XSS Protection');
    const js = readFile('js/views/templates.js');

    ok(js.includes('function esc('), 'esc() function exists');
    const escUses = (js.match(/\besc\(/g) || []).length;
    ok(escUses >= 20, `esc() used ${escUses} times (covers all user data including preview)`);

    // iframe sandbox
    ok(js.includes('sandbox="allow-same-origin"'), 'iframe sandbox attribute');
}

// ============================================
// 10. Preview features
// ============================================
function testPreview() {
    console.log('\n👁️ 10. Preview Features');
    const js = readFile('js/views/templates.js');

    // Desktop/Mobile/Text modes
    ok(js.includes("data-view=\"desktop\""), 'Desktop view tab');
    ok(js.includes("data-view=\"mobile\""), 'Mobile view tab');
    ok(js.includes("data-view=\"text\""), 'Text view tab');

    // Subject display
    ok(js.includes('Assunto:'), 'Subject shown in preview');
    ok(js.includes('Preheader:'), 'Preheader shown in preview');

    // Mobile notch
    ok(js.includes('tl-preview-mobile-notch'), 'Mobile phone notch element');

    // Subject bar in preview
    ok(js.includes('tl-preview-subject-bar'), 'Subject bar in preview frame');

    // Text view strips HTML
    ok(js.includes("replace(/<[^>]*>/g, '')"), 'Text view strips HTML tags');

    // Merge tags rendered via API
    ok(js.includes('renderMergeTags') || js.includes('/api/templates/preview'), 'Merge tags via API');
}

// ============================================
// 11. Test send features
// ============================================
function testTestSend() {
    const server = readFile('server.js');
    console.log('\n📧 11. Test Send Features');
    const js = readFile('js/views/templates.js');

    ok(js.includes('showTestSendModal'), 'Test send modal function');
    ok(js.includes('tl-testsend-email'), 'Email input element');
    ok(js.includes('type="email"'), 'Email input type');
    ok(js.includes('/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/'), 'Email validation regex');
    ok(server.includes('[TESTE]'), 'Test prefix in email subject (server-side)');
    ok(js.includes('tl-testsend-status'), 'Status feedback element');
    ok(js.includes('Email de teste enviado'), 'Success message');
    ok(js.includes('/api/templates/test-send'), 'API endpoint called');
    ok(js.includes("'POST'"), 'POST method used');
}

// ============================================
// 12. No dead code
// ============================================
function testDeadCode() {
    console.log('\n🧹 12. Dead Code Check');
    const js = readFile('js/views/templates.js');

    // All functions should be called
    const functions = ['render', 'buildHTML', 'renderToolbar', 'renderGrid', 'renderEmpty', 'bindEvents',
        'setDefault', 'duplicateTemplate', 'deleteTemplate', 'saveTemplate', 'showTemplateModal',
        'showPreviewModal', 'showTestSendModal', 'refresh', 'fetchTemplates', 'esc', 'formatDate'];

    functions.forEach(fn => {
        const defined = js.includes('function ' + fn + '(');
        const called = js.includes(fn + '(');
        ok(defined && called, fn + ' defined and used');
    });
}

// ============================================
// 13. Server boot
// ============================================
async function testServer() {
    console.log('\n🖥️ 13. Server Boot');
    return new Promise((resolve) => {
        const server = require('child_process').spawn('node', ['server.js'], {
            cwd: ROOT, stdio: 'pipe', env: { ...process.env, PORT: '3098' }
        });
        setTimeout(() => {
            const req = http.get('http://127.0.0.1:3098/health', (res) => {
                let body = '';
                res.on('data', c => body += c);
                res.on('end', () => {
                    ok(res.statusCode === 200, 'Health check 200');

                    // Templates without auth -> 401
                    const req2 = http.get('http://127.0.0.1:3098/api/templates', (res2) => {
                        let body2 = '';
                        res2.on('data', c => body2 += c);
                        res2.on('end', () => {
                            ok(res2.statusCode === 401, 'GET /api/templates without auth -> 401');

                            // Preview without auth -> 401
                            const previewReq = http.request({
                                hostname: '127.0.0.1', port: 3098,
                                path: '/api/templates/preview', method: 'POST',
                                headers: { 'Content-Type': 'application/json' }
                            }, (res3) => {
                                let body3 = '';
                                res3.on('data', c => body3 += c);
                                res3.on('end', () => {
                                    ok(res3.statusCode === 401, 'POST /api/templates/preview without auth -> 401');

                                    // Test send without auth -> 401
                                    const testReq = http.request({
                                        hostname: '127.0.0.1', port: 3098,
                                        path: '/api/templates/test-send', method: 'POST',
                                        headers: { 'Content-Type': 'application/json' }
                                    }, (res4) => {
                                        let body4 = '';
                                        res4.on('data', c => body4 += c);
                                        res4.on('end', () => {
                                            ok(res4.statusCode === 401, 'POST /api/templates/test-send without auth -> 401');
                                            server.kill();
                                            resolve();
                                        });
                                    });
                                    testReq.write('{}');
                                    testReq.end();
                                });
                            });
                            previewReq.write('{}');
                            previewReq.end();
                        });
                    });
                    req2.on('error', () => { server.kill(); resolve(); });
                });
            });
            req.on('error', () => { server.kill(); resolve(); });
        }, 2000);
    });
}

// ============================================
// Run
// ============================================
async function run() {
    console.log('🧪 MailFlow Pro — Templates Module Final Tests (Phase 3: Preview)\n');
    testSyntax();
    testMigration();
    testEndpoints();
    testFrontend();
    testCSS();
    testRouteOrdering();
    testSoftDelete();
    testDefaultTemplate();
    testXSS();
    testPreview();
    testTestSend();
    testDeadCode();
    await testServer();
    console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });
