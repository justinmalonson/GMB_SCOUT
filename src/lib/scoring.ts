import type { GooglePlace, Lead, LeadStatus } from "./types";

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

export function scorePlace(
  place: GooglePlace,
  context: {
    niche: string;
    city: string;
    state: string;
    sourceCity: string;
    sourceState: string;
    sourceQuery: string;
    matchedQueries: string[];
    searchMode: Lead["searchMode"];
  }
): Lead {
  const photos = Array.isArray(place.photos) ? place.photos : [];
  const hasPhoto = photos.length > 0;
  const firstPhotoName = photos[0]?.name ?? "";
  const hasWebsite = Boolean(place.websiteUri);
  const phone = place.nationalPhoneNumber?.trim() ?? "";
  const hasPhone = Boolean(phone);
  const noPhone = !hasPhone;
  const reviewCount = place.userRatingCount ?? 0;
  const rating = typeof place.rating === "number" ? place.rating : null;
  const businessStatus = place.businessStatus ?? "UNKNOWN";
  const isClosed = businessStatus === "CLOSED_PERMANENTLY";

  const reasons: string[] = [];
  let score = 0;

  if (isClosed) {
    return {
      id: place.id ?? crypto.randomUUID(),
      niche: context.niche,
      city: context.city,
      state: context.state,
      sourceCity: context.sourceCity,
      sourceState: context.sourceState,
      businessName: place.displayName?.text ?? "Unnamed business",
      address: place.formattedAddress ?? "",
      phone,
      website: place.websiteUri ?? "",
      sourceQuery: context.sourceQuery,
      matchedQueries: context.matchedQueries,
      searchMode: context.searchMode,
      googlePlaceId: place.id ?? "",
      googleMapsUrl: place.googleMapsUri ?? "",
      rating,
      reviewCount,
      businessStatus,
      primaryType: place.primaryType ?? "",
      hasPhone,
      noPhone,
      hasPhoto,
      firstPhotoName,
      firstPhotoProxyUrl: firstPhotoName ? `/api/photo?name=${encodeURIComponent(firstPhotoName)}` : "",
      opportunityScore: 0,
      status: "closed",
      reasons,
      createdAt: new Date().toISOString()
    };
  }

  if (!hasPhoto) {
    score += 35;
    reasons.push("No Google Places photos returned");
  } else {
    reasons.push("Has at least one Google Places photo");
  }

  if (!hasWebsite) {
    score += 20;
    reasons.push("No website listed");
  }

  if (reviewCount < 10) {
    score += 10;
    reasons.push("Fewer than 10 reviews");
  }

  if (hasPhone) {
    reasons.push("Phone number available");
  } else {
    score += 40;
    reasons.push("No phone number listed");
  }

  score = clampScore(score);

  let status: LeadStatus = "skip";
  if (!hasPhoto && !hasPhone) status = "high_probability_unmanaged";
  else if (score >= 70) status = "high_probability_unmanaged";
  else if (!hasPhoto) status = "likely_unmanaged";
  else if (score >= 40) status = "likely_unmanaged";
  else if (hasPhoto) status = "has_photo";

  return {
    id: place.id ?? crypto.randomUUID(),
    niche: context.niche,
    city: context.city,
    state: context.state,
    sourceCity: context.sourceCity,
    sourceState: context.sourceState,
    businessName: place.displayName?.text ?? "Unnamed business",
    address: place.formattedAddress ?? "",
    phone,
    website: place.websiteUri ?? "",
    sourceQuery: context.sourceQuery,
    matchedQueries: context.matchedQueries,
    searchMode: context.searchMode,
    googlePlaceId: place.id ?? "",
    googleMapsUrl: place.googleMapsUri ?? "",
    rating,
    reviewCount,
    businessStatus,
    primaryType: place.primaryType ?? "",
    hasPhone,
    noPhone,
    hasPhoto,
    firstPhotoName,
    firstPhotoProxyUrl: firstPhotoName ? `/api/photo?name=${encodeURIComponent(firstPhotoName)}` : "",
    opportunityScore: score,
    status,
    reasons,
    createdAt: new Date().toISOString()
  };
}
