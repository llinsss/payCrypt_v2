import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { createClient, RedisClientType } from "redis";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: RedisClientType;

  async onModuleInit() {
    this.client = createClient({
      socket: {
        host: process.env.REDIS_HOST || "localhost",
        port: parseInt(process.env.REDIS_PORT || "6379", 10),
      },
      password: process.env.REDIS_PASSWORD || undefined,
    });

    this.client.on("error", (err) => console.error("Redis Client Error", err));
    await this.client.connect();
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  async zadd(key: string, score: number, member: string): Promise<number> {
    return await this.client.zAdd(key, { score, value: member });
  }

  async zcard(key: string): Promise<number> {
    return await this.client.zCard(key);
  }

  async zremrangebyscore(
    key: string,
    min: number,
    max: number,
  ): Promise<number> {
    return await this.client.zRemRangeByScore(key, min, max);
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    return await this.client.expire(key, seconds);
  }

  async del(key: string): Promise<number> {
    return await this.client.del(key);
  }

  getClient(): RedisClientType {
    return this.client;
  }
}
