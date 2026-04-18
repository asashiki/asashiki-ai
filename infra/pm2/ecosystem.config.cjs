const path = require("node:path");

const rootDir = path.resolve(__dirname, "../..");

module.exports = {
  apps: [
    {
      name: "asashiki-core-api",
      cwd: path.join(rootDir, "apps/core-api"),
      script: "dist/server.js",
      interpreter: "node",
      env_production: {
        NODE_ENV: "production",
        CORE_API_HOST: "0.0.0.0",
        CORE_API_PORT: "4100",
        CORE_API_DB_PATH: "./data/core-api.sqlite"
      }
    },
    {
      name: "asashiki-mcp-gateway",
      cwd: path.join(rootDir, "apps/mcp-gateway"),
      script: "dist/server.js",
      interpreter: "node",
      env_production: {
        NODE_ENV: "production",
        MCP_GATEWAY_HOST: "0.0.0.0",
        MCP_GATEWAY_PORT: "4200",
        MCP_CORE_API_BASE_URL: "http://127.0.0.1:4100"
      }
    }
  ]
};
