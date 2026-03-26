jest.mock('@stellar/stellar-sdk');
jest.mock('../../models/User');
jest.mock('../../models/Balance');
jest.mock('../../models/Transaction');
jest.mock('../../models/Notification');
jest.mock('../../config/redis');

const { Horizon } = require('@stellar/stellar-sdk');
const User = require('../../models/User');
const Balance = require('../../models/Balance');
const Transaction = require('../../models/Transaction');
const Notification = require('../../models/Notification');
const redis = require('../../config/redis');
const StellarStreamService = require('../../services/StellarStreamService');

const MOCK_USER_ID = 'user123';
const MOCK_ADDRESS = 'GDEST1234567890';
const MOCK_SENDER = 'GSEND1234567890';

// Persistent ref — never reassigned, only mutated
const captured = { cursor: null, onmessage: null, onerror: null };

function buildPayment(overrides = {}) {
  return {
    type: 'payment',
    to: MOCK_ADDRESS,
    from: MOCK_SENDER,
    amount: '10.5',
    asset_type: 'native',
    transaction_hash: 'txhash123',
    paging_token: 'token_abc',
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  captured.cursor = null;
  captured.onmessage = null;
  captured.onerror = null;

  Horizon.Server.mockImplementation(() => ({
    payments: () => ({
      cursor: (cur) => ({
        stream: (handlers) => {
          captured.cursor = cur;
          captured.onmessage = handlers.onmessage;
          captured.onerror = handlers.onerror;
          return jest.fn();
        }
      })
    })
  }));

  User.find.mockReturnValue({
    lean: jest.fn().mockResolvedValue([{ stellarAddress: MOCK_ADDRESS, _id: MOCK_USER_ID }])
  });

  redis.get = jest.fn().mockResolvedValue(null);
  redis.set = jest.fn().mockResolvedValue('OK');
  redis.publish = jest.fn().mockResolvedValue(1);

  Balance.credit = jest.fn().mockResolvedValue({ amount: 10.5 });
  Transaction.create = jest.fn().mockResolvedValue({});
  Notification.create = jest.fn().mockResolvedValue({});
});

describe('StellarStreamService', () => {
  test('loads user addresses on start', async () => {
    const service = new StellarStreamService('https://horizon-testnet.stellar.org');
    await service.start();
    expect(User.find).toHaveBeenCalledWith({}, 'stellarAddress _id');
    expect(service.addressMap.get(MOCK_ADDRESS)).toBe(MOCK_USER_ID);
  });

  test('connects with "now" cursor when no cursor stored', async () => {
    const service = new StellarStreamService();
    await service.start();
    expect(captured.cursor).toBe('now');
  });

  test('connects with stored cursor from Redis', async () => {
    redis.get.mockResolvedValue('token_prev');
    const service = new StellarStreamService();
    await service.start();
    expect(captured.cursor).toBe('token_prev');
  });

  test('ignores non-payment events', async () => {
    const service = new StellarStreamService();
    await service.start();
    await captured.onmessage({ type: 'create_account', to: MOCK_ADDRESS });
    expect(Balance.credit).not.toHaveBeenCalled();
  });

  test('ignores payments to unknown addresses', async () => {
    const service = new StellarStreamService();
    await service.start();
    await captured.onmessage(buildPayment({ to: 'GUNKNOWN' }));
    expect(Balance.credit).not.toHaveBeenCalled();
  });

  test('credits balance on incoming payment', async () => {
    const service = new StellarStreamService();
    await service.start();
    await captured.onmessage(buildPayment());
    expect(Balance.credit).toHaveBeenCalledWith(MOCK_USER_ID, 10.5);
  });

  test('creates transaction record with correct fields', async () => {
    const service = new StellarStreamService();
    await service.start();
    await captured.onmessage(buildPayment());
    expect(Transaction.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: MOCK_USER_ID,
      type: 'credit',
      status: 'completed',
      amount: 10.5,
      asset: 'XLM',
      sender: MOCK_SENDER,
      stellarTxHash: 'txhash123'
    }));
  });

  test('creates notification for user', async () => {
    const service = new StellarStreamService();
    await service.start();
    await captured.onmessage(buildPayment());
    expect(Notification.create).toHaveBeenCalledWith(
      MOCK_USER_ID,
      'Payment Received',
      expect.stringContaining('10.5 XLM')
    );
  });

  test('saves cursor to Redis after processing', async () => {
    const service = new StellarStreamService();
    await service.start();
    await captured.onmessage(buildPayment());
    expect(redis.set).toHaveBeenCalledWith('stellar:stream:cursor', 'token_abc');
  });

  test('handles non-native asset payments', async () => {
    const service = new StellarStreamService();
    await service.start();
    await captured.onmessage(buildPayment({ asset_type: 'credit_alphanum4', asset_code: 'USDC' }));
    expect(Transaction.create).toHaveBeenCalledWith(expect.objectContaining({ asset: 'USDC' }));
  });

  test('schedules reconnect on stream error', async () => {
    jest.useFakeTimers();
    const service = new StellarStreamService();
    const connectSpy = jest.spyOn(service, '_connect');
    await service.start();
    captured.onerror(new Error('stream disconnected'));
    jest.advanceTimersByTime(1500);
    expect(connectSpy).toHaveBeenCalledTimes(2); // initial + reconnect
    jest.useRealTimers();
  });

  test('stop() halts reconnection', async () => {
    jest.useFakeTimers();
    const service = new StellarStreamService();
    const connectSpy = jest.spyOn(service, '_connect');
    await service.start();
    service.stop();
    captured.onerror(new Error('error'));
    jest.advanceTimersByTime(5000);
    expect(connectSpy).toHaveBeenCalledTimes(1); // only initial
    jest.useRealTimers();
  });

  test('registerAddress adds to map', () => {
    const service = new StellarStreamService();
    service.registerAddress('GNEW123', 'newUserId');
    expect(service.addressMap.get('GNEW123')).toBe('newUserId');
  });

  test('unregisterAddress removes from map', () => {
    const service = new StellarStreamService();
    service.registerAddress('GNEW123', 'newUserId');
    service.unregisterAddress('GNEW123');
    expect(service.addressMap.has('GNEW123')).toBe(false);
  });
});
