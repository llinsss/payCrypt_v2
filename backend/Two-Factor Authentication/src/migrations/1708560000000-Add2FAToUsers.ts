import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableIndex,
} from "typeorm";

export class Add2FAToUsers1708560000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "two_factor_secret",
        type: "varchar",
        length: "32",
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "two_factor_enabled",
        type: "boolean",
        default: false,
      }),
    );

    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "backup_codes",
        type: "text",
        isArray: true,
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "two_factor_enabled_at",
        type: "timestamp",
        isNullable: true,
      }),
    );

    await queryRunner.createIndex(
      "users",
      new TableIndex({
        name: "idx_users_2fa_enabled",
        columnNames: ["two_factor_enabled"],
        where: "two_factor_enabled = true",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex("users", "idx_users_2fa_enabled");
    await queryRunner.dropColumn("users", "two_factor_enabled_at");
    await queryRunner.dropColumn("users", "backup_codes");
    await queryRunner.dropColumn("users", "two_factor_enabled");
    await queryRunner.dropColumn("users", "two_factor_secret");
  }
}
