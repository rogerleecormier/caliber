import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  BorderStyle,
  SectionType,
} from "docx";
import type { AtsResumeContent } from "./ats-format";

const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function formatDateYYYYMM(text: string): string {
  const m = (text ?? "").match(/(\d{4})-(\d{2})/);
  if (!m) return text;
  const [, year, month] = m;
  const monthName = MONTHS[parseInt(month, 10)] || month;
  return text.replace(/\d{4}-\d{2}/, `${monthName} ${year}`);
}

function unwrapLink(text: string): string {
  const m = (text ?? "").trim().match(/^\[[^\]]*\]\(([^)]+)\)$/);
  return m ? m[1].trim() : text;
}

function cleanInline(text: string): string {
  return (text ?? "").replace(/\\([-.*_#+()\[\]`])/g, "$1");
}

function sectionHeading(title: string): Paragraph[] {
  return [
    new Paragraph({
      children: [new TextRun({ text: title.toUpperCase(), bold: true, size: 22, font: "Calibri" })],
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: "333333", space: 1 },
      },
      spacing: { before: 200, after: 80 },
    }),
  ];
}

function bulletParagraph(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 20, font: "Calibri" })],
    bullet: { level: 0 },
    spacing: { after: 40 },
  });
}

export async function generateResumeDocx(content: AtsResumeContent): Promise<Uint8Array> {
  const paragraphs: Paragraph[] = [];

  // Name header
  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: content.nameHeader, bold: true, size: 36, font: "Calibri" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
    }),
  );

  // Contact info
  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: content.contactInfo, size: 18, color: "444444", font: "Calibri" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
    }),
  );

  // Professional Summary
  paragraphs.push(...sectionHeading("Professional Summary"));
  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: content.professionalSummary, size: 20, font: "Calibri" })],
      spacing: { after: 80 },
    }),
  );

  // Core Competencies
  if (content.coreCompetencies?.length) {
    paragraphs.push(...sectionHeading("Core Competencies"));
    for (const item of content.coreCompetencies) {
      paragraphs.push(bulletParagraph(item));
    }
  }

  // Technical Skills
  if (content.technicalSkills?.length) {
    paragraphs.push(...sectionHeading("Technical Skills"));
    for (const group of content.technicalSkills) {
      const skillsText = Array.isArray(group.skills) ? group.skills.join(", ") : "";
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${group.category}: `, bold: true, size: 20, font: "Calibri" }),
            new TextRun({ text: skillsText, size: 20, font: "Calibri" }),
          ],
          // APA 7-style hanging indent: first line at margin, continuations indented 180 twips (~0.125in)
          indent: { left: 180, hanging: 180 },
          spacing: { after: 60 },
        }),
      );
    }
  }

  // Professional Experience
  paragraphs.push(...sectionHeading("Professional Experience"));
  for (const exp of content.experience) {
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: `${exp.title}  —  ${exp.company}`, bold: true, size: 20, font: "Calibri" })],
        spacing: { before: 120, after: 30 },
      }),
    );
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: exp.dates, size: 18, color: "555555", font: "Calibri" })],
        spacing: { after: 60 },
      }),
    );
    for (const bullet of exp.bullets) {
      paragraphs.push(bulletParagraph(bullet));
    }
  }

  // Personal Projects
  if (content.personalProjects?.length) {
    paragraphs.push(...sectionHeading("Personal Projects"));
    for (const project of content.personalProjects) {
      const projectName = cleanInline(project.name);
      const projectUrl = project.url ? unwrapLink(cleanInline(project.url)) : "";
      const titleText = projectUrl ? `${projectName}  —  ${projectUrl}` : projectName;
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: titleText, bold: true, size: 20, font: "Calibri" })],
          spacing: { before: 120, after: 40 },
        }),
      );
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: project.description, size: 20, font: "Calibri" })],
          spacing: { after: 60 },
        }),
      );
    }
  }

  // Education
  paragraphs.push(...sectionHeading("Education"));
  for (const edu of content.education) {
    const degreeLine = edu.fieldOfStudy
      ? `${edu.degree} in ${edu.fieldOfStudy}  —  ${edu.institution}  (${edu.year})`
      : `${edu.degree}  —  ${edu.institution}  (${edu.year})`;
    paragraphs.push(bulletParagraph(degreeLine));
  }

  // Certifications
  if (content.certifications?.length) {
    paragraphs.push(...sectionHeading("Certifications"));
    for (const cert of content.certifications) {
      paragraphs.push(bulletParagraph(formatDateYYYYMM(cert)));
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          type: SectionType.CONTINUOUS,
          page: {
            margin: {
              top: 720,
              bottom: 720,
              left: 900,
              right: 900,
            },
          },
        },
        children: paragraphs,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return new Uint8Array(buffer);
}

export async function generateCoverLetterDocx(content: {
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
  const paragraphs: Paragraph[] = [];

  if (content.nameHeader) {
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: content.nameHeader, bold: true, size: 36, font: "Calibri" })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
      }),
    );
  }

  if (content.contactInfo) {
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: content.contactInfo, size: 18, color: "444444", font: "Calibri" })],
        alignment: AlignmentType.CENTER,
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "333333", space: 2 } },
        spacing: { after: 200 },
      }),
    );
  }

  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: content.greeting, bold: true, size: 22, font: "Calibri" })],
      spacing: { after: 160 },
    }),
  );

  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: content.opening, size: 22, font: "Calibri" })],
      spacing: { after: 160 },
    }),
  );

  if (content.bullets?.length) {
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: "Some of my notable achievements include:", size: 22, font: "Calibri" })],
        spacing: { after: 80 },
      }),
    );
    for (const bullet of content.bullets) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: bullet, size: 22, font: "Calibri" })],
          bullet: { level: 0 },
          spacing: { after: 80 },
        }),
      );
    }
    paragraphs.push(new Paragraph({ children: [], spacing: { after: 80 } }));
  } else if (content.body) {
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: content.body, size: 22, font: "Calibri" })],
        spacing: { after: 160 },
      }),
    );
  }

  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: content.closing, size: 22, font: "Calibri" })],
      spacing: { after: 160 },
    }),
  );

  paragraphs.push(
    new Paragraph({
      children: [new TextRun({ text: content.signoff, bold: true, size: 22, font: "Calibri" })],
      spacing: { after: 80 },
    }),
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          type: SectionType.CONTINUOUS,
          page: { margin: { top: 720, bottom: 720, left: 900, right: 900 } },
        },
        children: paragraphs,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return new Uint8Array(buffer);
}
