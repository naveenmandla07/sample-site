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

function canonicalContact(value: unknown) {
  if (typeof value !== "string") throw new Error("Enter a valid email address or phone number.");
  const contact = value.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) return contact.toLowerCase();
  if (/^\+[1-9]\d{7,14}$/.test(contact)) return contact;
  throw new Error("Enter a valid email address or phone number with country code.");
}

async function hash(value: string, secret: string) {
  const bytes = new TextEncoder().encode(`${secret}:${value}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Server configuration is missing ${name}.`);
  return value;
}

async function sendEmailOtp(contact: string, code: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requiredEnv("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: requiredEnv("OTP_EMAIL_FROM"),
      to: [contact],
      subject: "Your Studio Verandah verification code",
      text: `Your verification code is ${code}. It expires in 10 minutes.`,
    }),
  });
  if (!response.ok) throw new Error("Email delivery failed. Check the Resend configuration.");
}

async function sendSmsOtp(contact: string, code: string) {
  const accountSid = requiredEnv("TWILIO_ACCOUNT_SID");
  const credentials = btoa(`${accountSid}:${requiredEnv("TWILIO_AUTH_TOKEN")}`);
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      To: contact,
      From: requiredEnv("TWILIO_PHONE_NUMBER"),
      Body: `Your Studio Verandah verification code is ${code}. It expires in 10 minutes.`,
    }),
  });
  if (!response.ok) throw new Error("SMS delivery failed. Check the Twilio configuration.");
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
    const secret = requiredEnv("OTP_HASH_SECRET");
    if (secret.length < 32) throw new Error("OTP_HASH_SECRET must be at least 32 characters.");
    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    if (payload.action === "send") {
      const code = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
      const otp = code.toString().padStart(6, "0");
      const { data: issued, error } = await supabase.rpc("issue_contact_otp", {
        p_contact: contact,
        p_code_hash: await hash(`${contact}:${otp}`, secret),
        p_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });
      if (error) throw new Error("Could not create a verification code.");
      if (!issued) return jsonResponse({ message: "Please wait 60 seconds before requesting another code." }, 429);

      try {
        if (contact.includes("@")) await sendEmailOtp(contact, otp);
        else await sendSmsOtp(contact, otp);
      } catch (error) {
        await supabase.from("contact_otp_challenges").delete().eq("contact", contact);
        throw error;
      }
      return jsonResponse({ sent: true });
    }

    if (payload.action === "verify") {
      if (typeof payload.token !== "string" || !/^\d{6}$/.test(payload.token)) {
        return jsonResponse({ message: "Enter the 6-digit verification code." }, 400);
      }
      const verificationToken = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const { data: verified, error } = await supabase.rpc("verify_contact_otp", {
        p_contact: contact,
        p_code_hash: await hash(`${contact}:${payload.token}`, secret),
        p_verification_token_hash: await hash(`verification:${verificationToken}`, secret),
      });
      if (error) throw new Error("Could not verify the code.");
      if (!verified) return jsonResponse({ message: "The code is invalid or expired. Request a new code and try again." }, 400);
      return jsonResponse({ verificationToken });
    }

    return jsonResponse({ message: "Unsupported OTP action." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The OTP request could not be completed.";
    return jsonResponse({ message }, 400);
  }
});