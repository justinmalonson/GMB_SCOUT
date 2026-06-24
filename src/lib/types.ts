export type SearchMode = "city_search" | "statewide_search";

export type SearchRequest = {
  niche: string;
  city?: string;
  state: string;
  searchMode: SearchMode;
  pageSize?: number;
  maxPages?: number;
  minScore?: number;
};

export type LeadStatus =
  | "high_probability_unmanaged"
  | "likely_unmanaged"
  | "has_photo"
  | "skip"
  | "closed";

export type Lead = {
  id: string;
  niche: string;
  city: string;
  state: string;
  sourceCity: string;
  sourceState: string;
  businessName: string;
  address: string;
  phone: string;
  website: string;
  sourceQuery: string;
  matchedQueries: string[];
  searchMode: SearchMode;
  googlePlaceId: string;
  googleMapsUrl: string;
  rating: number | null;
  reviewCount: number;
  businessStatus: string;
  primaryType: string;
  hasPhone: boolean;
  noPhone: boolean;
  hasPhoto: boolean;
  firstPhotoName: string;
  firstPhotoProxyUrl: string;
  opportunityScore: number;
  status: LeadStatus;
  reasons: string[];
  createdAt: string;
};

export type PlacesPhoto = {
  name?: string;
  widthPx?: number;
  heightPx?: number;
  authorAttributions?: unknown[];
};

export type GooglePlace = {
  id?: string;
  displayName?: {
    text?: string;
    languageCode?: string;
  };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  primaryType?: string;
  photos?: PlacesPhoto[];
};
