import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { createDefaultProjectConfig, DEFAULT_AGNO_CONFIG } from "../src/config/schema";
import { createAgnoBackend } from "../src/backends/agno";
import {
  loadProjectConfig,
  saveProjectConfig,
  projectExists,
  listProjects,
  deleteProject,
  loadGlobalConfig,
  updateProjectConfig,
} from "../src/config/loader";

// =============================================================================
// TEST SETUP
// =============================================================================

const TEST_DATA_DIR = join(import.meta.dir, ".test-config-data");

beforeAll(async () => {
  process.env.MINTLIFY_DATA_DIR = TEST_DATA_DIR;
  await mkdir(TEST_DATA_DIR, { recursive: true });
});

afterAll(async () => {
  await rm(TEST_DATA_DIR, { recursive: true, force: true });
});

// =============================================================================
// PROJECT CONFIG FACTORY
// =============================================================================

describe("createDefaultProjectConfig", () => {
  test("creates agno config with defaults", () => {
    const config = createDefaultProjectConfig("test-id", "https://docs.example.com");

    expect(config.id).toBe("test-id");
    expect(config.name).toBe("test-id");
    expect(config.backend).toBe("agno");
    expect(config.agno?.model).toBe(DEFAULT_AGNO_CONFIG.model);
    expect(config.seeding?.status).toBe("pending");
  });

  test("custom host/port override defaults", () => {
    const config = createDefaultProjectConfig("test-id", "https://docs.example.com", {
      agnoHost: "192.168.1.100",
      agnoPort: 8080,
    });

    expect(config.agno?.host).toBe("192.168.1.100");
    expect(config.agno?.port).toBe(8080);
  });

  test("mintlify backend extracts domain from URL", () => {
    const config = createDefaultProjectConfig("test-id", "https://docs.mysite.com/api", {
      backend: "mintlify",
    });

    expect(config.backend).toBe("mintlify");
    expect(config.mintlify?.domain).toBe("docs.mysite.com");
    expect(config.mintlify?.project_id).toBe("test-id");
  });
});

// =============================================================================
// PROJECT LOADER (real I/O)
// =============================================================================

describe("Project Loader", () => {
  const testProjectId = "test-loader-project";

  test("save and load roundtrip preserves data", async () => {
    const config = createDefaultProjectConfig(testProjectId, "https://example.com", {
      name: "Test Project",
      agnoPort: 9999,
    });
    await saveProjectConfig(config);

    const loaded = await loadProjectConfig(testProjectId);

    expect(loaded?.id).toBe(testProjectId);
    expect(loaded?.name).toBe("Test Project");
    expect(loaded?.agno?.port).toBe(9999);
  });

  test("projectExists detects saved projects", async () => {
    expect(await projectExists(testProjectId)).toBe(true);
    expect(await projectExists("nonexistent-xyz")).toBe(false);
  });

  test("listProjects includes saved project", async () => {
    const projects = await listProjects();
    expect(projects).toContain(testProjectId);
  });

  test("updateProjectConfig persists changes", async () => {
    await updateProjectConfig(testProjectId, { name: "Updated Name" });

    const loaded = await loadProjectConfig(testProjectId);
    expect(loaded?.name).toBe("Updated Name");
  });

  test("deleteProject removes project", async () => {
    const deleteTestId = "test-delete-project";
    await saveProjectConfig(createDefaultProjectConfig(deleteTestId, "https://example.com"));
    expect(await projectExists(deleteTestId)).toBe(true);

    await deleteProject(deleteTestId);
    expect(await projectExists(deleteTestId)).toBe(false);
  });

  test("loadGlobalConfig returns defaults when no file", async () => {
    const config = await loadGlobalConfig();
    expect(config.default_backend).toBe("agno");
  });
});

// =============================================================================
// AGNO BACKEND FACTORY
// =============================================================================

describe("createAgnoBackend", () => {
  test("agent endpoint uses projectId-assistant naming convention", () => {
    const backend = createAgnoBackend("my-docs", 7777, "localhost");

    // Business logic: agent name = ${projectId}-assistant
    expect(backend.getAgentEndpoint()).toBe(
      "http://localhost:7777/agents/my-docs-assistant/runs"
    );
  });
});
