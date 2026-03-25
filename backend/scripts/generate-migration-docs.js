#!/usr/bin/env node

/**
 * Migration Documentation Generator
 * Parses migration files to generate a markdown report of the schema.
 */

import fs from "fs";
import path from "path";

const migrationsDir = path.join(process.cwd(), "migrations");
const outputDir = path.join(process.cwd(), "../docs");
const outputFile = path.join(outputDir, "DATABASE_SCHEMA.md");

async function generateDocs() {
  console.log("📝 Generating Migration Documentation...\n");

  try {
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith(".js"))
      .sort();

    let doc = "# Database Schema Documentation\n\n";
    doc += "_Generated on: " + new Date().toUTCString() + "_\n\n";
    doc += "This document provides an overview of the database schema derived from Knex migrations.\n\n";

    const tables = {};

    for (const file of files) {
      const content = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      
      // Simple regex-based parsing for documentation (can be improved)
      const tableMatch = content.match(/createTable\(['"](.+?)['"]/);
      if (tableMatch) {
        const tableName = tableMatch[1];
        if (!tables[tableName]) {
          tables[tableName] = {
            name: tableName,
            columns: [],
            file: file
          };
        }

        // Extract columns (very basic extraction)
        const colLines = content.split("\n").filter(l => l.includes("table.") && !l.includes("createTable"));
        colLines.forEach(l => {
          const m = l.match(/table\.(.+?)\(['"](.+?)['"]/);
          if (m) {
            tables[tableName].columns.push({
              name: m[2],
              type: m[1]
            });
          }
        });
      }
    }

    // Build markdown tables
    Object.values(tables).forEach(table => {
      doc += `## Table: ${table.name}\n\n`;
      doc += `**Source Migration**: [${table.file}](../backend/migrations/${table.file})\n\n`;
      doc += "| Column | Type |\n";
      doc += "| --- | --- |\n";
      table.columns.forEach(col => {
        doc += `| ${col.name} | ${col.type} |\n`;
      });
      doc += "\n---\n\n";
    });

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputFile, doc);
    console.log(`✅ Documentation generated: ${outputFile}`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Failed to generate documentation:", err.message);
    process.exit(1);
  }
}

generateDocs();
