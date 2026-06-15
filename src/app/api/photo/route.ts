import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing GOOGLE_MAPS_API_KEY." },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name")?.trim();
  const maxWidthPx = searchParams.get("maxWidthPx") ?? "800";

  if (!name || !name.startsWith("places/") || !name.includes("/photos/")) {
    return NextResponse.json({ error: "Invalid or missing photo resource name." }, { status: 400 });
  }

  const url = new URL(`https://places.googleapis.com/v1/${name}/media`);
  url.searchParams.set("maxWidthPx", maxWidthPx);
  url.searchParams.set("skipHttpRedirect", "true");
  url.searchParams.set("key", apiKey);

  try {
    const response = await fetch(url.toString(), { cache: "no-store" });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message =
        typeof data?.error?.message === "string"
          ? data.error.message
          : `Google Place Photo API returned HTTP ${response.status}`;
      return NextResponse.json({ error: message }, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown photo error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
