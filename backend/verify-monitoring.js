import axios from 'axios';
import fs from 'fs';
import path from 'path';
import app from './app.js'; // Import app directly

const PORT = 3001;
const API_URL = `http://localhost:${PORT}/api`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const startServer = () => {
    return new Promise((resolve, reject) => {
        const server = app.listen(PORT, () => {
            console.log(`🚀 Test Server running on port ${PORT}`);
            resolve(server);
        });
        server.on('error', reject);
    });
};

const verify = async () => {
    console.log('🚀 Starting Verification...');
    let server;

    try {
        server = await startServer();
    } catch (err) {
        console.error('❌ Failed to start test server:', err.message);
        return;
    }

    // 1. Check Health Endpoint
    try {
        console.log('\n1️⃣ Checking Health Endpoint...');
        const healthRes = await axios.get(`${API_URL}/health`);
        console.log('   ✅ Health Check Status:', healthRes.status);
        console.log('   ✅ Health Data:', JSON.stringify(healthRes.data, null, 2));

        if (healthRes.data.checks.stellar.status === 'unknown' || healthRes.data.checks.stellar.status === 'down') {
            console.warn('   ⚠️ Stellar check might be down or initializing (expected if no network/keys)');
        }
    } catch (error) {
        console.error('   ❌ Health Check Failed:', error.message);
        if (error.response) {
            console.error('   Response:', error.response.data);
        }
    }

    // 2. Check Performance Headers
    try {
        console.log('\n2️⃣ Checking Performance Headers...');
        const start = Date.now();
        // Use health endpoint for performance check too, as it's safe
        const res = await axios.get(`${API_URL}/health`);
        const end = Date.now();

        console.log('   ✅ Request Status:', res.status);
        console.log('   ✅ X-Response-Time Header:', res.headers['x-response-time']);

        if (res.headers['x-response-time']) {
            console.log('   ✅ Performance header present');
        } else {
            console.error('   ❌ Performance header MISSING');
        }
    } catch (error) {
        console.error('   ❌ Request Failed:', error.message);
    }

    // 3. Check Logs
    console.log('\n3️⃣ Checking Logs...');
    // Allow some time for logs to be written
    await sleep(1000);

    const logDir = path.join(process.cwd(), 'logs');
    if (fs.existsSync(logDir)) {
        const files = fs.readdirSync(logDir);
        const logFiles = files.filter(f => f.startsWith('application-'));

        if (logFiles.length > 0) {
            console.log(`   ✅ Found ${logFiles.length} log file(s)`);
            const latestLog = logFiles.sort().pop();
            const content = fs.readFileSync(path.join(logDir, latestLog), 'utf8');
            console.log(`   ✅ Latest log file (${latestLog}) content preview:\n`);

            const lines = content.trim().split('\n').slice(-10);
            lines.forEach(line => console.log('   ' + line));

            if (content.includes('Stellar Network Health Check')) {
                console.log('\n   ✅ Found Stellar Health Check logs');
            } else {
                console.warn('\n   ⚠️ No Stellar Health Check logs found yet (might need more time)');
            }
        } else {
            console.error('   ❌ No application log files found');
        }
    } else {
        console.error('   ❌ Log directory not found');
    }

    console.log('\n🏁 Verification Complete');

    if (server) {
        server.close();
        console.log('🛑 Test Server stopped');
        process.exit(0); // Force exit to kill any hanging connections (Redis etc)
    }
};

verify();
