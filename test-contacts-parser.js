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

function eq(a, b, msg) {
    if (a === b) {
        passed++;
        console.log('  \u2705 ' + msg);
    } else {
        failed++;
        console.log('  \u274c ' + msg + ' — esperado: ' + JSON.stringify(b) + ', obtido: ' + JSON.stringify(a));
    }
}

var parser = require('./services/contacts-parser');

// ============================================
console.log('\n\uD83D\uDD12 1. BOM stripping');
// ============================================
var bomContent = '\uFEFFnome,email,telefone\nJoao,joao@test.com,911';
var result = parser.parseCSV(bomContent);
eq(result.headers[0], 'nome', 'BOM stripped from first header');
eq(result.rows[0][0], 'Joao', 'First row parsed after BOM');

// ============================================
console.log('\n\uD83D\uDD12 2. CRLF line endings');
// ============================================
var crlfContent = 'nome,email\r\nAna,ana@test.com\r\nBruno,bruno@test.com\r\n';
result = parser.parseCSV(crlfContent);
eq(result.rows.length, 2, 'CRLF: 2 rows parsed');
eq(result.rows[0][1], 'ana@test.com', 'CRLF: email without trailing \\r');
eq(result.rows[1][0], 'Bruno', 'CRLF: second row nome correct');

// ============================================
console.log('\n\uD83D\uDD12 3. Mixed line endings');
// ============================================
var mixedContent = 'nome,email\nCarlos,carlos@test.com\r\nDiana,diana@test.com\n';
result = parser.parseCSV(mixedContent);
eq(result.rows.length, 2, 'Mixed: 2 rows');
eq(result.rows[0][0], 'Carlos', 'Mixed: first row');
eq(result.rows[1][0], 'Diana', 'Mixed: second row');

// ============================================
console.log('\n\uD83D\uDD12 4. RFC 4180 — quoted fields with commas');
// ============================================
var quotedContent = 'nome,email,notas\n"Silva, Joao",joao@test.com,"Notas, extras e mais"';
result = parser.parseCSV(quotedContent);
eq(result.rows[0][0], 'Silva, Joao', 'Quoted field containing comma');
eq(result.rows[0][2], 'Notas, extras e mais', 'Quoted field with multiple commas');

// ============================================
console.log('\n\uD83D\uDD12 5. RFC 4180 — escaped quotes inside quoted fields');
// ============================================
var escapedQuotesContent = 'nome,cargo\n"Joao ""O Grande""","Diretor ""CEO"""';
result = parser.parseCSV(escapedQuotesContent);
eq(result.rows[0][0], 'Joao "O Grande"', 'Escaped quotes inside field');
eq(result.rows[0][1], 'Diretor "CEO"', 'Escaped quotes in second field');

// ============================================
console.log('\n\uD83D\uDD12 6. RFC 4180 — quoted field with newline');
// ============================================
var multilineContent = 'nome,email,morada\nMaria,maria@test.com,"Rua Principal\n2o Andar\nLisboa"';
result = parser.parseCSV(multilineContent);
eq(result.rows.length, 1, 'Multiline: 1 row parsed');
eq(result.rows[0][0], 'Maria', 'Multiline: nome correct');
eq(result.rows[0][2], 'Rua Principal\n2o Andar\nLisboa', 'Multiline: morada with embedded newlines');

// ============================================
console.log('\n\uD83D\uDD12 7. Separator auto-detection (semicolon)');
// ============================================
var semicolonContent = 'nome;email;telefone\nRui;rui@test.com;912345678';
result = parser.parseCSV(semicolonContent);
eq(result.headers.length, 3, 'Semicolon: 3 columns detected');
eq(result.rows[0][1], 'rui@test.com', 'Semicolon: email correct');

// ============================================
console.log('\n\uD83D\uDD12 8. Separator auto-detection (tab)');
// ============================================
var tabContent = 'nome\temail\ttelefone\nSofia\tsofia@test.com\t987654321';
result = parser.parseCSV(tabContent);
eq(result.headers.length, 3, 'Tab: 3 columns detected');
eq(result.rows[0][0], 'Sofia', 'Tab: nome correct');

