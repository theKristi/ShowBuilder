import { NextRequest, NextResponse } from "next/server";
import { analyzeNotesForClarification } from "@/lib/claude";
import { parsePresentationNotesFile } from "@/lib/document-parser";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { presentationNotes, presentationNotesFileDataUrl, presentationTitle, styleSummary } =
      body as {
        presentationNotes?: string;
        presentationNotesFileDataUrl?: string;
        presentationTitle: string;
        styleSummary?: string;
      };

    let resolvedNotes = presentationNotes ?? "";
    if (presentationNotesFileDataUrl) {
      const parsed = await parsePresentationNotesFile(presentationNotesFileDataUrl);
      resolvedNotes = resolvedNotes.trim()
        ? `${resolvedNotes}\n\n${parsed.notesText}`
        : parsed.notesText;
    }

    if (!resolvedNotes.trim()) {
      return NextResponse.json(
        { error: "Presentation notes are required." },
        { status: 400 }
      );
    }

    const result = await analyzeNotesForClarification({
      presentationNotes: resolvedNotes,
      presentationTitle,
      styleSummary,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
