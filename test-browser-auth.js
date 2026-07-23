// Test to check if process.env is available in browser
console.log('=== Testing Browser Environment ===');
console.log('typeof process:', typeof process);
console.log('typeof window:', typeof window);
console.log('typeof navigator:', typeof navigator);

if (typeof process !== 'undefined') {
    console.log('process available:', process);
    console.log('process.env.SUPABASE_URL:', process.env.SUPABASE_URL);
    console.log('process.env.SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY || 'Key not set');
}

if (typeof window !== 'undefined') {
    console.log('window location:', window.location.hostname);
    console.log('window exists: true');
}

// Test what supabase-client.js would use
const TEST_SUPABASE_URL = (typeof process !== 'undefined' && process.env && process.env.SUPABASE_URL) ||
                           (typeof window !== 'undefined' && window.SUPABASE_URL) ||
                           'https://cpwdtknrcupxmtrjpxey.supabase.co';
const TEST_SUPABASE_ANON_KEY = (typeof process !== 'undefined' && process.env && process.env.SUPABASE_ANON_KEY) ||
                               (typeof window !== 'undefined' && window.SUPABASE_ANON_KEY) ||
                               'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwd2R0a25yY3VweG10cmpweGV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2Njk2NDgsImV4cCI6MjEwMDI0NTY0OH0.Iqz33YYsCbJgxHxWqYb50-zENg8PZR3FeyWwIgwo5Wg';

console.log('=== supabase-client.js values ===');
console.log('Final SUPABASE_URL:', TEST_SUPABASE_URL);
console.log('Final SUPABASE_ANON_KEY:', TEST_SUPABASE_ANON_KEY.substring(0, 50) + '...');

// Store for later reference
window.TEST_SUPABASE_URL = TEST_SUPABASE_URL;
window.TEST_SUPABASE_ANON_KEY = TEST_SUPABASE_ANON_KEY;
