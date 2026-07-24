import { Injectable, ConflictException, NotFoundException, Logger } from '@nestjs/common';

interface TagMapping {
  tag: string;
  publicKey: string;
  createdAt: Date;
  resolvedAt: number;
}

@Injectable()
export class TagsService {
  private readonly logger = new Logger(TagsService.name);
  private readonly tagMap: Map<string, TagMapping> = new Map();

  /**
   * Registers a new @tag to Stellar address mapping
   * @param tag The @tag identifier (without @ prefix)
   * @param publicKey The Stellar public key
   * @returns The registered tag mapping
   */
  registerTag(tag: string, publicKey: string): TagMapping {
    const normalizedTag = tag.toLowerCase().replace(/^@/, '');

    if (this.tagMap.has(normalizedTag)) {
      throw new ConflictException(`Tag @${normalizedTag} is already registered`);
    }

    const mapping: TagMapping = {
      tag: normalizedTag,
      publicKey,
      createdAt: new Date(),
      resolvedAt: 0,
    };

    this.tagMap.set(normalizedTag, mapping);
    this.logger.log(`Registered tag @${normalizedTag} to ${publicKey}`);

    return mapping;
  }

  /**
   * Resolves a @tag to its Stellar public address
   * @param tag The @tag to resolve
   * @returns The public key, or null if not found
   */
  resolveTag(tag: string): string | null {
    const normalizedTag = tag.toLowerCase().replace(/^@/, '');
    const mapping = this.tagMap.get(normalizedTag);

    if (!mapping) {
      this.logger.warn(`Tag @${normalizedTag} not found`);
      return null;
    }

    mapping.resolvedAt = Date.now();
    return mapping.publicKey;
  }

  /**
   * Gets a tag mapping by tag name
   * @param tag The @tag to look up
   * @returns The tag mapping or undefined
   */
  getTagMapping(tag: string): TagMapping | undefined {
    const normalizedTag = tag.toLowerCase().replace(/^@/, '');
    return this.tagMap.get(normalizedTag);
  }

  /**
   * Checks if a tag is registered
   * @param tag The @tag to check
   * @returns True if tag exists
   */
  tagExists(tag: string): boolean {
    const normalizedTag = tag.toLowerCase().replace(/^@/, '');
    return this.tagMap.has(normalizedTag);
  }

  /**
   * Gets all registered tags (for admin purposes)
   * @returns Array of all tag mappings
   */
  getAllTags(): TagMapping[] {
    return Array.from(this.tagMap.values());
  }

  /**
   * Unregisters a tag
   * @param tag The @tag to unregister
   * @returns True if successful
   */
  unregisterTag(tag: string): boolean {
    const normalizedTag = tag.toLowerCase().replace(/^@/, '');
    return this.tagMap.delete(normalizedTag);
  }
}
