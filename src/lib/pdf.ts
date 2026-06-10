import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { AtsResumeContent } from "./ats-format";

const MARGIN = 50;
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const LINE_HEIGHT = 14;
const SECTION_GAP = 10;

/**
 * Make text safe for pdf-lib's StandardFont (WinAnsi) encoding.
 * WinAnsi cannot encode control characters such as newline (0x0A) or tab
 * (0x09), which throw at draw time. Collapse all whitespace runs to single
 * spaces and drop any remaining non-printable characters.
 */
function sanitizeText(text: string): string {
  return (text ?? "")
    .replace(/\s+/g, " ")
    // strip any remaining C0/C1 control chars (whitespace already collapsed)
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .trim();
}

/**
 * Strips markdown backslash-escapes before punctuation (e.g. "Locker \- Vault"
 * -> "Locker - Vault"). Defensive: resume data may already contain these from
 * older parses.
 */
function cleanInline(text: string): string {
  return (text ?? "").replace(/\\([-.*_#+()\[\]`])/g, "$1");
}

/** Unwraps a markdown link "[text](url)" to just the URL; otherwise unchanged. */
function unwrapLink(text: string): string {
  const m = (text ?? "").trim().match(/^\[[^\]]*\]\(([^)]+)\)$/);
  return m ? m[1].trim() : text;
}

/** Expands YYYY-MM date format to "Month Year" (e.g. "2025-08" → "August 2025"). */
function formatDateYYYYMM(text: string): string {
  const m = (text ?? "").match(/(\d{4})-(\d{2})/);
  if (!m) return text;
  const [, year, month] = m;
  const months = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const monthName = months[parseInt(month, 10)] || month;
  return text.replace(/\d{4}-\d{2}/, `${monthName} ${year}`);
}

export async function generateResumePdf(content: AtsResumeContent): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0, 0, 0);
  const darkGray = rgb(0.3, 0.3, 0.3);

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  }

  function drawText(
    text: string,
    options: {
      font?: typeof fontRegular;
      size?: number;
      color?: typeof black;
      x?: number;
      hangingIndent?: number;
    } = {},
  ) {
    const font = options.font ?? fontRegular;
    const size = options.size ?? 10;
    const color = options.color ?? black;
    const x = options.x ?? MARGIN;
    const hangingIndent = options.hangingIndent ?? 0;

    const words = sanitizeText(text).split(" ");
    let line = "";
    let isFirstLine = true;
    const maxWidth = CONTENT_WIDTH - (x - MARGIN);
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      const lineMaxWidth = isFirstLine ? maxWidth : maxWidth - hangingIndent;
      const width = font.widthOfTextAtSize(test, size);
      if (width > lineMaxWidth && line) {
        ensureSpace(LINE_HEIGHT);
        const lineX = isFirstLine ? x : x + hangingIndent;
        page.drawText(line, { x: lineX, y, size, font, color });
        y -= LINE_HEIGHT;
        line = word;
        isFirstLine = false;
      } else {
        line = test;
      }
    }
    if (line) {
      ensureSpace(LINE_HEIGHT);
      const lineX = isFirstLine ? x : x + hangingIndent;
      page.drawText(line, { x: lineX, y, size, font, color });
      y -= LINE_HEIGHT;
    }
  }

  function drawPrefixedText(
    prefix: string,
    text: string,
    options: {
      x?: number;
      size?: number;
      prefixFont?: typeof fontRegular;
      textFont?: typeof fontRegular;
      color?: typeof black;
    } = {},
  ) {
    const x = options.x ?? MARGIN;
    const size = options.size ?? 10;
    const prefixFont = options.prefixFont ?? fontBold;
    const textFont = options.textFont ?? fontRegular;
    const color = options.color ?? black;

    const prefixWidth = prefixFont.widthOfTextAtSize(prefix, size);

    ensureSpace(LINE_HEIGHT);
    page.drawText(sanitizeText(prefix), { x, y, size, font: prefixFont, color });

    const words = sanitizeText(text).split(" ");
    let line = "";
    let isFirstLine = true;
    const maxWidth = CONTENT_WIDTH - (x - MARGIN);
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      const lineMaxWidth = isFirstLine ? maxWidth - prefixWidth : maxWidth - prefixWidth;
      const width = textFont.widthOfTextAtSize(test, size);
      if (width > lineMaxWidth && line) {
        const lineX = isFirstLine ? x + prefixWidth : x + prefixWidth;
        page.drawText(line, { x: lineX, y, size, font: textFont, color });
        y -= LINE_HEIGHT;
        ensureSpace(LINE_HEIGHT);
        line = word;
        isFirstLine = false;
      } else {
        line = test;
      }
    }
    if (line) {
      const lineX = x + prefixWidth;
      page.drawText(line, { x: lineX, y, size, font: textFont, color });
      y -= LINE_HEIGHT;
    }
  }

  function drawSection(title: string) {
    y -= SECTION_GAP;
    ensureSpace(LINE_HEIGHT * 2);
    page.drawText(sanitizeText(title).toUpperCase(), { x: MARGIN, y, size: 11, font: fontBold, color: black });
    y -= 3;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 0.5,
      color: darkGray,
    });
    y -= LINE_HEIGHT;
  }

  const bulletPrefix = "•  ";
  const bulletIndent = fontRegular.widthOfTextAtSize(bulletPrefix, 10);

  ensureSpace(30);
  page.drawText(sanitizeText(content.nameHeader), { x: MARGIN, y, size: 20, font: fontBold, color: black });
  y -= 26;

  drawText(content.contactInfo, { size: 9, color: darkGray });
  y -= 4;

  drawSection("Professional Summary");
  drawText(content.professionalSummary);

  if (content.coreCompetencies) {
    drawSection("Core Competencies");
    for (const item of content.coreCompetencies) {
      drawText(`•  ${item}`, { x: MARGIN + 10, hangingIndent: bulletIndent });
    }
  }

  if (Array.isArray(content.technicalSkills)) {
    drawSection("Technical Skills");
    for (const skillGroup of content.technicalSkills) {
      if (typeof skillGroup === "object" && "category" in skillGroup) {
        const skills = Array.isArray(skillGroup.skills) ? skillGroup.skills.join(", ") : "";
        drawPrefixedText(`${skillGroup.category}:  `, skills, { x: MARGIN + 10, size: 10 });
      }
    }
  }

  drawSection("Professional Experience");
  for (const exp of content.experience) {
    ensureSpace(LINE_HEIGHT * 3);
    drawText(`${exp.title}  —  ${exp.company}`, { font: fontBold, size: 10 });
    drawText(exp.dates, { size: 9, color: darkGray });
    for (const bullet of exp.bullets) {
      drawText(`•  ${bullet}`, { x: MARGIN + 10, hangingIndent: bulletIndent });
    }
    y -= 4;
  }

  if (content.personalProjects && content.personalProjects.length > 0) {
    drawSection("Personal Projects");
    for (const project of content.personalProjects) {
      ensureSpace(LINE_HEIGHT * 2);
      const projectName = cleanInline(project.name);
      const projectUrl = project.url ? unwrapLink(cleanInline(project.url)) : "";
      const titleLine = projectUrl ? `${projectName}  —  ${projectUrl}` : projectName;
      drawText(titleLine, { font: fontBold, size: 10 });

      // Always render as prose (2 sentences)
      drawText(project.description);
      y -= 4;
    }
  }

  drawSection("Education");
  for (const edu of content.education) {
    const degreeLine = edu.fieldOfStudy
      ? `${edu.degree} in ${edu.fieldOfStudy}  —  ${edu.institution}  (${edu.year})`
      : `${edu.degree}  —  ${edu.institution}  (${edu.year})`;
    drawText(`•  ${degreeLine}`, { x: MARGIN + 10, hangingIndent: bulletIndent });
  }

  if (content.certifications.length > 0) {
    drawSection("Certifications");
    for (const cert of content.certifications) {
      drawText(`•  ${formatDateYYYYMM(cert)}`, { x: MARGIN + 10, hangingIndent: bulletIndent });
    }
  }

  return doc.save();
}

