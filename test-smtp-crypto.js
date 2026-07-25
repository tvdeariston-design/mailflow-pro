/**
 * MailFlow Pro — SMTP Crypto Unit Tests
 *
 * Tests for AES-256-GCM encrypt/decrypt functions.
 * No Supabase or server required.
 */

const crypto = require('crypto');

var passed = 0;
var failed = 0;

function ok(cond, msg) {
    if (cond) { console.log('  \u2705 ' + msg); passed++; }
    else { console.log('  \u274c ' + msg); failed++; }
}

// Generate a test key (32 random bytes as hex)
var testKeyHex = crypto.randomBytes(32).toString('hex');

// Copy of the encrypt/decrypt functions from server.js
var encryptionAvailable = true;

function encrypt(text) {
    if (!encryptionAvailable) return text;
    try {
        var key = Buffer.from(testKeyHex, 'hex');
        var iv = crypto.randomBytes(12);
        var cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        var encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        var authTag = cipher.getAuthTag().toString('hex');
        return iv.toString('hex') + ':' + authTag + ':' + encrypted;
    } catch (e) {
        return text;
    }
}

function decrypt(encoded) {
    if (!encryptionAvailable) return encoded;
    if (!encoded || typeof encoded !== 'string') return encoded;
    var parts = encoded.split(':');
    if (parts.length !== 3) return encoded;
    try {
        var key = Buffer.from(testKeyHex, 'hex');
        var iv = Buffer.from(parts[0], 'hex');
        var authTag = Buffer.from(parts[1], 'hex');
        var encrypted = parts[2];
        var decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        var decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        return encoded;
    }
}

// ============================================
// Tests
// ============================================

function testEncryptDecrypt() {
    console.log('\n\uD83D\uDD12 1. Encrypt -> Decrypt round trip');

    var password = 'MyS3cur3P@ss!';
    var encrypted = encrypt(password);
    ok(typeof encrypted === 'string', 'encrypt() returns a string');
    ok(encrypted !== password, 'encrypted value differs from plaintext');
    ok(encrypted.split(':').length === 3, 'encrypted format is iv:authTag:ciphertext');

    var decrypted = decrypt(encrypted);
    ok(decrypted === password, 'decrypt(encrypt(password)) returns original password');
}

function testDifferentIV() {
    console.log('\n\uD83D\uDD12 2. Different IV per encryption');
    var password = 'same_password';

    var encrypted1 = encrypt(password);
    var encrypted2 = encrypt(password);
    ok(encrypted1 !== encrypted2, 'two encryptions of same password produce different ciphertexts');

    var iv1 = encrypted1.split(':')[0];
    var iv2 = encrypted2.split(':')[0];
    ok(iv1 !== iv2, 'each encryption uses a different IV');
}

function testInvalidCiphertext() {
    console.log('\n\uD83D\uDD12 3. Invalid ciphertext handling');

    // Tampered ciphertext
    var password = 'test_password';
    var encrypted = encrypt(password);
    var parts = encrypted.split(':');
    var tampered = parts[0] + ':' + parts[1] + ':0000' + parts[2].substring(4);
    var result = decrypt(tampered);
    ok(result === tampered, 'decrypt of tampered ciphertext returns raw input (fallback to plaintext)');

    // Missing colon separators
    var noColon = 'justaplainstring';
    ok(decrypt(noColon) === noColon, 'decrypt of non-colon string returns raw input');

    // Invalid hex in IV
    var invalidHex = 'zzzz:' + parts[1] + ':' + parts[2];
    var result2 = decrypt(invalidHex);
    ok(result2 === invalidHex, 'decrypt of invalid hex returns raw input');

    // Null/undefined
    ok(decrypt(null) === null, 'decrypt(null) returns null');
    ok(decrypt(undefined) === undefined, 'decrypt(undefined) returns undefined');
    ok(decrypt('') === '', 'decrypt("") returns ""');
}

function testSpecialCharacters() {
    console.log('\n\uD83D\uDD12 4. Special characters in passwords');

    var passwords = [
        'simple',
        'with spaces and ãçénts',
        '!@#$%^&*()_+-=[]{}|;:,.<>?',
        'a'.repeat(100),
        '',
        'emoji 🚀 test'
    ];

    passwords.forEach(function(pwd) {
        var enc = encrypt(pwd);
        var dec = decrypt(enc);
        ok(dec === pwd, 'password "' + pwd.substring(0, 20) + (pwd.length > 20 ? '...' : '') + '" round-trips correctly');
    });
}

function testLegacyPlaintext() {
    console.log('\n\uD83D\uDD12 5. Backward compatibility with plaintext passwords');

    var plaintext = 'legacy_password_in_db';
    var result = decrypt(plaintext);
    ok(result === plaintext, 'decrypt of plaintext returns the same plaintext (backward compat)');
}

// Run
console.log('\n========================================');
console.log('  SMTP Crypto Unit Tests');
console.log('========================================');

testEncryptDecrypt();
testDifferentIV();
testInvalidCiphertext();
testSpecialCharacters();
testLegacyPlaintext();

console.log('\n========================================');
console.log('  Results: ' + passed + ' passed, ' + failed + ' failed');
console.log('========================================\n');

process.exit(failed > 0 ? 1 : 0);
