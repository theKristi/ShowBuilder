"use client";

import { useState, useRef, ChangeEvent } from "react";

interface Slide {
  title: string;
  body: string;
  notes?: string;
}

interface GenerateResponse {
  slides?: Slide[];
  proXML?: string;
  error?: string;
}

export default function Home() {
  const [presentationTitle, setPresentationTitle] = useState("");
  const [styleGuide, setStyleGuide] = useState("");
  const [presentationNotes, setPresentationNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slides, setSlides] = useState<Slide[] | null>(null);
  const [proXML, setProXML] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setStyleGuide((ev.target?.result as string) ?? "");
    };
    reader.readAsText(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSlides(null);
    setProXML(null);
    setLoading(true);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presentationTitle, styleGuide, presentationNotes }),
      });
      const data: GenerateResponse = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? "Failed to generate slides.");
      } else {
        setSlides(data.slides ?? []);
        setProXML(data.proXML ?? null);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function downloadProFile() {
    if (!proXML) return;
    const blob = new Blob([proXML], { type: "text/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeName = (presentationTitle || "presentation").replace(/[^a-z0-9_\-]/gi, "_");
    a.download = `${safeName}.pro6`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      <header className="border-b border-white/10 px-6 py-4">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            🎬 ShowBuilder
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            AI-powered slide builder for ProPresenter
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Presentation Title */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-200">
              Presentation Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={presentationTitle}
              onChange={(e) => setPresentationTitle(e.target.value)}
              required
              placeholder="e.g. Sunday Service – Week 1"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-slate-500 outline-none ring-0 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
            />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Style Guide */}
            <div className="flex flex-col">
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-sm font-medium text-slate-200">
                  Style Guide
                  <span className="ml-1.5 text-xs text-slate-500">(optional)</span>
                </label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:bg-white/20"
                >
                  Upload file
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.json"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </div>
              <textarea
                value={styleGuide}
                onChange={(e) => setStyleGuide(e.target.value)}
                placeholder={`Describe how slides should look and be structured.\n\nExample:\n- Dark background, white text\n- Title in bold, 60pt\n- Keep each slide to 3 lines max\n- Use a professional, concise tone`}
                rows={10}
                className="flex-1 resize-none rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
              />
            </div>

            {/* Presentation Notes */}
            <div className="flex flex-col">
              <label className="mb-1.5 block text-sm font-medium text-slate-200">
                Presentation Notes / Content{" "}
                <span className="text-red-400">*</span>
              </label>
              <textarea
                value={presentationNotes}
                onChange={(e) => setPresentationNotes(e.target.value)}
                required
                placeholder={`Paste or type your content here.\n\nExample:\n- Welcome and announcements\n- Scripture: John 3:16\n- Main message: God's love and grace\n- Three points: Faith, Hope, Love\n- Closing prayer and benediction`}
                rows={10}
                className="flex-1 resize-none rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
              />
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={loading || !presentationTitle.trim() || !presentationNotes.trim()}
              className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Generating slides…" : "Generate Slides"}
            </button>
            {slides && proXML && (
              <button
                type="button"
                onClick={downloadProFile}
                className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-6 py-2.5 text-sm font-semibold text-blue-300 transition hover:bg-blue-500/20"
              >
                ⬇ Download .pro6 File
              </button>
            )}
          </div>
        </form>

        {/* Error */}
        {error && (
          <div className="mt-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Slide Preview */}
        {slides && slides.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-4 text-lg font-semibold text-white">
              Preview — {slides.length} slide{slides.length !== 1 ? "s" : ""} generated
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {slides.map((slide, i) => (
                <SlideCard key={i} slide={slide} index={i} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function SlideCard({ slide, index }: { slide: Slide; index: number }) {
  const [showNotes, setShowNotes] = useState(false);
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-black shadow-lg">
      {/* Slide preview (16:9 aspect) */}
      <div
        className="relative flex flex-col items-start justify-start bg-black p-4"
        style={{ aspectRatio: "16/9" }}
      >
        <span className="mb-2 text-[10px] font-medium text-slate-600">
          {index + 1}
        </span>
        {slide.title && (
          <p className="text-base font-bold leading-snug text-white">{slide.title}</p>
        )}
        {slide.body && (
          <p className="mt-1.5 text-xs leading-relaxed text-slate-300 whitespace-pre-line">
            {slide.body}
          </p>
        )}
      </div>
      {/* Presenter notes toggle */}
      {slide.notes && (
        <div className="border-t border-white/10 bg-slate-900/60 px-3 py-2">
          <button
            onClick={() => setShowNotes((v) => !v)}
            className="text-xs text-slate-500 hover:text-slate-300"
          >
            {showNotes ? "Hide notes ▲" : "Show notes ▼"}
          </button>
          {showNotes && (
            <p className="mt-1.5 text-xs text-slate-400 whitespace-pre-line">{slide.notes}</p>
          )}
        </div>
      )}
    </div>
  );
}

