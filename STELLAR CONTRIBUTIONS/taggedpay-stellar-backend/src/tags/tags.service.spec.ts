import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { TagsService } from './tags.service';

describe('TagsService', () => {
  let service: TagsService;

  const mockPublicKey = 'GBZXN3XVFC3TTIYVMJ2HAW3E34Z6YIX27N2HQKH3RDXEWWBXVZVMYOMQ';
  const mockPublicKey2 = 'GCZST3XVFC3TTIYVMJ2HAW3E34Z6YIX27N2HQKH3RDXEWWBXVZVMYZZZ';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TagsService],
    }).compile();

    service = module.get<TagsService>(TagsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('registerTag', () => {
    it('should register a new tag successfully', () => {
      const result = service.registerTag('john_doe', mockPublicKey);

      expect(result).toEqual(
        expect.objectContaining({
          tag: 'john_doe',
          publicKey: mockPublicKey,
          createdAt: expect.any(Date),
          resolvedAt: 0,
        }),
      );
    });

    it('should normalize tag to lowercase', () => {
      const result = service.registerTag('JOHN_DOE', mockPublicKey);
      expect(result.tag).toBe('john_doe');
    });

    it('should remove @ prefix if provided', () => {
      const result = service.registerTag('@john_doe', mockPublicKey);
      expect(result.tag).toBe('john_doe');
    });

    it('should throw ConflictException if tag already exists', () => {
      service.registerTag('john_doe', mockPublicKey);

      expect(() => {
        service.registerTag('john_doe', mockPublicKey2);
      }).toThrow(ConflictException);
    });

    it('should throw ConflictException for duplicate tags with different casing', () => {
      service.registerTag('john_doe', mockPublicKey);

      expect(() => {
        service.registerTag('JOHN_DOE', mockPublicKey2);
      }).toThrow(ConflictException);
    });
  });

  describe('resolveTag', () => {
    beforeEach(() => {
      service.registerTag('john_doe', mockPublicKey);
    });

    it('should resolve a registered tag to public key', () => {
      const publicKey = service.resolveTag('john_doe');
      expect(publicKey).toBe(mockPublicKey);
    });

    it('should resolve tag with @ prefix', () => {
      const publicKey = service.resolveTag('@john_doe');
      expect(publicKey).toBe(mockPublicKey);
    });

    it('should resolve tag case-insensitively', () => {
      const publicKey = service.resolveTag('JOHN_DOE');
      expect(publicKey).toBe(mockPublicKey);
    });

    it('should return null for unregistered tag', () => {
      const publicKey = service.resolveTag('nonexistent');
      expect(publicKey).toBeNull();
    });

    it('should update resolvedAt timestamp on resolution', () => {
      const initialMapping = service.getTagMapping('john_doe');
      const initialResolvedAt = initialMapping?.resolvedAt || 0;

      service.resolveTag('john_doe');
      const updatedMapping = service.getTagMapping('john_doe');

      expect(updatedMapping?.resolvedAt).toBeGreaterThan(initialResolvedAt);
    });
  });

  describe('getTagMapping', () => {
    beforeEach(() => {
      service.registerTag('john_doe', mockPublicKey);
    });

    it('should return tag mapping for registered tag', () => {
      const mapping = service.getTagMapping('john_doe');
      expect(mapping).toBeDefined();
      expect(mapping?.tag).toBe('john_doe');
      expect(mapping?.publicKey).toBe(mockPublicKey);
    });

    it('should return undefined for unregistered tag', () => {
      const mapping = service.getTagMapping('nonexistent');
      expect(mapping).toBeUndefined();
    });
  });

  describe('tagExists', () => {
    beforeEach(() => {
      service.registerTag('john_doe', mockPublicKey);
    });

    it('should return true for registered tag', () => {
      expect(service.tagExists('john_doe')).toBe(true);
    });

    it('should return true with @ prefix', () => {
      expect(service.tagExists('@john_doe')).toBe(true);
    });

    it('should return false for unregistered tag', () => {
      expect(service.tagExists('nonexistent')).toBe(false);
    });
  });

  describe('getAllTags', () => {
    it('should return empty array initially', () => {
      const tags = service.getAllTags();
      expect(tags).toEqual([]);
    });

    it('should return all registered tags', () => {
      service.registerTag('john_doe', mockPublicKey);
      service.registerTag('jane_doe', mockPublicKey2);

      const tags = service.getAllTags();
      expect(tags).toHaveLength(2);
      expect(tags[0].tag).toBe('john_doe');
      expect(tags[1].tag).toBe('jane_doe');
    });
  });

  describe('unregisterTag', () => {
    beforeEach(() => {
      service.registerTag('john_doe', mockPublicKey);
    });

    it('should unregister an existing tag', () => {
      const result = service.unregisterTag('john_doe');
      expect(result).toBe(true);
      expect(service.tagExists('john_doe')).toBe(false);
    });

    it('should return false for unregistered tag', () => {
      const result = service.unregisterTag('nonexistent');
      expect(result).toBe(false);
    });

    it('should handle @ prefix', () => {
      const result = service.unregisterTag('@john_doe');
      expect(result).toBe(true);
      expect(service.tagExists('john_doe')).toBe(false);
    });
  });
});
