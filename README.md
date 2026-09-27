# Studio Verandah site

The page is assembled from reusable HTML sections under `src/components/`. Run the one-time extraction on the existing page, then rebuild the standalone `index.html` whenever a component changes:

```sh
node build.mjs --init
node build.mjs
```

## Backend

The Supabase Edge Functions and database migration provide contact OTP delivery, verification, and request storage. Install the project tools and start the local backend with Docker Desktop running:

```sh
npm install
cp supabase/.env.example supabase/.env.local
npm run backend:check
npm run backend:start
npm run backend:reset
npm run backend:functions
```

In a second terminal, serve the site from `http://127.0.0.1:5500` and rebuild it using the local Supabase URL and anon key printed by `npx supabase status`:

```sh
python3 -m http.server 5500
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=YOUR_LOCAL_ANON_KEY npm run build
```

Set real Resend and Twilio credentials in `supabase/.env.local` before testing delivery. Never put the service-role key or provider secrets into `index.html`. Deployment instructions for a hosted project are in `supabase/README.md`.

Component folders:

- `src/components/account-creation/`
- `src/components/start-project/` (hero and requirements)
- `src/components/services/`
- `src/components/work/`
- `src/components/about/`
- `src/components/contact/`

Shared styles and page behavior remain in `src/index.template.html`. The generated root `index.html` can be opened directly in a browser. Supabase OTP setup and deployment notes are in `supabase/README.md`.