// ============================================
console.log('\n\uD83D\uDD12 9. Empty lines between rows');
// ============================================
var emptyLineContent = 'nome,email\nAna,ana@test.com\n\nBruno,bruno@test.com\n';
result = parser.parseCSV(emptyLineContent);
eq(result.rows.length, 2, 'Empty lines: 2 rows (blank line skipped)');
eq(result.rows[0][0], 'Ana', 'Empty lines: first row');
eq(result.rows[1][0], 'Bruno', 'Empty lines: second row');

// ============================================
console.log('\n\uD83D\uDD12 10. Trailing empty line');
// ============================================
var trailingNewlineContent = 'nome,email\nRita,rita@test.com\n';
result = parser.parseCSV(trailingNewlineContent);
eq(result.rows.length, 1, 'Trailing newline: 1 row parsed');

// ============================================
console.log('\n\uD83D\uDD12 11. Empty file edge cases');
// ============================================
eq(parser.parseCSV('').headers.length, 0, 'Empty string: no headers');
eq(parser.parseCSV('nome').headers.length, 0, 'Only header: no rows (but no data rows)');
eq(parser.parseCSV('   ').headers.length, 0, 'Whitespace only: no headers');

// ============================================
console.log('\n\uD83D\uDD12 12. Header alias mapping');
// ============================================
var headers = ['E-mail', 'Nome Completo', 'Telefone', 'Empresa', 'Tags'];
var mapping = parser.buildColumnMapping(headers, null);
eq(mapping.email, 0, 'E-mail maps to email index 0');
eq(mapping.nome, 1, 'Nome Completo maps to nome index 1');
eq(mapping.telefone, 2, 'Telefone maps to telefone index 2');
eq(mapping.empresa, 3, 'Empresa maps to empresa index 3');
eq(mapping.tags, 4, 'Tags maps to tags index 4');

// ============================================
console.log('\n\uD83D\uDD12 13. Header alias variations');
// ============================================
var engHeaders = ['Name', 'Email Address', 'Phone', 'Company', 'Categories'];
var engMapping = parser.buildColumnMapping(engHeaders, null);
eq(engMapping.email, 1, 'Email Address maps to email');
eq(engMapping.nome, 0, 'Name maps to nome');
eq(engMapping.telefone, 2, 'Phone maps to telefone');
eq(engMapping.empresa, 3, 'Company maps to empresa');
eq(engMapping.tags, 4, 'Categories maps to tags');

// ============================================
console.log('\n\uD83D\uDD12 14. User-provided mapping overrides aliases');
// ============================================
var userMapping = { email: 2, nome: 1 };
var overrideResult = parser.buildColumnMapping(engHeaders, userMapping);
eq(overrideResult.email, 2, 'User mapping overrides alias (email at col 2)');
eq(overrideResult.nome, 1, 'User mapping overrides alias (nome at col 1)');

// ============================================
console.log('\n\uD83D\uDD12 15. Header with surrounding quotes');
// ============================================
var quotedHeadersContent = '"Nome","Email","Telefone"\nJoao,joao@test.com,911';
result = parser.parseCSV(quotedHeadersContent);
eq(result.headers[0], 'Nome', 'Quoted header: first header without quotes');
eq(result.headers[1], 'Email', 'Quoted header: second header');

// ============================================
console.log('\n\uD83D\uDD12 16. Header with extra spaces before/after');
// ============================================
var spacedContent = '  nome  ,  email  ,  telefone  \nJoao,joao@test.com,911';
result = parser.parseCSV(spacedContent);
// Parser now does NOT trim headers (RFC 4180), but buildColumnMapping uses trim
// Actually, our current parser doesn't trim headers. Let's check.
// Headers keep their spaces
eq(result.headers[0], '  nome  ', 'Spaced headers: spaces preserved as-is');
// But buildColumnMapping should normalize them
var spacedMapping = parser.buildColumnMapping(result.headers, null);
eq(spacedMapping.email, 1, 'Spaced headers: buildColumnMapping still finds email');

// ============================================
console.log('\n\uD83D\uDD12 17. findHeaderIndex with no match');
// ============================================
var noMatch = parser.findHeaderIndex(['a', 'b', 'c'], 'email', null);
eq(noMatch, -1, 'No match returns -1');

