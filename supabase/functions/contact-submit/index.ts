import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigin = Deno.env.get("SITE_ORIGIN") ?? "";
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Server configuration is missing ${name}.`);
  return value;
}

function canonicalContact(value: unknown) {
  if (typeof value !== "string") throw new Error("Enter a valid email address or phone number.");
  const contact = value.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) return contact.toLowerCase();
  if (/^\+[1-9]\d{7,14}$/.test(contact)) return contact;
  throw new Error("Enter a valid email address or phone number with country code.");
}

function requiredText(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new Error(`${label} is required and must be shorter than ${maxLength} characters.`);
  }
  return value.trim();
}

async function hash(value: string, secret: string) {
  const bytes = new TextEncoder().encode(`${secret}:${value}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.headers.get("origin") !== allowedOrigin || !allowedOrigin) {
    return jsonResponse({ message: "Origin is not allowed." }, 403);
  }
  if (request.method !== "POST") return jsonResponse({ message: "Method not allowed." }, 405);

  try {
    const payload = await request.json();
    const contact = canonicalContact(payload.email ?? payload.phone);
    const verificationToken = payload.verificationToken;
    if (typeof verificationToken !== "string" || !/^[a-f0-9]{64}$/.test(verificationToken)) {
      return jsonResponse({ message: "Verify your contact before submitting the request." }, 400);
    }
    const secret = requiredEnv("OTP_HASH_SECRET");
    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: requestId, error } = await supabase.rpc("submit_verified_contact_request", {
      p_contact: contact,
      p_verification_token_hash: await hash(`verification:${verificationToken}`, secret),
      p_name: requiredText(payload.name, "Name", 120),
      p_company: typeof payload.company === "string" ? payload.company.trim().slice(0, 120) : "",
      p_project: requiredText(payload.project, "Project details", 5000),
    });
    if (error) throw new Error("Could not save the verified request.");
    if (!requestId) return jsonResponse({ message: "Verification expired or was already used. Request a new code." }, 400);
    return jsonResponse({ sent: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The request could not be submitted.";
    return jsonResponse({ message }, 400);
  }
});