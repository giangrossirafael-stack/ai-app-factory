
interface Env {
  TOKENS: KVNamespace;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
}

const REDIRECT_URI =
  "https://neural-pulse-mcp.giangrossirafael.workers.dev/callback";

const YOUTUBE_SCOPE =
  "https://www.googleapis.com/auth/youtube.upload";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "/health") {
      return json({
        name: "Neural Pulse Brasil",
        status: "online",
        auth: "/auth",
        mcp: "/mcp",
      });
    }

    if (url.pathname === "/auth" && request.method === "GET") {
      const state = crypto.randomUUID();

      await env.TOKENS.put("oauth_state", state, {
        expirationTtl: 600,
      });

      const googleUrl = new URL(
        "https://accounts.google.com/o/oauth2/v2/auth"
      );

      googleUrl.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
      googleUrl.searchParams.set("redirect_uri", REDIRECT_URI);
      googleUrl.searchParams.set("response_type", "code");
      googleUrl.searchParams.set("scope", YOUTUBE_SCOPE);
      googleUrl.searchParams.set("access_type", "offline");
      googleUrl.searchParams.set("prompt", "consent");
      googleUrl.searchParams.set("state", state);

      return Response.redirect(googleUrl.toString(), 302);
    }

    if (url.pathname === "/callback" && request.method === "GET") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const savedState = await env.TOKENS.get("oauth_state");

      if (!state || !savedState || state !== savedState) {
        return new Response("Autorização inválida. Tente novamente.", {
          status: 400,
        });
      }

      await env.TOKENS.delete("oauth_state");

      if (!code) {
        return new Response("Código de autorização não recebido.", {
          status: 400,
        });
      }

      const tokenResponse = await fetch(
        "https://oauth2.googleapis.com/token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            code,
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            redirect_uri: REDIRECT_URI,
            grant_type: "authorization_code",
          }),
        }
      );

      const tokens = await tokenResponse.json() as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        error?: string;
      };

      if (!tokenResponse.ok || !tokens.access_token) {
        return json(
          { status: "erro", message: tokens.error || "Falha na autorização." },
          400
        );
      }

      await env.TOKENS.put(
        "google_oauth_tokens",
        JSON.stringify({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || null,
          expires_in: tokens.expires_in || null,
          saved_at: Date.now(),
        })
      );

      return new Response(
        "<h2>Neural Pulse Brasil</h2><p>Autorização do Google concluída. Você já pode fechar esta página.</p>",
        { headers: { "Content-Type": "text/html; charset=UTF-8" } }
      );
    }

    if (url.pathname === "/mcp" && request.method === "POST") {
      let body: any;

      try {
        body = await request.json();
      } catch {
        return json({ error: "JSON inválido" }, 400);
      }

      const id = body.id ?? null;

      if (body.method === "initialize") {
        return json({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2025-03-26",
            capabilities: { tools: {} },
            serverInfo: {
              name: "neural-pulse-brasil",
              version: "1.0.0",
            },
          },
        });
      }

      if (body.method === "notifications/initialized") {
        return new Response(null, { status: 202 });
      }

      if (body.method === "ping") {
        return json({ jsonrpc: "2.0", id, result: {} });
      }

      if (body.method === "tools/list") {
        return json({
          jsonrpc: "2.0",
          id,
          result: {
            tools: [
              {
                name: "status_neural_pulse",
                description: "Verifica o funcionamento do Neural Pulse Brasil.",
                inputSchema: {
                  type: "object",
                  properties: {},
                },
              },
              {
                name: "status_youtube",
                description: "Verifica se existe uma autorização do YouTube salva.",
                inputSchema: {
                  type: "object",
                  properties: {},
                },
              },
            ],
          },
        });
      }

      if (body.method === "tools/call") {
        const name = body.params?.name;

        let message = "";

        if (name === "status_neural_pulse") {
          message = "Neural Pulse Brasil está online!";
        } else if (name === "status_youtube") {
          const saved = await env.TOKENS.get("google_oauth_tokens");
          message = saved
            ? "Autorização do YouTube encontrada."
            : "YouTube ainda não foi autorizado.";
        } else {
          return json({
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: "Ferramenta não encontrada." },
          });
        }

        return json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: message }],
          },
        });
      }

      return json({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: "Método não encontrado." },
      });
    }

    return json({ error: "Rota não encontrada" }, 404);
  },
};
