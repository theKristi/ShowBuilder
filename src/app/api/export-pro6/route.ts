import { NextRequest, NextResponse } from "next/server";
import { generateProPresenterXML } from "@/lib/propresenter";

type ExportSlide = {
  title?: string;
  body?: string;
  notes?: string;
  layout?: {
    titleBox?: {
      x: number;
      y: number;
      width: number;
      height: number;
      align?: "left" | "center" | "right";
    };
    bodyBox?: {
      x: number;
      y: number;
      width: number;
      height: number;
      align?: "left" | "center" | "right";
    };
    textColor?: string;
    titleFontSize?: number;
    bodyFontSize?: number;
  };
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { presentationTitle, slides } = body as {
      presentationTitle?: string;
      slides?: ExportSlide[];
    };

    const safeTitle = (presentationTitle ?? "").trim();
    if (!safeTitle) {
      return NextResponse.json({ error: "Presentation title is required." }, { status: 400 });
    }

    if (!Array.isArray(slides) || slides.length === 0) {
      return NextResponse.json({ error: "At least one slide is required." }, { status: 400 });
    }

    const normalizedSlides = slides.map((slide) => ({
      title: (slide.title ?? "").trim(),
      body: (slide.body ?? "").trim(),
      notes: slide.notes,
      layout: slide.layout,
    }));

    const xml = generateProPresenterXML(normalizedSlides, {
      title: safeTitle,
      category: "Presentation",
      author: "ShowBuilder",
    });

    const safeFileName = safeTitle.replace(/[^a-z0-9_\-]/gi, "_");

    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeFileName || "presentation"}.pro6"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to export ProPresenter file.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
