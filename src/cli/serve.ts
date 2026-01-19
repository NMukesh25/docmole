import {
  createAgnoBackend,
  DEFAULT_HOST,
  DEFAULT_PORT,
  isAgentRunning,
  isServerRunning,
} from "../backends/agno";
import { createMintlifyBackend } from "../backends/mintlify";
import type { Backend } from "../backends/types";
import { loadProjectConfig } from "../config/loader";
import { paths } from "../config/paths";
import { startMcpServer } from "../server";
import { ensureOpenAIApiKey } from "./prompt";
import { startServer, stopServer, waitForServer } from "./start";

// =============================================================================
// SERVE COMMAND - Start MCP server for Claude Code
// =============================================================================

/** Server startup timeout in milliseconds */
const SERVER_STARTUP_TIMEOUT_MS = 15_000;

export interface ServeOptions {
  project: string;
}

export async function serveCommand(options: ServeOptions): Promise<void> {
  const { project } = options;

  // Load project config
  const config = await loadProjectConfig(project);
  if (!config) {
    console.error(`Project "${project}" not found.`);
    console.error("Run 'list' command to see available projects.");
    process.exit(1);
  }

  let backend: Backend;

  if (config.backend === "mintlify") {
    // Use Mintlify API backend
    if (!config.mintlify) {
      console.error("Mintlify configuration missing in project config.");
      process.exit(1);
    }

    backend = createMintlifyBackend(
      config.mintlify.project_id,
      config.mintlify.domain,
    );
  } else if (config.backend === "embedded") {
    // Use embedded TypeScript RAG backend
    backend = await createEmbeddedBackendFromConfig(config);
  } else {
    // Use Agno (Python) RAG backend
    const host = config.agno?.host || DEFAULT_HOST;
    const port = config.agno?.port || DEFAULT_PORT;

    // Check if the correct agent is running
    const agentExists = await isAgentRunning(project, port, host);

    if (!agentExists) {
      // Server might be running with different project - need to restart
      if (await isServerRunning(port, host)) {
        console.error(`Stopping existing server on port ${port}...`);
        await stopServer(port);
        await Bun.sleep(1000); // Wait for graceful shutdown
      }

      console.error(`Starting RAG server for "${project}" on port ${port}...`);

      const started = await startServer(project, port, false);
      if (!started) {
        console.error("Failed to start RAG server.");
        process.exit(1);
      }

      // Wait for server and agent to be ready
      const ready = await waitForServer(port, SERVER_STARTUP_TIMEOUT_MS, host);
      if (!ready) {
        console.error("RAG server did not become ready in time.");
        process.exit(1);
      }

      console.error("RAG server started.");
    }

    backend = createAgnoBackend(project, port, host);
  }

  // Start MCP server
  console.error(`Starting MCP server for "${config.name}"...`);
  await startMcpServer(backend, config.name);
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Create embedded backend from project config
 */
async function createEmbeddedBackendFromConfig(
  config: Awaited<ReturnType<typeof loadProjectConfig>>,
): Promise<Backend> {
  if (!config) {
    throw new Error("Config is required");
  }

  // Validate environment for cloud mode (prompt if interactive)
  if (!config.embedded?.local) {
    const hasApiKey = await ensureOpenAIApiKey();
    if (!hasApiKey) {
      console.error(
        "Tip: Reconfigure the project with --local flag for Ollama.",
      );
      process.exit(1);
    }
  }

  // Dynamic import to avoid loading embedded module if not needed
  const { createEmbeddedBackend } = await import("../backends/embedded");

  console.error(
    `Loading embedded backend (${config.embedded?.local ? "local" : "cloud"} mode)...`,
  );

  const backend = await createEmbeddedBackend(config.id, {
    projectPath: paths.project(config.id),
    local: config.embedded?.local,
    llmProvider: config.embedded?.llm_provider,
    llmModel: config.embedded?.llm_model,
    embeddingProvider: config.embedded?.embedding_provider,
    embeddingModel: config.embedded?.embedding_model,
    ollamaBaseUrl: config.embedded?.ollama_base_url,
  });

  // Check if knowledge base has documents
  const isAvailable = await backend.isAvailable();
  if (!isAvailable) {
    console.error(
      "Warning: Knowledge base is empty or unavailable. Run setup again.",
    );
  }

  return backend;
}
