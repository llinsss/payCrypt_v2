import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { Repository } from 'typeorm';
import { Queue } from 'bull';
import { WebhookService } from './webhook.service';
import { Webhook, WebhookEventType } from './entities/webhook.entity';
import { CreateWebhookDto } from './dto/create-webhook.dto';

describe('WebhookService', () => {
    let service: WebhookService;
    let webhookRepository: Repository<Webhook>;
    let webhookQueue: Queue;

    const mockWebhookRepository = {
        create: jest.fn(),
        save: jest.fn(),
        find: jest.fn(),
        findOne: jest.fn(),
        remove: jest.fn(),
    };

    const mockQueue = {
        add: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                WebhookService,
                {
                    provide: getRepositoryToken(Webhook),
                    useValue: mockWebhookRepository,
                },
                {
                    provide: getQueueToken('webhooks'),
                    useValue: mockQueue,
                },
            ],
        }).compile();

        service = module.get<WebhookService>(WebhookService);
        webhookRepository = module.get<Repository<Webhook>>(
            getRepositoryToken(Webhook),
        );
        webhookQueue = module.get<Queue>(getQueueToken('webhooks'));

        // Reset mocks
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('registerWebhook', () => {
        it('should create a webhook with provided secret', async () => {
            const createDto: CreateWebhookDto = {
                accountTag: 'testuser',
                url: 'https://example.com/webhook',
                events: [WebhookEventType.ACCOUNT_CREATED],
                secret: 'test-secret',
            };

            const mockWebhook = {
                id: '123',
                ...createDto,
                accountTag: 'testuser',
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockWebhookRepository.create.mockReturnValue(mockWebhook);
            mockWebhookRepository.save.mockResolvedValue(mockWebhook);

            const result = await service.registerWebhook(createDto);

            expect(webhookRepository.create).toHaveBeenCalledWith({
                accountTag: 'testuser',
                url: createDto.url,
                events: createDto.events,
                secret: 'test-secret',
                isActive: true,
            });
            expect(webhookRepository.save).toHaveBeenCalled();
            expect(result).toEqual(mockWebhook);
        });

        it('should generate a secret if not provided', async () => {
            const createDto: CreateWebhookDto = {
                accountTag: 'testuser',
                url: 'https://example.com/webhook',
                events: [WebhookEventType.ACCOUNT_CREATED],
            };

            const mockWebhook = {
                id: '123',
                ...createDto,
                accountTag: 'testuser',
                secret: expect.any(String),
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockWebhookRepository.create.mockImplementation((data) => ({
                ...mockWebhook,
                secret: data.secret,
            }));
            mockWebhookRepository.save.mockImplementation((webhook) =>
                Promise.resolve(webhook),
            );

            const result = await service.registerWebhook(createDto);

            expect(webhookRepository.create).toHaveBeenCalled();
            const createCall = mockWebhookRepository.create.mock.calls[0][0];
            expect(createCall.secret).toBeTruthy();
            expect(createCall.secret.length).toBeGreaterThan(10);
        });
    });

    describe('getWebhooksByAccount', () => {
        it('should return webhooks for an account', async () => {
            const mockWebhooks = [
                {
                    id: '1',
                    accountTag: 'testuser',
                    url: 'https://example.com/webhook1',
                    events: [WebhookEventType.ACCOUNT_CREATED],
                },
                {
                    id: '2',
                    accountTag: 'testuser',
                    url: 'https://example.com/webhook2',
                    events: [WebhookEventType.PAYMENT_RECEIVED],
                },
            ];

            mockWebhookRepository.find.mockResolvedValue(mockWebhooks);

            const result = await service.getWebhooksByAccount('testuser');

            expect(webhookRepository.find).toHaveBeenCalledWith({
                where: { accountTag: 'testuser' },
                order: { createdAt: 'DESC' },
            });
            expect(result).toEqual(mockWebhooks);
        });

        it('should normalize account tag to lowercase', async () => {
            mockWebhookRepository.find.mockResolvedValue([]);

            await service.getWebhooksByAccount('TestUser');

            expect(webhookRepository.find).toHaveBeenCalledWith({
                where: { accountTag: 'testuser' },
                order: { createdAt: 'DESC' },
            });
        });
    });

    describe('triggerEvent', () => {
        it('should queue delivery jobs for subscribed webhooks', async () => {
            const mockWebhooks = [
                {
                    id: '1',
                    accountTag: 'testuser',
                    url: 'https://example.com/webhook1',
                    events: [
                        WebhookEventType.ACCOUNT_CREATED,
                        WebhookEventType.PAYMENT_RECEIVED,
                    ],
                    isActive: true,
                },
                {
                    id: '2',
                    accountTag: 'testuser',
                    url: 'https://example.com/webhook2',
                    events: [WebhookEventType.ACCOUNT_CREATED],
                    isActive: true,
                },
            ];

            mockWebhookRepository.find.mockResolvedValue(mockWebhooks);

            await service.triggerEvent(WebhookEventType.ACCOUNT_CREATED, {
                accountTag: 'testuser',
                publicKey: 'GABC...',
                balance: '1000',
            });

            expect(webhookQueue.add).toHaveBeenCalledTimes(2);
            expect(webhookQueue.add).toHaveBeenCalledWith(
                'deliver-webhook',
                expect.objectContaining({
                    webhookId: '1',
                    payload: expect.objectContaining({
                        eventType: WebhookEventType.ACCOUNT_CREATED,
                        data: expect.objectContaining({
                            accountTag: 'testuser',
                        }),
                    }),
                }),
                expect.objectContaining({
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 60000,
                    },
                }),
            );
        });

        it('should not queue jobs for webhooks not subscribed to event', async () => {
            const mockWebhooks = [
                {
                    id: '1',
                    accountTag: 'testuser',
                    url: 'https://example.com/webhook1',
                    events: [WebhookEventType.PAYMENT_RECEIVED],
                    isActive: true,
                },
            ];

            mockWebhookRepository.find.mockResolvedValue(mockWebhooks);

            await service.triggerEvent(WebhookEventType.ACCOUNT_CREATED, {
                accountTag: 'testuser',
            });

            expect(webhookQueue.add).not.toHaveBeenCalled();
        });

        it('should not queue jobs for inactive webhooks', async () => {
            const mockWebhooks = [
                {
                    id: '1',
                    accountTag: 'testuser',
                    url: 'https://example.com/webhook1',
                    events: [WebhookEventType.ACCOUNT_CREATED],
                    isActive: false,
                },
            ];

            mockWebhookRepository.find.mockResolvedValue(mockWebhooks);

            await service.triggerEvent(WebhookEventType.ACCOUNT_CREATED, {
                accountTag: 'testuser',
            });

            expect(webhookQueue.add).not.toHaveBeenCalled();
        });
    });

    describe('generateSignature', () => {
        it('should generate HMAC-SHA256 signature', () => {
            const payload = { test: 'data' };
            const secret = 'my-secret';

            const signature = service.generateSignature(payload, secret);

            expect(signature).toBeTruthy();
            expect(typeof signature).toBe('string');
            expect(signature.length).toBe(64); // SHA256 hex = 64 chars
        });

        it('should generate consistent signatures for same input', () => {
            const payload = { test: 'data' };
            const secret = 'my-secret';

            const signature1 = service.generateSignature(payload, secret);
            const signature2 = service.generateSignature(payload, secret);

            expect(signature1).toBe(signature2);
        });

        it('should generate different signatures for different secrets', () => {
            const payload = { test: 'data' };

            const signature1 = service.generateSignature(payload, 'secret1');
            const signature2 = service.generateSignature(payload, 'secret2');

            expect(signature1).not.toBe(signature2);
        });
    });

    describe('verifySignature', () => {
        it('should verify valid signature', () => {
            const payload = { test: 'data' };
            const secret = 'my-secret';

            const signature = service.generateSignature(payload, secret);
            const result = service.verifySignature(payload, signature, secret);

            expect(result).toBe(true);
        });

        it('should reject invalid signature', () => {
            const payload = { test: 'data' };
            const secret = 'my-secret';

            const result = service.verifySignature(
                payload,
                'invalid-signature-invalid-signature-invalid-signature123',
                secret,
            );

            expect(result).toBe(false);
        });

        it('should reject signature with wrong secret', () => {
            const payload = { test: 'data' };

            const signature = service.generateSignature(payload, 'secret1');
            const result = service.verifySignature(payload, signature, 'secret2');

            expect(result).toBe(false);
        });
    });
});
