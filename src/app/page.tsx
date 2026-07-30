"use client";

import Image from "next/image";
import { useEffect, useState, useRef, ChangeEvent } from "react";

type BoxAlign = "left" | "center" | "right";

interface LayoutBox {
  x: number;
  y: number;
  width: number;
  height: number;
  align?: BoxAlign;
}

interface SlideLayout {
  titleBox?: LayoutBox;
  bodyBox?: LayoutBox;
  textColor?: string;
  titleFontSize?: number;
  bodyFontSize?: number;
}

interface ResolvedSlideLayout {
  titleBox: LayoutBox & { align: BoxAlign };
  bodyBox: LayoutBox & { align: BoxAlign };
  textColor: string;
  titleFontSize: number;
  bodyFontSize: number;
}

type SlideBoxKey = "titleBox" | "bodyBox";

interface ZoneBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

type TemplateZones = {
  title?: ZoneBox;
  body?: ZoneBox;
};

type ZoneMap = Record<number, TemplateZones>;

interface Slide {
  title: string;
  body: string;
  notes?: string;
  slideType?: "point" | "scripture" | "other";
  showTitle?: boolean;
  showBody?: boolean;
  layout?: SlideLayout;
}

interface GenerateResponse {
  slides?: Slide[];
  error?: string;
  fallbackTypes?: string[];
}

type WorkflowPhase = "idle" | "style_review" | "notes_clarification" | "generating" | "complete";

interface ChatMessage {
  role: "user" | "agent";
  content: string;
}

function resolveTemplateIndexForSlide(slide: Slide, templateCount: number): number {
  if (templateCount === 0) return -1;
  if (slide.slideType === "scripture" && templateCount > 1) return 1;
  return 0;
}

function resolveTemplateForSlide(slide: Slide, templateDataUrls: string[]): string | null {
  const index = resolveTemplateIndexForSlide(slide, templateDataUrls.length);
  return index >= 0 ? templateDataUrls[index] ?? null : null;
}

