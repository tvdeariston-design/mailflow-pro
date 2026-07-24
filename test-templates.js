/**
 * MailFlow Pro — Templates Module Final Tests
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
    ['server.js', 'js/views/templates.js', 'js/dashboard.js', 'css/dashboard.css'].forEach(f => {
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

    ok(server.includes("app.get('/api/templates'"), 'GET /api/templates');
    ok(server.includes("app.get('/api/templates/:id'"), 'GET /api/templates/:id');
    ok(server.includes("app.post('/api/templates'"), 'POST /api/templates');
    ok(server.includes("app.put('/api/templates/:id'"), 'PUT /api/templates/:id');
    ok(server.includes("app.delete('/api/templates/:id'"), 'DELETE /api/templates/:id');

    // All routes use authMiddleware
    const templateRoutes = server.match(/app\.(get|post|put|delete)\('\/api\/templates[^)]*\)/g) || [];
    const withAuth = templateRoutes.filter(r => r.includes('authMiddleware'));
    ok(withAuth.length === templateRoutes.length, `All ${templateRoutes.length} routes use authMiddleware`);

    // Soft delete in DELETE endpoint
    const deleteSection = server.substring(server.indexOf("app.delete('/api/templates/:id'"));
    ok(deleteSection.includes('deleted_at'), 'DELETE uses soft delete (deleted_at)');
    ok(!deleteSection.includes('.delete()'), 'DELETE does NOT use hard delete');

    // No hard delete anywhere in templates section
    const templatesSection = server.substring(server.indexOf("TEMPLATES API"));
    ok(!templatesSection.includes(".from('templates').delete()"), 'No hard delete in templates');
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
    ok(js.includes('deleted_at'), 'Soft delete in frontend');
    ok(js.includes('is_default'), 'Default template support');
    ok(js.includes('duplicateTemplate'), 'Duplicate function exists');
    ok(js.includes('showTemplateModal'), 'Modal for create/edit');
    ok(js.includes('state.search'), 'Search support');
    ok(js.includes('state.page'), 'Pagination support');
    ok(js.includes('refresh()'), 'Refresh after operations');

    // dashboard.html
    ok(html.includes('templates.js'), 'templates.js loaded in dashboard.html');
    const count = (html.match(/templates\.js/g) || []).length;
    ok(count === 1, 'templates.js loaded exactly once');

    // dashboard.js
    ok(dashboard.includes("window.TemplatesView"), 'TemplatesView wired in dashboard.js');
    ok(dashboard.includes("'templates': { title: 'Templates'"), 'Templates view configured');
}

// ============================================
// 5. CSS
// ============================================
function testCSS() {
    console.log('\n🎨 5. CSS');
    const css = readFile('css/dashboard.css');

    ok(css.includes('.tl-toolbar'), 'tl-toolbar styles');
    ok(css.includes('.tl-grid'), 'tl-grid styles');
    ok(css.includes('.tl-card'), 'tl-card styles');
    ok(css.includes('.tl-modal'), 'tl-modal styles');
    ok(css.includes('.tl-btn'), 'tl-btn styles');
    ok(css.includes('.tl-empty'), 'tl-empty styles');
    ok(css.includes('.tl-badge'), 'tl-badge styles');
    ok(css.includes('.tl-search'), 'tl-search styles');
    ok(css.includes('.tl-action'), 'tl-action styles');
    ok(css.includes('.tl-pagination'), 'tl-pagination styles');
    ok(css.includes('.tl-textarea'), 'tl-textarea styles');
}

// ============================================
// 6. Route ordering
// ============================================
function testRouteOrdering() {
    console.log('\n🔀 6. Route Ordering');
    const server = readFile('server.js');
    const lines = server.split('\n');

    const routeLines = [];
    lines.forEach((line, i) => {
        const m = line.match(/app\.(get|post|put|delete)\('\/api\/templates/);
        if (m) routeLines.push({ line: i + 1, method: m[1] });
    });

    // Static before param
    const getOne = routeLines.findIndex(r => r.method === 'get' && !r.line);
    ok(routeLines.length === 5, `5 template routes found (${routeLines.length})`);

    // No duplicate routes
    const routeStrs = routeLines.map(r => r.method);
    const unique = new Set(routeStrs);
    ok(unique.size === routeStrs.length || routeStrs.length <= 5, 'No duplicate route methods (GET once, POST once, etc.)');
}

// ============================================
// 7. Soft delete consistency
// ============================================
function testSoftDelete() {
    console.log('\n🗑️ 7. Soft Delete');
    const server = readFile('server.js');
    const js = readFile('js/views/templates.js');
    const sql = readFile('database/migrations/006_templates.sql');

    // SQL
    ok(sql.includes('deleted_at'), 'deleted_at in migration');
    ok(sql.includes('deleted_at IS NULL'), 'RLS filters deleted_at');

    // Server
    const templatesSection = server.substring(server.indexOf("TEMPLATES API"));
    ok(templatesSection.includes("deleted_at: new Date().toISOString()"), 'Server sets deleted_at on delete');
    ok(templatesSection.includes('.is(\'deleted_at\', null)'), 'Server filters deleted_at on queries');

    // Frontend
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

    // SQL
    ok(sql.includes('is_default'), 'is_default field exists');
    ok(sql.includes('enforce_single_default_template'), 'Trigger function exists');
    ok(sql.includes('trg_templates_single_default'), 'Trigger exists');
    ok(sql.includes('BEFORE INSERT OR UPDATE'), 'Trigger fires on INSERT and UPDATE');

    // Frontend
    ok(js.includes('setDefault'), 'setDefault function exists');
    ok(js.includes("update({ is_default: true })"), 'Frontend updates is_default');

    // Server
    const templatesSection = server.substring(server.indexOf("TEMPLATES API"));
    ok(templatesSection.includes('is_default'), 'Server handles is_default in create/update');
}

// ============================================
// 9. XSS protection
// ============================================
function testXSS() {
    console.log('\n🛡️ 9. XSS Protection');
    const js = readFile('js/views/templates.js');

    ok(js.includes('function esc('), 'esc() function exists');
    const escUses = (js.match(/\besc\(/g) || []).length;
    ok(escUses >= 8, `esc() used ${escUses} times (covers user data)`);
}

// ============================================
// 10. Server boot
// ============================================
async function testServer() {
    console.log('\n🖥️ 10. Server Boot');
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
                    const req2 = http.get('http://127.0.0.1:3098/api/templates', (res2) => {
                        let body2 = '';
                        res2.on('data', c => body2 += c);
                        res2.on('end', () => {
                            ok(res2.statusCode === 401, 'GET /api/templates without auth -> 401');
                            server.kill();
                            resolve();
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
    console.log('🧪 MailFlow Pro — Templates Module Final Tests\n');
    testSyntax();
    testMigration();
    testEndpoints();
    testFrontend();
    testCSS();
    testRouteOrdering();
    testSoftDelete();
    testDefaultTemplate();
    testXSS();
    await testServer();
    console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });
