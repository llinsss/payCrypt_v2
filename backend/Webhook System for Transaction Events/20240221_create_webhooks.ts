import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWebhooks20240221 implements MigrationInterface {
  name = 'CreateWebhooks20240221';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "webhooks" (
        "id"         SERIAL PRIMARY KEY,
        "user_id"    INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "url"        VARCHAR(500) NOT NULL,
        "secret"     VARCHAR(64) NOT NULL,
        "events"     TEXT[] NOT NULL DEFAULT '{}',
        "active"     BOOLEAN DEFAULT true,
        "created_at" TIMESTAMP DEFAULT NOW(),
        "updated_at" TIMESTAMP DEFAULT NOW(),
        CONSTRAINT "valid_url"    CHECK (url ~* '^https?://'),
        CONSTRAINT "valid_events" CHECK (
          events <@ ARRAY[
            'transaction.created',
            'transaction.completed',
            'transaction.failed'
          ]::TEXT[]
        )
      );

      CREATE INDEX "idx_webhooks_user_id" ON "webhooks"("user_id");
      CREATE INDEX "idx_webhooks_active"  ON "webhooks"("active") WHERE active = true;

      CREATE TABLE "webhook_deliveries" (
        "id"              SERIAL PRIMARY KEY,
        "webhook_id"      INTEGER NOT NULL REFERENCES "webhooks"("id") ON DELETE CASCADE,
        "event_type"      VARCHAR(50) NOT NULL,
        "payload"         JSONB NOT NULL,
        "status"          VARCHAR(20) NOT NULL DEFAULT 'pending',
        "response_code"   INTEGER,
        "response_body"   TEXT,
        "attempts"        INTEGER DEFAULT 0,
        "last_attempt_at" TIMESTAMP,
        "next_retry_at"   TIMESTAMP,
        "created_at"      TIMESTAMP DEFAULT NOW(),
        CONSTRAINT "valid_status" CHECK (
          status IN ('pending', 'success', 'failed', 'retrying')
        )
      );

      CREATE INDEX "idx_webhook_deliveries_webhook_id" ON "webhook_deliveries"("webhook_id");
      CREATE INDEX "idx_webhook_deliveries_status"     ON "webhook_deliveries"("status");
      CREATE INDEX "idx_webhook_deliveries_next_retry" ON "webhook_deliveries"("next_retry_at")
        WHERE status = 'retrying';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "webhook_deliveries";
      DROP TABLE IF EXISTS "webhooks";
    `);
  }
}
