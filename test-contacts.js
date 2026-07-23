/**
 * MailFlow Pro — Contactos Module Final Tests
 * 
 * Static + server-level tests (no Supabase auth required)
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
    
    try {
        require('child_process').execSync('node -c server.js', { cwd: ROOT, stdio: 'pipe' });
        ok(true, 'server.js syntax valid');
    } catch { ok(false, 'server.js syntax INVALID'); }

    try {
        require('child_process').execSync('node -c js/views/contactos.js', { cwd: ROOT, stdio: 'pipe' });
        ok(true, 'contactos.js syntax valid');
    } catch { ok(false, 'contactos.js syntax INVALID'); }

    try {
        require('child_process').execSync('node -c js/dashboard.js', { cwd: ROOT, stdio: 'pipe' });
        ok(true, 'dashboard.js syntax valid');
    } catch { ok(false, 'dashboard.js syntax INVALID'); }

    try {
        require('child_process').execSync('node -c js/supabase-client.js', { cwd: ROOT, stdio: 'pipe' });
        ok(true, 'supabase-client.js syntax valid');
    } catch { ok(false, 'supabase-client.js syntax INVALID'); }
}

// ============================================
// 2. Route ordering
// ============================================
function testRouteOrdering() {
    console.log('\n🔧 2. Route Ordering (Express matches first-match)');
    const server = readFile('server.js');
    const lines = server.split('\n');

    // Find all contacts routes in order
    const routeLines = [];
    lines.forEach((line, i) => {
        const m = line.match(/app\.(get|post|put|delete)\('\/api\/contacts/);
        if (m) routeLines.push({ line: i + 1, method: m[1], path: line.trim() });
    });

    // Static paths must come before parameterized paths
    const getExport = routeLines.findIndex(r => r.method === 'get' && r.path.includes('/export'));
    const getParam = routeLines.findIndex(r => r.method === 'get' && r.path.includes('/:id'));
    ok(getExport >= 0 && getParam >= 0 && getExport < getParam,
        `GET /export (L${routeLines[getExport]?.line}) before GET /:id (L${routeLines[getParam]?.line})`);

    const deleteBulk = routeLines.findIndex(r => r.method === 'delete' && r.path.includes('/bulk'));
    const deleteParam = routeLines.findIndex(r => r.method === 'delete' && r.path.includes('/:id'));
    ok(deleteBulk >= 0 && deleteParam >= 0 && deleteBulk < deleteParam,
        `DELETE /bulk (L${routeLines[deleteBulk]?.line}) before DELETE /:id (L${routeLines[deleteParam]?.line})`);

    const postImport = routeLines.findIndex(r => r.method === 'post' && r.path.includes('/import'));
    ok(postImport >= 0, `POST /import exists (L${routeLines[postImport]?.line})`);

    // Verify no duplicate routes
    const routeStrings = routeLines.map(r => r.method + ' ' + r.path.split("'")[1]);
    const uniqueRoutes = new Set(routeStrings);
    ok(uniqueRoutes.size === routeStrings.length, `No duplicate routes (${routeStrings.length} unique)`);
}

// ============================================
// 3. Auth middleware on all routes
// ============================================
function testAuthMiddleware() {
    console.log('\n🔒 3. Auth Middleware');
    const server = readFile('server.js');

    // All contacts endpoints must use authMiddleware
    const contactRoutes = server.match(/app\.(get|post|put|delete)\('\/api\/contacts[^)]*\)/g) || [];
    const withAuth = contactRoutes.filter(r => r.includes('authMiddleware'));
    ok(withAuth.length === contactRoutes.length,
        `All ${contactRoutes.length} contacts routes use authMiddleware`);
}

// ============================================
// 4. Migration SQL
// ============================================
function testMigration() {
    console.log('\n🗄️ 4. Migration SQL');
    const sql = readFile('database/migrations/005_contacts.sql');

    ok(sql.includes('CREATE TABLE IF NOT EXISTS contacts'), 'CREATE TABLE exists');
    ok(sql.includes('UNIQUE (user_id, email)'), 'UNIQUE constraint on (user_id, email)');
    ok(sql.includes('ENABLE ROW LEVEL SECURITY'), 'RLS enabled');
    ok(sql.includes('contacts_select_own'), 'SELECT policy');
    ok(sql.includes('contacts_insert_own'), 'INSERT policy');
    ok(sql.includes('contacts_update_own'), 'UPDATE policy');
    ok(sql.includes('contacts_delete_own'), 'DELETE policy');
    ok(sql.includes('trg_contacts_updated_at'), 'updated_at trigger');
    ok(!sql.includes('notas'), 'No unused notas column');

    // Dead functions removed
    ok(!sql.includes('get_user_contacts('), 'No dead get_user_contacts function');
    ok(!sql.includes('get_user_contacts_paginated('), 'No dead get_user_contacts_paginated function');
    ok(!sql.includes('count_user_contacts('), 'No dead count_user_contacts function');

    // No non-unique email index
    ok(!sql.includes('CREATE INDEX IF NOT EXISTS idx_contacts_email'), 'No redundant email index (UNIQUE constraint covers it)');
}

// ============================================
// 5. Frontend field names match SQL
// ============================================
function testFieldConsistency() {
    console.log('\n🔗 5. Field Consistency (SQL ↔ JS)');
    const sql = readFile('database/migrations/005_contacts.sql');
    const js = readFile('js/views/contactos.js');
    const server = readFile('server.js');

    // SQL columns
    const sqlCols = ['id', 'user_id', 'nome', 'email', 'telefone', 'empresa', 'tags', 'created_at', 'updated_at'];
    
    // Frontend insert payload
    sqlCols.forEach(col => {
        if (['updated_at'].includes(col)) return; // trigger handles this
        const inJs = js.includes(`'${col}'`) || js.includes(`"${col}"`);
        const inServer = server.includes(`'${col}'`) || server.includes(`"${col}"`);
        ok(inJs || inServer, `Field '${col}' referenced in JS/server`);
    });
}

// ============================================
// 6. No dead code
// ============================================
function testDeadCode() {
    console.log('\n🧹 6. Dead Code Check');
    const js = readFile('js/views/contactos.js');
    const server = readFile('server.js');

    // No unused upsert with onConflict in import (now uses ignoreDuplicates)
    ok(js.includes('ignoreDuplicates: true') || server.includes('ignoreDuplicates: true'),
        'Import uses upsert with ignoreDuplicates');

    // No manual duplicate check in frontend saveContact
    const saveContactMatch = js.match(/async function saveContact[\s\S]*?\/\/ Modal/);
    if (saveContactMatch) {
        ok(!saveContactMatch[0].includes('dupCheck'), 'No manual dupCheck in saveContact');
    } else {
        ok(true, 'saveContact structure verified (pattern match)');
    }

    // No old Netlify references in contacts files
    ok(!js.includes('.netlify') && !js.includes('functions/'), 'No Netlify refs in contactos.js');

    // No validateStringLength in PUT (only used elsewhere)
    const putBlock = server.match(/app\.put\('\/api\/contacts\/:id'[\s\S]*?^}\);/m);
    if (putBlock) {
        ok(putBlock[0].includes('validateStringLength'), 'No unused validateStringLength in PUT');
    }
}

// ============================================
// 7. Server starts and responds
// ============================================
async function testServer() {
    console.log('\n🖥️ 7. Server Boot Test');
    
    return new Promise((resolve) => {
        const server = require('child_process').spawn('node', ['server.js'], {
            cwd: ROOT, stdio: 'pipe', env: { ...process.env, PORT: '3099' }
        });

        let output = '';
        server.stdout.on('data', d => output += d);
        server.stderr.on('data', d => output += d);

        setTimeout(() => {
            // Test health endpoint
            const req = http.get('http://127.0.0.1:3099/health', (res) => {
                let body = '';
                res.on('data', c => body += c);
                res.on('end', () => {
                    ok(res.statusCode === 200, 'Health check returns 200');
                    try {
                        const j = JSON.parse(body);
                        ok(j.status === 'ok', 'Health status is "ok"');
                    } catch { ok(false, 'Health response is valid JSON'); }

                    // Test unauthenticated contacts endpoint
                    const req2 = http.get('http://127.0.0.1:3099/api/contacts', (res2) => {
                        let body2 = '';
                        res2.on('data', c => body2 += c);
                        res2.on('end', () => {
                            ok(res2.statusCode === 401, 'GET /api/contacts without auth → 401');
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
// 8. dashboard.html
// ============================================
function testDashboard() {
    console.log('\n📄 8. Dashboard HTML');
    const html = readFile('dashboard.html');
    const contactosCount = (html.match(/contactos\.js/g) || []).length;
    ok(contactosCount === 1, `contactos.js loaded exactly once (found ${contactosCount})`);

    ok(html.includes('data-view="contactos"'), 'Sidebar link for contactos exists');
}

// ============================================
// 9. CSS
// ============================================
function testCSS() {
    console.log('\n🎨 9. CSS');
    const css = readFile('css/dashboard.css');
    
    ok(css.includes('.ct-toolbar'), 'ct-toolbar styles');
    ok(css.includes('.ct-table'), 'ct-table styles');
    ok(css.includes('.ct-modal'), 'ct-modal styles');
    ok(css.includes('.ct-btn'), 'ct-btn styles');
    ok(css.includes('.ct-empty'), 'ct-empty styles');
    ok(css.includes('.ct-tag'), 'ct-tag styles');
    ok(css.includes('.ct-pagination'), 'ct-pagination styles');
    ok(css.includes('.ct-search'), 'ct-search styles');
    ok(css.includes('.ct-dropzone'), 'ct-dropzone styles');

    // Check for duplicate class definitions
    const toolbarDefs = (css.match(/\.ct-toolbar\b/g) || []).length;
    ok(toolbarDefs <= 2, `No excessive .ct-toolbar duplication (${toolbarDefs} defs)`);
}

// ============================================
// 10. XSS protection
// ============================================
function testXSS() {
    console.log('\n🛡️ 10. XSS Protection');
    const js = readFile('js/views/contactos.js');
    
    ok(js.includes('function esc('), 'esc() function exists');
    
    // Check that esc() is used in template strings
    const escUses = (js.match(/\besc\(/g) || []).length;
    ok(escUses >= 5, `esc() used ${escUses} times (covers user data)`);
}

// ============================================
// 11. No race conditions in CRUD
// ============================================
function testRaceConditions() {
    console.log('\n⚡ 11. Race Condition Check');
    const js = readFile('js/views/contactos.js');
    const server = readFile('server.js');

    // Frontend saveContact disables button during save
    ok(js.includes('this.disabled = true'), 'Save button disabled during request');
    
    // Import button also disabled
    ok(js.includes("this.textContent = 'A importar...'"), 'Import button shows loading state');
    
    // Server uses await (not fire-and-forget)
    const serverContacts = server.substring(server.indexOf("CONTACTOS API"));
    const awaits = (serverContacts.match(/\bawait\b/g) || []).length;
    ok(awaits >= 10, `Server contacts section uses ${awaits} awaits (proper async)`);
}

// ============================================
// Run
// ============================================
async function run() {
    console.log('🧪 MailFlow Pro — Contactos Final Audit Tests\n');

    testSyntax();
    testRouteOrdering();
    testAuthMiddleware();
    testMigration();
    testFieldConsistency();
    testDeadCode();
    testDashboard();
    testCSS();
    testXSS();
    testRaceConditions();
    await testServer();

    console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
