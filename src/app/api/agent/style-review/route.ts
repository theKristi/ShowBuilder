import { NextRequest, NextResponse } from "next/server";
import { analyzeStyleGuideForSamples, ZoneMap } from "@/lib/claude";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      styleGuide,
      styleGuideImageDataUrl,
      styleGuideImageDataUrls,
      templateSlideImageDataUrls,
      presentationTitle,
      zoneMap,
    } = body as {
      styleGuide?: string;
      styleGuideImageDataUrl?: string;
      styleGuideImageDataUrls?: string[];
      templateSlideImageDataUrls?: string[];
      presentationTitle: string;
      zoneMap?: ZoneMap;
    };

    if (!presentationTitle?.trim()) {
      return NextResponse.json({ error: "Presentation title is required." }, { status: 400 });
    }

    const result = await analyzeStyleGuideForSamples({
      styleGuide: styleGuide ?? "",
      styleGuideImageDataUrl,
      styleGuideImageDataUrls,
      templateSlideImageDataUrls,
      presentationTitle,
      zoneMap,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
