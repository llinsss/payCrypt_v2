# USSD Integration for Tagged

## Overview
USSD (Unstructured Supplementary Service Data) integration allows users to send crypto payments using feature phones without internet access. Users dial a shortcode like `*123*456#` to access Tagged services.

## Features
- ✅ Send money to @tags via USSD
- ✅ Check account balance
- ✅ View transaction history
- ✅ Display user's @tag
- ✅ Works on any phone (no smartphone needed)
- ✅ No internet connection required

## How It Works

### User Flow
1. User dials USSD code: `*123*456#`
2. Menu appears:
   ```
   Welcome to Tagged
   1. Send Money
   2. Check Balance
   3. Transaction History
   4. My @Tag
   ```
3. User selects option by pressing number
4. Follows prompts to complete action

### Example: Sending Money
```
*123*456#
> 1 (Send Money)
> @john (Recipient)
> 5000 (Amount in NGN)
> 1 (Confirm)
> "Payment successful! Sent 5000 NGN to @john"
```

## Technical Architecture

### Components
1. **UssdService** - Core business logic
2. **ussdController** - HTTP request handler
3. **USSD Gateway** - Telecom provider integration (Africa's Talking, Twilio, etc.)

### Request Format (from Gateway)
```json
{
  "sessionId": "ATUid_abc123",
  "serviceCode": "*123*456#",
  "phoneNumber": "+2348012345678",
  "text": "1*@john*5000*1"
}
```

### Response Format
```
CON <message>  // Continue session
END <message>  // End session
```

## Setup Instructions

### 1. Run Migration
```bash
cd backend
npm run migrate
```

### 2. Update User Phone Numbers
Users must have phone numbers linked to their accounts:
```sql
UPDATE users SET phone = '+2348012345678' WHERE email = 'user@example.com';
```

### 3. Configure USSD Gateway

#### Option A: Africa's Talking (Recommended for Africa)
1. Sign up at https://africastalking.com
2. Create USSD service code
3. Set callback URL: `https://yourdomain.com/api/ussd/callback`
4. Add credentials to `.env`:
```env
USSD_PROVIDER=africastalking
AFRICASTALKING_API_KEY=your_api_key
AFRICASTALKING_USERNAME=your_username
```

#### Option B: Twilio
1. Sign up at https://twilio.com
2. Purchase phone number with USSD capability
3. Set webhook URL: `https://yourdomain.com/api/ussd/callback`
4. Add credentials to `.env`:
```env
USSD_PROVIDER=twilio
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
```

### 4. Register Routes
Add to `backend/server.js`:
```javascript
const ussdRoutes = require('./routes/ussd');
app.use('/api/ussd', ussdRoutes);
```

### 5. Start Session Cleanup Worker
Add to `backend/workers.js`:
```javascript
const UssdService = require('./services/UssdService');

// Clean up expired sessions every 5 minutes
setInterval(() => {
  UssdService.cleanupExpiredSessions();
}, 5 * 60 * 1000);
```

## API Endpoints

### POST /api/ussd/callback
Handles incoming USSD requests from gateway.

**Request Body:**
```json
{
  "sessionId": "string",
  "serviceCode": "string",
  "phoneNumber": "string",
  "text": "string"
}
```

**Response:**
```
CON Welcome to Tagged
1. Send Money
2. Check Balance
```

### GET /api/ussd/stats
Get USSD usage statistics (requires authentication).

**Response:**
```json
{
  "total_transactions": 1250,
  "total_volume": 5000000,
  "unique_users": 450
}
```

## Testing

### Local Testing with Simulator
Use Africa's Talking simulator:
1. Go to https://simulator.africastalking.com
2. Enter your USSD code
3. Test the flow

### Manual Testing with cURL
```bash
curl -X POST http://localhost:3000/api/ussd/callback \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test123",
    "serviceCode": "*123*456#",
    "phoneNumber": "+2348012345678",
    "text": ""
  }'
```

## Security Considerations

1. **Phone Verification**: Ensure users verify phone numbers before enabling USSD
2. **Rate Limiting**: Implement per-phone rate limits to prevent abuse
3. **Transaction Limits**: Set daily USSD transaction limits
4. **IP Whitelisting**: Only accept requests from gateway IPs
5. **PIN Protection**: Consider adding PIN for high-value transactions

## Supported Countries

### Africa's Talking Coverage
- 🇳🇬 Nigeria
- 🇰🇪 Kenya
- 🇺🇬 Uganda
- 🇹🇿 Tanzania
- 🇷🇼 Rwanda
- 🇿🇦 South Africa
- 🇬🇭 Ghana

## Pricing
- Africa's Talking: ~$0.002 per USSD session
- Twilio: ~$0.005 per USSD session

## Limitations
- Session timeout: 5 minutes
- Max input length: 182 characters
- No rich media (text only)
- Sequential navigation (no back button)

## Future Enhancements
- [ ] Multi-language support (Yoruba, Hausa, Swahili)
- [ ] PIN-based authentication
- [ ] Airtime purchase
- [ ] Bill payments
- [ ] Request money feature
- [ ] Transaction receipts via SMS

## Support
For issues or questions:
- Email: support@taggedpay.xyz
- Docs: https://docs.taggedpay.xyz/ussd