export async function generateCoverLetterPdf(content: {
  greeting: string;
  opening: string;
  bullets?: string[];
  body?: string;
  closing: string;
  signoff: string;
  candidateName: string;
  nameHeader?: string;
  contactInfo?: string;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0, 0, 0);
  const darkGray = rgb(0.3, 0.3, 0.3);

  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  if (content.nameHeader) {
    page.drawText(sanitizeText(content.nameHeader), { x: MARGIN, y, size: 20, font: fontBold, color: black });
    y -= 26;
  }

  if (content.contactInfo) {
    const contactWords = sanitizeText(content.contactInfo).split(" ");
    let contactLine = "";
    for (const word of contactWords) {
      const test = contactLine ? `${contactLine} ${word}` : word;
      if (fontRegular.widthOfTextAtSize(test, 9) > CONTENT_WIDTH && contactLine) {
        page.drawText(contactLine, { x: MARGIN, y, size: 9, font: fontRegular, color: darkGray });
        y -= LINE_HEIGHT;
        contactLine = word;
      } else {
        contactLine = test;
      }
    }
    if (contactLine) {
      page.drawText(contactLine, { x: MARGIN, y, size: 9, font: fontRegular, color: darkGray });
      y -= LINE_HEIGHT;
    }
    y -= 4;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 0.5,
      color: darkGray,
    });
    y -= LINE_HEIGHT;
  }

  function drawText(text: string, options: { font?: typeof fontRegular; size?: number } = {}) {
    const font = options.font ?? fontRegular;
    const size = options.size ?? 11;
    const words = sanitizeText(text).split(" ");
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) > CONTENT_WIDTH && line) {
        page.drawText(line, { x: MARGIN, y, size, font, color: black });
        y -= LINE_HEIGHT + 2;
        line = word;
      } else {
        line = test;
      }
    }
    if (line) {
      page.drawText(line, { x: MARGIN, y, size, font, color: black });
      y -= LINE_HEIGHT + 2;
    }
    y -= LINE_HEIGHT;
  }

  drawText(content.greeting, { font: fontBold });
  y -= 6;
  drawText(content.opening);

  if (content.bullets && content.bullets.length > 0) {
    y -= 4;
    drawText("Some of my notable achievements include:");
    y -= 4;
    const bulletPrefix = "•  ";
    const hangingIndent = fontRegular.widthOfTextAtSize(bulletPrefix, 11);
    for (const bullet of content.bullets) {
      const text = `${bulletPrefix}${sanitizeText(bullet)}`;
      const words = text.split(" ");
      let line = "";
      let isFirstLine = true;
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (fontRegular.widthOfTextAtSize(test, 11) > CONTENT_WIDTH - 20 && line) {
          const lineX = isFirstLine ? MARGIN + 10 : MARGIN + 10 + hangingIndent;
          page.drawText(line, { x: lineX, y, size: 11, font: fontRegular, color: black });
          y -= LINE_HEIGHT + 2;
          line = word;
          isFirstLine = false;
        } else {
          line = test;
        }
      }
      if (line) {
        const lineX = isFirstLine ? MARGIN + 10 : MARGIN + 10 + hangingIndent;
        page.drawText(line, { x: lineX, y, size: 11, font: fontRegular, color: black });
        y -= LINE_HEIGHT + 2;
      }
      y -= 4;
    }
    y -= LINE_HEIGHT - 4;
  } else if (content.body) {
    drawText(content.body);
  }

  drawText(content.closing);
  y -= 6;
  drawText(content.signoff, { font: fontBold });

  return doc.save();
}
