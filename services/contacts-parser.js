'use strict';

var HEADER_ALIASES = {
    email: ['email', 'e-mail', 'correo', 'correo electronico', 'mail', 'endereco', 'endereço', 'email address', 'electronic mail'],
    nome: ['nome', 'name', 'nombre', 'full name', 'nome completo', 'nombre completo'],
    telefone: ['telefone', 'phone', 'telephone', 'telemovel', 'telemóvel', 'mobile', 'celular', 'contacto'],
    empresa: ['empresa', 'company', 'organization', 'companhia', 'negocio', 'negócio', 'compania', 'origen'],
    tags: ['tags', 'etiquetas', 'labels', 'tag', 'categorias', 'categories', 'categoria']
};

function stripBOM(text) {
    if (text.charCodeAt(0) === 0xFEFF) {
        return text.slice(1);
    }
    return text;
}

function normalizeLineEndings(text) {
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function parseCSVLine(line, separator) {
    var cells = [];
    var current = '';
    var inQuotes = false;
    for (var i = 0; i < line.length; i++) {
        var c = line[i];
        if (inQuotes) {
            if (c === '"') {
                if (i + 1 < line.length && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                current += c;
            }
        } else {
            if (c === '"') {
                inQuotes = true;
            } else if (c === separator) {
                cells.push(current);
                current = '';
            } else {
                current += c;
            }
        }
    }
    cells.push(current);
    return cells;
}

function detectSeparator(firstLine) {
    var separators = [',', ';', '\t'];
    var best = ',';
    var max = 0;
    for (var s = 0; s < separators.length; s++) {
        var sep = separators[s];
        var count = 0;
        var inQ = false;
        for (var i = 0; i < firstLine.length; i++) {
            var c = firstLine[i];
            if (c === '"') {
                inQ = !inQ;
            } else if (c === sep && !inQ) {
                count++;
            }
        }
        if (count > max) {
            max = count;
            best = sep;
        }
    }
    return best;
}

function parseCSV(content) {
    content = stripBOM(content);
    content = normalizeLineEndings(content);
    if (!content || content.trim().length === 0) {
        return { headers: [], rows: [] };
    }
    var rawLines = content.split('\n');
    if (rawLines.length < 2) {
        return { headers: [], rows: [] };
    }
    var separator = detectSeparator(rawLines[0]);
    var allRows = [];
    var currentRow = null;
    var currentField = '';
    var inQuotes = false;
    for (var li = 0; li < rawLines.length; li++) {
        var line = rawLines[li];
        if (currentRow === null) {
            currentRow = [];
        }
        for (var ci = 0; ci < line.length; ci++) {
            var ch = line[ci];
            if (inQuotes) {
                if (ch === '"') {
                    if (ci + 1 < line.length && line[ci + 1] === '"') {
                        currentField += '"';
                        ci++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    currentField += ch;
                }
            } else {
                if (ch === '"') {
                    inQuotes = true;
                } else if (ch === separator) {
                    currentRow.push(currentField);
                    currentField = '';
                } else {
                    currentField += ch;
                }
            }
        }
        if (inQuotes) {
            currentField += '\n';
        } else {
            currentRow.push(currentField);
            allRows.push(currentRow);
            currentRow = null;
            currentField = '';
        }
    }
    if (currentRow !== null) {
        currentRow.push(currentField);
        allRows.push(currentRow);
    }
    var nonEmptyRows = [];
    for (var r = 0; r < allRows.length; r++) {
        var row = allRows[r];
        var hasContent = false;
        for (var c = 0; c < row.length; c++) {
            if (row[c] !== '') {
                hasContent = true;
                break;
            }
        }
        if (hasContent) {
            nonEmptyRows.push(row);
        }
    }
    if (nonEmptyRows.length < 2) {
        return { headers: [], rows: [] };
    }
    return {
        headers: nonEmptyRows[0],
        rows: nonEmptyRows.slice(1)
    };
}

function parseXLSX(base64Content) {
    var XLSX = require('xlsx');
    var buffer = Buffer.from(base64Content, 'base64');
    var workbook = XLSX.read(buffer, { type: 'buffer' });
    var sheet = workbook.Sheets[workbook.SheetNames[0]];
    var json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (json.length < 2) {
        return { headers: [], rows: [] };
    }
    var headers = json[0].map(function(h) { return String(h).trim(); });
    var rows = json.slice(1);
    return { headers: headers, rows: rows };
}

function parseContent(content, filename) {
    var ext = filename.split('.').pop().toLowerCase();
    if (ext === 'csv') {
        return parseCSV(content);
    } else if (ext === 'xlsx' || ext === 'xls') {
        return parseXLSX(content);
    }
    return { headers: [], rows: [] };
}

function findHeaderIndex(headers, field, userMapping) {
    if (userMapping && userMapping[field] !== undefined) {
        var idx = parseInt(userMapping[field], 10);
        if (idx >= 0 && idx < headers.length) return idx;
    }
    var normalized = headers.map(function(h) {
        return String(h).trim().toLowerCase().replace(/^["']|["']$/g, '');
    });
    var aliases = HEADER_ALIASES[field] || [field];
    for (var a = 0; a < aliases.length; a++) {
        var alias = aliases[a];
        for (var h = 0; h < normalized.length; h++) {
            if (normalized[h] === alias) {
                return h;
            }
        }
    }
    return -1;
}

function buildColumnMapping(headers, userMapping) {
    var fields = ['nome', 'email', 'telefone', 'empresa', 'tags'];
    var mapping = {};
    for (var f = 0; f < fields.length; f++) {
        var field = fields[f];
        mapping[field] = findHeaderIndex(headers, field, userMapping);
    }
    return mapping;
}

function extractField(row, colIndex) {
    if (colIndex < 0 || colIndex >= row.length) return '';
    return String(row[colIndex] || '');
}

module.exports = {
    parseCSV: parseCSV,
    parseXLSX: parseXLSX,
    parseContent: parseContent,
    buildColumnMapping: buildColumnMapping,
    findHeaderIndex: findHeaderIndex,
    extractField: extractField,
    HEADER_ALIASES: HEADER_ALIASES
};
