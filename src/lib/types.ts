export type SearchMode = "single_city" | "multiple_cities" | "county";

export type SearchRequest = {
  niche: string;
  city?: string;
  cities?: string[];
  county?: string;
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
  businessName: string;
  address: string;
  phone: string;
  website: string;
  sourceQuery: string;
  matchedQueries: string[];
  searchMode: SearchMode;
  searchedCounty: string;
  searchedCities: string[];
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
