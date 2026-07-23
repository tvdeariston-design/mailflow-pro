const SUPABASE_URL = 'https://cpwdtknrcupxmtrjpxey.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwd2R0a25yY3VweG10cmpweGV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2Njk2NDgsImV4cCI6MjEwMDI0NTY0OH0.Iqz33YYsCbJgxHxWqYb50-zENg8PZR3FeyWwIgwo5Wg';

async function testSupabaseConnection() {
    console.log('=== Testing Supabase Connection ===');
    console.log('URL:', SUPABASE_URL);
    console.log('Key (first 50 chars):', SUPABASE_ANON_KEY.substring(0, 50) + '...');
    
    // Test if this is a valid Supabase URL
    if (!SUPABASE_URL.includes('supabase.co')) {
        console.error('❌ Invalid Supabase URL format');
        return false;
    }
    
    // Validate key format (basic check for JWT format)
    if (!SUPABASE_ANON_KEY.startsWith('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')) {
        console.error('❌ Invalid Supabase key format');
        return false;
    }
    
    console.log('✅ Basic credential format validation passed');
    
    // Check if we can actually connect
    try {
        const { createClient } = supabase || {};
        if (!createClient) {
            console.error('❌ supabase-js not loaded');
            return false;
        }
        
        const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('✅ Supabase client created successfully');
        
        // Test basic auth operation
        const { data, error } = await client.auth.getSession();
        if (error) {
            console.error('❌ Failed to get session:', error.message);
            return false;
        }
        
        console.log('✅ Session fetch successful:', data.session ? 'authenticated' : 'anonymous');
        return true;
        
    } catch (err) {
        console.error('❌ Supabase connection failed:', err.message);
        return false;
    }
}

// Test function export for browser
if (typeof window !== 'undefined') {
    window.testSupabaseConnection = testSupabaseConnection;
    console.log('Test function available as window.testSupabaseConnection');
}

// Run if not in browser context
try {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { testSupabaseConnection };
    }
} catch (e) {}
