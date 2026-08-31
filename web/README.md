# Tagged Web Dashboard

A Next.js 14 web dashboard for managing crypto transactions on the Tagged platform.

## Features

- **Dashboard**: View account balances and transaction volume charts
- **Transactions**: Search and filter transactions by date, chain, and type
- **Send**: Send payments with form validation and approval flow
- **Receive**: Display wallet addresses and referral code
- **Settings**: Manage profile and security settings
- **Authentication**: HttpOnly cookie-based JWT with refresh token rotation

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **HTTP Client**: Axios

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
cd web
npm install
```

### Environment Setup

Copy `.env.example` to `.env.local` and configure:

```bash
cp .env.example .env.local
```

Update `NEXT_PUBLIC_API_URL` to point to your backend API.

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Security Notes

- JWT tokens are stored in HttpOnly cookies (not accessible to JavaScript)
- Refresh tokens are automatically rotated on each request
- No sensitive data is logged to the console
- CSRF protection is enabled for state-changing operations

## API Integration

The dashboard integrates with the Tagged REST API for:

- User authentication (login/register)
- Transaction history and search
- Balance queries
- Send payments
- Allowance status checks
- Referral program

## Pages

- `/login` - User authentication
- `/dashboard` - Account overview with balance and charts
- `/transactions` - Transaction history with filtering
- `/send` - Payment submission form
- `/receive` - Display wallet addresses and tags
- `/settings` - User profile and security settings

## Testing

```bash
npm test
```

## Deployment

```bash
npm run build
npm run start
```

## Notes

- This dashboard consumes the existing Tagged REST API
- No new backend endpoints are required
- Responsive design works on tablet and desktop
- Mobile screens are handled by the native mobile app
