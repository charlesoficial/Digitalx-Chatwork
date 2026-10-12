// Prepared server endpoint. Not deployed until LiveKit and allowed origins are configured.
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { AccessToken } from "npm:livekit-server-sdk@2.19.1";
Deno.serve(async (request) => {
  const origin = request.headers.get("origin") ?? "";
  const allowed = (
    Deno.env.get("APP_ORIGINS") ?? "http://localhost:5173"
  ).split(",");
  if (origin && !allowed.includes(origin))
    return new Response("Origin denied", { status: 403 });
  const headers = {
    "Access-Control-Allow-Origin": origin || allowed[0],
    "Access-Control-Allow-Headers":
      "authorization,apikey,content-type,x-client-info",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
  const reply = (status: number, data: unknown) =>
    new Response(JSON.stringify(data), { status, headers });
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (request.method !== "POST")
    return reply(405, { error: "Method not allowed" });
  const key = Deno.env.get("LIVEKIT_API_KEY"),
    secret = Deno.env.get("LIVEKIT_API_SECRET"),
    url = Deno.env.get("LIVEKIT_URL");
  if (!key || !secret || !url)
    return reply(503, { error: "Call infrastructure pending" });
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer "))
    return reply(401, { error: "Authentication required" });
  try {
    const scoped = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false },
      },
    );
    const {
      data: { user },
      error,
    } = await scoped.auth.getUser(authorization.slice(7));
    if (error || !user) return reply(401, { error: "Invalid session" });
    const { conversation_id } = await request.json();
    if (
      typeof conversation_id !== "string" ||
      !/^[0-9a-f-]{36}$/.test(conversation_id)
    )
      return reply(400, { error: "Invalid conversation" });
    const { data: member, error: memberError } = await scoped
      .from("conversation_members")
      .select("role")
      .eq("conversation_id", conversation_id)
      .eq("user_id", user.id)
      .single();
    if (memberError || !member)
      return reply(403, { error: "Participant access required" });
    const token = new AccessToken(key, secret, {
      identity: user.id,
      name: user.user_metadata.full_name ?? "Membro",
      ttl: "10m",
    });
    token.addGrant({
      roomJoin: true,
      room: `digitalx-${conversation_id}`,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
    });
    return reply(201, {
      server_url: url,
      participant_token: await token.toJwt(),
    });
  } catch {
    return reply(400, { error: "Invalid request" });
  }
});
