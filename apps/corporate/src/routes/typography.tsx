import { createFileRoute } from "@tanstack/react-router";
import { Type } from "lucide-react";
import {
  Hero,
  Headline,
  Title,
  Subtitle,
  Body,
  Caption,
  Label,
  Overline,
  PageHero,
} from "@caliber/ui-kit";

export const Route = createFileRoute("/typography")({
  component: TypographyLibrary,
});

function TypographyLibrary() {
  const colors = {
    primary: {
      name: "Primary Red",
      class: "text-red-500",
      hex: "#ef4444",
      description: "Brand primary color - use for main actions",
    },
    "primary-light": {
      name: "Primary Light",
      class: "text-red-400",
      hex: "#f87171",
      description: "Lighter red for hover and active states",
    },
    secondary: {
      name: "Secondary Indigo",
      class: "text-indigo-500",
      hex: "#6366f1",
      description: "Professional secondary color - use for visual hierarchy",
    },
    "secondary-light": {
      name: "Secondary Light",
      class: "text-indigo-400",
      hex: "#818cf8",
      description: "Lighter indigo for secondary actions",
    },
    accent: {
      name: "Accent Emerald",
      class: "text-emerald-500",
      hex: "#22c55e",
      description: "Success and positive indicators",
    },
    "accent-light": {
      name: "Accent Light",
      class: "text-emerald-400",
      hex: "#4ade80",
      description: "Lighter emerald for accents",
    },
    info: {
      name: "Info Blue",
      class: "text-blue-500",
      hex: "#3b82f6",
      description: "Informational messages and secondary actions",
    },
    "info-light": {
      name: "Info Light",
      class: "text-blue-400",
      hex: "#60a5fa",
      description: "Lighter blue for info states",
    },
    success: {
      name: "Success Teal",
      class: "text-teal-500",
      hex: "#14b8a6",
      description: "Successful operations",
    },
    "success-light": {
      name: "Success Light",
      class: "text-teal-400",
      hex: "#2dd4bf",
      description: "Lighter teal for success states",
    },
    warning: {
      name: "Warning Amber",
      class: "text-amber-500",
      hex: "#f59e0b",
      description: "Warnings and caution",
    },
    "warning-light": {
      name: "Warning Light",
      class: "text-amber-400",
      hex: "#fbbf24",
      description: "Lighter amber for warnings",
    },
    error: {
      name: "Error Rose",
      class: "text-rose-500",
      hex: "#ff6b85",
      description: "Errors and critical alerts",
    },
    "error-light": {
      name: "Error Light",
      class: "text-rose-400",
      hex: "#fb7185",
      description: "Lighter rose for error states",
    },
    "neutral-dark": {
      name: "Neutral Dark",
      class: "text-slate-900",
      hex: "#111827",
      description: "Primary text color",
    },
    neutral: {
      name: "Neutral Medium",
      class: "text-slate-500",
      hex: "#6b7280",
      description: "Secondary text color",
    },
    "neutral-light": {
      name: "Neutral Light",
      class: "text-slate-400",
      hex: "#9ca3af",
      description: "Tertiary text color",
    },
    "neutral-lighter": {
      name: "Neutral Lighter",
      class: "text-slate-300",
      hex: "#d1d5db",
      description: "Disabled and placeholder text",
    },
  };

  const fontWeights = [
    { name: "Thin", class: "font-thin", weight: "100" },
    { name: "Extra Light", class: "font-extralight", weight: "200" },
    { name: "Light", class: "font-light", weight: "300" },
    { name: "Normal", class: "font-normal", weight: "400" },
    { name: "Medium", class: "font-medium", weight: "500" },
    { name: "Semi Bold", class: "font-semibold", weight: "600" },
    { name: "Bold", class: "font-bold", weight: "700" },
    { name: "Extra Bold", class: "font-extrabold", weight: "800" },
    { name: "Black", class: "font-black", weight: "900" },
  ];

  const letterSpacings = [
    { name: "Ultra Tight", class: "tracking-ultra-tight", value: "-0.1em" },
    { name: "Tighter", class: "tracking-tighter", value: "-0.05em" },
    { name: "Tight", class: "tracking-tight", value: "-0.025em" },
    { name: "Normal", class: "tracking-normal", value: "0em" },
    { name: "Wide", class: "tracking-wide", value: "0.025em" },
    { name: "Wider", class: "tracking-wider", value: "0.05em" },
    { name: "Widest", class: "tracking-widest", value: "0.1em" },
  ];

  const lineHeights = [
    { name: "Tight XS", class: "leading-tight-xs", value: "1" },
    { name: "Tight", class: "leading-tight", value: "1.2" },
    { name: "Snug", class: "leading-snug", value: "1.35" },
    { name: "Normal", class: "leading-normal", value: "1.5" },
    { name: "Relaxed", class: "leading-relaxed", value: "1.65" },
    { name: "Loose", class: "leading-loose", value: "2" },
  ];

  return (
    <div className="spx-page">
      <div className="pb-2">
        <PageHero
          eyebrow="Component Library"
          icon={<Type className="h-3.5 w-3.5" />}
          title="Typography Styles"
          description="Explore the shared typography system, color roles, and spacing choices used to keep Spearyx readable, modern, and consistent across apps."
        />
      </div>

      <section className="py-10">
        <div className="max-w-6xl mx-auto">
          <div className="rounded-[28px] border border-slate-200 bg-white/80 p-8 shadow-sm backdrop-blur-sm md:p-10">
            <Overline className="mb-8 text-red-500">
              Typography Hierarchy
            </Overline>
            <Headline className="mb-12">Text Styles & Variants</Headline>

            <div className="space-y-16">
            {/* Hero */}
            <div className="space-y-4">
              <Title>Hero</Title>
              <div className="space-y-3 bg-slate-50 p-8 rounded-lg border border-slate-200">
                <Hero>Bold Hero Heading</Hero>
                <Hero variant="semibold">Semibold Hero Heading</Hero>
              </div>
            </div>

            {/* Display */}
            <div className="space-y-4">
              <Title>Display</Title>
              <div className="space-y-3 bg-slate-50 p-8 rounded-lg border border-slate-200">
                <Display>Bold Display Heading</Display>
                <Display variant="semibold">Semibold Display Heading</Display>
              </div>
            </div>

            {/* Headline */}
            <div className="space-y-4">
              <Title>Headline</Title>
              <div className="space-y-3 bg-slate-50 p-8 rounded-lg border border-slate-200">
                <Headline>Bold Headline Heading</Headline>
                <Headline variant="semibold">
                  Semibold Headline Heading
                </Headline>
              </div>
            </div>

            {/* Title */}
            <div className="space-y-4">
              <Title>Title</Title>
              <div className="space-y-3 bg-slate-50 p-8 rounded-lg border border-slate-200">
                <Title>Bold Title</Title>
                <Title variant="semibold">Semibold Title</Title>
              </div>
            </div>

            {/* Subtitle */}
            <div className="space-y-4">
              <Title>Subtitle</Title>
              <div className="space-y-3 bg-slate-50 p-8 rounded-lg border border-slate-200">
                <Subtitle>Semibold Subtitle</Subtitle>
                <Subtitle variant="regular">Regular Subtitle</Subtitle>
              </div>
            </div>

            {/* Body */}
            <div className="space-y-4">
              <Title>Body</Title>
              <div className="space-y-3 bg-slate-50 p-8 rounded-lg border border-slate-200">
                <div>
                  <Body size="lg">Body Large - Normal Weight</Body>
                  <Body size="lg" weight="semibold">
                    Body Large - Semibold Weight
                  </Body>
                </div>
                <div>
                  <Body size="base">Body Base - Normal Weight</Body>
                  <Body size="base" weight="medium">
                    Body Base - Medium Weight
                  </Body>
                  <Body size="base" weight="semibold">
                    Body Base - Semibold Weight
                  </Body>
                </div>
                <div>
                  <Body size="sm">Body Small - Normal Weight</Body>
                  <Body size="sm" weight="semibold">
                    Body Small - Semibold Weight
                  </Body>
                </div>
              </div>
            </div>

            {/* Caption */}
            <div className="space-y-4">
              <Title>Caption</Title>
              <div className="space-y-3 bg-slate-50 p-8 rounded-lg border border-slate-200">
                <Caption>Normal Caption</Caption>
                <Caption variant="semibold">Semibold Caption</Caption>
              </div>
            </div>

            {/* Label */}
            <div className="space-y-4">
              <Title>Label</Title>
              <div className="space-y-3 bg-slate-50 p-8 rounded-lg border border-slate-200">
                <Label>Normal Label</Label>
                <Label variant="semibold">Semibold Label</Label>
              </div>
            </div>

              {/* Overline */}
              <div className="space-y-4">
                <Title>Overline</Title>
                <div className="space-y-3 bg-slate-50 p-8 rounded-lg border border-slate-200">
                  <Overline>Overline Text</Overline>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Text Colors Section */}
      <section className="px-4 py-10">
        <div className="max-w-6xl mx-auto rounded-[28px] border border-slate-200 bg-white/80 p-8 shadow-sm backdrop-blur-sm md:p-10">
          <Overline className="mb-8 text-red-500">Color System</Overline>
          <Headline className="mb-12">Text Colors</Headline>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.entries(colors).map(([key, color]) => (
              <div
                key={key}
                className="bg-white rounded-lg border border-slate-200 p-6 hover-lift"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div
                    className="w-16 h-16 rounded-lg border border-slate-300 flex-shrink-0"
                    style={{
                      backgroundColor: color.hex,
                    }}
                  />
                  <div className="flex-1">
                    <Caption className="text-neutral-light">{key}</Caption>
                    <Title className="text-base">{color.name}</Title>
                    <Caption className="text-neutral">{color.hex}</Caption>
                  </div>
                </div>
                <Body size="sm" className="text-neutral mb-3">
                  {color.description}
                </Body>
                <Body className={`${color.class} font-medium`}>
                  The quick brown fox
                </Body>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Font Weights Section */}
      <section className="px-4 py-10">
        <div className="max-w-6xl mx-auto rounded-[28px] border border-slate-200 bg-white/80 p-8 shadow-sm backdrop-blur-sm md:p-10">
          <Overline className="mb-8 text-red-500">Typography Settings</Overline>
          <Headline className="mb-12">Font Weights</Headline>

          <div className="space-y-4">
            {fontWeights.map((weight) => (
              <div
                key={weight.class}
                className="bg-slate-50 rounded-lg border border-slate-200 p-6"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <Caption className="text-neutral-light">
                      {weight.class}
                    </Caption>
                    <Title>{weight.name}</Title>
                  </div>
                  <span className="text-neutral-light text-sm font-medium">
                    Weight {weight.weight}
                  </span>
                </div>
                <p className={`text-lg mt-4 ${weight.class}`}>
                  The quick brown fox jumps over the lazy dog
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Letter Spacing Section */}
      <section className="px-4 py-10">
        <div className="max-w-6xl mx-auto rounded-[28px] border border-slate-200 bg-white/80 p-8 shadow-sm backdrop-blur-sm md:p-10">
          <Overline className="mb-8 text-red-500">Spacing</Overline>
          <Headline className="mb-12">Letter Spacing</Headline>

          <div className="space-y-4">
            {letterSpacings.map((spacing) => (
              <div
                key={spacing.class}
                className="bg-slate-50 rounded-lg border border-slate-200 p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <Caption className="text-neutral-light">
                      {spacing.class}
                    </Caption>
                    <Title>{spacing.name}</Title>
                  </div>
                  <span className="text-neutral-light text-sm font-medium">
                    {spacing.value}
                  </span>
                </div>
                <p className={`text-base ${spacing.class}`}>
                  The quick brown fox jumps over the lazy dog
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Line Height Section */}
      <section className="px-4 py-10">
        <div className="max-w-6xl mx-auto rounded-[28px] border border-slate-200 bg-white/80 p-8 shadow-sm backdrop-blur-sm md:p-10">
          <Overline className="mb-8 text-red-500">Spacing</Overline>
          <Headline className="mb-12">Line Heights</Headline>

          <div className="space-y-4">
            {lineHeights.map((lineHeight) => (
              <div
                key={lineHeight.class}
                className="bg-slate-50 rounded-lg border border-slate-200 p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <Caption className="text-slate-400">
                      {lineHeight.class}
                    </Caption>
                    <Title>{lineHeight.name}</Title>
                  </div>
                  <span className="text-slate-400 text-sm font-medium">
                    {lineHeight.value}
                  </span>
                </div>
                <p className={`${lineHeight.class} text-slate-700 max-w-2xl`}>
                  The quick brown fox jumps over the lazy dog. The quick brown
                  fox jumps over the lazy dog. The quick brown fox jumps over
                  the lazy dog. The quick brown fox jumps over the lazy dog. The
                  quick brown fox jumps over the lazy dog. The quick brown fox
                  jumps over the lazy dog.
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Combined Examples Section */}
      <section className="px-4 py-10">
        <div className="max-w-6xl mx-auto rounded-[28px] border border-slate-200 bg-white/80 p-8 shadow-sm backdrop-blur-sm md:p-10">
          <Overline className="mb-8 text-red-500">Examples</Overline>
          <Headline className="mb-12">Combined Typography Examples</Headline>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
            {/* Card Example 1 */}
            <div className="bg-white rounded-lg border border-slate-200 p-8 hover-lift">
              <Overline className="text-red-500 mb-2">Primary Brand</Overline>
              <Headline className="text-red-500 mb-2">
                Primary Showcase
              </Headline>
              <Body className="text-neutral mb-4">
                This card demonstrates the primary red color system for main
                actions and brand elements.
              </Body>
              <div className="flex items-center gap-2">
                <div className="w-2 h-8 bg-red-500 rounded-sm"></div>
                <Body className="text-red-500 font-semibold">
                  Primary Action
                </Body>
              </div>
            </div>

            {/* Card Example 2 */}
            <div className="bg-white rounded-lg border border-indigo-200 p-8 hover-lift">
              <Overline className="text-indigo-500 mb-2">
                Secondary Hierarchy
              </Overline>
              <Headline className="text-indigo-500 mb-2">
                Secondary Showcase
              </Headline>
              <Body className="text-neutral mb-4">
                Secondary indigo provides professional hierarchy and supporting
                actions across the interface.
              </Body>
              <div className="flex items-center gap-2">
                <div className="w-2 h-8 bg-indigo-500 rounded-sm"></div>
                <Body className="text-indigo-500 font-semibold">
                  Secondary Action
                </Body>
              </div>
            </div>

            {/* Card Example 3 */}
            <div className="bg-white rounded-lg border border-emerald-200 p-8 hover-lift">
              <Overline className="text-emerald-600 mb-2">
                Growth & Success
              </Overline>
              <Headline className="text-emerald-600 mb-2">
                Accent Colors
              </Headline>
              <Body className="text-neutral mb-4">
                Emerald accent conveys growth, success, and positive actions
                throughout the design.
              </Body>
              <div className="flex items-center gap-2">
                <div className="w-2 h-8 bg-emerald-500 rounded-sm"></div>
                <Body className="text-emerald-600 font-semibold">
                  Success State
                </Body>
              </div>
            </div>

            {/* Card Example 4 */}
            <div className="bg-white rounded-lg border border-blue-200 p-8 hover-lift">
              <Overline className="text-blue-600 mb-2">Information</Overline>
              <Headline className="text-blue-600 mb-2">Info System</Headline>
              <Body className="text-neutral mb-4">
                Blue provides informational context, tips, and secondary
                communication throughout UI.
              </Body>
              <div className="flex items-center gap-2">
                <div className="w-2 h-8 bg-blue-500 rounded-sm"></div>
                <Body className="text-blue-600 font-semibold">Information</Body>
              </div>
            </div>
          </div>

          {/* Gradient Text Examples */}
          <div className="mb-12">
            <Overline className="mb-6 text-red-500">Advanced Styling</Overline>
            <Headline className="mb-8">Gradient Text Utilities</Headline>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-lg border border-slate-200 p-8 text-center hover-lift">
                <Headline className="bg-gradient-to-r from-red-500 to-red-700 bg-clip-text text-transparent mb-4">
                  Primary Gradient
                </Headline>
                <Body size="sm" className="text-slate-600">
                  Bold red gradient for emphasis and brand moments
                </Body>
              </div>

              <div className="bg-white rounded-lg border border-slate-200 p-8 text-center hover-lift">
                <Headline className="bg-gradient-to-r from-indigo-500 to-indigo-700 bg-clip-text text-transparent mb-4">
                  Secondary Gradient
                </Headline>
                <Body size="sm" className="text-slate-600">
                  Professional indigo gradient for key highlights
                </Body>
              </div>

              <div className="bg-white rounded-lg border border-slate-200 p-8 text-center hover-lift">
                <Headline className="bg-gradient-to-r from-emerald-500 to-emerald-700 bg-clip-text text-transparent mb-4">
                  Accent Gradient
                </Headline>
                <Body size="sm" className="text-slate-600">
                  Emerald gradient for success and growth moments
                </Body>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer Section */}
      <section className="px-4 pb-12 pt-2">
        <div className="max-w-6xl mx-auto rounded-[28px] border border-slate-200 bg-white/80 px-8 py-10 text-center shadow-sm backdrop-blur-sm">
          <Body className="text-neutral mb-2">
            Explore these typography styles in your designs
          </Body>
          <Caption className="text-neutral-light">
            All components are available in the Typography library
          </Caption>
        </div>
      </section>
    </div>
  );
}
