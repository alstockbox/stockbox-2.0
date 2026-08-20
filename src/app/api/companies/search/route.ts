import { z } from "zod";
import { captureServerEvent } from "@/lib/analytics/events";
import { searchCompanies } from "@/lib/data/provider";

const querySchema = z.string().trim().min(1).max(80);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = querySchema.safeParse(url.searchParams.get("q"));

  if (!query.success) {
    return Response.json({ error: "A search query is required." }, { status: 422 });
  }

  const companies = await searchCompanies(query.data);
  captureServerEvent("company_searched", { query: query.data, resultCount: companies.length });

  return Response.json({ companies });
}