// ============================================
console.log('\n\uD83D\uDD12 18. extractField');
// ============================================
var row = ['Joao', 'joao@test.com', '', undefined, null];
eq(parser.extractField(row, 0), 'Joao', 'extractField: normal value');
eq(parser.extractField(row, 2), '', 'extractField: empty string');
eq(parser.extractField(row, 3), '', 'extractField: undefined becomes empty string');
eq(parser.extractField(row, 4), '', 'extractField: null becomes empty string');
eq(parser.extractField(row, 99), '', 'extractField: out of bounds');

// ============================================
console.log('\n\uD83D\uDD12 19. XLSX parse structure');
// ============================================
var xlsxResult = parser.parseXLSX('');
eq(xlsxResult.headers.length, 0, 'Empty XLSX: no headers');
eq(xlsxResult.rows.length, 0, 'Empty XLSX: no rows');

// ============================================
console.log('\n\uD83D\uDD12 20. parseContent auto-detects by extension');
// ============================================
var csvResult = parser.parseContent('nome,email\nJoao,j@t.com', 'file.csv');
eq(csvResult.headers[0], 'nome', 'parseContent CSV: header detected');
eq(csvResult.rows[0][1], 'j@t.com', 'parseContent CSV: row parsed');

var noExt = parser.parseContent('whatever', 'file.txt');
eq(noExt.headers.length, 0, 'parseContent unsupported: empty result');

// ============================================
console.log('\n\uD83D\uDD12 21. RFC 4180 — spaces inside quoted fields are preserved');
// ============================================
var spaceContent = 'nome,email\n"  Joao  ",joao@test.com';
result = parser.parseCSV(spaceContent);
eq(result.rows[0][0], '  Joao  ', 'Spaces inside quotes preserved');

// ============================================
console.log('\n\uD83D\uDD12 22. Tags field parsed correctly');
// ============================================
// Tags in a CSV are a semicolon-separated list
var tagsContent = 'email,tags\nuser@test.com,"tag1;tag2;tag3"';
result = parser.parseCSV(tagsContent);
eq(result.rows[0][1], 'tag1;tag2;tag3', 'Tags field preserves semicolons');

// ============================================
console.log('\n\uD83D\uDD12 23. Comma inside unquoted field');
// ============================================
// This is technically invalid per RFC 4180 but some files do it
// With our parser, a comma inside an unquoted field would be treated as separator
// So this produces more fields than expected
var noQuotesCommaContent = 'a,b\n1,"2,3"';
result = parser.parseCSV(noQuotesCommaContent);
eq(result.rows[0].length, 2, 'Quoted comma: 2 fields');
eq(result.rows[0][1], '2,3', 'Quoted comma preserves comma');

// ============================================
console.log('\n\uD83D\uDD12 24. Realistic CSV import scenario');
// ============================================
var realisticCSV = 'Nome,E-mail,Telemovel,Empresa,Tags\r\n"Ana Silva",ana.silva@exemplo.pt,"+351 912 345 678","Exemplo, Lda.",clientes;novos\r\n"Bruno Costa",bruno.costa@exemplo.pt,,,"clientes;vip"\r\n';
result = parser.parseCSV(realisticCSV);
eq(result.headers.length, 5, 'Realistic: 5 headers');
eq(result.rows.length, 2, 'Realistic: 2 rows');
eq(result.rows[0][0], 'Ana Silva', 'Realistic: nome with quotes');
eq(result.rows[0][3], 'Exemplo, Lda.', 'Realistic: empresa with comma inside quotes');
eq(result.rows[1][2], '', 'Realistic: telefone empty');
eq(result.rows[1][4], 'clientes;vip', 'Realistic: tags');

var realisticMapping = parser.buildColumnMapping(result.headers, null);
eq(realisticMapping.email, 1, 'Realistic: E-mail mapped to email (1)');
eq(realisticMapping.nome, 0, 'Realistic: Nome mapped to nome (0)');
eq(realisticMapping.telefone, 2, 'Realistic: Telemovel mapped to telefone (2)');
eq(realisticMapping.empresa, 3, 'Realistic: Empresa mapped to empresa (3)');
eq(realisticMapping.tags, 4, 'Realistic: Tags mapped to tags (4)');

// ============================================
// Summary
// ============================================
console.log('\n========================================');
console.log('  Contacts Parser Tests');
console.log('========================================');
console.log('  Results: ' + passed + ' passed, ' + failed + ' failed');
console.log('========================================\n');
process.exit(failed > 0 ? 1 : 0);
