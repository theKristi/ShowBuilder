import { NextRequest, NextResponse } from "next/server";
import { generateSlides } from "@/lib/openai";
import { generateProPresenterXML } from "@/lib/propresenter";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { styleGuide, presentationNotes, presentationTitle, options } = body as {
      styleGuide: string;
      presentationNotes: string;
      presentationTitle: string;
      options?: {
        backgroundColor?: string;
        textColor?: string;
        fontName?: string;
        titleFontSize?: number;
        bodyFontSize?: number;
        width?: number;
        height?: number;
        author?: string;
      };
    };

    if (!presentationNotes || presentationNotes.trim().length === 0) {
      return NextResponse.json(
        { error: "Presentation notes are required." },
        { status: 400 }
      );
    }

    if (!presentationTitle || presentationTitle.trim().length === 0) {
      return NextResponse.json(
        { error: "Presentation title is required." },
        { status: 400 }
      );
    }

    const slides = await generateSlides({
      styleGuide: styleGuide ?? "",
      presentationNotes,
      presentationTitle,
    });

    const proXML = generateProPresenterXML(slides, {
      title: presentationTitle,
      author: options?.author ?? "",
      backgroundColor: options?.backgroundColor ?? "0 0 0 1",
      textColor: options?.textColor ?? "1 1 1 1",
      fontName: options?.fontName ?? "Arial",
      titleFontSize: options?.titleFontSize ?? 60,
      bodyFontSize: options?.bodyFontSize ?? 40,
      width: options?.width ?? 1920,
      height: options?.height ?? 1080,
    });

    return NextResponse.json({ slides, proXML });
  } catch (err) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    const status = message.includes("OPENAI_API_KEY") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
