const SUPABASE_URL = 'https://cpwdtknrcupxmtrjpxey.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwd2R0a25yY3VweG10cmpweGV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2Njk2NDgsImV4cCI6MjEwMDI0NTY0OH0.Iqz33YYsCbJgxHxWqYb50-zENg8PZR3FeyWwIgwo5Wg';

// Test if these credentials are valid by checking Supabase auth status
async function testCredentials() {
    try {
        const { createClient } = supabase || {};
        if (!createClient) {
            console.error('supabase library not loaded');
            return false;
        }
        
        const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('Supabase client created successfully with hardcoded credentials');
        
        // Test auth session (should be null for anonymous)
        const { data } = await client.auth.getSession();
        console.log('Session status:', data.session ? 'authenticated' : 'anonymous');
        return true;
        
    } catch (err) {
        console.error('Failed to initialize Supabase client:', err.message);
        return false;
    }
}

// Simulate what happens in browser
if (typeof window !== 'undefined') {
    // Inject test function
    window.testAuthCredentials = testCredentials;
    console.log('Test function available: window.testAuthCredentials');
}
