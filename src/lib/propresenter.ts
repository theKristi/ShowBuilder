/**
 * ProPresenter 6 (.pro6) XML file generator.
 * Produces a valid .pro6 file that can be imported into ProPresenter 6 or 7.
 */

export interface Slide {
  title: string;
  body: string;
  notes?: string;
}

export interface PresentationOptions {
  title: string;
  author?: string;
  category?: string;
  backgroundColor?: string; // "R G B A" e.g. "0 0 0 1"
  textColor?: string; // "R G B A" e.g. "1 1 1 1"
  fontName?: string;
  titleFontSize?: number;
  bodyFontSize?: number;
  width?: number;
  height?: number;
}

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16).toUpperCase();
  });
}

/**
 * Builds a minimal RTF string for ProPresenter text.
 * ProPresenter expects RTF with specific attributes for color and font.
 */
function buildRTF(
  text: string,
  options: { fontName: string; fontSize: number; colorR: number; colorG: number; colorB: number }
): string {
  const halfPtSize = options.fontSize * 2;
  // Escape special RTF characters
  const escaped = text
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\n/g, "\\line ");

  return (
    `{\\rtf1\\ansi\\deff0` +
    `{\\fonttbl{\\f0 ${options.fontName};}}` +
    `{\\colortbl;\\red${options.colorR}\\green${options.colorG}\\blue${options.colorB};}` +
    `\\f0\\cf1\\fs${halfPtSize} ${escaped}}`
  );
}

function toBase64(str: string): string {
  return Buffer.from(str, "utf-8").toString("base64");
}

/**
 * Builds a single RVDisplaySlide XML element.
 */
function buildSlideXML(
  slide: Slide,
  index: number,
  opts: Required<PresentationOptions>
): string {
  const slideUUID = generateUUID();
  const titleElementUUID = generateUUID();
  const bodyElementUUID = generateUUID();

  const width = opts.width;
  const height = opts.height;

  // Parse text color
  const [r, g, b] = opts.textColor.split(" ").map((v) => Math.round(parseFloat(v) * 255));

  const hasTitle = slide.title && slide.title.trim().length > 0;
  const hasBody = slide.body && slide.body.trim().length > 0;

  // Layout: title takes top 20%, body takes remaining 70% (with padding)
  const titleH = Math.round(height * 0.2);
  const bodyY = Math.round(height * 0.22);
  const bodyH = Math.round(height * 0.65);
  const padding = Math.round(width * 0.05);

  let elements = "";

  if (hasTitle) {
    const titleRTF = buildRTF(slide.title, {
      fontName: opts.fontName,
      fontSize: opts.titleFontSize,
      colorR: r,
      colorG: g,
      colorB: b,
    });
    elements += `
      <RVTextElement
        displayDelay="0"
        displayName="Title"
        locked="0"
        persistent="0"
        typeID="0"
        fromTemplate="0"
        bezelRadius="0"
        drawingFill="0"
        drawingShadow="0"
        drawingStroke="0"
        fillColor="0 0 0 0"
        rotation="0"
        source=""
        adjustsHeightToFit="0"
        verticalAlignment="0"
        RTFData="${toBase64(titleRTF)}"
        revealType="0"
        serialization-array-index="0"
        UUID="${titleElementUUID}"
        position="{${padding}, ${Math.round(height * 0.05)}, ${width - padding * 2}, ${titleH}}"
        shadow="|0|0|0|0"
        stroke="0 0 0 0|1"
      >
        <shadow mutableOwnerIdentity="RVShadow" shadowAngle="90" shadowBlur="0" shadowColor="0 0 0 1" shadowEnabled="0" shadowLength="0"/>
        <dictionary containerClass="NSMutableDictionary"/>
      </RVTextElement>`;
  }

  if (hasBody) {
    const bodyRTF = buildRTF(slide.body, {
      fontName: opts.fontName,
      fontSize: opts.bodyFontSize,
      colorR: r,
      colorG: g,
      colorB: b,
    });
    const bodySerializationIndex = hasTitle ? 1 : 0;
    elements += `
      <RVTextElement
        displayDelay="0"
        displayName="Body"
        locked="0"
        persistent="0"
        typeID="0"
        fromTemplate="0"
        bezelRadius="0"
        drawingFill="0"
        drawingShadow="0"
        drawingStroke="0"
        fillColor="0 0 0 0"
        rotation="0"
        source=""
        adjustsHeightToFit="0"
        verticalAlignment="0"
        RTFData="${toBase64(bodyRTF)}"
        revealType="0"
        serialization-array-index="${bodySerializationIndex}"
        UUID="${bodyElementUUID}"
        position="{${padding}, ${bodyY}, ${width - padding * 2}, ${bodyH}}"
        shadow="|0|0|0|0"
        stroke="0 0 0 0|1"
      >
        <shadow mutableOwnerIdentity="RVShadow" shadowAngle="90" shadowBlur="0" shadowColor="0 0 0 1" shadowEnabled="0" shadowLength="0"/>
        <dictionary containerClass="NSMutableDictionary"/>
      </RVTextElement>`;
  }

  const notes = slide.notes ? slide.notes.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";

  return `
    <RVDisplaySlide
      backgroundColor="${opts.backgroundColor}"
      enabled="1"
      highlightColor="0 0 0 0"
      hotKey=""
      label=""
      notes="${notes}"
      slideType="1"
      sort_index="${index}"
      UUID="${slideUUID}"
      drawingBackgroundColor="0"
      serialization-array-index="${index}"
      chordChartPath=""
    >
      <cues containerClass="NSMutableArray"/>
      <displayElements containerClass="NSMutableArray">
        ${elements}
      </displayElements>
      <_-RVProTransitionObject-_transitionObject transitionType="-1" transitionDuration="1" motionEnabled="0" motionDuration="20" motionSpeed="100"/>
    </RVDisplaySlide>`;
}

