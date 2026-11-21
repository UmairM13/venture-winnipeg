# Venture Production Starter v0.1

Venture is a mobile-first Winnipeg discovery product for trustworthy events, restaurants, and complete outings.

This repository is the first production-oriented scaffold. It is not yet a public-launch application.

## Included

- Next.js App Router and TypeScript
- Mobile-first Venture UI baseline
- PWA manifest and service worker shell
- Home, Explore, Tonight, Saved, Profile, and listing-detail routes
- MapLibre component with safe missing-configuration behaviour
- Supabase client and server-only admin helpers
- Newsletter consent endpoint scaffold
- PostgreSQL/PostGIS schema with verification, sources, reports, saves, business claims, newsletter consent, and audit history
- Architecture, build plan, and decision log

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Create a Supabase project.
3. Apply `supabase/migrations/001_initial_schema.sql`.
4. Add the public Supabase URL and anonymous key.
5. Add the service-role key only to server-side environment settings.
6. Choose a licensed MapLibre-compatible map style provider and add the style URL.
7. Run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Production cautions

- Sample listings are fictionalized prototype data, not a production feed.
- Do not turn on Google place content until the exact implementation has been reviewed against current Google terms.
- Places UI Kit is optional and should remain behind a feature flag while it is pre-GA.
- Do not use public OpenStreetMap tile servers as a production tile backend.
- Newsletter signup should use double opt-in and a real unsubscribe workflow before collecting subscribers.
- High-risk business edits must pass review rather than publishing directly.
- Obtain qualified Canadian legal advice before public launch.

## Docker development setup

Venture supports a containerised development environment using
Docker Compose and a local Supabase instance.

### Prerequisites

- Git
- Node.js 24
- Docker Desktop (running)

### Start Supabase

From the repository root:

```sh
npx supabase start
```

This starts the local Supabase services and applies the database migrations
on initial setup.

### Configure environment variables

Copy `.env.example` to `.env.local` and populate the Supabase keys
provided by the Supabase CLI.

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

Never commit `.env.local` or production credentials.

### Start Venture

```sh
cd docker
docker compose up -d
```

Rebuild the application after making code changes:

```sh
docker compose up --build -d
```

### Local development services

| Service               | URL                                       |
| --------------------- | ----------------------------------------- |
| Venture               | http://localhost:3000                     |
| Supabase API          | http://127.0.0.1:54321                    |
| Supabase Studio       | http://127.0.0.1:54323                    |
| Mailpit               | http://127.0.0.1:54324                    |
| Supabase health check | http://localhost:3000/api/health/supabase |

### Testing email authentication

1. Open Venture using http://localhost:3000.
2. Request an email sign-in link.
3. Open Mailpit to retrieve the email.
4. Follow the sign-in link in the same browser session.

Always use localhost:3000 when accessing Venture to maintain a
consistent application origin.

### Stopping the environment

From the docker directory:

```sh
docker compose down
```

From the repository root:

```sh
npx supabase stop
```
