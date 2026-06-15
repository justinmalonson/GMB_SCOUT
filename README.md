# GMB_SCOUT

Internal Next.js MVP for finding local Google Maps/Places business profiles that are likely unmanaged based on missing Places photos, no website, low review count, and phone availability.

## What it does

- Search by niche + city/state using Google Places API Text Search (New)
- Requests the `places.photos` field
- Marks listings with no returned photos as high-probability opportunities
- Shows a one-click "View First Photo" button when a first photo exists
- Scores each result from 0 to 100
- Saves leads in browser localStorage
- Exports search results and saved leads to CSV

## Important signal rule

This app treats missing Google Places photos as a lead signal, not a confirmed ownership/claim signal.

Recommended internal labels:

- `high_probability_unmanaged`
- `likely_unmanaged`
- `has_photo`
- `skip`

## Requirements

- Node.js 20+
- Google Cloud project
- Google Maps Platform billing enabled
- Places API (New) enabled
- API key added to `.env.local`

## Setup

```bash
npm install
cp .env.example .env.local
```

Edit `.env.local`:

```bash
GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
```

Run locally:

```bash
npm run dev
```

Open:

```bash
http://localhost:3000
```

## Google API used

### Text Search New

Endpoint:

```txt
POST https://places.googleapis.com/v1/places:searchText
```

Field mask used:

```txt
places.id,
places.displayName,
places.formattedAddress,
places.nationalPhoneNumber,
places.websiteUri,
places.googleMapsUri,
places.rating,
places.userRatingCount,
places.businessStatus,
places.primaryType,
places.photos,
nextPageToken
```

### Place Photos New

Endpoint:

```txt
GET https://places.googleapis.com/v1/{photoName}/media?maxWidthPx=800&skipHttpRedirect=true&key=API_KEY
```

The app proxies this through:

```txt
/api/photo?name=places/.../photos/...
```

This avoids exposing the API key in the browser.

## Score model

```txt
No photos: +60
No website: +25
Reviews under 3: +25
Reviews under 10: +10
Phone available: +5
No phone: -10
Rating under 4.0: +5
Closed businesses: excluded
```

## Suggested first searches

```txt
home remodelers in Myrtle Beach SC
roofers in Myrtle Beach SC
flooring contractors in Myrtle Beach SC
painters in Myrtle Beach SC
fence contractors in Myrtle Beach SC
```

## Current persistence

Saved leads are stored in browser localStorage for speed.

For production/team usage, replace localStorage with Supabase/Postgres. Suggested table:

```sql
create table leads (
  id uuid primary key default gen_random_uuid(),
  niche text,
  city text,
  state text,
  business_name text,
  address text,
  phone text,
  website text,
  google_place_id text unique,
  google_maps_url text,
  has_photo boolean,
  first_photo_name text,
  rating numeric,
  review_count int,
  business_status text,
  primary_type text,
  opportunity_score int,
  status text,
  reasons text[],
  created_at timestamp default now()
);
```

## Files

```txt
src/app/page.tsx              Main UI
src/app/api/search/route.ts   Google Places Text Search proxy + scoring
src/app/api/photo/route.ts    Place Photo proxy
src/lib/scoring.ts            Lead scoring logic
src/lib/types.ts              Shared types
```

## Deployment notes

If deploying to Vercel/Netlify:

1. Add `GOOGLE_MAPS_API_KEY` as an environment variable.
2. Restrict the Google API key in Google Cloud Console.
3. Keep API calls server-side so the raw key is not exposed in the browser.
