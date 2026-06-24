import { NextResponse } from "next/server";
import { scorePlace } from "@/lib/scoring";
import { normalizeStateKey, STATE_CITIES } from "@/lib/state-cities";
import type { GooglePlace, Lead, SearchMode, SearchRequest } from "@/lib/types";

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

type QueryTarget = {
  city: string;
  query: string;
};

type StoredPlace = {
  place: GooglePlace;
  sourceCity: string;
  sourceState: string;
  sourceQuery: string;
  matchedQueries: string[];
};

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

function buildQueryTargets(args: {
  niche: string;
  city: string;
  state: string;
  searchMode: SearchMode;
}) {
  const { niche, city, state, searchMode } = args;
  const normalizedState = normalizeStateKey(state);

  if (searchMode === "city_search") {
    if (!city) {
      throw new Error("City Search requires city and state.");
    }

    return {
      targets: [{ city, query: `${niche} in ${city}, ${state}` }]
    };
  }

  const statewideCities = STATE_CITIES[normalizedState] ?? [];
  if (statewideCities.length === 0) {
    throw new Error(`No statewide city list configured for ${normalizedState}.`);
  }

  return {
    targets: statewideCities.map((sourceCity) => ({
      city: sourceCity,
      query: `${niche} in ${sourceCity}, ${state}`
    }))
  };
}

async function runTargetSearch(args: {
  apiKey: string;
  target: QueryTarget;
  pageSize: number;
  maxPages: number;
  placeMap: Map<string, StoredPlace>;
  state: string;
}) {
  const { apiKey, target, pageSize, maxPages, placeMap, state } = args;
  let pageToken: string | undefined;

  for (let page = 0; page < maxPages; page += 1) {
    if (pageToken) {
      await wait(2000);
    }

    const data = await callTextSearch({
      apiKey,
      textQuery: target.query,
      pageSize,
      pageToken
    });

    for (const place of data.places ?? []) {
      if (!place.id) continue;

      const existing = placeMap.get(place.id);
      if (existing) {
        if (!existing.matchedQueries.includes(target.query)) {
          existing.matchedQueries.push(target.query);
        }
        continue;
      }

      placeMap.set(place.id, {
        place,
        sourceCity: target.city,
        sourceState: state,
        sourceQuery: target.query,
        matchedQueries: [target.query]
      });
    }

    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
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
  const searchMode = body.searchMode;
  const pageSize = asNumber(body.pageSize, 20, 1, 20);
  const maxPages = asNumber(body.maxPages, 1, 1, 3);
  const minScore = asNumber(body.minScore, 0, 0, 100);

  if (!niche || !state) {
    return NextResponse.json({ error: "niche and state are required." }, { status: 400 });
  }

  if (!searchMode || !["city_search", "statewide_search"].includes(searchMode)) {
    return NextResponse.json({ error: "Valid searchMode is required." }, { status: 400 });
  }

  try {
    const { targets } = buildQueryTargets({ niche, city, state, searchMode });
    const placeMap = new Map<string, StoredPlace>();
    const cityErrors: Array<{ city: string; query: string; error: string }> = [];

    for (const target of targets) {
      try {
        await runTargetSearch({
          apiKey,
          target,
          pageSize,
          maxPages,
          placeMap,
          state
        });
      } catch (error) {
        cityErrors.push({
          city: target.city,
          query: target.query,
          error: error instanceof Error ? error.message : "Unknown search error."
        });
      }
    }

    if (placeMap.size === 0 && cityErrors.length > 0) {
      return NextResponse.json(
        {
          error: cityErrors[0].error,
          cityErrors
        },
        { status: 500 }
      );
    }

    const leads: Lead[] = Array.from(placeMap.values())
      .map(({ place, sourceCity, sourceState, sourceQuery, matchedQueries }) =>
        scorePlace(place, {
          niche,
          city: sourceCity,
          state,
          sourceCity,
          sourceState,
          sourceQuery,
          matchedQueries,
          searchMode
        })
      )
      .filter((lead) => lead.status !== "closed")
      .filter((lead) => lead.opportunityScore >= minScore)
      .sort((a, b) => b.opportunityScore - a.opportunityScore);

    return NextResponse.json({
      query: targets.map((target) => target.query).join(" | "),
      count: leads.length,
      uniqueCount: leads.length,
      queries: targets.map((target) => target.query),
      cityErrors,
      leads
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown search error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
