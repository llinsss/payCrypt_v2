/**
 * Utility for asserting database schema state during migration tests
 */
const migrationValidator = (knex) => {
  return {
    /**
     * Assert that a table exists
     * @param {string} tableName
     */
    async assertTableExists(tableName) {
      const exists = await knex.schema.hasTable(tableName);
      if (!exists) {
        throw new Error(`Table "${tableName}" does not exist`);
      }
      return true;
    },

    /**
     * Assert that a table does not exist
     * @param {string} tableName
     */
    async assertTableNotExists(tableName) {
      const exists = await knex.schema.hasTable(tableName);
      if (exists) {
        throw new Error(`Table "${tableName}" should not exist`);
      }
      return true;
    },

    /**
     * Assert that a column exists in a table
     * @param {string} tableName
     * @param {string} columnName
     * @param {string} [type] - Optional type check
     */
    async assertColumnExists(tableName, columnName, type) {
      const exists = await knex.schema.hasColumn(tableName, columnName);
      if (!exists) {
        throw new Error(`Column "${columnName}" does not exist in table "${tableName}"`);
      }

      if (type) {
        const info = await knex(tableName).columnInfo(columnName);
        if (info.type !== type) {
          throw new Error(`Column "${columnName}" in table "${tableName}" has type "${info.type}", expected "${type}"`);
        }
      }
      return true;
    },

    /**
     * Assert that a column does not exist
     * @param {string} tableName
     * @param {string} columnName
     */
    async assertColumnNotExists(tableName, columnName) {
      const exists = await knex.schema.hasColumn(tableName, columnName);
      if (exists) {
        throw new Error(`Column "${columnName}" should not exist in table "${tableName}"`);
      }
      return true;
    },

    /**
     * Assert that an index exists
     * @param {string} tableName
     * @param {string} indexName
     */
    async assertIndexExists(tableName, indexName) {
      const result = await knex.raw(`
        SELECT count(*) as count
        FROM pg_indexes
        WHERE tablename = ? AND indexname = ?
      `, [tableName, indexName]);

      if (parseInt(result.rows[0].count) === 0) {
        throw new Error(`Index "${indexName}" does not exist on table "${tableName}"`);
      }
      return true;
    }
  };
};

export default migrationValidator;
