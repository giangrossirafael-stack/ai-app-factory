
interface Env {
  TOKENS: KVNamespace;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  STUDIO_PASSWORD: string;
}

const REDIRECT_URI =
  "https://neural-pulse-mcp.giangrossirafael.workers.dev/callback";

const YOUTUBE_SCOPE =
  "https://www.googleapis.com/auth/youtube.upload";

const TOKEN_KEY = "google_oauth_tokens";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function getAccessToken(env: Env): Promise<string> {
  const saved = await env.TOKENS.get(TOKEN_KEY);

  if (!saved) throw new Error("YouTube não autorizado.");

  const tokens = JSON.parse(saved);

  if (
    tokens.access_token &&
    tokens.saved_at &&
    Date.now() < tokens.saved_at + tokens.expires_in * 1000 - 60000
  ) {
    return tokens.access_token;
  }

  if (!tokens.refresh_token) {
    throw new Error("Refresh token ausente. Autorize novamente o Google.");
  }

  const response = await fetch(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: tokens.refresh_token,
        grant_type: "refresh_token",
      }),
    }
  );

  const refreshed: any = await response.json();

  if (!response.ok || !refreshed.access_token) {
    throw new Error("Não foi possível renovar o token do Google.");
  }

  const updated = {
    ...tokens,
    access_token: refreshed.access_token,
    expires_in: refreshed.expires_in || 3600,
    saved_at: Date.now(),
  };

  await env.TOKENS.put(TOKEN_KEY, JSON.stringify(updated));

  return refreshed.access_token;
}

