import axios from 'axios';

const BASE_URL = 'http://localhost:3000/api/tags';

async function verify() {
    console.log('--- Verifying Tag Availability Endpoint ---');

    try {
        // 1. Check a likely available tag
        const randomTag = `test_tag_${Date.now()}`;
        console.log(`\n1. Checking available tag: ${randomTag}`);
        const res1 = await axios.get(`${BASE_URL}/check/${randomTag}`);
        console.log('Status:', res1.status);
        console.log('Data:', res1.data);
        if (res1.data.available === true && res1.data.suggestions.length === 0) {
            console.log('✅ Passed');
        } else {
            console.error('❌ Failed: Expected available=true');
        }

        // 2. Create a tag to test unavailability (if possible via API)
        // Alternatively, reuse an existing tag if known. 
        // For this test script to be self-contained without creating data, I might not be able to guarantee a collision unless I know the DB state.
        // I will assume 'admin' or something common might exist? Or I will skip creation to avoid polluting DB and just check a known one if I can.
        // Better: Try to create one first.
        const knownTag = `taken_${Date.now()}`;
        const stellarAddress = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'; // Mock 56 chars
        try {
            await axios.post(`${BASE_URL}`, { tag: knownTag, stellarAddress });
            console.log(`\n(Setup) Created tag: ${knownTag}`);
        } catch (e) {
            console.log(`\n(Setup) Failed to create tag (might exist): ${e.message}`);
        }

        // 3. Check the known unavailable tag
        console.log(`\n3. Checking unavailable tag: ${knownTag}`);
        const res2 = await axios.get(`${BASE_URL}/check/${knownTag}`);
        console.log('Data:', res2.data);

        if (res2.data.available === false && Array.isArray(res2.data.suggestions)) {
            console.log('✅ Passed (Suggestions returned: ' + res2.data.suggestions.join(', ') + ')');
        } else {
            console.error('❌ Failed: Expected available=false with suggestions');
        }

        // 4. Test Invalid Format
        console.log('\n4. Testing invalid format (special chars)');
        try {
            await axios.get(`${BASE_URL}/check/invalid!@#`);
            console.error('❌ Failed: Expected 400 error');
        } catch (e) {
            if (e.response && e.response.status === 400) {
                console.log('✅ Passed (Got 400 Bad Request)');
            } else {
                console.error('❌ Failed: ' + e.message);
            }
        }

        // 5. Test Rate Limiting
        console.log('\n5. Testing Rate Limiting (12 requests)');
        let hits = 0;
        try {
            for (let i = 0; i < 12; i++) {
                await axios.get(`${BASE_URL}/check/${randomTag}`);
                hits++;
                process.stdout.write('.');
            }
            console.error('\n❌ Failed: Should have hit rate limit');
        } catch (e) {
            if (e.response && e.response.status === 429) {
                console.log(`\n✅ Passed (Hit rate limit after ${hits} requests)`);
            } else {
                console.error('\n❌ Failed: ' + e.message);
            }
        }

    } catch (error) {
        console.error('Verification Error:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
    }
}

verify();