/**
 * Generates a ProPresenter 6 (.pro6) XML string from an array of slides.
 */
export function generateProPresenterXML(
  slides: Slide[],
  options: PresentationOptions
): string {
  const opts: Required<PresentationOptions> = {
    title: options.title,
    author: options.author ?? "",
    category: options.category ?? "Presentation",
    backgroundColor: options.backgroundColor ?? "0 0 0 1",
    textColor: options.textColor ?? "1 1 1 1",
    fontName: options.fontName ?? "Arial",
    titleFontSize: options.titleFontSize ?? 60,
    bodyFontSize: options.bodyFontSize ?? 40,
    width: options.width ?? 1920,
    height: options.height ?? 1080,
  };

  const presentationUUID = generateUUID();
  const groupUUID = generateUUID();
  const now = new Date().toISOString().replace(/\.\d{3}/, "");

  const safeTitle = opts.title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const slidesXML = slides.map((slide, i) => buildSlideXML(slide, i, opts)).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<RVPresentationDocument
  height="${opts.height}"
  width="${opts.width}"
  versionNumber="600"
  docType="0"
  creatorCode="1349676880"
  lastDateUsed="${now}"
  usedCount="0"
  category="${opts.category}"
  resourcesDirectory=""
  backgroundColor="${opts.backgroundColor}"
  drawingBackgroundColor="0"
  notes=""
  artist=""
  author="${opts.author}"
  album=""
  CCLIDisplay="0"
  CCLIArtistCredits=""
  CCLISongTitle="${safeTitle}"
  CCLIPublisher=""
  CCLICopyrightInfo=""
  CCLILicenseNumber=""
  UUID="${presentationUUID}"
>
  <timeline timeOffSet="0" selectedMediaTrackIndex="0" unitOfMeasure="60" duration="0" loop="0">
    <timeCues containerClass="NSMutableArray"/>
    <mediaTracks containerClass="NSMutableArray"/>
  </timeline>
  <bibleReference containerClass="NSMutableArray"/>
  <_-RVProTransitionObject-_transitionObject transitionType="-1" transitionDuration="1" motionEnabled="0" motionDuration="20" motionSpeed="100"/>
  <groups containerClass="NSMutableArray">
    <RVSlideGrouping
      name="${safeTitle}"
      uuid="${groupUUID}"
      color="0 0 0 0"
      serialization-array-index="0"
    >
      <slides containerClass="NSMutableArray">
        ${slidesXML}
      </slides>
    </RVSlideGrouping>
  </groups>
  <arrangements containerClass="NSMutableArray"/>
</RVPresentationDocument>`;
}
