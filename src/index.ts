
const REDIRECT_URI =
  "https://neural-pulse-mcp.giangrossirafael.workers.dev/callback";

const YOUTUBE_SCOPE =
  "https://www.googleapis.com/auth/youtube.upload";

const SERVER_INFO = {
  name: "neural-pulse-brasil",
  version: "1.0.0"
};

function json(data, status = 200) {
  return Response.json(data, { status });
}

function result(id, data) {
  return { jsonrpc: "2.0", id, result: data };
}

function error(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function handleMcp(request) {
  if (request.method !== "POST") {
    return json({ error: "Use POST para acessar o MCP" }, 405);
  }

  let message;

  try {
    message = await request.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  const { id, method, params = {} } = message;

  if (method === "notifications/initialized") {
    return new Response(null, { status: 202 });
  }

  if (method === "initialize") {
    return json(result(id, {
      protocolVersion: params.protocolVersion || "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO
    }));
  }

  if (method === "ping") {
    return json(result(id, {}));
  }

  if (method === "tools/list") {
    return json(result(id, {
      tools: [
        {
          name: "status_neural_pulse",
          description: "Verifica o funcionamento do servidor.",
          inputSchema: {
            type: "object",
            properties: {}
          }
        },
        {
          name: "apresentar_canal",
          description: "Apresenta a identidade do canal.",
          inputSchema: {
            type: "object",
            properties: {
              idioma: {
                type: "string",
                enum: ["pt", "en"]
              }
            }
          }
        }
      ]
    }));
  }

  if (method === "tools/call") {
    const name = params.name;
    const args = params.arguments || {};

    if (name === "status_neural_pulse") {
      return json(result(id, {
        content: [{
          type: "text",
          text: "Neural Pulse Brasil está online!"
        }]
      }));
    }

    if (name === "apresentar_canal") {
      const text = args.idioma === "en"
        ? "Neural Pulse Brasil — AI that transforms the future into reality."
        : "Neural Pulse Brasil — IA que transforma o futuro em realidade.";

      return json(result(id, {
        content: [{ type: "text", text }]
      }));
    }

    return json(error(id, -32602, "Ferramenta não encontrada"));
  }

  if (id === undefined) {
    return new Response(null, { status: 202 });
  }

  return json(error(id, -32601, "Método não encontrado"));
}

async function startGoogleAuth(env) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.TOKENS) {
    return json({
      error: "Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e TOKENS."
    }, 500);
  }

  const state = crypto.randomUUID();

  await env.TOKENS.put(
    "oauth_state",
    state,
    { expirationTtl: 600 }
  );

  const authUrl = new URL(
    "https://accounts.google.com/o/oauth2/v2/auth"
  );

  authUrl.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", YOUTUBE_SCOPE);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("include_granted_scopes", "true");
  authUrl.searchParams.set("state", state);

  return Response.redirect(authUrl.toString(), 302);
}

async function googleCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return new Response(
      "Autorização Google não concluída: " + oauthError,
      { status: 400 }
    );
  }

  const savedState = await env.TOKENS.get("oauth_state");

  if (!state || !savedState || state !== savedState) {
    return new Response("Estado OAuth inválido ou expirado.", {
      status: 400
    });
  }

  await env.TOKENS.delete("oauth_state");

  if (!code) {
    return new Response("Código de autorização não recebido.", {
      status: 400
    });
  }

  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: "authorization_code"
  });

  const tokenResponse = await fetch(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    }
  );

  const tokens = await tokenResponse.json();

  if (!tokenResponse.ok) {
    return json({
      error: "Google não aceitou a troca do código.",
      details: tokens.error_description || tokens.error || "Erro OAuth"
    }, 400);
  }

  if (!tokens.refresh_token) {
    return new Response(
      "O Google não retornou refresh token. Tente autorizar novamente.",
      { status: 400 }
    );
  }

  await env.TOKENS.put(
    "google_oauth_tokens",
    JSON.stringify(tokens)
  );

  return new Response(
    "<h2>Neural Pulse Brasil conectada!</h2><p>Autorização Google concluída. Você já pode fechar esta página.</p>",
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8"
      }
    }
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "/health") {
      return json({
        name: "Neural Pulse Brasil",
        status: "online",
        mcp: "/mcp"
      });
    }

    if (url.pathname === "/auth" && request.method === "GET") {
      return startGoogleAuth(env);
    }

    if (url.pathname === "/callback" && request.method === "GET") {
      return googleCallback(request, env);
    }

    if (url.pathname === "/mcp") {
      return handleMcp(request);
    }

    return json({ error: "Rota não encontrada" }, 404);
  }
};
