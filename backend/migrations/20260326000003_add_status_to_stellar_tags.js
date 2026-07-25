/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
    return knex.schema.table('stellar_tags', function (table) {
        table.enum('status', ['pending', 'active', 'failed']).notNullable().defaultTo('pending');
        table.timestamp('confirmed_at').nullable();
        table.string('failure_reason').nullable();
    });
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
    return knex.schema.table('stellar_tags', function (table) {
        table.dropColumn('failure_reason');
        table.dropColumn('confirmed_at');
        table.dropColumn('status');
    });
}
