"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Lead } from "@/lib/types";

type SearchResponse = {
  query: string;
  count: number;
  leads: Lead[];
  error?: string;
};

type PhotoResponse = {
  name?: string;
  photoUri?: string;
  error?: string;
};

const STORAGE_KEY = "GMB_SCOUT.saved-leads.v1";

function statusLabel(status: Lead["status"]): string {
  switch (status) {
    case "high_probability_unmanaged":
      return "High Probability";
    case "likely_unmanaged":
      return "Likely Unmanaged";
    case "has_photo":
      return "Has Photo";
    case "closed":
      return "Closed";
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
  const phone = lead.phone?.trim() ?? "";
  const hasPhone = typeof lead.hasPhone === "boolean" ? lead.hasPhone : Boolean(phone);
  const noPhone = typeof lead.noPhone === "boolean" ? lead.noPhone : !hasPhone;
  return { ...lead, phone, hasPhone, noPhone };
}

function exportCsv(leads: Lead[], filename: string) {
  const headers = [
    "business_name",
    "niche",
    "city",
    "state",
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
    const lead = normalizeLead(rawLead);
    return [
      lead.businessName,
      lead.niche,
      lead.city,
      lead.state,
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

  const csv = [headers, ...rows]
    .map((row) => row.map(toCsvValue).join(","))
    .join("\n");

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
  const [niche, setNiche] = useState("home remodelers");
  const [city, setCity] = useState("Myrtle Beach");
  const [state, setState] = useState("SC");
  const [pageSize, setPageSize] = useState(20);
  const [maxPages, setMaxPages] = useState(1);
  const [minScore, setMinScore] = useState(0);
  const [onlyNoPhoto, setOnlyNoPhoto] = useState(false);
  const [onlyNoPhone, setOnlyNoPhone] = useState(false);

  const [results, setResults] = useState<Lead[]>([]);
  const [saved, setSaved] = useState<Lead[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [photoLoadingId, setPhotoLoadingId] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Lead[];
      if (Array.isArray(parsed)) setSaved(parsed.map(normalizeLead));
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
    return { high, noPhoto, noPhone, noWebsite, saved: saved.length };
  }, [results, saved.length]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResults([]);
    setQuery("");

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche,
          city,
          state,
          pageSize,
          maxPages,
          minScore,
          onlyNoPhoto,
          onlyNoPhone
        })
      });

      const data = (await response.json()) as SearchResponse;

      if (!response.ok || data.error) {
        throw new Error(data.error || "Search failed.");
      }

      setQuery(data.query);
      setResults(data.leads);
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
      return [lead, ...current];
    });
  }

  function saveHighProbability() {
    const highLeads = results.filter((lead) =>
      lead.status === "high_probability_unmanaged" || lead.status === "likely_unmanaged"
    );

    setSaved((current) => {
      const existingIds = new Set(current.map((lead) => lead.googlePlaceId));
      const additions = highLeads.filter((lead) => !existingIds.has(lead.googlePlaceId));
      return [...additions, ...current];
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
            Search Google Maps Places by niche and city, score listings by missing photo, no website, low reviews, and phone availability, then save/export the best leads.
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
                <div className="field">
                  <label htmlFor="state">State</label>
                  <input
                    id="state"
                    value={state}
                    onChange={(event) => setState(event.target.value)}
                    placeholder="SC"
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

              <label className="check-row">
                <input
                  type="checkbox"
                  checked={onlyNoPhoto}
                  onChange={(event) => setOnlyNoPhoto(event.target.checked)}
                />
                Only show listings missing photos
              </label>

              <label className="check-row">
                <input
                  type="checkbox"
                  checked={onlyNoPhone}
                  onChange={(event) => setOnlyNoPhone(event.target.checked)}
                />
                Only show listings missing phone numbers
              </label>

              <button className="primary-btn" type="submit" disabled={loading}>
                {loading ? "Searching..." : "Search Google Places"}
              </button>
            </form>

            {error ? <div className="error">{error}</div> : null}

            <div className="notice">
              Missing photos are treated as a high-probability signal, not a confirmed ownership/claim-status signal.
            </div>
          </div>

          <div className="card panel" style={{ marginTop: 16 }}>
            <div className="actions" style={{ justifyContent: "space-between" }}>
              <h2 className="card-title" style={{ margin: 0 }}>Saved Leads</h2>
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
                        {lead.opportunityScore}/100 · {statusLabel(lead.status)}
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
                {saved.length > 12 ? (
                  <p className="footer-note">Showing latest 12 of {saved.length}. Export CSV for the full list.</p>
                ) : null}
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
                <div className="query-label">{query || "Run a niche + city search to populate results."}</div>
              </div>
              <div className="actions">
                <button
                  className="secondary-btn"
                  type="button"
                  disabled={results.length === 0}
                  onClick={saveHighProbability}
                >
                  Save No-Photo Leads
                </button>
              </div>
            </div>

            {results.length === 0 ? (
              <div className="empty">No results loaded.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Business</th>
                      <th>Score</th>
                      <th>Status</th>
                      <th>Photo</th>
                      <th>Website</th>
                      <th>Reviews</th>
                      <th>Phone</th>
                      <th>Reasons</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((lead) => (
                      <tr key={lead.googlePlaceId}>
                        <td>
                          <div className="business-name">{lead.businessName}</div>
                          <div className="muted">{lead.address}</div>
                          {lead.googleMapsUrl ? (
                            <div style={{ marginTop: 6 }}>
                              <a href={lead.googleMapsUrl} target="_blank" rel="noreferrer">Open Maps</a>
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <strong>{lead.opportunityScore}</strong>/100
                        </td>
                        <td>
                          <span className={statusClass(lead.status)}>{statusLabel(lead.status)}</span>
                        </td>
                        <td>
                          {lead.hasPhoto ? (
                            <button
                              className="small-btn"
                              type="button"
                              onClick={() => openFirstPhoto(lead)}
                              disabled={photoLoadingId === lead.googlePlaceId}
                            >
                              {photoLoadingId === lead.googlePlaceId ? "Loading..." : "View First Photo"}
                            </button>
                          ) : (
                            <span className="badge high">Missing</span>
                          )}
                          {lead.firstPhotoName ? (
                            <div className="muted" style={{ marginTop: 6, maxWidth: 180, overflowWrap: "anywhere" }}>
                              {lead.firstPhotoName}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          {lead.website ? (
                            <a href={lead.website} target="_blank" rel="noreferrer">Website</a>
                          ) : (
                            <span className="badge likely">None</span>
                          )}
                        </td>
                        <td>
                          <strong>{lead.reviewCount}</strong>
                          <div className="muted">Rating: {lead.rating ?? "N/A"}</div>
                        </td>
                        <td>
                          {lead.hasPhone ? lead.phone : <span className="badge likely">Missing</span>}
                        </td>
                        <td>
                          <ul className="reasons">
                            {lead.reasons.slice(0, 4).map((reason) => (
                              <li key={reason}>{reason}</li>
                            ))}
                          </ul>
                        </td>
                        <td>
                          <button
                            className="small-btn"
                            type="button"
                            onClick={() => saveLead(lead)}
                            disabled={savedIds.has(lead.googlePlaceId)}
                          >
                            {savedIds.has(lead.googlePlaceId) ? "Saved" : "Save"}
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
