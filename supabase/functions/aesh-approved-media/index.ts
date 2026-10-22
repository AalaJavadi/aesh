// AESH5 public approved-work image gateway. Deploy on isolated TEST Supabase first.
// DO NOT turn on function JWT verification: an anonymous visitor should be able
// to view already-published works but must never view pending or rejected media.
// Service role key stays in Supabase Edge runtime (never browser or Pages bundle).
const allowed = new Set(["aesh-member-works", "aesh-owner-works", "aesh-work-thumbs"]);
const uid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const worksRe = new RegExp(String.raw`^${uid}/${uid}\.(?:jpg|png|webp)$`, "i");
const thumbsRe = new RegExp(String.raw`^${uid}/${uid}\.webp$`, "i");
const deny = (status: number) => new Response(null, {
  status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
});
Deno.serve(async (req: Request) => {
  if (req.method !== "GET" && req.method !== "HEAD") return deny(405);
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const n = parts.lastIndexOf("aesh-approved-media");
  if (n < 0 || parts.length !== n + 4) return deny(404);
  let bucket: string, owner: string, name: string;
  try {
    bucket = decodeURIComponent(parts[n+1]);
    owner = decodeURIComponent(parts[n+2]);
    name = decodeURIComponent(parts[n+3]);
  } catch { return deny(404); }
  const path = `${owner}/${name}`;
  if (!allowed.has(bucket) || !(bucket === "aesh-work-thumbs" ? thumbsRe : worksRe).test(path)) return deny(404);
  const base = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !anon || !service) return deny(503);
  try {
    // Database evaluates one requested path; no full gallery list transfer per image.
    // The RPC is SECURITY DEFINER, and checks only aesh_public_works() (published).
    const rpc = await fetch(base + "/rest/v1/rpc/aesh_5_approved_media", {
      method: "POST", headers: { apikey: anon, Authorization: "Bearer " + anon,
        "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({p_bucket:bucket,p_path:path}), cache: "no-store"
    });
    if (!rpc.ok) return deny(503); // Fail closed on broken RPC or missing grant.
    if (await rpc.json() !== true) return deny(404);
    const dest = base + "/storage/v1/object/authenticated/" + bucket + "/" +
      path.split("/").map(encodeURIComponent).join("/");
    const file = await fetch(dest, { headers: {
      apikey: service, Authorization: "Bearer " + service
    }, cache: "no-store" });
    if (!file.ok || !file.body) return deny(404);
    const mime = file.headers.get("content-type") || "";
    if (!/^image\/(webp|jpeg|png)(?:;|$)/i.test(mime)) return deny(502);
    const headers = new Headers({ "Content-Type": mime, "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff", "Access-Control-Allow-Origin": "*" });
    return new Response(req.method === "HEAD" ? null : file.body, {status:200,headers});
  } catch { return deny(503); }
});
