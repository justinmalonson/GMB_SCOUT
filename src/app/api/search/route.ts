import { NextResponse } from "next/server";
import { scorePlace } from "@/lib/scoring";
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

function asNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCities(values: unknown): string[] {
  if (!Array.isArray(values)) return [];

  const seen = new Set<string>();
  const cities: string[] = [];

  for (const value of values) {
    const city = normalizeText(value);
    const key = city.toLowerCase();
    if (!city || seen.has(key)) continue;
    seen.add(key);
    cities.push(city);
  }

  return cities;
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

function buildQueries(args: {
  niche: string;
  city: string;
  cities: string[];
  county: string;
  state: string;
  searchMode: SearchMode;
}) {
  const { niche, city, cities, county, state, searchMode } = args;

  switch (searchMode) {
    case "single_city":
      if (!city) {
        throw new Error("Single City mode requires city and state.");
      }
      return {
        queries: [`${niche} in ${city}, ${state}`],
        primaryCity: city,
        searchedCounty: "",
        searchedCities: [city]
      };
    case "multiple_cities":
      if (cities.length === 0) {
        throw new Error("Multiple Cities mode requires at least one city.");
      }
      return {
        queries: cities.map((item) => `${niche} in ${item}, ${state}`),
        primaryCity: cities[0],
        searchedCounty: "",
        searchedCities: cities
      };
    case "county":
      if (!county) {
        throw new Error("County mode requires county and state.");
      }
      return {
        queries: [
          `${niche} in ${county} County, ${state}`,
          ...cities.map((item) => `${niche} in ${item}, ${state}`)
        ],
        primaryCity: cities[0] ?? "",
        searchedCounty: county,
        searchedCities: cities
      };
    default:
      throw new Error("Unsupported search mode.");
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
  const cities = normalizeCities(body.cities);
  const county = normalizeText(body.county);
  const state = normalizeText(body.state);
  const searchMode = body.searchMode;
  const pageSize = asNumber(body.pageSize, 20, 1, 20);
  const maxPages = asNumber(body.maxPages, 1, 1, 3);
  const minScore = asNumber(body.minScore, 0, 0, 100);

  if (!niche || !state) {
    return NextResponse.json(
      { error: "niche and state are required." },
      { status: 400 }
    );
  }

  if (!searchMode || !["single_city", "multiple_cities", "county"].includes(searchMode)) {
    return NextResponse.json({ error: "Valid searchMode is required." }, { status: 400 });
  }

  try {
    const { queries, primaryCity, searchedCounty, searchedCities } = buildQueries({
      niche,
      city,
      cities,
      county,
      state,
      searchMode
    });

    const placeMap = new Map<string, { place: GooglePlace; sourceQuery: string; matchedQueries: string[] }>();

    for (const textQuery of queries) {
      let pageToken: string | undefined;

      for (let page = 0; page < maxPages; page += 1) {
        if (pageToken) {
          await wait(2000);
        }

        const data = await callTextSearch({ apiKey, textQuery, pageSize, pageToken });

        for (const place of data.places ?? []) {
          if (!place.id) continue;
          const existing = placeMap.get(place.id);
          if (existing) {
            if (!existing.matchedQueries.includes(textQuery)) {
              existing.matchedQueries.push(textQuery);
            }
          } else {
            placeMap.set(place.id, {
              place,
              sourceQuery: textQuery,
              matchedQueries: [textQuery]
            });
          }
        }

        if (!data.nextPageToken) break;
        pageToken = data.nextPageToken;
      }
    }

    const leads: Lead[] = Array.from(placeMap.values())
      .map(({ place, sourceQuery, matchedQueries }) =>
        scorePlace(place, {
          niche,
          city: primaryCity,
          state,
          sourceQuery,
          matchedQueries,
          searchMode,
          searchedCounty,
          searchedCities
        })
      )
      .filter((lead) => lead.status !== "closed")
      .filter((lead) => lead.opportunityScore >= minScore)
      .sort((a, b) => b.opportunityScore - a.opportunityScore);

    return NextResponse.json({
      query: queries.join(" | "),
      count: leads.length,
      uniqueCount: leads.length,
      queries,
      leads
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown search error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
