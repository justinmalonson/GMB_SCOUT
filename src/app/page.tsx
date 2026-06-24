"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { normalizeStateKey, STATE_CITIES } from "@/lib/state-cities";
import type { Lead, SearchMode } from "@/lib/types";

type SearchResponse = {
  query: string;
  count: number;
  uniqueCount?: number;
  queries?: string[];
  cityErrors?: Array<{ city: string; query: string; error: string }>;
  leads: Lead[];
  error?: string;
};

type PhotoResponse = {
  photoUri?: string;
  error?: string;
};

type ResultFilter = "all" | "no_photo" | "no_website" | "no_phone";

const STORAGE_KEY = "GMB_SCOUT.saved-leads.v1";

function statusLabel(status: Lead["status"]): string {
  switch (status) {
    case "high_probability_unmanaged":
      return "High Probability";
    case "likely_unmanaged":
      return "Likely Unmanaged";
    case "has_photo":
      return "Has Photos";
    default:
      return "Skip";
  }
}

function statusClass(status: Lead["status"]): string {
  switch (status) {
    case "high_probability_unmanaged":
      return "badge high";
    case "likely_unmanaged":
      return "badge likely";
    case "has_photo":
      return "badge photo";
    default:
      return "badge skip";
  }
}

function toCsvValue(value: unknown): string {
  const stringValue = value === null || value === undefined ? "" : String(value);
  return `"${stringValue.replaceAll('"', '""')}"`;
}

function normalizeLead(lead: Lead): Lead {
  const rawPhone = lead.phone?.trim() ?? "";
  const phone = rawPhone === "Missing" ? "" : rawPhone;
  const hasPhone = typeof lead.hasPhone === "boolean" ? lead.hasPhone : Boolean(phone);
  const noPhone = typeof lead.noPhone === "boolean" ? lead.noPhone : !hasPhone;

  return {
    ...lead,
    city: lead.city ?? lead.sourceCity ?? "",
    state: lead.state ?? lead.sourceState ?? "",
    sourceCity: lead.sourceCity ?? lead.city ?? "",
    sourceState: lead.sourceState ?? lead.state ?? "",
    phone,
    hasPhone,
    noPhone,
    sourceQuery: lead.sourceQuery ?? "",
    matchedQueries: Array.isArray(lead.matchedQueries) ? lead.matchedQueries : [],
    searchMode: lead.searchMode ?? "city_search"
  };
}

function prepareLeadForSave(rawLead: Lead): Lead {
  const lead = normalizeLead(rawLead);
  return {
    ...lead,
    phone: lead.noPhone ? "Missing" : lead.phone
  };
}

