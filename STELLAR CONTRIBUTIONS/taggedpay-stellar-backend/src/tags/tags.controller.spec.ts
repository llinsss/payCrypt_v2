import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';

describe('TagsController', () => {
  let controller: TagsController;
  let service: TagsService;

  const mockPublicKey = 'GBZXN3XVFC3TTIYVMJ2HAW3E34Z6YIX27N2HQKH3RDXEWWBXVZVMYOMQ';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TagsController],
      providers: [TagsService],
    }).compile();

    controller = module.get<TagsController>(TagsController);
    service = module.get<TagsService>(TagsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('registerTag', () => {
    it('should register a tag successfully', () => {
      const result = controller.registerTag({
        tag: 'john_doe',
        publicKey: mockPublicKey,
      });

      expect(result.success).toBe(true);
      expect(result.data.tag).toBe('@john_doe');
      expect(result.data.publicKey).toBe(mockPublicKey);
    });

    it('should throw ConflictException for duplicate tag', () => {
      controller.registerTag({
        tag: 'john_doe',
        publicKey: mockPublicKey,
      });

      expect(() => {
        controller.registerTag({
          tag: 'john_doe',
          publicKey: 'GCZST3XVFC3TTIYVMJ2HAW3E34Z6YIX27N2HQKH3RDXEWWBXVZVMYZZZ',
        });
      }).toThrow(ConflictException);
    });
  });

  describe('resolveTag', () => {
    beforeEach(() => {
      controller.registerTag({
        tag: 'john_doe',
        publicKey: mockPublicKey,
      });
    });

    it('should resolve a registered tag', () => {
      const result = controller.resolveTag('john_doe');

      expect(result.success).toBe(true);
      expect(result.data.publicKey).toBe(mockPublicKey);
    });

    it('should throw NotFoundException for unregistered tag', () => {
      expect(() => {
        controller.resolveTag('nonexistent');
      }).toThrow(NotFoundException);
    });
  });

  describe('unregisterTag', () => {
    beforeEach(() => {
      controller.registerTag({
        tag: 'john_doe',
        publicKey: mockPublicKey,
      });
    });

    it('should unregister a tag successfully', () => {
      const result = controller.unregisterTag('john_doe');

      expect(result.success).toBe(true);
      expect(result.message).toContain('unregistered');
    });

    it('should throw NotFoundException for unregistered tag', () => {
      expect(() => {
        controller.unregisterTag('nonexistent');
      }).toThrow(NotFoundException);
    });
  });
});
