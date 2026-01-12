#!/usr/bin/env bun

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Known Mintlify documentation sites
const KNOWN_DOCS: Record<string, { name: string; domain: string }> = {
  "agno-v2": { name: "Agno", domain: "docs.agno.com" },
};

// Mintlify API base URL
const MINTLIFY_API_BASE = "https://leaves.mintlify.com/api/assistant";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  parts: Array<{ type: string; text?: string }>;
}

interface ConversationState {
  messages: Message[];
}

// Store conversation state per project
const conversations: Map<string, ConversationState> = new Map();

/**
 * Send a message to Mintlify AI Assistant
 */
async function askMintlify(
  projectId: string,
  question: string,
  conversationHistory: Message[] = []
): Promise<string> {
  const domain = KNOWN_DOCS[projectId]?.domain || "docs.example.com";
  const timestamp = new Date().toISOString();

  const newMessage: Message = {
    id: String(conversationHistory.length + 1),
    role: "user",
    content: question,
    createdAt: timestamp,
    parts: [{ type: "text", text: question }],
  };

  const messages = [...conversationHistory, newMessage];

  const response = await fetch(`${MINTLIFY_API_BASE}/${projectId}/message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: `https://${domain}`,
      Referer: `https://${domain}/`,
    },
    body: JSON.stringify({
      id: projectId,
      fp: projectId,  // Fingerprint - required, same as project ID
      messages,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Mintlify API error: ${response.status} ${response.statusText}`
    );
  }

  // Handle streaming response
  const text = await response.text();

  // Parse the streamed response to extract the assistant's message
  // The response format may vary, this is a basic extraction
  return parseStreamedResponse(text);
}

/**
 * Parse the SSE streamed response from Mintlify
 *
 * SSE Format:
 * - f: Message metadata (messageId)
 * - 9: Tool calls (search operations) - SKIP (bloats context)
 * - a: Tool results with docs - SKIP (bloats context)
 * - 0: Text chunks (the actual response) - KEEP
 * - e: Finish metadata - SKIP
 * - d: Done signal - SKIP
 *
 * We ONLY extract "0:" chunks to minimize context window usage
 */
function parseStreamedResponse(rawResponse: string): string {
  const lines = rawResponse.split("\n");
  const textChunks: string[] = [];

  for (const line of lines) {
    // Only process text content chunks (prefix "0:")
    // These contain the actual assistant response
    if (line.startsWith("0:")) {
      try {
        // Remove prefix and parse the JSON string
        const jsonStr = line.slice(2);
        const text = JSON.parse(jsonStr);
        if (typeof text === "string") {
          textChunks.push(text);
        }
      } catch {
        // If parsing fails, try to extract raw text
        const text = line.slice(2).replace(/^"|"$/g, "");
        if (text) textChunks.push(text);
      }
    }
  }

  const content = textChunks.join("");

  // If no text chunks found, return a minimal message
  if (!content.trim()) {
    return "No response generated. Please try rephrasing your question.";
  }

  return content.trim();
}

// Create MCP server
const server = new Server(
  {
    name: "mintlify-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "ask_docs",
        description:
          "Ask a question to a Mintlify-powered documentation site. The AI assistant will search the documentation and provide a relevant answer.",
        inputSchema: {
          type: "object" as const,
          properties: {
            project_id: {
              type: "string",
              description:
                'The Mintlify project ID (e.g., "agno-v2" for Agno docs)',
            },
            question: {
              type: "string",
              description: "The question to ask the documentation",
            },
            continue_conversation: {
              type: "boolean",
              description:
                "Whether to continue the previous conversation (default: false)",
              default: false,
            },
          },
          required: ["project_id", "question"],
        },
      },
      {
        name: "list_docs",
        description:
          "List all known Mintlify documentation sites that can be queried",
        inputSchema: {
          type: "object" as const,
          properties: {},
        },
      },
      {
        name: "clear_conversation",
        description: "Clear the conversation history for a specific project",
        inputSchema: {
          type: "object" as const,
          properties: {
            project_id: {
              type: "string",
              description: "The Mintlify project ID to clear history for",
            },
          },
          required: ["project_id"],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "ask_docs": {
      const { project_id, question, continue_conversation } = args as {
        project_id: string;
        question: string;
        continue_conversation?: boolean;
      };

      // Get or create conversation state
      let state = conversations.get(project_id);
      if (!state || !continue_conversation) {
        state = { messages: [] };
        conversations.set(project_id, state);
      }

      try {
        const answer = await askMintlify(
          project_id,
          question,
          state.messages
        );

        // Update conversation history
        const timestamp = new Date().toISOString();
        state.messages.push({
          id: String(state.messages.length + 1),
          role: "user",
          content: question,
          createdAt: timestamp,
          parts: [{ type: "text", text: question }],
        });
        state.messages.push({
          id: String(state.messages.length + 1),
          role: "assistant",
          content: answer,
          createdAt: new Date().toISOString(),
          parts: [{ type: "text", text: answer }],
        });

        return {
          content: [
            {
              type: "text",
              text: answer,
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        return {
          content: [
            {
              type: "text",
              text: `Error querying documentation: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }

    case "list_docs": {
      const docsList = Object.entries(KNOWN_DOCS)
        .map(
          ([id, info]) =>
            `- **${info.name}** (project_id: \`${id}\`)\n  URL: https://${info.domain}`
        )
        .join("\n\n");

      return {
        content: [
          {
            type: "text",
            text: `# Available Documentation Sites\n\n${docsList}\n\n> To add more sites, check the project README for instructions.`,
          },
        ],
      };
    }

    case "clear_conversation": {
      const { project_id } = args as { project_id: string };
      conversations.delete(project_id);

      return {
        content: [
          {
            type: "text",
            text: `Conversation history cleared for project: ${project_id}`,
          },
        ],
      };
    }

    default:
      return {
        content: [
          {
            type: "text",
            text: `Unknown tool: ${name}`,
          },
        ],
        isError: true,
      };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Mintlify MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
