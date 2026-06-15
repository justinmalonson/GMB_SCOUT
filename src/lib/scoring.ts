import type { GooglePlace, Lead, LeadStatus } from "./types";

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

export function scorePlace(
  place: GooglePlace,
  context: { niche: string; city: string; state: string }
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
    reasons.push("Business is closed");
    return {
      id: place.id ?? crypto.randomUUID(),
      niche: context.niche,
      city: context.city,
      state: context.state,
      businessName: place.displayName?.text ?? "Unnamed business",
      address: place.formattedAddress ?? "",
      phone,
      website: place.websiteUri ?? "",
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
    score += 60;
    reasons.push("No Google Places photos returned");
  } else {
    reasons.push("Has at least one Google Places photo");
  }

  if (!hasWebsite) {
    score += 25;
    reasons.push("No website listed");
  }

  if (reviewCount < 10) {
    score += 10;
    reasons.push("Fewer than 10 reviews");
  }

  if (hasPhone) {
    score += 5;
    reasons.push("Phone number available for outreach");
  } else {
    score += 20;
    reasons.push("No phone number listed");
  }

  if (rating !== null && rating < 4) {
    score += 5;
    reasons.push("Rating below 4.0");
  }

  score = clampScore(score);

  let status: LeadStatus = "skip";
  if (!hasPhoto && !hasPhone) status = "high_probability_unmanaged";
  else if (!hasPhoto && score >= 80) status = "high_probability_unmanaged";
  else if (!hasPhoto) status = "likely_unmanaged";
  else if (hasPhoto) status = "has_photo";

  return {
    id: place.id ?? crypto.randomUUID(),
    niche: context.niche,
    city: context.city,
    state: context.state,
    businessName: place.displayName?.text ?? "Unnamed business",
    address: place.formattedAddress ?? "",
    phone,
    website: place.websiteUri ?? "",
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
