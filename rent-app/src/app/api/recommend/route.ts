import { NextResponse } from "next/server";
import { explain } from "@/lib/explain";
import { InputError, recommend, validateInput } from "@/lib/recommend";
import { sources } from "@/lib/sources";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  try {
    const input = validateInput(body, sources);
    const result = recommend(input, sources);
    return NextResponse.json({ ...result, explanation: explain(result) });
  } catch (e) {
    if (e instanceof InputError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}

export async function GET() {
  return NextResponse.json({
    destinations: sources.travel.destinations.map(({ id, name }) => ({ id, name })),
    departureWindow: sources.travel.source.departureWindow,
  });
}
