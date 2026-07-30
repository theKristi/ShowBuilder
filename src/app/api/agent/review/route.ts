import { NextRequest, NextResponse } from "next/server";
import { reviewGeneratedSlides, GeneratedSlide } from "@/lib/claude";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { slides, styleGuide, presentationTitle } = body as {
      slides: GeneratedSlide[];
      styleGuide?: string;
      presentationTitle: string;
    };

    const result = await reviewGeneratedSlides({
      slides,
      styleGuide: styleGuide ?? "",
      presentationTitle,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
