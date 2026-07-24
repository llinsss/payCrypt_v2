#!/usr/bin/env node
/**
 * Generate the Postman collection from the OpenAPI spec.
 *
 * The collection is a build artifact, not source. Committing it added ~30k
 * lines of generated JSON to every PR that touched this branch, so it is
 * gitignored and produced here instead.
 *
 * Usage:
 *   npm run docs:postman
 *
 * Output:
 *   docs/api/Tagged_API.postman_collection.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import swaggerJsdoc from "swagger-jsdoc";
import converter from "openapi-to-postmanv2";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(backendRoot, "..");
const outDir = path.join(repoRoot, "docs", "api");
const outFile = path.join(outDir, "Tagged_API.postman_collection.json");

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Tagg@d API",
      version: "1.0.0",
      description:
        "API documentation for the Tagg@d backend. Routes are available under /api " +
        "(current version alias), /api/v2 (current), and /api/v1 (deprecated).",
    },
    servers: [
      { url: "http://localhost:5002/api/v2", description: "Current version (v2)" },
      { url: "http://localhost:5002/api/v1", description: "Deprecated version (v1)" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
    },
  },
  // Resolve route globs relative to the backend root so the script works
  // regardless of the caller's cwd.
  apis: [path.join(backendRoot, "routes", "*.js")],
};

const openapiSpec = swaggerJsdoc(swaggerOptions);

const pathCount = Object.keys(openapiSpec.paths || {}).length;
if (pathCount === 0) {
  console.error("No documented paths found — is the routes glob correct?");
  process.exit(1);
}

converter.convert(
  { type: "json", data: openapiSpec },
  { folderStrategy: "Tags", requestParametersResolution: "Example" },
  (err, result) => {
    if (err) {
      console.error("Postman conversion failed:", err);
      process.exit(1);
    }
    if (!result.result) {
      console.error("Postman conversion failed:", result.reason);
      process.exit(1);
    }

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      outFile,
      JSON.stringify(result.output[0].data, null, 2) + "\n"
    );

    console.log(`Generated ${path.relative(repoRoot, outFile)}`);
    console.log(`  ${pathCount} documented paths`);
  }
);