function exportCsv(leads: Lead[], filename: string) {
  const headers = [
    "business_name",
    "city",
    "state",
    "source_city",
    "source_state",
    "source_query",
    "search_mode",
    "phone",
    "has_phone",
    "no_phone",
    "website",
    "address",
    "google_maps_url",
    "google_place_id",
    "has_photo",
    "first_photo_name",
    "rating",
    "review_count",
    "opportunity_score",
    "status",
    "reasons",
    "created_at"
  ];

  const rows = leads.map((rawLead) => {
    const lead = prepareLeadForSave(rawLead);
    return [
      lead.businessName,
      lead.city,
      lead.state,
      lead.sourceCity,
      lead.sourceState,
      lead.sourceQuery,
      lead.searchMode,
      lead.phone,
      lead.hasPhone,
      lead.noPhone,
      lead.website,
      lead.address,
      lead.googleMapsUrl,
      lead.googlePlaceId,
      lead.hasPhoto,
      lead.firstPhotoName,
      lead.rating ?? "",
      lead.reviewCount,
      lead.opportunityScore,
      lead.status,
      lead.reasons.join("; "),
      lead.createdAt
    ];
  });

  const csv = [headers, ...rows].map((row) => row.map(toCsvValue).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [searchMode, setSearchMode] = useState<SearchMode>("city_search");
  const [niche, setNiche] = useState("home remodelers");
  const [city, setCity] = useState("Myrtle Beach");
  const [state, setState] = useState("SC");
  const [pageSize, setPageSize] = useState(20);
  const [maxPages, setMaxPages] = useState(1);
  const [minScore, setMinScore] = useState(0);
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [results, setResults] = useState<Lead[]>([]);
  const [saved, setSaved] = useState<Lead[]>([]);
  const [query, setQuery] = useState("");
  const [queryCount, setQueryCount] = useState(0);
  const [searchWarnings, setSearchWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [photoLoadingId, setPhotoLoadingId] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Lead[];
      if (Array.isArray(parsed)) setSaved(parsed.map(prepareLeadForSave));
    } catch {
      setSaved([]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  }, [saved]);

  const stats = useMemo(() => {
    const high = results.filter((lead) => lead.status === "high_probability_unmanaged").length;
    const noPhoto = results.filter((lead) => !lead.hasPhoto).length;
    const noPhone = results.filter((lead) => lead.noPhone).length;
    const noWebsite = results.filter((lead) => !lead.website).length;
    return { high, noPhoto, noPhone, noWebsite };
  }, [results]);

  const filteredResults = useMemo(() => {
    switch (resultFilter) {
      case "no_photo":
        return results.filter((lead) => !lead.hasPhoto);
      case "no_website":
        return results.filter((lead) => !lead.website);
      case "no_phone":
        return results.filter((lead) => lead.noPhone);
      default:
        return results;
    }
  }, [resultFilter, results]);

  const statewideCityCount = useMemo(() => {
    const stateKey = normalizeStateKey(state);
    return STATE_CITIES[stateKey]?.length ?? 0;
  }, [state]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResults([]);
    setQuery("");
    setQueryCount(0);
    setSearchWarnings([]);

    if (!niche.trim() || !state.trim()) {
      setError("Niche and state are required.");
      setLoading(false);
      return;
    }

    if (searchMode === "city_search" && !city.trim()) {
      setError("City Search requires city and state.");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          searchMode,
          niche,
          city,
          state,
          pageSize,
          maxPages,
          minScore
        })
      });

      const data = (await response.json()) as SearchResponse;

      if (!response.ok || data.error) {
        throw new Error(data.error || "Search failed.");
      }

      setQuery(data.query);
      setQueryCount(data.queries?.length ?? 0);
      setResults(data.leads.map(normalizeLead));
      setSearchWarnings(
        (data.cityErrors ?? []).map(
          (item) => `${item.city}: ${item.error}`
        )
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Search failed.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function saveLead(lead: Lead) {
    setSaved((current) => {
      const exists = current.some((item) => item.googlePlaceId === lead.googlePlaceId);
      if (exists) return current;
      return [prepareLeadForSave(lead), ...current];
    });
  }

  function removeSavedLead(googlePlaceId: string) {
    setSaved((current) => current.filter((lead) => lead.googlePlaceId !== googlePlaceId));
  }

  async function openFirstPhoto(lead: Lead) {
    if (!lead.firstPhotoProxyUrl) return;
    setPhotoLoadingId(lead.googlePlaceId);
    setError("");

    try {
      const response = await fetch(lead.firstPhotoProxyUrl);
      const data = (await response.json()) as PhotoResponse;

      if (!response.ok || data.error || !data.photoUri) {
        throw new Error(data.error || "Could not load photo URL.");
      }

      window.open(data.photoUri, "_blank", "noopener,noreferrer");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load photo URL.";
      setError(message);
    } finally {
      setPhotoLoadingId("");
    }
  }

  const savedIds = useMemo(() => new Set(saved.map((lead) => lead.googlePlaceId)), [saved]);

  return (
    <main className="page">
      <header className="header">
        <div>
          <div className="eyebrow">Internal Tool</div>
          <h1>GMB_SCOUT</h1>
          <p className="subtitle">
            Search Google Places by city or statewide, score weak listings, and save qualified leads with source metadata.
          </p>
        </div>
        <div className="actions">
          <button
            className="secondary-btn"
            type="button"
            disabled={results.length === 0}
            onClick={() => exportCsv(results, "gmb_scout-search-results.csv")}
          >
            Export Results
          </button>
          <button
            className="secondary-btn"
            type="button"
            disabled={saved.length === 0}
            onClick={() => exportCsv(saved, "gmb_scout-saved-leads.csv")}
          >
            Export Saved
          </button>
        </div>
      </header>

      <section className="grid">
        <aside>
          <div className="card panel">
            <h2 className="card-title">Search</h2>
            <form className="form" onSubmit={handleSearch}>
              <div className="field">
                <label htmlFor="searchMode">Search mode</label>
                <select
                  id="searchMode"
                  value={searchMode}
                  onChange={(event) => setSearchMode(event.target.value as SearchMode)}
                >
                  <option value="city_search">City Search</option>
                  <option value="statewide_search">Statewide Search</option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="niche">Niche</label>
                <input
                  id="niche"
                  value={niche}
                  onChange={(event) => setNiche(event.target.value)}
                  placeholder="roofers, remodelers, flooring contractors"
                  required
                />
              </div>

              <div className="two-col">
                {searchMode === "city_search" ? (
                  <div className="field">
                    <label htmlFor="city">City</label>
                    <input
                      id="city"
                      value={city}
                      onChange={(event) => setCity(event.target.value)}
                      placeholder="Myrtle Beach"
                      required
                    />
                  </div>
                ) : (
                  <div className="field">
                    <label>Configured cities</label>
                    <div className="info-box">
                      {statewideCityCount > 0
                        ? `${statewideCityCount} cities loaded for ${normalizeStateKey(state)}.`
                        : `No city map configured for ${normalizeStateKey(state) || "this state"}.`}
                    </div>
                  </div>
                )}

                <div className="field">
                  <label htmlFor="state">State</label>
                  <input
                    id="state"
                    value={state}
                    onChange={(event) => setState(event.target.value)}
                    placeholder="SC"
                    required
                  />
                </div>
              </div>

              <div className="two-col">
                <div className="field">
                  <label htmlFor="pageSize">Page size</label>
                  <select
                    id="pageSize"
                    value={pageSize}
                    onChange={(event) => setPageSize(Number(event.target.value))}
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="maxPages">Pages</label>
                  <select
                    id="maxPages"
                    value={maxPages}
                    onChange={(event) => setMaxPages(Number(event.target.value))}
                  >
                    <option value={1}>1 page</option>
                    <option value={2}>2 pages</option>
                    <option value={3}>3 pages</option>
                  </select>
                </div>
              </div>

              <div className="field">
                <label htmlFor="minScore">Minimum score</label>
                <select
                  id="minScore"
                  value={minScore}
                  onChange={(event) => setMinScore(Number(event.target.value))}
                >
                  <option value={0}>Show all</option>
                  <option value={40}>40+</option>
                  <option value={60}>60+</option>
                  <option value={80}>80+</option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="resultFilter">Results filter</label>
                <select
                  id="resultFilter"
                  value={resultFilter}
                  onChange={(event) => setResultFilter(event.target.value as ResultFilter)}
                >
                  <option value="all">Show All</option>
                  <option value="no_photo">No Photos</option>
                  <option value="no_website">No Website</option>
                  <option value="no_phone">No Phone</option>
                </select>
              </div>

              <button className="primary-btn" type="submit" disabled={loading}>
                {loading ? "Searching..." : "Search Google Places"}
              </button>
            </form>

            {error ? <div className="error">{error}</div> : null}
            {searchWarnings.length > 0 ? (
              <div className="warning-list">
                {searchWarnings.map((warning) => (
                  <div className="warning-item" key={warning}>
                    {warning}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="notice">
              Statewide search runs one text query per configured city, deduplicates by Google Place ID, and returns partial results if one city fails.
            </div>
          </div>

          <div className="card panel" style={{ marginTop: 16 }}>
            <div className="actions" style={{ justifyContent: "space-between" }}>
              <h2 className="card-title" style={{ margin: 0 }}>
                Saved Leads
              </h2>
              <button
                className="danger-btn"
                type="button"
                disabled={saved.length === 0}
                onClick={() => setSaved([])}
              >
                Clear
              </button>
            </div>

            {saved.length === 0 ? (
              <div className="empty">No saved leads yet.</div>
            ) : (
              <div>
                {saved.slice(0, 12).map((lead) => (
                  <div className="saved-row" key={lead.googlePlaceId}>
                    <div>
                      <div className="saved-name">{lead.businessName}</div>
                      <div className="saved-meta">
                        {lead.sourceCity}, {lead.sourceState} · {lead.opportunityScore}/100
                      </div>
                    </div>
                    <button
                      className="small-btn"
                      type="button"
                      onClick={() => removeSavedLead(lead.googlePlaceId)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        <section>
          <div className="status-bar">
            <div className="stat">
              <div className="stat-value">{results.length}</div>
              <div className="stat-label">Results</div>
            </div>
            <div className="stat">
              <div className="stat-value">{stats.high}</div>
              <div className="stat-label">High Probability</div>
            </div>
            <div className="stat">
              <div className="stat-value">{stats.noPhoto}</div>
              <div className="stat-label">Missing Photos</div>
            </div>
            <div className="stat">
              <div className="stat-value">{stats.noPhone}</div>
              <div className="stat-label">Missing Phones</div>
            </div>
            <div className="stat">
              <div className="stat-value">{stats.noWebsite}</div>
              <div className="stat-label">No Website</div>
            </div>
          </div>

          <div className="card">
            <div className="results-header">
              <div>
                <h2 className="results-title">Results</h2>
                <div className="query-label">
                  {query || "Run a search to populate results."}
                  {queryCount > 0 ? ` (${queryCount} queries, ${results.length} unique results)` : ""}
                </div>
              </div>
            </div>

            {filteredResults.length === 0 ? (
              <div className="empty">
                {results.length === 0 ? "No results loaded." : "No results match the selected filter."}
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Business Name</th>
                      <th>City</th>
                      <th>Phone</th>
                      <th>Website</th>
                      <th>Has Photos</th>
                      <th>First Photo Link</th>
                      <th>Rating</th>
                      <th>Review Count</th>
                      <th>Opportunity Score</th>
                      <th>Status</th>
                      <th>Google Maps Link</th>
                      <th>Save Lead</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResults.map((lead) => (
                      <tr key={lead.googlePlaceId}>
                        <td>
                          <div className="business-name">{lead.businessName}</div>
                          <div className="muted">{lead.address}</div>
                          <div className="muted">Query: {lead.sourceQuery}</div>
                        </td>
                        <td>{lead.sourceCity || lead.city}</td>
                        <td>{lead.hasPhone ? lead.phone : <span className="badge likely">Missing</span>}</td>
                        <td>
                          {lead.website ? (
                            <a href={lead.website} target="_blank" rel="noreferrer">
                              Website
                            </a>
                          ) : (
                            <span className="badge likely">Missing</span>
                          )}
                        </td>
                        <td>{lead.hasPhoto ? "Yes" : "No"}</td>
                        <td>
                          {lead.firstPhotoName ? (
                            <button
                              className="small-btn"
                              type="button"
                              onClick={() => openFirstPhoto(lead)}
                              disabled={photoLoadingId === lead.googlePlaceId}
                            >
                              {photoLoadingId === lead.googlePlaceId ? "Loading..." : "Open Photo"}
                            </button>
                          ) : (
                            <span className="muted">N/A</span>
                          )}
                        </td>
                        <td>{lead.rating ?? "N/A"}</td>
                        <td>{lead.reviewCount}</td>
                        <td>{lead.opportunityScore}</td>
                        <td>
                          <span className={statusClass(lead.status)}>{statusLabel(lead.status)}</span>
                        </td>
                        <td>
                          {lead.googleMapsUrl ? (
                            <a href={lead.googleMapsUrl} target="_blank" rel="noreferrer">
                              Google Maps
                            </a>
                          ) : (
                            <span className="muted">N/A</span>
                          )}
                        </td>
                        <td>
                          <button
                            className="small-btn"
                            type="button"
                            onClick={() => saveLead(lead)}
                            disabled={savedIds.has(lead.googlePlaceId)}
                          >
                            {savedIds.has(lead.googlePlaceId) ? "Saved" : "Save Lead"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
