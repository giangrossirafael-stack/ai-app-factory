
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

function createServer() {
  const server = new McpServer({
    name: "Neural Pulse Brasil",
    version: "1.0.0"
  });

  server.registerTool(
    "status_neural_pulse",
    {
      description:
        "Verifica o funcionamento do servidor Neural Pulse Brasil.",
      inputSchema: {}
    },
    async () => ({
      content: [
        {
          type: "text",
          text: "Neural Pulse Brasil está online. Servidor MCP funcionando."
        }
      ]
    })
  );

  server.registerTool(
    "apresentar_canal",
    {
      description:
        "Apresenta a identidade e o objetivo do canal Neural Pulse Brasil.",
      inputSchema: {
        idioma: z.enum(["pt", "en"]).default("pt")
      }
    },
    async ({ idioma }) => ({
      content: [
        {
          type: "text",
          text:
            idioma === "en"
              ? "Neural Pulse Brasil — AI that transforms the future into reality."
              : "Neural Pulse Brasil — IA que transforma o futuro em realidade."
        }
      ]
    })
  );

  return server;
}

const mcpHandler = createMcpHandler(createServer);

export default {
  async fetch(request: Request, env: unknown, ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "/health") {
      return Response.json({
        name: "Neural Pulse Brasil",
        status: "online",
        mcp: "/mcp"
      });
    }

    return mcpHandler(request, env, ctx);
  }
};
