import { NextRequest, NextResponse } from "next/server";
import {
  chatInStyleReview,
  chatInNotesClarification,
  AgentChatMessage,
  GeneratedSlide,
  ZoneMap,
} from "@/lib/claude";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phase, messages, context } = body as {
      phase: "style_review" | "notes_clarification";
      messages: AgentChatMessage[];
      context: {
        styleGuide?: string;
        presentationTitle?: string;
        currentSampleSlides?: GeneratedSlide[];
        presentationNotes?: string;
        zoneMap?: ZoneMap;
      };
    };

    if (phase === "style_review") {
      const result = await chatInStyleReview(messages, {
        styleGuide: context.styleGuide ?? "",
        presentationTitle: context.presentationTitle ?? "",
        currentSampleSlides: context.currentSampleSlides ?? [],
        zoneMap: context.zoneMap,
      });
      return NextResponse.json(result);
    }

    if (phase === "notes_clarification") {
      const result = await chatInNotesClarification(messages, {
        presentationTitle: context.presentationTitle ?? "",
      });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Invalid phase." }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