function toPx(percent: number, full: number): number {
  return Math.round((percent / 100) * full);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundPercent(value: number): number {
  return Math.round(value * 10) / 10;
}

function normalizeBox(box: LayoutBox | undefined, defaults: LayoutBox): Required<LayoutBox> {
  const width = roundPercent(clamp(box?.width ?? defaults.width, 5, 100));
  const height = roundPercent(clamp(box?.height ?? defaults.height, 5, 100));
  const x = roundPercent(clamp(box?.x ?? defaults.x, 0, 100 - width));
  const y = roundPercent(clamp(box?.y ?? defaults.y, 0, 100 - height));

  return {
    x,
    y,
    width,
    height,
    align: box?.align ?? defaults.align ?? "left",
  };
}

function buildEditableLayout(layout?: SlideLayout): ResolvedSlideLayout {
  const defaultTitle = { x: 10, y: 10, width: 80, height: 14, align: "left" as const };
  const defaultBody = { x: 10, y: 28, width: 80, height: 54, align: "left" as const };

  return {
    titleBox: normalizeBox(layout?.titleBox, defaultTitle),
    bodyBox: normalizeBox(layout?.bodyBox, defaultBody),
    textColor: layout?.textColor ?? "#FFFFFF",
    titleFontSize: clamp(layout?.titleFontSize ?? 60, 18, 180),
    bodyFontSize: clamp(layout?.bodyFontSize ?? 40, 18, 180),
  };
}


function getSlideLayout(slide: Slide): ResolvedSlideLayout {
  return buildEditableLayout(slide.layout);
}

function getTemplateRoleLabel(index: number): string {
  if (index === 0) return "Point template";
  if (index === 1) return "Scripture template";
  return `Additional template ${index + 1}`;
}

function hasSlideText(slide: Slide, field: "title" | "body"): boolean {
  return slide[field].trim().length > 0;
}

function isSlideTextVisible(slide: Slide, field: "title" | "body"): boolean {
  if (!hasSlideText(slide, field)) return false;
  return field === "title" ? slide.showTitle !== false : slide.showBody !== false;
}

export default function Home() {
  const [presentationTitle, setPresentationTitle] = useState("");
  const [agentInstructions, setAgentInstructions] = useState("");
  const [styleGuideImageDataUrl, setStyleGuideImageDataUrl] = useState<string | null>(null);
  const [styleGuideImageDataUrls, setStyleGuideImageDataUrls] = useState<string[]>([]);
  const [styleGuideFileName, setStyleGuideFileName] = useState<string | null>(null);
  const [styleGuideFileType, setStyleGuideFileType] = useState<"text" | "image" | "pdf" | null>(null);
  const [templateSlideImageDataUrls, setTemplateSlideImageDataUrls] = useState<string[]>([]);
  const [templateSlideFileNames, setTemplateSlideFileNames] = useState<string[]>([]);
  const [presentationNotes, setPresentationNotes] = useState("");
  const [presentationNotesFileDataUrl, setPresentationNotesFileDataUrl] = useState<string | null>(null);
  const [presentationNotesFileName, setPresentationNotesFileName] = useState<string | null>(null);
  const [zoneMap, setZoneMap] = useState<ZoneMap>({});
  const [detectingZoneIndexes, setDetectingZoneIndexes] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallbackWarning, setFallbackWarning] = useState<string | null>(null);
  const [slides, setSlides] = useState<Slide[] | null>(null);
  const [selectedSlideIndex, setSelectedSlideIndex] = useState(0);
  const [approvedSlides, setApprovedSlides] = useState<boolean[]>([]);
  const [downloading, setDownloading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const templateSlideInputRef = useRef<HTMLInputElement>(null);
  const notesFileInputRef = useRef<HTMLInputElement>(null);

  // Workflow dialogue state
  const [workflowPhase, setWorkflowPhase] = useState<WorkflowPhase>("idle");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [sampleSlides, setSampleSlides] = useState<Slide[] | null>(null);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);

  function readImageAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve((ev.target?.result as string) ?? "");
      reader.onerror = () => reject(new Error("Failed to read image file."));
      reader.readAsDataURL(file);
    });
  }

  async function renderPdfToImages(file: File): Promise<string[]> {
    const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
    GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs`;

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await getDocument({ data: arrayBuffer }).promise;
    const pageCount = Math.min(pdf.numPages, 8);
    const dataUrls: string[] = [];

    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      dataUrls.push(canvas.toDataURL("image/jpeg", 0.85));
    }

    return dataUrls;
  }

  function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setStyleGuideFileName(file.name);

    if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
      setStyleGuideFileType("pdf");
      setStyleGuideImageDataUrl(null);
      setStyleGuideImageDataUrls([]);
      renderPdfToImages(file).then((dataUrls) => {
        setStyleGuideImageDataUrls(dataUrls);
      }).catch(() => {
        setError("Failed to render PDF style guide. Try uploading as an image or text file.");
      });
      return;
    }

    const reader = new FileReader();

    if (file.type.startsWith("image/")) {
      reader.onload = (ev) => {
        setStyleGuideImageDataUrl((ev.target?.result as string) ?? null);
        setStyleGuideImageDataUrls([]);
        setStyleGuideFileType("image");
      };
      reader.readAsDataURL(file);
      return;
    }

    reader.onload = (ev) => {
      setAgentInstructions((ev.target?.result as string) ?? "");
      setStyleGuideImageDataUrl(null);
      setStyleGuideImageDataUrls([]);
      setStyleGuideFileType("text");
    };
    reader.readAsText(file);
  }

  async function handleTemplateSlidesUpload(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const pngFiles = files.filter(
      (file) => file.type === "image/png" || /\.png$/i.test(file.name)
    );

    if (pngFiles.length === 0) {
      setError("Template slides must be PNG files.");
      return;
    }

    try {
      const dataUrls = await Promise.all(pngFiles.map(readImageAsDataUrl));
      setTemplateSlideImageDataUrls(dataUrls);
      setTemplateSlideFileNames(pngFiles.map((file) => file.name));
      setZoneMap({});
      setError(null);
      detectZonesForTemplates(dataUrls);
    } catch {
      setError("Failed to load template slide images.");
    }
  }

  async function detectZonesForTemplates(dataUrls: string[]) {
    setDetectingZoneIndexes(new Set(dataUrls.map((_, index) => index)));

    await Promise.all(
      dataUrls.map(async (dataUrl, index) => {
        try {
          const res = await fetch("/api/agent/detect-zones", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageDataUrl: dataUrl, styleGuide: agentInstructions }),
          });
          const data = (await res.json()) as { zones?: TemplateZones; error?: string };
          if (res.ok && data.zones) {
            setZoneMap((prev) => (prev[index] ? prev : { ...prev, [index]: data.zones! }));
          }
        } catch {
          // Detection failed silently — user can still draw zones manually.
        } finally {
          setDetectingZoneIndexes((prev) => {
            const next = new Set(prev);
            next.delete(index);
            return next;
          });
        }
      })
    );
  }

  function handleRemoveTemplateSlide(indexToRemove: number) {
    setTemplateSlideImageDataUrls((prev) => prev.filter((_, index) => index !== indexToRemove));
    setTemplateSlideFileNames((prev) => prev.filter((_, index) => index !== indexToRemove));
    setZoneMap((prev) => {
      const next: ZoneMap = {};
      Object.entries(prev).forEach(([key, value]) => {
        const idx = Number(key);
        if (idx === indexToRemove) return;
        next[idx > indexToRemove ? idx - 1 : idx] = value;
      });
      return next;
    });
    setError(null);
  }

  function handleClearTemplateSlides() {
    setTemplateSlideImageDataUrls([]);
    setTemplateSlideFileNames([]);
    setZoneMap({});
    if (templateSlideInputRef.current) {
      templateSlideInputRef.current.value = "";
    }
    setError(null);
  }

  function handleNotesFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    const isDocx =
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      /\.docx$/i.test(file.name);

    if (!isPdf && !isDocx) {
      setError("Notes file must be a PDF or DOCX.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      setPresentationNotesFileDataUrl((ev.target?.result as string) ?? null);
      setPresentationNotesFileName(file.name);
      setError(null);
    };
    reader.onerror = () => {
      setError("Failed to read uploaded notes file.");
    };
    reader.readAsDataURL(file);
  }

  // ── Workflow handlers ──

  async function handleBeginWorkflow(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSlides(null);
    setReviewMessage(null);
    setChatMessages([]);
    setSampleSlides(null);
    setWorkflowPhase("style_review");
    setChatLoading(true);

    try {
      const res = await fetch("/api/agent/style-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          styleGuide: agentInstructions,
          styleGuideImageDataUrl,
          styleGuideImageDataUrls,
          templateSlideImageDataUrls,
          presentationTitle,
          zoneMap,
        }),
      });
      const data = await res.json() as { message?: string; sampleSlides?: Slide[]; error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? "Failed to analyze style guide.");
        setWorkflowPhase("idle");
        return;
      }
      const samples = (data.sampleSlides ?? []).map((s) => ({
        ...s,
        showTitle: (s.title ?? "").trim().length > 0,
        showBody: (s.body ?? "").trim().length > 0,
        layout: buildEditableLayout(s.layout),
      }));
      setSampleSlides(samples.length > 0 ? samples : null);
      setChatMessages([{ role: "agent", content: data.message ?? "Here are your sample slides." }]);
    } catch {
      setError("Network error. Please try again.");
      setWorkflowPhase("idle");
    } finally {
      setChatLoading(false);
    }
  }

  async function handleChatSend() {
    const trimmed = chatInput.trim();
    if (!trimmed || chatLoading) return;

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const nextMessages = [...chatMessages, userMsg];
    setChatMessages(nextMessages);
    setChatInput("");
    setChatLoading(true);

    const phase = workflowPhase as "style_review" | "notes_clarification";

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase,
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
          context: {
            styleGuide: agentInstructions,
            presentationTitle,
            currentSampleSlides: sampleSlides ?? [],
            presentationNotes,
            zoneMap,
          },
        }),
      });
      const data = await res.json() as { message?: string; updatedSlides?: Slide[]; error?: string };
      if (!res.ok || data.error) {
        setChatMessages((prev) => [
          ...prev,
          { role: "agent", content: data.error ?? "Something went wrong." },
        ]);
        return;
      }
      if (data.updatedSlides && data.updatedSlides.length > 0) {
        const updated = data.updatedSlides.map((s) => ({
          ...s,
          showTitle: (s.title ?? "").trim().length > 0,
          showBody: (s.body ?? "").trim().length > 0,
          layout: buildEditableLayout(s.layout),
        }));
        setSampleSlides(updated);
      }
      setChatMessages((prev) => [
        ...prev,
        { role: "agent", content: data.message ?? "" },
      ]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "agent", content: "Network error. Please try again." },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  async function handleContinueToNotes() {
    setChatLoading(true);
    setWorkflowPhase("notes_clarification");

    const styleSummary = chatMessages
      .filter((m) => m.role === "agent")
      .map((m) => m.content)
      .join(" ");

    try {
      const res = await fetch("/api/agent/notes-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          presentationNotes,
          presentationNotesFileDataUrl,
          presentationTitle,
          styleSummary,
        }),
      });
      const data = await res.json() as { message?: string; error?: string };
      if (!res.ok || data.error) {
        setChatMessages((prev) => [
          ...prev,
          { role: "agent", content: data.error ?? "Failed to analyze notes." },
        ]);
        return;
      }
      setChatMessages((prev) => [
        ...prev,
        { role: "agent", content: data.message ?? "I've reviewed your notes. Ready to generate?" },
      ]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "agent", content: "Network error analyzing notes." },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  async function handleGenerateSlides() {
    setError(null);
    setFallbackWarning(null);
    setSlides(null);
    setReviewMessage(null);
    setWorkflowPhase("generating");
    setLoading(true);

    // Build additional instructions from notes clarification chat
    const phase2Messages = chatMessages.filter(
      (_, i) => {
        // Find first notes_clarification agent message index
        const firstNotesIdx = chatMessages.findIndex(
          (m, idx) => m.role === "agent" && idx > chatMessages.findIndex((m2) => m2.role === "agent")
        );
        return i >= firstNotesIdx;
      }
    );
    const dialogueSummary = phase2Messages.length > 0
      ? phase2Messages.map((m) => `${m.role === "agent" ? "Agent" : "User"}: ${m.content}`).join("\n")
      : "";

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          presentationTitle,
          styleGuide: dialogueSummary
            ? `${agentInstructions}\n\n--- Notes clarification ---\n${dialogueSummary}`
            : agentInstructions,
          styleGuideImageDataUrl,
          styleGuideImageDataUrls,
          templateSlideImageDataUrls,
          presentationNotes,
          presentationNotesFileDataUrl,
          zoneMap,
        }),
      });
      const data: GenerateResponse = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? "Failed to generate slides.");
        setWorkflowPhase("notes_clarification");
        return;
      }
      const nextSlides = (data.slides ?? []).map((slide) => ({
        ...slide,
        showTitle: hasSlideText(slide, "title"),
        showBody: hasSlideText(slide, "body"),
        layout: buildEditableLayout(slide.layout),
      }));
      setSlides(nextSlides);
      setSelectedSlideIndex(0);
      setApprovedSlides(nextSlides.map(() => false));
      if (data.fallbackTypes && data.fallbackTypes.length > 0) {
        setFallbackWarning(
          `No zones were defined for: ${data.fallbackTypes.join(", ")} slides. Default layout was used.`
        );
      }
      setWorkflowPhase("complete");

      // Kick off post-generation review
      triggerSlideReview(nextSlides);
    } catch {
      setError("Network error. Please try again.");
      setWorkflowPhase("notes_clarification");
    } finally {
      setLoading(false);
    }
  }

  async function triggerSlideReview(generatedSlides: Slide[]) {
    try {
      const res = await fetch("/api/agent/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slides: generatedSlides,
          styleGuide: agentInstructions,
          presentationTitle,
        }),
      });
      const data = await res.json() as { message?: string; error?: string };
      if (res.ok && data.message) {
        setReviewMessage(data.message);
      }
    } catch {
      // Review is non-critical — silently skip on error
    }
  }

  function resetWorkflow() {
    setWorkflowPhase("idle");
    setChatMessages([]);
    setChatInput("");
    setSampleSlides(null);
    setSlides(null);
    setReviewMessage(null);
    setError(null);
    setFallbackWarning(null);
  }

  // ── Existing download / slide handlers ──

  async function downloadPNGs() {
    if (!slides || slides.length === 0) return;
    setDownloading(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const W = 1920;
      const H = 1080;

      function wrapText(
        ctx: CanvasRenderingContext2D,
        text: string,
        maxWidth: number
      ): string[] {
        const words = text.split(" ");
        const lines: string[] = [];
        let current = "";
        for (const word of words) {
          const test = current ? `${current} ${word}` : word;
          if (ctx.measureText(test).width > maxWidth && current) {
            lines.push(current);
            current = word;
          } else {
            current = test;
          }
        }
        if (current) lines.push(current);
        return lines;
      }

      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        const layout = getSlideLayout(slide);
        const canvas = document.createElement("canvas");
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext("2d")!;

        const templateImageDataUrl = resolveTemplateForSlide(slide, templateSlideImageDataUrls);
        let templateImage: HTMLImageElement | null = null;
        if (templateImageDataUrl) {
          templateImage = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new window.Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("Failed to load template image."));
            img.src = templateImageDataUrl;
          });
        }

        if (templateImage) {
          ctx.drawImage(templateImage, 0, 0, W, H);
        } else {
          ctx.fillStyle = "#000000";
          ctx.fillRect(0, 0, W, H);
        }

        const showTitle = isSlideTextVisible(slide, "title");
        const showBody = isSlideTextVisible(slide, "body");
        const titleX = toPx(layout.titleBox.x, W);
        const titleY = toPx(layout.titleBox.y, H);
        const titleW = toPx(layout.titleBox.width, W);
        const titleH = toPx(layout.titleBox.height, H);
        const bodyX = toPx(layout.bodyBox.x, W);
        const bodyY = toPx(layout.bodyBox.y, H);
        const bodyW = toPx(layout.bodyBox.width, W);
        const bodyH = toPx(layout.bodyBox.height, H);

        const resolvedTextColor = layout.textColor;
        const titleLineHeight = Math.round(layout.titleFontSize * 1.2);
        const bodyLineHeight = Math.round(layout.bodyFontSize * 1.2);

        ctx.textBaseline = "top";

        if (showTitle) {
          ctx.fillStyle = resolvedTextColor;
          ctx.font = `bold ${layout.titleFontSize}px Arial`;
          ctx.textAlign = layout.titleBox.align;
          const titleLines = wrapText(ctx, slide.title, titleW);
          let currentY = titleY;
          for (const line of titleLines) {
            if (currentY + titleLineHeight > titleY + titleH) break;
            const drawX = layout.titleBox.align === "center"
              ? titleX + titleW / 2
              : layout.titleBox.align === "right"
                ? titleX + titleW
                : titleX;
            ctx.fillText(line, drawX, currentY);
            currentY += titleLineHeight;
          }
        }

        if (showBody) {
          ctx.fillStyle = resolvedTextColor;
          ctx.font = `${layout.bodyFontSize}px Arial`;
          ctx.textAlign = layout.bodyBox.align;
          const rawLines = slide.body.split("\n");
          let currentY = bodyY;
          for (const rawLine of rawLines) {
            const wrapped = wrapText(ctx, rawLine, bodyW);
            for (const line of wrapped) {
              if (currentY + bodyLineHeight > bodyY + bodyH) break;
              const drawX = layout.bodyBox.align === "center"
                ? bodyX + bodyW / 2
                : layout.bodyBox.align === "right"
                  ? bodyX + bodyW
                  : bodyX;
              ctx.fillText(line, drawX, currentY);
              currentY += bodyLineHeight;
            }
            if (currentY + bodyLineHeight > bodyY + bodyH) break;
          }
        }

        const blob = await new Promise<Blob>((resolve) =>
          canvas.toBlob((b) => resolve(b!), "image/png")
        );
        const num = String(i + 1).padStart(2, "0");
        zip.file(`slide_${num}.png`, blob);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = (presentationTitle || "presentation").replace(/[^a-z0-9_\-]/gi, "_");
      a.download = `${safeName}_slides.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  async function downloadPro() {
    if (!slides || slides.length === 0) return;
    setDownloading(true);
    try {
      const res = await fetch("/api/export-pro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          presentationTitle,
          slides: slides.map((slide) => ({
            title: isSlideTextVisible(slide, "title") ? slide.title : "",
            body: isSlideTextVisible(slide, "body") ? slide.body : "",
            notes: slide.notes,
            layout: slide.layout,
          })),
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Failed to export .pro file.");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = (presentationTitle || "presentation").replace(/[^a-z0-9_\-]/gi, "_");
      a.download = `${safeName}.pro`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export .pro file.");
    } finally {
      setDownloading(false);
    }
  }

  function updateSlideLayout(index: number, nextLayout: SlideLayout) {
    setSlides((currentSlides) => {
      if (!currentSlides) return currentSlides;
      return currentSlides.map((slide, slideIndex) =>
        slideIndex === index
          ? { ...slide, layout: buildEditableLayout(nextLayout) }
          : slide
      );
    });
    setApprovedSlides((currentApprovals) =>
      currentApprovals.map((approved, slideIndex) => (slideIndex === index ? false : approved))
    );
  }

  function updateSlideStyleField(
    index: number,
    field: "textColor" | "titleFontSize" | "bodyFontSize",
    rawValue: string
  ) {
    const currentSlide = slides?.[index];
    if (!currentSlide) return;

    const currentLayout = getSlideLayout(currentSlide);
    if (field === "textColor") {
      updateSlideLayout(index, { ...currentLayout, textColor: rawValue || "#FFFFFF" });
      return;
    }

    const parsedValue = Number(rawValue);
    if (Number.isNaN(parsedValue)) return;

    updateSlideLayout(index, {
      ...currentLayout,
      [field]: clamp(Math.round(parsedValue), 18, 180),
    });
  }

  function applyCurrentFontSizesToAllSlides(index: number) {
    const sourceSlide = slides?.[index];
    if (!sourceSlide) return;

    const sourceLayout = getSlideLayout(sourceSlide);

    setSlides((currentSlides) => {
      if (!currentSlides) return currentSlides;
      return currentSlides.map((slide) => {
        const currentLayout = getSlideLayout(slide);
        return {
          ...slide,
          layout: buildEditableLayout({
            ...currentLayout,
            titleFontSize: sourceLayout.titleFontSize,
            bodyFontSize: sourceLayout.bodyFontSize,
          }),
        };
      });
    });

    setApprovedSlides((currentApprovals) => currentApprovals.map(() => false));
  }

  function updateSlideVisibility(index: number, field: "title" | "body", visible: boolean) {
    setSlides((currentSlides) => {
      if (!currentSlides) return currentSlides;
      return currentSlides.map((slide, slideIndex) => {
        if (slideIndex !== index) return slide;
        return field === "title"
          ? { ...slide, showTitle: visible }
          : { ...slide, showBody: visible };
      });
    });
    setApprovedSlides((currentApprovals) =>
      currentApprovals.map((approved, slideIndex) => (slideIndex === index ? false : approved))
    );
  }

  function approveSlide(index: number) {
    setApprovedSlides((currentApprovals) =>
      currentApprovals.map((approved, slideIndex) => (slideIndex === index ? true : approved))
    );
  }

  function approveAllSlides() {
    setApprovedSlides((currentApprovals) => currentApprovals.map(() => true));
  }

  const approvedCount = approvedSlides.filter(Boolean).length;
  const allSlidesApproved = slides ? slides.length > 0 && approvedCount === slides.length : false;
  const selectedSlide = slides?.[selectedSlideIndex] ?? null;

  const canBeginWorkflow =
    !loading &&
    workflowPhase === "idle" &&
    presentationTitle.trim().length > 0 &&
    (presentationNotes.trim().length > 0 || presentationNotesFileDataUrl !== null);

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

        {/* Input form — hidden once workflow is active */}
        {workflowPhase === "idle" && (
          <form onSubmit={handleBeginWorkflow} className="space-y-6">
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
                    Agent Instructions
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
                    accept=".txt,.md,.json,.pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </div>
                {styleGuideFileName && (
                  <div className="mb-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-2 text-xs text-emerald-300">
                    <p>
                      Style guide uploaded: <span className="font-medium">{styleGuideFileName}</span>
                    </p>
                    <p className="mt-0.5 text-emerald-200/80">
                      {styleGuideFileType === "pdf"
                        ? styleGuideImageDataUrls.length > 0
                          ? `PDF rendered as ${styleGuideImageDataUrls.length} page image${styleGuideImageDataUrls.length === 1 ? "" : "s"} — Claude will see your style guide visually.`
                          : "Rendering PDF pages…"
                        : styleGuideFileType === "image"
                          ? "Image guide will be OCR-scanned during generation."
                          : "Text guide is loaded and ready."}
                    </p>
                  </div>
                )}
                <textarea
                  value={agentInstructions}
                  onChange={(e) => setAgentInstructions(e.target.value)}
                  placeholder={`Instructions for the AI agent — controls tone, formatting, and slide structure.\n\nExamples:\n- Dark background, white text\n- Title in bold, 60pt\n- Keep each slide to 3 lines max\n- Use a professional, concise tone\n- Avoid scripture references unless explicitly in the notes`}
                  rows={10}
                  className="flex-1 resize-none rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                />
                <div className="mt-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-200">
                      Template Slides
                      <span className="ml-1.5 text-xs text-slate-500">(PNG, optional)</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => templateSlideInputRef.current?.click()}
                      className="rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:bg-white/20"
                    >
                      Upload templates
                    </button>
                    <input
                      ref={templateSlideInputRef}
                      type="file"
                      accept=".png,image/png"
                      multiple
                      className="hidden"
                      onChange={handleTemplateSlidesUpload}
                    />
                  </div>
                  {templateSlideFileNames.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-slate-500">
                          {templateSlideFileNames.length} template slide{templateSlideFileNames.length === 1 ? "" : "s"} — text zones are auto-detected; drag to adjust
                        </p>
                        <button
                          type="button"
                          onClick={handleClearTemplateSlides}
                          className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[10px] font-medium text-slate-300 transition hover:bg-white/10"
                        >
                          Clear all
                        </button>
                      </div>
                      {templateSlideImageDataUrls.map((dataUrl, index) => (
                        <div
                          key={`${templateSlideFileNames[index] ?? "template"}-${index}`}
                          className="rounded-lg border border-white/10 bg-black/30 p-2"
                        >
                          <div className="mb-1.5 flex items-center justify-between">
                            <div>
                              <p className="text-[10px] font-medium uppercase tracking-wide text-cyan-300/90">
                                {getTemplateRoleLabel(index)}
                              </p>
                              <p className="truncate text-[10px] text-slate-400">
                                {templateSlideFileNames[index] ?? `Template ${index + 1}`}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveTemplateSlide(index)}
                              aria-label={`Remove template slide ${index + 1}`}
                              className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white transition hover:bg-red-600/80"
                            >
                              Remove
                            </button>
                          </div>
                          <TemplateZoneEditor
                            imageUrl={dataUrl}
                            zones={zoneMap[index] ?? {}}
                            detecting={detectingZoneIndexes.has(index)}
                            onChange={(zones) =>
                              setZoneMap((prev) => ({ ...prev, [index]: zones }))
                            }
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Presentation Notes */}
              <div className="flex flex-col">
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="block text-sm font-medium text-slate-200">
                    Presentation Notes / Content <span className="text-red-400">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => notesFileInputRef.current?.click()}
                    className="rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:bg-white/20"
                  >
                    Upload PDF/DOCX
                  </button>
                  <input
                    ref={notesFileInputRef}
                    type="file"
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                    onChange={handleNotesFileUpload}
                  />
                </div>
                {presentationNotesFileName && (
                  <div className="mb-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-2 text-xs text-emerald-300">
                    Notes document uploaded: <span className="font-medium">{presentationNotesFileName}</span>
                  </div>
                )}
                <textarea
                  value={presentationNotes}
                  onChange={(e) => setPresentationNotes(e.target.value)}
                  placeholder={`Paste notes here, or upload a PDF/DOCX file with sermon content and styles.\n\nExample:\n- Welcome and announcements\n- Scripture: John 3:16\n- Main message: God's love and grace\n- Three points: Faith, Hope, Love\n- Closing prayer and benediction`}
                  rows={10}
                  className="flex-1 resize-none rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                type="submit"
                disabled={!canBeginWorkflow}
                className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Begin Review →
              </button>
            </div>
          </form>
        )}

        {/* Compact header shown once workflow is active */}
        {workflowPhase !== "idle" && (
          <div className="mb-6 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-5 py-3">
            <div>
              <p className="text-sm font-semibold text-white">{presentationTitle}</p>
              <p className="text-xs text-slate-400">
                {presentationNotesFileName
                  ? presentationNotesFileName
                  : presentationNotes.slice(0, 60).trim() + (presentationNotes.length > 60 ? "…" : "")}
              </p>
            </div>
            <button
              type="button"
              onClick={resetWorkflow}
              className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/10"
            >
              ← Edit inputs
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Workflow dialogue panel */}
        {(workflowPhase === "style_review" || workflowPhase === "notes_clarification") && (
          <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60">

            {/* Phase progress bar */}
            <div className="flex items-center gap-0 border-b border-white/10 bg-black/20">
              <div
                className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 text-xs font-medium transition ${
                  workflowPhase === "style_review"
                    ? "bg-cyan-500/15 text-cyan-300"
                    : "text-emerald-400"
                }`}
              >
                {workflowPhase === "style_review" ? (
                  <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                ) : (
                  <span className="text-emerald-400">✓</span>
                )}
                Step 1 — Style Review
              </div>
              <div className="w-px self-stretch bg-white/10" />
              <div
                className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 text-xs font-medium transition ${
                  workflowPhase === "notes_clarification"
                    ? "bg-amber-500/15 text-amber-300"
                    : "text-slate-500"
                }`}
              >
                {workflowPhase === "notes_clarification" && (
                  <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                )}
                Step 2 — Notes Review
              </div>
              <div className="w-px self-stretch bg-white/10" />
              <div className="flex flex-1 items-center justify-center gap-2 px-4 py-3 text-xs font-medium text-slate-600">
                Step 3 — Generate
              </div>
            </div>

            {/* Sample slides (Phase 1) */}
            {workflowPhase === "style_review" && sampleSlides && sampleSlides.length > 0 && (
              <div className="border-b border-white/10 px-6 py-5">
                <p className="mb-3 text-xs font-medium uppercase tracking-widest text-slate-400">
                  Sample Slides
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {sampleSlides.map((slide, i) => (
                    <div key={i}>
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        {slide.slideType === "scripture" ? "Scripture template" : "Point template"}
                      </p>
                      <SampleSlidePreview
                        slide={slide}
                        templateImageDataUrl={resolveTemplateForSlide(slide, templateSlideImageDataUrls)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Chat messages */}
            <div className="max-h-80 space-y-4 overflow-y-auto px-6 py-5">
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-white/10 text-slate-200"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm text-slate-400">
                    <span className="inline-flex gap-1">
                      <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                      <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                      <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
                    </span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Chat input + action buttons */}
            <div className="border-t border-white/10 px-6 py-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleChatSend();
                    }
                  }}
                  placeholder={
                    workflowPhase === "style_review"
                      ? "Ask to adjust font size, alignment, content structure…"
                      : "Answer questions or add clarifications…"
                  }
                  disabled={chatLoading}
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={handleChatSend}
                  disabled={chatLoading || !chatInput.trim()}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
                >
                  Send
                </button>
              </div>

              <div className="mt-3 flex justify-end">
                {workflowPhase === "style_review" && (
                  <button
                    type="button"
                    onClick={handleContinueToNotes}
                    disabled={chatLoading}
                    className="rounded-lg bg-cyan-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-50"
                  >
                    Continue to Notes Review →
                  </button>
                )}
                {workflowPhase === "notes_clarification" && (
                  <button
                    type="button"
                    onClick={handleGenerateSlides}
                    disabled={chatLoading}
                    className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                  >
                    Generate Slides →
                  </button>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Generating spinner */}
        {workflowPhase === "generating" && (
          <div className="mt-10 flex flex-col items-center gap-4 py-16 text-slate-400">
            <svg className="h-10 w-10 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z" />
            </svg>
            <p className="text-sm">Generating slides…</p>
          </div>
        )}

        {/* Fallback warning */}
        {fallbackWarning && (
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
            <strong>Layout warning:</strong> {fallbackWarning}
          </div>
        )}

        {/* Slide Preview */}
        {slides && slides.length > 0 && (
          <section className="mt-10">

            {/* Agent review banner */}
            {reviewMessage && (
              <div className="mb-6 rounded-xl border border-purple-500/30 bg-purple-500/10 px-5 py-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-purple-400">
                  Agent Review
                </p>
                <p className="text-sm leading-relaxed text-purple-100">{reviewMessage}</p>
              </div>
            )}
            {!reviewMessage && workflowPhase === "complete" && (
              <div className="mb-6 rounded-xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-slate-400">
                Reviewing slides against your style guide…
              </div>
            )}

            <div className="mb-4 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Review and approve layout
                  </h2>
                  <p className="text-sm text-cyan-100/80">
                    Review slide content against the template, then approve each slide before exporting.
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-sm text-slate-200">
                    {approvedCount} / {slides.length} approved
                  </div>
                  <button
                    type="button"
                    onClick={approveAllSlides}
                    className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
                  >
                    Approve all current layouts
                  </button>
                  {allSlidesApproved && (
                    <>
                      <button
                        type="button"
                        onClick={downloadPro}
                        disabled={downloading}
                        className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
                      >
                        {downloading ? "Preparing…" : "⬇ Download .pro"}
                      </button>
                      <button
                        type="button"
                        onClick={downloadPNGs}
                        disabled={downloading}
                        className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-300 transition hover:bg-blue-500/20 disabled:opacity-50"
                      >
                        {downloading ? "Generating…" : "⬇ Download PNGs"}
                      </button>
                    </>
                  )}
                  {!allSlidesApproved && (
                    <p className="text-xs text-slate-500">Approve all slides to export</p>
                  )}
                </div>
              </div>
            </div>

            {selectedSlide && (
              <div className="mb-8 grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_360px]">
                <LayoutEditorPreview
                  slide={selectedSlide}
                  index={selectedSlideIndex}
                  templateImageDataUrl={resolveTemplateForSlide(selectedSlide, templateSlideImageDataUrls)}
                  approved={approvedSlides[selectedSlideIndex] ?? false}
                />
                <aside className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                        Slide {selectedSlideIndex + 1}
                      </p>
                      <h3 className="mt-1 text-lg font-semibold text-white">
                        {selectedSlide.title || "Untitled slide"}
                      </h3>
                      <p className="mt-1 text-xs text-slate-400">
                        {(selectedSlide.slideType ?? "other").toUpperCase()} template mapping
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        approvedSlides[selectedSlideIndex]
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-amber-500/15 text-amber-300"
                      }`}
                    >
                      {approvedSlides[selectedSlideIndex] ? "Approved" : "Pending"}
                    </span>
                  </div>

                  <div className="mt-4 space-y-4">
                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <p className="text-sm font-medium text-white">Visibility</p>
                      <div className="mt-2 flex gap-2">
                        {hasSlideText(selectedSlide, "title") && (
                          <button
                            type="button"
                            onClick={() =>
                              updateSlideVisibility(selectedSlideIndex, "title", !isSlideTextVisible(selectedSlide, "title"))
                            }
                            className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/10"
                          >
                            {isSlideTextVisible(selectedSlide, "title") ? "Hide title" : "Show title"}
                          </button>
                        )}
                        {hasSlideText(selectedSlide, "body") && (
                          <button
                            type="button"
                            onClick={() =>
                              updateSlideVisibility(selectedSlideIndex, "body", !isSlideTextVisible(selectedSlide, "body"))
                            }
                            className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/10"
                          >
                            {isSlideTextVisible(selectedSlide, "body") ? "Hide body" : "Show body"}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-white">Text styling</p>
                        <button
                          type="button"
                          onClick={() => applyCurrentFontSizesToAllSlides(selectedSlideIndex)}
                          className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-white/10"
                        >
                          Apply font sizes to all slides
                        </button>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                        <label className="text-xs text-slate-400">
                          Text color
                          <input
                            type="color"
                            value={getSlideLayout(selectedSlide).textColor}
                            onChange={(e) => updateSlideStyleField(selectedSlideIndex, "textColor", e.target.value)}
                            className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-white/10 bg-transparent"
                          />
                        </label>
                        <label className="text-xs text-slate-400">
                          Title font size
                          <div className="mt-1 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                updateSlideStyleField(
                                  selectedSlideIndex,
                                  "titleFontSize",
                                  String(getSlideLayout(selectedSlide).titleFontSize - 2)
                                )
                              }
                              className="rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-sm text-white transition hover:bg-white/10"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min={18}
                              max={180}
                              value={getSlideLayout(selectedSlide).titleFontSize}
                              onChange={(e) => updateSlideStyleField(selectedSlideIndex, "titleFontSize", e.target.value)}
                              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                updateSlideStyleField(
                                  selectedSlideIndex,
                                  "titleFontSize",
                                  String(getSlideLayout(selectedSlide).titleFontSize + 2)
                                )
                              }
                              className="rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-sm text-white transition hover:bg-white/10"
                            >
                              +
                            </button>
                          </div>
                        </label>
                        <label className="text-xs text-slate-400">
                          Body font size
                          <div className="mt-1 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                updateSlideStyleField(
                                  selectedSlideIndex,
                                  "bodyFontSize",
                                  String(getSlideLayout(selectedSlide).bodyFontSize - 2)
                                )
                              }
                              className="rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-sm text-white transition hover:bg-white/10"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min={18}
                              max={180}
                              value={getSlideLayout(selectedSlide).bodyFontSize}
                              onChange={(e) => updateSlideStyleField(selectedSlideIndex, "bodyFontSize", e.target.value)}
                              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                updateSlideStyleField(
                                  selectedSlideIndex,
                                  "bodyFontSize",
                                  String(getSlideLayout(selectedSlide).bodyFontSize + 2)
                                )
                              }
                              className="rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-sm text-white transition hover:bg-white/10"
                            >
                              +
                            </button>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => approveSlide(selectedSlideIndex)}
                      className="w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
                    >
                      Approve this slide
                    </button>
                  </div>
                </aside>
              </div>
            )}

            <h2 className="mb-4 text-lg font-semibold text-white">
              Preview — {slides.length} slide{slides.length !== 1 ? "s" : ""} generated
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {slides.map((slide, i) => (
                <SlideCard
                  key={i}
                  slide={slide}
                  index={i}
                  approved={approvedSlides[i] ?? false}
                  selected={selectedSlideIndex === i}
                  onSelect={() => setSelectedSlideIndex(i)}
                  templateImageDataUrl={resolveTemplateForSlide(slide, templateSlideImageDataUrls)}
                />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function SampleSlidePreview({
  slide,
  templateImageDataUrl,
}: {
  slide: Slide;
  templateImageDataUrl: string | null;
}) {
  const layout = getSlideLayout(slide);
  const showTitle = isSlideTextVisible(slide, "title");
  const showBody = isSlideTextVisible(slide, "body");

  return (
    <div
      className="relative overflow-hidden rounded-xl bg-black"
      style={{ aspectRatio: "16/9" }}
    >
      {templateImageDataUrl && (
        <Image
          src={templateImageDataUrl}
          alt="Template background"
          fill
          unoptimized
          className="object-cover"
        />
      )}
      {showTitle && (
        <p
          className="absolute whitespace-pre-line font-bold leading-snug"
          style={{
            left: `${layout.titleBox.x}%`,
            top: `${layout.titleBox.y}%`,
            width: `${layout.titleBox.width}%`,
            height: `${layout.titleBox.height}%`,
            color: layout.textColor,
            textAlign: layout.titleBox.align,
            fontSize: `${Math.max(10, Math.round(layout.titleFontSize / 5))}px`,
          }}
        >
          {slide.title}
        </p>
      )}
      {showBody && (
        <p
          className="absolute whitespace-pre-line leading-relaxed"
          style={{
            left: `${layout.bodyBox.x}%`,
            top: `${layout.bodyBox.y}%`,
            width: `${layout.bodyBox.width}%`,
            height: `${layout.bodyBox.height}%`,
            color: layout.textColor,
            textAlign: layout.bodyBox.align,
            fontSize: `${Math.max(9, Math.round(layout.bodyFontSize / 5))}px`,
          }}
        >
          {slide.body}
        </p>
      )}
      {!showTitle && !showBody && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="rounded bg-black/60 px-2 py-1 text-[10px] text-slate-400">Empty slide</span>
        </div>
      )}
    </div>
  );
}

function SlideCard({
  slide,
  index,
  approved,
  selected,
  onSelect,
  templateImageDataUrl,
}: {
  slide: Slide;
  index: number;
  approved: boolean;
  selected: boolean;
  onSelect: () => void;
  templateImageDataUrl: string | null;
}) {
  const [showNotes, setShowNotes] = useState(false);
  const layout = getSlideLayout(slide);
  const showTitle = isSlideTextVisible(slide, "title");
  const showBody = isSlideTextVisible(slide, "body");
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`flex flex-col overflow-hidden rounded-xl border bg-black text-left shadow-lg transition ${
        selected
          ? "border-cyan-400/70 ring-2 ring-cyan-400/30"
          : "border-white/10 hover:border-white/25"
      }`}
    >
      <div
        className="relative flex flex-col items-start justify-start bg-black p-4"
        style={{ aspectRatio: "16/9" }}
      >
        {templateImageDataUrl && (
          <Image
            src={templateImageDataUrl}
            alt="Slide template background"
            fill
            unoptimized
            className="object-cover"
          />
        )}
        <div className="relative z-10 h-full w-full">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-medium text-slate-600">
              {index + 1}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                approved ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"
              }`}
            >
              {approved ? "Approved" : "Pending"}
            </span>
          </div>
          {showTitle && (
            <p
              className="absolute whitespace-pre-line text-base font-bold leading-snug"
              style={{
                left: `${layout.titleBox.x}%`,
                top: `${layout.titleBox.y}%`,
                width: `${layout.titleBox.width}%`,
                height: `${layout.titleBox.height}%`,
                color: layout.textColor,
                textAlign: layout.titleBox.align,
                fontSize: `${Math.max(10, Math.round(layout.titleFontSize / 5))}px`,
              }}
            >
              {slide.title}
            </p>
          )}
          {showBody && (
            <p
              className="absolute whitespace-pre-line leading-relaxed"
              style={{
                left: `${layout.bodyBox.x}%`,
                top: `${layout.bodyBox.y}%`,
                width: `${layout.bodyBox.width}%`,
                height: `${layout.bodyBox.height}%`,
                color: layout.textColor,
                textAlign: layout.bodyBox.align,
                fontSize: `${Math.max(9, Math.round(layout.bodyFontSize / 5))}px`,
              }}
            >
              {slide.body}
            </p>
          )}
        </div>
      </div>
      {slide.notes && (
        <div className="border-t border-white/10 bg-slate-900/60 px-3 py-2">
          <button
            type="button"
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

function LayoutEditorPreview({
  slide,
  index,
  approved,
  templateImageDataUrl,
}: {
  slide: Slide;
  index: number;
  approved: boolean;
  templateImageDataUrl: string | null;
}) {
  const layout = getSlideLayout(slide);
  const showTitle = isSlideTextVisible(slide, "title");
  const showBody = isSlideTextVisible(slide, "body");

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/10 bg-slate-950/80 px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Slide preview</p>
          <p className="text-sm text-slate-300">Slide {index + 1} — {(slide.slideType ?? "other")} layout</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            approved ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"
          }`}
        >
          {approved ? "Approved" : "Needs review"}
        </span>
      </div>
      <div className="p-4">
        <div className="relative overflow-hidden rounded-xl bg-black" style={{ aspectRatio: "16/9" }}>
          {templateImageDataUrl && (
            <Image
              src={templateImageDataUrl}
              alt="Slide template background"
              fill
              unoptimized
              className="object-cover"
            />
          )}
          {showTitle && (
            <div
              className="absolute overflow-hidden rounded px-2 py-1"
              style={{
                left: `${layout.titleBox.x}%`,
                top: `${layout.titleBox.y}%`,
                width: `${layout.titleBox.width}%`,
                height: `${layout.titleBox.height}%`,
                color: layout.textColor,
                textAlign: layout.titleBox.align,
              }}
            >
              <span
                className="whitespace-pre-line font-bold leading-snug"
                style={{ fontSize: `${Math.max(18, Math.round(layout.titleFontSize / 2.5))}px` }}
              >
                {slide.title}
              </span>
            </div>
          )}
          {showBody && (
            <div
              className="absolute overflow-hidden px-2 py-1"
              style={{
                left: `${layout.bodyBox.x}%`,
                top: `${layout.bodyBox.y}%`,
                width: `${layout.bodyBox.width}%`,
                height: `${layout.bodyBox.height}%`,
                color: layout.textColor,
                textAlign: layout.bodyBox.align,
              }}
            >
              <span
                className="whitespace-pre-line leading-relaxed"
                style={{ fontSize: `${Math.max(16, Math.round(layout.bodyFontSize / 2.7))}px` }}
              >
                {slide.body}
              </span>
            </div>
          )}
          {!showTitle && !showBody && (
            <div className="absolute inset-x-6 top-6 rounded-xl border border-dashed border-white/20 bg-black/35 px-4 py-3 text-sm text-slate-300">
              This slide has no active text. Re-enable title or body from the visibility controls.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TemplateZoneEditor({
  imageUrl,
  zones,
  detecting,
  onChange,
}: {
  imageUrl: string;
  zones: TemplateZones;
  detecting?: boolean;
  onChange: (zones: TemplateZones) => void;
}) {
  const [activeZoneType, setActiveZoneType] = useState<"title" | "body">("title");
  const [drawPreview, setDrawPreview] = useState<{
    x: number; y: number; width: number; height: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const activeZoneTypeRef = useRef(activeZoneType);
  activeZoneTypeRef.current = activeZoneType;
  const zonesRef = useRef(zones);
  zonesRef.current = zones;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  function getPct(clientX: number, clientY: number) {
    const b = containerRef.current?.getBoundingClientRect();
    if (!b) return null;
    return {
      x: clamp(((clientX - b.left) / b.width) * 100, 0, 100),
      y: clamp(((clientY - b.top) / b.height) * 100, 0, 100),
    };
  }

  useEffect(() => {
    function handleMove(e: PointerEvent) {
      const start = drawStartRef.current;
      if (!start) return;
      const pos = getPct(e.clientX, e.clientY);
      if (!pos) return;
      setDrawPreview({
        x: Math.min(start.x, pos.x),
        y: Math.min(start.y, pos.y),
        width: Math.abs(pos.x - start.x),
        height: Math.abs(pos.y - start.y),
      });
    }

    function handleUp(e: PointerEvent) {
      const start = drawStartRef.current;
      if (!start) return;
      const pos = getPct(e.clientX, e.clientY);
      if (pos) {
        const x = roundPercent(Math.min(start.x, pos.x));
        const y = roundPercent(Math.min(start.y, pos.y));
        const width = roundPercent(Math.abs(pos.x - start.x));
        const height = roundPercent(Math.abs(pos.y - start.y));
        if (width > 2 && height > 2) {
          onChangeRef.current({ ...zonesRef.current, [activeZoneTypeRef.current]: { x, y, width, height } });
        }
      }
      drawStartRef.current = null;
      setDrawPreview(null);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, []);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const pos = getPct(e.clientX, e.clientY);
    if (!pos) return;
    drawStartRef.current = pos;
    setDrawPreview({ x: pos.x, y: pos.y, width: 0, height: 0 });
  }

  const hasNoZones = !zones.title && !zones.body;

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-slate-500">Draw zone:</span>
        <button
          type="button"
          onClick={() => setActiveZoneType("title")}
          className={`rounded px-2 py-0.5 text-[11px] font-medium transition ${
            activeZoneType === "title"
              ? "bg-cyan-500/30 text-cyan-300 ring-1 ring-cyan-400/50"
              : "bg-white/5 text-slate-400 hover:bg-white/10"
          }`}
        >
          Title
        </button>
        <button
          type="button"
          onClick={() => setActiveZoneType("body")}
          className={`rounded px-2 py-0.5 text-[11px] font-medium transition ${
            activeZoneType === "body"
              ? "bg-amber-500/30 text-amber-300 ring-1 ring-amber-400/50"
              : "bg-white/5 text-slate-400 hover:bg-white/10"
          }`}
        >
          Body
        </button>
      </div>

      <div
        ref={containerRef}
        className="relative select-none overflow-hidden rounded-lg bg-black touch-none"
        style={{ aspectRatio: "16/9", cursor: "crosshair" }}
        onPointerDown={handlePointerDown}
      >
        <Image src={imageUrl} alt="Template" fill unoptimized draggable={false} className="object-cover pointer-events-none" />

        {detecting && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/40">
            <span className="rounded-full border border-cyan-500/40 bg-cyan-500/20 px-3 py-1 text-[11px] font-medium text-cyan-300">
              Detecting text zones…
            </span>
          </div>
        )}

        {!detecting && hasNoZones && !drawPreview && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="rounded-full border border-amber-500/40 bg-amber-500/20 px-3 py-1 text-[11px] font-medium text-amber-300">
              Zones not set — click and drag to draw
            </span>
          </div>
        )}

        {zones.title && (
          <div
            className="absolute border-2 border-cyan-400 bg-cyan-400/15"
            style={{
              left: `${zones.title.x}%`,
              top: `${zones.title.y}%`,
              width: `${zones.title.width}%`,
              height: `${zones.title.height}%`,
            }}
          >
            <span className="absolute left-1 top-1 rounded bg-black/70 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-cyan-300">
              Title
            </span>
            <button
              type="button"
              className="absolute right-1 top-1 rounded bg-black/70 px-1 py-0.5 text-[9px] font-bold text-white hover:bg-red-600/80"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onChange({ ...zones, title: undefined }); }}
            >
              ×
            </button>
          </div>
        )}

        {zones.body && (
          <div
            className="absolute border-2 border-amber-400 bg-amber-400/15"
            style={{
              left: `${zones.body.x}%`,
              top: `${zones.body.y}%`,
              width: `${zones.body.width}%`,
              height: `${zones.body.height}%`,
            }}
          >
            <span className="absolute left-1 top-1 rounded bg-black/70 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-300">
              Body
            </span>
            <button
              type="button"
              className="absolute right-1 top-1 rounded bg-black/70 px-1 py-0.5 text-[9px] font-bold text-white hover:bg-red-600/80"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onChange({ ...zones, body: undefined }); }}
            >
              ×
            </button>
          </div>
        )}

        {drawPreview && (
          <div
            className={`pointer-events-none absolute border-2 ${
              activeZoneType === "title" ? "border-cyan-400 bg-cyan-400/20" : "border-amber-400 bg-amber-400/20"
            }`}
            style={{
              left: `${drawPreview.x}%`,
              top: `${drawPreview.y}%`,
              width: `${drawPreview.width}%`,
              height: `${drawPreview.height}%`,
            }}
          />
        )}
      </div>
    </div>
  );
}
