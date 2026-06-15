import { NextResponse } from "next/server";
import { scorePlace } from "@/lib/scoring";
import type { GooglePlace, Lead, SearchRequest } from "@/lib/types";

export const runtime = "nodejs";

const PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.googleMapsUri",
  "places.rating",
  "places.userRatingCount",
  "places.businessStatus",
  "places.primaryType",
  "places.photos",
  "nextPageToken"
].join(",");

function asNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callTextSearch(args: {
  apiKey: string;
  textQuery: string;
  pageSize: number;
  pageToken?: string;
}) {
  const body: Record<string, unknown> = {
    textQuery: args.textQuery,
    pageSize: args.pageSize
  };

  if (args.pageToken) {
    body.pageToken = args.pageToken;
  }

  const response = await fetch(PLACES_TEXT_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": args.apiKey,
      "X-Goog-FieldMask": FIELD_MASK
    },
    body: JSON.stringify(body),
    cache: "no-store"
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      typeof data?.error?.message === "string"
        ? data.error.message
        : `Google Places API returned HTTP ${response.status}`;
    throw new Error(message);
  }

  return data as { places?: GooglePlace[]; nextPageToken?: string };
}

export async function POST(request: Request) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Missing GOOGLE_MAPS_API_KEY. Add it to .env.local and make sure Places API (New) is enabled."
      },
      { status: 500 }
    );
  }

  let body: SearchRequest;
  try {
    body = (await request.json()) as SearchRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const niche = normalizeText(body.niche);
  const city = normalizeText(body.city);
  const state = normalizeText(body.state);
  const pageSize = asNumber(body.pageSize, 20, 1, 20);
  const maxPages = asNumber(body.maxPages, 1, 1, 3);
  const minScore = asNumber(body.minScore, 0, 0, 100);
  const onlyNoPhoto = Boolean(body.onlyNoPhoto);
  const onlyNoPhone = Boolean(body.onlyNoPhone);

  if (!niche || !city) {
    return NextResponse.json(
      { error: "niche and city are required." },
      { status: 400 }
    );
  }

  const location = state ? `${city}, ${state}` : city;
  const textQuery = `${niche} in ${location}`;

  try {
    const allPlaces: GooglePlace[] = [];
    let pageToken: string | undefined;

    for (let page = 0; page < maxPages; page += 1) {
      if (pageToken) {
        // Google page tokens may need a short delay before the next call is accepted.
        await wait(2000);
      }

      const data = await callTextSearch({ apiKey, textQuery, pageSize, pageToken });
      allPlaces.push(...(data.places ?? []));

      if (!data.nextPageToken) break;
      pageToken = data.nextPageToken;
    }

    const deduped = new Map<string, GooglePlace>();
    for (const place of allPlaces) {
      if (!place.id) continue;
      deduped.set(place.id, place);
    }

    const leads: Lead[] = Array.from(deduped.values())
      .map((place) => scorePlace(place, { niche, city, state }))
      .filter((lead) => lead.status !== "closed")
      .filter((lead) => lead.opportunityScore >= minScore)
      .filter((lead) => (onlyNoPhoto ? !lead.hasPhoto : true))
      .filter((lead) => (onlyNoPhone ? lead.noPhone : true))
      .sort((a, b) => b.opportunityScore - a.opportunityScore);

    return NextResponse.json({
      query: textQuery,
      count: leads.length,
      leads
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown search error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
