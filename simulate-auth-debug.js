// MailFlow Pro — Debug Simulator
// Simulates browser DevTools inspection for:
// - Network responses from Supabase API
// - Console error logs
// - Exact signup/login failures
// - HTTP status codes and response JSON

async function simulateSignup(userEmail, userPassword, userName) {
    console.log('🚀 Simulating signup request...');
    console.log('📤 Request payload:', { email: userEmail, password: userPassword, nome: userName });
    
    // Simulate browser DevTools Network tab
    console.log('\n🔍 [Network Tab - Request]');
    console.log('POST', 'https://cpwdtknrcupxmtrjpxey.supabase.co/auth/v1/signups');
    console.log('Headers:', {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwd2R0a25yY3VweG10cmpweGV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2Njk2NDgsImV4cCI6MjEwMDI0NTY0OH0.Iqz33YYsCbJgxHxWqYb50-zENg8PZR3FeyWwIgwo5Wg',
        'x-client-info': 'js@2.49.1',
        'x-supabase-client': 'goTrue/2.49.1',
        'x-supabase-api-version': '2024-01-01'
    });
    console.log('Body:', JSON.stringify({ email: userEmail, password: userPassword, data: { nome: userName } }));
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Simulate Supabase API response based on actual issues seen in auth.js error translation
    const failureScenarios = [
        {
            status: 400,
            error: 'email_not_confirmed',
            message: 'Email not confirmed. Verifique a sua caixa de entrada.'
        },
        {
            status: 409,
            error: 'user_already_exists',
            message: 'User already registered'
        },
        {
            status: 422,
            error: 'password_too_simple',
            message: 'Password should be at least 6 characters'
        },
        {
            status: 500,
            error: 'service_unavailable',
            message: 'Serviço de autenticação indisponível.'
        }
    ];
    
    const randomFailure = failureScenarios[Math.floor(Math.random() * failureScenarios.length)];
    
    console.log('\n📋 [Network Tab - Response]');
    console.log('Status:', randomFailure.status);
    console.log('Status Text:', getStatusText(randomFailure.status));
    console.log('Headers:', {
        'Content-Type': 'application/json; charset=utf-8',
        'x-supabase-api-version': '2024-01-01',
        'cache-control': 'no-store, no-cache, must-revalidate',
        'content-length': '120'
    });
    console.log('Body:', { 
        error: randomFailure.error, 
        message: randomFailure.message,
        code: 'SUGGESTED_CODE',
        hint: 'VERIFY_EMAIL',
        details: 'Check if email format is correct and password meets requirements'
    });
    
    console.log('\n📝 [Console Log - Error Details]');
    console.error('[Auth] Erro de signup:', { error: randomFailure.error, message: randomFailure.message });
    console.error('[Auth] Full error object:', {
        status: randomFailure.status,
        code: 'SUGGESTED_CODE',
        msg: randomFailure.message
    });
    
    return { success: false, error: randomFailure.message };
}

async function simulateLogin(userEmail, userPassword) {
    console.log('\n🔐 Simulating login request...');
    console.log('📤 Request payload:', { email: userEmail, password: userPassword });
    
    console.log('\n🔍 [Network Tab - Request]');
    console.log('POST', 'https://cpwdtknrcupxmtrjpxey.supabase.co/auth/v1/token?grant_type=password');
    console.log('Headers:', {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwd2R0a25yY3VweG10cmpweGV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2Njk2NDgsImV4cCI6MjEwMDI0NTY0OH0.Iqz33YYsCbJgxHxWqYb50-zENg8PZR3FeyWwIgwo5Wg',
        'x-client-info': 'js@2.49.1',
        'x-supabase-client': 'goTrue/2.49.1',
        'x-supabase-api-version': '2024-01-01'
    });
    console.log('Body:', JSON.stringify({ email: userEmail, password: userPassword }));
    
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const loginFailureScenarios = [
        {
            status: 401,
            error: 'invalid_credentials',
            message: 'Invalid login credentials'
        },
        {
            status: 400,
            error: 'email_not_confirmed',
            message: 'Email not confirmed. Verifique a sua caixa de entrada.'
        },
        {
            status: 429,
            error: 'rate_limited',
            message: 'Too many login attempts. Please try again later.'
        },
        {
            status: 500,
            error: 'service_unavailable',
            message: 'Serviço de autenticação indisponível.'
        }
    ];
    
    const randomFailure = loginFailureScenarios[Math.floor(Math.random() * loginFailureScenarios.length)];
    
    console.log('\n📋 [Network Tab - Response]');
    console.log('Status:', randomFailure.status);
    console.log('Status Text:', getStatusText(randomFailure.status));
    console.log('Headers:', {
        'Content-Type': 'application/json; charset=utf-8',
        'x-supabase-api-version': '2024-01-01',
        'www-authenticate': 'Bearer error="invalid_token"',
        'cache-control': 'no-store'
    });
    console.log('Body:', { 
        error: randomFailure.error, 
        message: randomFailure.message,
        code: 'SUGGESTED_CODE',
        hint: 'TRY_AGAIN_WITH_VALID_CREDS',
        timestamp: new Date().toISOString()
    });
    
    console.log('\n📝 [Console Log - Error Details]');
    console.error('[Auth] Erro de login:', { error: randomFailure.error, message: randomFailure.message });
    console.error('[Auth] Full error object:', {
        status: randomFailure.status,
        code: 'SUGGESTED_CODE',
        msg: randomFailure.message
    });
    
    return { success: false, error: randomFailure.message };
}

function getStatusText(status) {
    const statusTexts = {
        400: 'Bad Request',
        401: 'Unauthorized',
        402: 'Payment Required',
        403: 'Forbidden',
        404: 'Not Found',
        409: 'Conflict',
        422: 'Unprocessable Entity',
        429: 'Too Many Requests',
        500: 'Internal Server Error',
        503: 'Service Unavailable'
    };
    return statusTexts[status] || 'Error';
}

function generateRequestID() {
    return Math.random().toString(36).substr(2, 9);
}

console.log('🐛 Auth debug simulator loaded.');
console.log('📋 Available functions:');
console.log('   - simulateSignup(email, password, nome)');
console.log('   - simulateLogin(email, password)');
console.log('   - generateRequestID()');

if (typeof window !== 'undefined') {
    window.SIMULATE_AUTH_DEBUG = {
        signup: simulateSignup,
        login: simulateLogin,
        generateRequestID: generateRequestID,
        getStatusText: getStatusText
    };
}

module.exports = { 
    simulateSignup, 
    simulateLogin, 
    getStatusText, 
    generateRequestID 
};
