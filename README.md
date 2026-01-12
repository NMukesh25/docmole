# mintlify-mcp

> MCP server to chat with any Mintlify-powered documentation via Claude Code

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What is this?

An MCP (Model Context Protocol) server that lets you query any documentation site powered by [Mintlify](https://mintlify.com) directly from Claude Code.

**Example use cases:**
- Ask questions about Agno, LangChain, or any Mintlify docs
- Get code examples and explanations without leaving your terminal
- Multi-turn conversations with documentation context

## Quick Start

Add to your Claude Code MCP settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "mintlify": {
      "command": "bunx",
      "args": ["mintlify-mcp"]
    }
  }
}
```

**That's it!** Restart Claude Code and you're ready to query any Mintlify docs.

> **Requires:** [Bun](https://bun.sh) installed (`curl -fsSL https://bun.sh/install | bash`)

## Usage

Once configured, you can use commands like:

```
Ask the Agno documentation: how do I create a workflow?
```

```
Query mintlify docs for "agno-v2": what are tools?
```

## Supported Documentation Sites

| Documentation | Project ID | Status |
|--------------|------------|--------|
| [Agno](https://docs.agno.com) | `agno-v2` | ✅ Tested |
| [Resend](https://resend.com/docs) | `resend` | ✅ Tested |
| [Upstash](https://upstash.com/docs) | `upstash` | ✅ Tested |
| [Mintlify](https://mintlify.com/docs) | `mintlify` | ✅ Tested |
| [Vercel](https://vercel.com/docs) | `vercel` | ✅ Tested |
| [Plain](https://plain.com/docs) | `plain` | ✅ Tested |

> **Want to add more?** The project ID is usually the subdomain or company name. Open a PR or issue!

## How It Works

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────────┐
│ Claude Code │────▶│ MCP Server  │────▶│ Mintlify Assistant  │
│             │◀────│ (this repo) │◀────│ API (RAG Pipeline)  │
└─────────────┘     └─────────────┘     └─────────────────────┘
```

1. You ask a question in Claude Code
2. MCP server forwards to Mintlify's AI Assistant API
3. Mintlify searches documentation using RAG
4. Response streams back to Claude Code

## API Documentation

See [CLAUDE.md](./CLAUDE.md) for complete reverse-engineered API documentation including:
- Endpoint details
- Request/response schemas
- cURL examples
- Multi-turn conversation support

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Submit a PR

### Adding New Documentation Sites

To add support for a new Mintlify-powered site:

1. Visit the documentation site
2. Open DevTools > Network tab
3. Use the search/AI assistant feature
4. Find the request to `leaves.mintlify.com/api/assistant/{project-id}/message`
5. Add the project ID to the supported sites list

## License

MIT - See [LICENSE](./LICENSE)

## Acknowledgments

- [Mintlify](https://mintlify.com) for building amazing documentation tooling
- [Anthropic](https://anthropic.com) for Claude and the MCP protocol
