# OTP setup

## Configure the page

In `index.html`, replace `SUPABASE_URL` and `SUPABASE_ANON_KEY` with the project's public URL and anon key. These are intended for browser use. Never put the service-role key in the page.

## Configure Supabase Auth

Enable email and phone signups in the Supabase Auth settings. Configure a production SMTP provider and set the signup confirmation email template to include `{{ .Token }}` so email signups receive a numeric code. Configure an SMS provider in Supabase Auth for phone signup codes.

## Deploy contact verification

From the project root, link the Supabase project, apply the migration, set the function secrets, and deploy both functions:

```sh
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase secrets set \
  SITE_ORIGIN=https://your-site.example \
  OTP_HASH_SECRET=REPLACE_WITH_AT_LEAST_32_RANDOM_CHARACTERS \
  RESEND_API_KEY=YOUR_RESEND_API_KEY \
  OTP_EMAIL_FROM='Studio Verandah <hello@your-verified-domain.example>' \
  TWILIO_ACCOUNT_SID=YOUR_TWILIO_ACCOUNT_SID \
  TWILIO_AUTH_TOKEN=YOUR_TWILIO_AUTH_TOKEN \
  TWILIO_PHONE_NUMBER=YOUR_TWILIO_E164_NUMBER
supabase functions deploy contact-otp
supabase functions deploy contact-submit
```

`SITE_ORIGIN` must exactly match the deployed site's origin, with no trailing slash. Resend must be configured with a verified sending domain, and Twilio must be enabled to send SMS to the target countries. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions; keep the service-role key server-side.

Contact OTPs expire after 10 minutes, can be requested once per minute per contact, and allow five verification attempts. The final request is saved in `contact_requests` only after verification.