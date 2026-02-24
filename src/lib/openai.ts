import OpenAI from "openai";

let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY environment variable is not set. Please add it to your .env.local file."
      );
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}

export interface GeneratedSlide {
  title: string;
  body: string;
  notes?: string;
}

export interface GenerateRequest {
  styleGuide: string;
  presentationNotes: string;
  presentationTitle: string;
}

const SYSTEM_PROMPT = `You are an expert presentation designer for ProPresenter, a live presentation software used in churches and live events.

Your task is to take the user's style guide and presentation notes and create a structured set of slides.

Rules:
- Create clear, concise slides with a title and body text
- Follow the style guide instructions carefully
- Keep slide content brief — each slide should be easily readable at a glance
- Use simple, direct language appropriate for on-screen projection
- Aim for 5–15 slides unless the style guide or content requires otherwise
- Each slide title should be short (1–5 words)
- Each slide body should be 1–3 short lines or bullet points

Respond ONLY with valid JSON in this exact format, with no additional text or markdown:
{
  "slides": [
    {
      "title": "Slide Title",
      "body": "Slide body text.\nSecond line if needed.",
      "notes": "Optional presenter notes for this slide."
    }
  ]
}`;

export async function generateSlides(req: GenerateRequest): Promise<GeneratedSlide[]> {
  const openai = getOpenAIClient();

  const userMessage = `Presentation Title: ${req.presentationTitle}

Style Guide:
${req.styleGuide}

Presentation Notes / Content:
${req.presentationNotes}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    temperature: 0.7,
    max_tokens: 4096,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response received from OpenAI.");
  }

  const parsed = JSON.parse(content) as { slides: GeneratedSlide[] };
  if (!Array.isArray(parsed.slides)) {
    throw new Error("Unexpected response format from AI.");
  }

  return parsed.slides;
}
