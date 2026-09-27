# Web Bill Payments

`src/components/Bills/BillsView.tsx` submits real bill payments through the
backend; there is no client-side simulation.

## Flow

1. Providers for the selected category are loaded from
   `GET /api/bills/providers/:category`. Categories match the backend:
   `airtime`, `data`, `electricity`, `cable_tv`.
2. **Pay Now** calls `submitBillPayment` (`src/utils/billsApi.ts`), which posts
   to the authenticated `POST /api/bills/pay` endpoint (session cookie + CSRF
   token via `apiClient`) with `{ category, provider, phone, amount }`.
3. The result modal (`BillPaymentResult.tsx`) shows:
   - **Pending** while the request is in flight, and while the returned
     transaction is not yet `completed`/`failed`. Pending payments are tracked
     with `GET /api/transactions/:id` every 3s (up to 10 checks); if still
     pending after that, the modal keeps the pending state and reference.
   - **Successful** / **Failed** from the backend transaction status. The
     reference shown is the backend's payment reference (or transaction id).
4. Errors returned by the API or provider (e.g. `Insufficient wallet balance`,
   validation messages, rate limiting) are shown verbatim in the failed state.

## Tests

`npm run test:contracts` runs `src/utils/billsApi.test.ts` (API calls, response
contract, pending → final tracking, error preservation) and
`src/components/Bills/BillPaymentResult.test.tsx` (pending/success/failed
rendering). Backend route coverage: `backend/tests/billRoutes.test.js`.
