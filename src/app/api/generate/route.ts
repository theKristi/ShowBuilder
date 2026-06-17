import { NextRequest, NextResponse } from "next/server";
import { extractStyleGuideTextFromImage, generateSlides, ZoneMap } from "@/lib/claude";
import { parsePresentationNotesFile } from "@/lib/document-parser";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      styleGuide,
      styleGuideImageDataUrl,
      templateSlideImageDataUrls,
      presentationNotes,
      presentationNotesFileDataUrl,
      presentationTitle,
      zoneMap,
    } = body as {
      styleGuide: string;
      styleGuideImageDataUrl?: string;
      templateSlideImageDataUrls?: string[];
      presentationNotes: string;
      presentationNotesFileDataUrl?: string;
      presentationTitle: string;
      zoneMap?: ZoneMap;
    };

    const resolvedTemplateSlideImages = (templateSlideImageDataUrls ?? []).filter((url) =>
      /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(url)
    );

    let resolvedStyleGuide = styleGuide ?? "";
    if (styleGuideImageDataUrl) {
      const imageStyleGuideText = await extractStyleGuideTextFromImage(styleGuideImageDataUrl);
      resolvedStyleGuide = resolvedStyleGuide.trim()
        ? `${resolvedStyleGuide}\n\n${imageStyleGuideText}`
        : imageStyleGuideText;
    }

    let resolvedPresentationNotes = presentationNotes ?? "";
    if (presentationNotesFileDataUrl) {
      const parsedNotes = await parsePresentationNotesFile(presentationNotesFileDataUrl);
      resolvedPresentationNotes = resolvedPresentationNotes.trim()
        ? `${resolvedPresentationNotes}\n\n${parsedNotes.notesText}`
        : parsedNotes.notesText;
    }

    if (!resolvedPresentationNotes || resolvedPresentationNotes.trim().length === 0) {
      return NextResponse.json(
        { error: "Presentation notes are required. Provide text notes or upload a PDF/DOCX." },
        { status: 400 }
      );
    }

    if (!presentationTitle || presentationTitle.trim().length === 0) {
      return NextResponse.json(
        { error: "Presentation title is required." },
        { status: 400 }
      );
    }

    const { slides, fallbackTypes } = await generateSlides({
      styleGuide: resolvedStyleGuide,
      presentationNotes: resolvedPresentationNotes,
      presentationTitle,
      templateSlideImageDataUrls: resolvedTemplateSlideImages,
      zoneMap,
    });

    return NextResponse.json({ slides, fallbackTypes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    const status = message.includes("ANTHROPIC_API_KEY") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
