import app from '../app.js';
import request from 'supertest';

async function run() {
    console.log('Testing Sentry /test-error route...');
    try {
        const res = await request(app).get('/test-error');
        console.log('Response status:', res.status);
        console.log('Response body:', res.body);
    } catch (e) {
        console.error('Test error:', e.message);
    }

    // Wait 2 seconds for Sentry to process in the background
    setTimeout(() => process.exit(0), 2000);
}

run();
