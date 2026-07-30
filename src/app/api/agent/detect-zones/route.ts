import { NextRequest, NextResponse } from "next/server";
import { detectTemplateZones } from "@/lib/claude";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageDataUrl, styleGuide } = body as {
      imageDataUrl?: string;
      styleGuide?: string;
    };

    if (!imageDataUrl) {
      return NextResponse.json({ error: "imageDataUrl is required." }, { status: 400 });
    }

    const zones = await detectTemplateZones({ imageDataUrl, styleGuide });
    return NextResponse.json({ zones });
  } catch (err) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
