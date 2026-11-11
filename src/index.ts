
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return Response.json({
        name: "Neural Pulse MCP",
        status: "online",
        message: "Servidor inicial da Neural Pulse."
      });
    }

    if (url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }

    return Response.json(
      { error: "Not found" },
      { status: 404 }
    );
  }
};
