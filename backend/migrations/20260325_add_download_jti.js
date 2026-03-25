/**
 * Migration: add download_jti to export_exports (Issue #227)
 *
 * A JTI (JWT ID) is stored when the download link is emailed to the user.
 * serveDownload checks this value and nullifies it after one successful use,
 * making each download link single-use.
 *
 * Note: existing rows will have download_jti = null.  Any download tokens
 * issued before this migration lack a jti claim and will be rejected with 400.
 */

export async function up(knex) {
  await knex.schema.table("export_exports", (t) => {
    t.uuid("download_jti").nullable().defaultTo(null);
  });
}

export async function down(knex) {
  await knex.schema.table("export_exports", (t) => {
    t.dropColumn("download_jti");
  });
}