function studioHTML() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Neural Pulse Brasil</title>
<style>
body{background:#071426;color:white;font-family:Arial;padding:22px;max-width:520px;margin:auto}
h1{color:#45d9ff}
p{color:#b9c9da;line-height:1.5}
input,textarea,select,button{width:100%;box-sizing:border-box;padding:14px;margin:9px 0;border-radius:9px;border:1px solid #31506e;background:#10243b;color:white;font-size:15px}
button{background:#087ee5;border:0;font-weight:bold;cursor:pointer}
button:disabled{opacity:.5}
small{color:#9bb0c6}
#result{white-space:pre-wrap;overflow-wrap:anywhere}
</style>
</head>
<body>
<h1>NEURAL PULSE BRASIL</h1>
<p>Central de aprovação e publicação de vídeos no YouTube.</p>
<form id="uploadForm">
<label>Senha do painel</label>
<input name="password" type="password" required placeholder="Sua senha de acesso">
<label>Vídeo MP4</label>
<input name="video" type="file" accept="video/mp4" required>
<label>Título</label>
<input name="title" maxlength="100" required placeholder="Título do Short">
<label>Descrição</label>
<textarea name="description" rows="4" placeholder="Descrição do vídeo"></textarea>
<label>Hashtags</label>
<input name="tags" placeholder="inteligenciaartificial, tecnologia, IA">
<label>Visibilidade</label>
<select name="privacy">
<option value="private">Privado — revisão</option>
<option value="unlisted">Não listado</option>
<option value="public">Público — publicar agora</option>
</select>
<p><small>Ao clicar no botão, você aprova o envio do vídeo e a visibilidade escolhida.</small></p>
<button id="sendButton" type="submit">APROVAR E ENVIAR AO YOUTUBE</button>
</form>
<p id="result"></p>
<script>
const form=document.getElementById("uploadForm");
const result=document.getElementById("result");
const button=document.getElementById("sendButton");
form.addEventListener("submit",async(e)=>{
 e.preventDefault();
 if(!confirm("Você aprova o envio deste vídeo ao YouTube?"))return;
 button.disabled=true;
 result.textContent="Enviando vídeo. Aguarde...";
 try{
  const response=await fetch("/api/upload",{method:"POST",body:new FormData(form)});
  const data=await response.json();
  result.textContent=JSON.stringify(data,null,2);
 }catch(error){
  result.textContent="Erro no envio. Tente novamente.";
 }finally{
  button.disabled=false;
 }
});
</script>
</body>
</html>`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "/health") {
      return json({
        name: "Neural Pulse Brasil",
        status: "online",
        studio: "/studio",
        auth: "/auth",
      });
    }

    if (url.pathname === "/studio" && request.method === "GET") {
      return new Response(studioHTML(), {
        headers: { "Content-Type": "text/html; charset=UTF-8" },
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
        return new Response("Autorização inválida.", { status: 400 });
      }

      await env.TOKENS.delete("oauth_state");

      if (!code) {
        return new Response("Código de autorização ausente.", {
          status: 400,
        });
      }

      const response = await fetch(
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

      const tokens: any = await response.json();

      if (!response.ok || !tokens.access_token) {
        return json({
          error: "Falha na autorização",
          details: tokens.error || "Erro desconhecido",
        }, 400);
      }

      const previous = await env.TOKENS.get(TOKEN_KEY);
      const oldTokens = previous ? JSON.parse(previous) : {};

      await env.TOKENS.put(
        TOKEN_KEY,
        JSON.stringify({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || oldTokens.refresh_token,
          expires_in: tokens.expires_in || 3600,
          saved_at: Date.now(),
        })
      );

      return Response.redirect(
        url.origin + "/studio",
        302
      );
    }

    if (url.pathname === "/api/upload" && request.method === "POST") {
      try {
        const form = await request.formData();

        const password = String(form.get("password") || "");

        if (
          !env.STUDIO_PASSWORD ||
          password !== env.STUDIO_PASSWORD
        ) {
          return json({ error: "Senha incorreta." }, 401);
        }

        const file = form.get("video");
        const title = String(form.get("title") || "").trim();
        const description = String(form.get("description") || "");
        const tagsText = String(form.get("tags") || "");
        const privacy = String(form.get("privacy") || "private");

        if (!(file instanceof File)) {
          return json({ error: "Selecione um vídeo MP4." }, 400);
        }

        if (
          file.type !== "video/mp4" ||
          !file.name.toLowerCase().endsWith(".mp4")
        ) {
          return json({ error: "O arquivo precisa ser MP4." }, 400);
        }

        if (file.size > 90 * 1024 * 1024) {
          return json({
            error: "Arquivo acima de 90 MB. Reduza o tamanho do vídeo.",
          }, 413);
        }

        if (!title || title.length > 100) {
          return json({ error: "Título obrigatório, até 100 caracteres." }, 400);
        }

        if (!["private", "unlisted", "public"].includes(privacy)) {
          return json({ error: "Visibilidade inválida." }, 400);
        }

        const tags = tagsText
          .split(",")
          .map((tag) => tag.trim().replace(/^#/, ""))
          .filter(Boolean)
          .slice(0, 30);

        const accessToken = await getAccessToken(env);

        const metadata = {
          snippet: {
            title,
            description,
            tags,
            categoryId: "28",
          },
          status: {
            privacyStatus: privacy,
            selfDeclaredMadeForKids: false,
          },
        };

        const start = await fetch(
          "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json; charset=UTF-8",
              "X-Upload-Content-Type": "video/mp4",
              "X-Upload-Content-Length": String(file.size),
            },
            body: JSON.stringify(metadata),
          }
        );

        const uploadUrl = start.headers.get("Location");

        if (!start.ok || !uploadUrl) {
          const error = await start.text();
          return json({
            error: "Não foi possível iniciar o upload.",
            details: error,
          }, 502);
        }

        const uploaded = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": "video/mp4",
          },
          body: file,
        });

        const result: any = await uploaded.json().catch(() => ({}));

        if (!uploaded.ok || !result.id) {
          return json({
            error: "O YouTube não confirmou o envio.",
            details: result,
          }, 502);
        }

        return json({
          success: true,
          message: "Vídeo enviado ao YouTube!",
          videoId: result.id,
          title: result.snippet?.title || title,
          privacyStatus: result.status?.privacyStatus || privacy,
          url: `https://www.youtube.com/watch?v=${result.id}`,
        });

      } catch (error) {
        return json({
          error: error instanceof Error
            ? error.message
            : "Erro inesperado no envio.",
        }, 500);
      }
    }

    if (url.pathname === "/api/status" && request.method === "GET") {
      const saved = await env.TOKENS.get(TOKEN_KEY);

      return json({
        service: "Neural Pulse Brasil",
        online: true,
        youtubeAuthorized: Boolean(saved),
      });
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
              version: "1.1.0",
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
                description: "Verifica o funcionamento do canal.",
                inputSchema: {
                  type: "object",
                  properties: {},
                },
              },
              {
                name: "status_youtube",
                description: "Verifica a autorização do YouTube.",
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
          message = await env.TOKENS.get(TOKEN_KEY)
            ? "Autorização do YouTube encontrada."
            : "YouTube ainda não foi autorizado.";
        } else {
          return json({
            jsonrpc: "2.0",
            id,
            error: {
              code: -32602,
              message: "Ferramenta não encontrada.",
            },
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
