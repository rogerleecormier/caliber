import { createFileRoute } from "@tanstack/react-router";
import {
  MessageCircle,
  TrendingUp,
  Zap,
  Heart,
  Grid,
  Package,
  AlertCircle,
  Palette,
  ShoppingBag,
  Users,
  Zap as ProgressIcon,
  Clock,
  Package as LoadingIcon,
  Inbox,
} from "lucide-react";
import {
  BasicCard,
  FeaturedCard,
  StatCard,
  TestimonialCard,
  ImageCard,
  CTACard,
  PricingCard,
  AlertCard,
  ColorVariantCard,
  ProductCard,
  ProfileCard,
  ProgressCard,
  TimelineCard,
  SkeletonCard,
  EmptyStateCard,
  PrimaryCard,
  SecondaryCard,
  ToolCard,
  ComingSoonCard,
  StatsCard,
  InteractiveCard,
  PageHero,
  PageSection,
} from "@caliber/ui-kit";
import {
  Headline,
  Title,
  Body,
  Overline,
} from "@caliber/ui-kit";

export const Route = createFileRoute("/cards")({
  component: CardsLibrary,
});

function CardsLibrary() {
  return (
    <div className="spx-page">
      <div className="pb-2">
        <PageHero
          eyebrow="Component Library"
          icon={<Package className="h-3.5 w-3.5" />}
          title="Card Library"
          description="A comprehensive collection of reusable card components with the same glass-forward Spearyx presentation used across the product suite."
        />
      </div>

      <div className="py-8 [&>section]:rounded-[28px] [&>section]:border [&>section]:border-slate-200 [&>section]:bg-white/80 [&>section]:p-8 [&>section]:shadow-sm [&>section]:backdrop-blur-sm md:[&>section]:p-10">
        {/* Basic Card Section */}
        <PageSection className="mb-24">
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-2">
              <Grid className="w-6 h-6 text-red-500" />
              <Headline>Basic Card</Headline>
            </div>
            <Body className="text-neutral">
              The fundamental card component. Perfect for displaying simple
              content with a title and description.
            </Body>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <BasicCard
              title="Simple & Clean"
              description="Minimal design with just the essentials. Great for lists and general content."
            />
            <BasicCard
              title="Easy to Use"
              description="Drop it in anywhere. No complex configuration needed to get started."
            />
            <BasicCard
              title="Responsive"
              description="Works perfectly on mobile, tablet, and desktop devices out of the box."
            />
          </div>
        </PageSection>

        {/* Specialized Cards Section - NEW */}
        <PageSection className="mb-24">
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-2">
              <Palette className="w-6 h-6 text-indigo-500" />
              <Headline>Specialized Cards</Headline>
            </div>
            <Body className="text-neutral">
              Modern, purpose-built cards for specific use cases:
              Primary/Secondary for hierarchy, Tool cards for feature showcase,
              Coming Soon cards for announcements, Stats cards for metrics, and
              Interactive cards for engagement.
            </Body>
          </div>

          {/* Primary & Secondary Cards */}
          <div className="mb-12">
            <Title className="mb-6">Primary & Secondary Cards</Title>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <PrimaryCard
                title="Primary Action"
                description="Use for main actions and primary calls-to-action"
                icon="⚡"
              />
              <SecondaryCard
                title="Secondary Action"
                description="Perfect for supporting actions and visual hierarchy"
                icon="💡"
              />
            </div>
          </div>

          {/* Tool Cards */}
          <div className="mb-12">
            <Title className="mb-6">Tool & Feature Cards</Title>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <ToolCard
                title="RACI Chart Generator"
                description="Define roles and responsibilities with crystal clarity"
                icon="📊"
                status="available"
              />
              <ToolCard
                title="Project Charter Tool"
                description="Establish project foundations and scope"
                icon="📋"
                status="coming-soon"
              />
              <ToolCard
                title="Risk Analyzer"
                description="Identify and mitigate project risks"
                icon="⚠️"
                status="beta"
              />
            </div>
          </div>

          {/* Coming Soon Cards */}
          <div className="mb-12">
            <Title className="mb-6">Coming Soon Showcase</Title>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ComingSoonCard
                title="Advanced Analytics"
                subtitle="Powerful Insights"
                description="Deep-dive analytics and reporting tools"
                icon="📈"
                eta="Q2 2026"
              />
              <ComingSoonCard
                title="Team Collaboration Suite"
                subtitle="Work Together"
                description="Real-time collaboration and team features"
                icon="👥"
                eta="Q3 2026"
              />
            </div>
          </div>

          {/* Stats Cards */}
          <div className="mb-12">
            <Title className="mb-6">Statistics & Metrics</Title>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatsCard
                label="Active Projects"
                value="24"
                icon="📊"
                accentColor="primary"
                trend="up"
                trendValue="+12% from last month"
              />
              <StatsCard
                label="Team Members"
                value="8"
                icon="👥"
                accentColor="secondary"
                trend="up"
                trendValue="+2 this quarter"
              />
              <StatsCard
                label="Completed Tasks"
                value="156"
                icon="✓"
                accentColor="accent"
                trend="up"
                trendValue="+34 this week"
              />
              <StatsCard
                label="Completion Rate"
                value="87%"
                icon="🎯"
                accentColor="success"
                trend="neutral"
                trendValue="Steady"
              />
            </div>
          </div>

          {/* Interactive Cards */}
          <div className="mb-12">
            <Title className="mb-6">Interactive Cards with Hover Effects</Title>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <InteractiveCard
                title="Explore Features"
                description="Hover to discover interactive effects"
                icon="✨"
                accentColor="primary"
              />
              <InteractiveCard
                title="Learn More"
                description="Click to see professional polish"
                icon="🚀"
                accentColor="secondary"
              />
              <InteractiveCard
                title="Get Started"
                description="Interactive hover lift and glow"
                icon="⚡"
                accentColor="accent"
              />
            </div>
          </div>
        </PageSection>

        {/* Featured Card Section */}
        <section className="mb-24">
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-2">
              <Zap className="w-6 h-6 text-red-500" />
              <Headline>Featured Card</Headline>
            </div>
            <Body className="text-neutral">
              Eye-catching card with optional icon and colored left border.
              Perfect for highlighting important features.
            </Body>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FeaturedCard
              icon={<Zap className="text-red-500" size={24} />}
              title="Lightning Fast"
              description="Built for performance. Optimized load times and smooth interactions."
              accentColor="primary"
            />
            <FeaturedCard
              icon={<Heart className="text-green-500" size={24} />}
              title="User Loved"
              description="Trusted by thousands. Join our growing community of happy users."
              accentColor="accent"
            />
          </div>
        </section>

        {/* Stat Card Section */}
        <section className="mb-24">
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className="w-6 h-6 text-red-500" />
              <Headline>Stat Card</Headline>
            </div>
            <Body className="text-neutral">
              Display metrics and statistics with optional trend indicators.
              Perfect for dashboards and analytics pages.
            </Body>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard
              value="12.5K"
              label="Total Users"
              icon={<TrendingUp size={20} />}
              trend={{ direction: "up", value: "+12.5%" }}
            />
            <StatCard
              value="$52.8M"
              label="Revenue"
              icon={<TrendingUp size={20} />}
              trend={{ direction: "up", value: "+8.2%" }}
            />
            <StatCard
              value="99.9%"
              label="Uptime"
              icon={<TrendingUp size={20} />}
              trend={{ direction: "up", value: "+0.1%" }}
            />
            <StatCard
              value="4.9/5"
              label="Rating"
              icon={<Heart size={20} />}
              trend={{ direction: "up", value: "+0.2" }}
            />
          </div>
        </section>

        {/* Testimonial Card Section */}
        <section className="mb-24">
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-2">
              <MessageCircle className="w-6 h-6 text-red-500" />
              <Headline>Testimonial Card</Headline>
            </div>
            <Body className="text-neutral">
              Showcase customer feedback with quotes, avatars, and star ratings.
              Great for social proof.
            </Body>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <TestimonialCard
              quote="This has completely transformed how we work. Highly recommended!"
              author="Sarah Johnson"
              role="Product Manager"
              rating={5}
              avatar="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop"
            />
            <TestimonialCard
              quote="Best platform we've used. Support is fantastic and feature-rich."
              author="Michael Chen"
              role="CEO, Tech Startup"
              rating={5}
              avatar="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop"
            />
            <TestimonialCard
              quote="Amazing solution for our team. Easy to use and incredibly powerful."
              author="Emma Davis"
              role="Design Lead"
              rating={4}
              avatar="https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop"
            />
            <TestimonialCard
              quote="Saved us countless hours. The team is absolutely fantastic!"
              author="David Wilson"
              role="Operations Director"
              rating={5}
              avatar="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop"
            />
          </div>
        </section>

        {/* Image Card Section */}
        <section className="mb-24">
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-2">
              <Grid className="w-6 h-6 text-red-500" />
              <Headline>Image Card</Headline>
            </div>
            <Body className="text-neutral">
              Cards with featured images. Available in standard layout or with
              hover overlay effect.
            </Body>
          </div>

          {/* Standard Layout */}
          <div className="mb-16">
            <Title>Standard Layout</Title>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <ImageCard
                image="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=500&h=300&fit=crop"
                title="Ocean Serenity"
                description="Peaceful shores and endless horizons"
              />
              <ImageCard
                image="https://images.unsplash.com/photo-1511497584788-876760111969?w=500&h=300&fit=crop"
                title="Forest Trail"
                description="Nature's tranquil pathways"
              />
              <ImageCard
                image="https://images.unsplash.com/photo-1495521821757-a1efb6729352?w=500&h=300&fit=crop"
                title="Mountain Peak"
                description="Breathtaking alpine vistas"
              />
            </div>
          </div>

          {/* Overlay Variant */}
          <div>
            <Title>Overlay Variant (Hover)</Title>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <ImageCard
                image="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=500&h=300&fit=crop"
                title="Ocean Serenity"
                description="Hover to see details"
                overlay={true}
              />
              <ImageCard
                image="https://images.unsplash.com/photo-1511497584788-876760111969?w=500&h=300&fit=crop"
                title="Forest Trail"
                description="Interactive overlay effect"
                overlay={true}
              />
              <ImageCard
                image="https://images.unsplash.com/photo-1495521821757-a1efb6729352?w=500&h=300&fit=crop"
                title="Mountain Peak"
                description="Modern presentation style"
                overlay={true}
              />
            </div>
          </div>
        </section>

        {/* CTA Card Section */}
        <section className="mb-24">
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-2">
              <Zap className="w-6 h-6 text-red-500" />
              <Headline>Call-to-Action Card</Headline>
            </div>
            <Body className="text-neutral">
              Encourage user engagement with action-oriented cards. Perfect for
              promotions and next steps.
            </Body>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <CTACard
              title="Get Started Now"
              description="Join thousands of users. Start your free trial today with no credit card required."
              buttonText="Start Free Trial"
              buttonVariant="default"
              onButtonClick={() => alert("CTA clicked!")}
            />
            <CTACard
              title="Learn More"
              description="Explore our comprehensive documentation and discover all the features available."
              buttonText="View Docs"
              buttonVariant="secondary"
              onButtonClick={() => alert("Learn more clicked!")}
            />
          </div>
        </section>

        {/* Pricing Card Section */}
        <section className="mb-24">
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-2">
              <Zap className="w-6 h-6 text-red-500" />
              <Headline>Pricing Card</Headline>
            </div>
            <Body className="text-neutral">
              Display pricing tiers with features and CTA buttons. Perfect for
              product pricing pages.
            </Body>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <PricingCard
              name="Starter"
              price="29"
              description="Perfect for getting started"
              features={[
                "Up to 5 projects",
                "2 GB storage",
                "Basic support",
                "Community access",
                "Email notifications",
              ]}
              buttonText="Start Free"
              buttonVariant="outline"
              onButtonClick={() => alert("Starter plan clicked!")}
            />
            <PricingCard
              name="Professional"
              price="79"
              description="Most popular for teams"
              features={[
                "Unlimited projects",
                "100 GB storage",
                "Priority support",
                "Advanced analytics",
                "API access",
                "Team collaboration",
                "Custom integrations",
              ]}
              buttonText="Start Trial"
              featured={true}
              onButtonClick={() => alert("Professional plan clicked!")}
            />
            <PricingCard
              name="Enterprise"
              price="Custom"
              description="For large organizations"
              features={[
                "Everything in Pro",
                "Unlimited storage",
                "24/7 support",
                "Advanced security",
                "Custom contracts",
                "Dedicated manager",
                "SLA guarantee",
              ]}
              buttonText="Contact Sales"
              buttonVariant="secondary"
              onButtonClick={() => alert("Enterprise plan clicked!")}
            />
          </div>
        </section>

        {/* Alert Card Section */}
        <section className="mb-24">
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-2">
              <AlertCircle className="w-6 h-6 text-blue-500" />
              <Headline>Alert & Info Cards</Headline>
            </div>
            <Body className="text-neutral">
              Display important information, warnings, errors, and success
              messages with contextual styling.
            </Body>
          </div>
          <div className="space-y-4">
            <AlertCard
              variant="success"
              title="Success!"
              description="Your changes have been saved successfully."
            />
            <AlertCard
              variant="info"
              title="New Feature Available"
              description="Check out our latest updates to improve your workflow."
            />
            <AlertCard
              variant="warning"
              title="Warning"
              description="This action will affect 3 team members. Please proceed with caution."
            />
            <AlertCard
              variant="error"
              title="Error Occurred"
              description="Unable to process your request. Please try again later."
            />
          </div>

          <div className="mt-12 pt-8 border-t">
            <Title>Dismissible Alerts</Title>
            <div className="space-y-4">
              <AlertCard
                variant="success"
                title="Project Created"
                description="Your new project is ready to use."
                dismissible={true}
                onDismiss={() => alert("Alert dismissed!")}
              />
              <AlertCard
                variant="warning"
                title="Deprecation Notice"
                description="This API endpoint will be deprecated on December 31st."
                dismissible={true}
                onDismiss={() => alert("Alert dismissed!")}
              />
            </div>
          </div>

          <div className="mt-12 pt-8 border-t">
            <Title>With Additional Content</Title>
            <AlertCard
              variant="info"
              title="System Maintenance"
              description="We'll be performing scheduled maintenance."
            >
              <ul className="list-disc list-inside space-y-1 mt-3">
                <li>Maintenance window: 2:00 AM - 4:00 AM UTC</li>
                <li>Expected downtime: 30 minutes</li>
                <li>All services will be unavailable during this time</li>
              </ul>
            </AlertCard>
          </div>
        </section>

        {/* Color Variant Card Section */}
        <section className="mb-24">
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-2">
              <Palette className="w-6 h-6 text-purple-500" />
              <Headline>Color Variant Cards</Headline>
            </div>
            <Body className="text-neutral">
              Cards with 9 different color themes. Use color to organize,
              categorize, or highlight different content types.
            </Body>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ColorVariantCard
              color="red"
              title="Red Theme"
              description="Perfect for alerts, errors, or important actions that need attention."
            >
              This card uses a red color scheme to draw focus to critical
              information.
            </ColorVariantCard>
            <ColorVariantCard
              color="orange"
              title="Orange Theme"
              description="Great for warnings or content that needs moderate attention."
            >
              The orange theme provides a balanced, cautionary visual hierarchy.
            </ColorVariantCard>
            <ColorVariantCard
              color="yellow"
              title="Yellow Theme"
              description="Use for highlights, tips, or secondary important content."
            >
              Yellow provides a warm, inviting appearance for positive notices.
            </ColorVariantCard>
            <ColorVariantCard
              color="green"
              title="Green Theme"
              description="Ideal for success states, confirmations, and positive feedback."
            >
              Green conveys success, growth, and positive user actions.
            </ColorVariantCard>
            <ColorVariantCard
              color="blue"
              title="Blue Theme"
              description="The most versatile - perfect for information and neutral content."
            >
              Blue is trustworthy and works well for general information
              display.
            </ColorVariantCard>
            <ColorVariantCard
              color="indigo"
              title="Indigo Theme"
              description="Professional and sophisticated for premium features."
            >
              Indigo adds a touch of elegance and exclusivity to your interface.
            </ColorVariantCard>
            <ColorVariantCard
              color="purple"
              title="Purple Theme"
              description="Creative and modern - great for innovative features or new content."
            >
              Purple stands out and draws attention while remaining
              professional.
            </ColorVariantCard>
            <ColorVariantCard
              color="pink"
              title="Pink Theme"
              description="Friendly and approachable for user engagement and community features."
            >
              Pink creates a warm, inviting, and accessible user experience.
            </ColorVariantCard>
            <ColorVariantCard
              color="slate"
              title="Slate Theme"
              description="Neutral and clean - perfect for secondary or background content."
            >
              Slate provides a professional, understated appearance for neutral
              information.
            </ColorVariantCard>
          </div>
        </section>

        {/* Product Card Section */}
        <section className="mb-24">
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-2">
              <ShoppingBag className="w-6 h-6 text-blue-500" />
              <Headline>Product Cards</Headline>
            </div>
            <Body className="text-neutral">
              Perfect for e-commerce, portfolios, and product showcases with
              ratings, pricing, and cart functionality.
            </Body>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <ProductCard
              image="https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=300&h=300&fit=crop"
              title="Wireless Headphones"
              price={129.99}
              originalPrice={199.99}
              rating={4.5}
              reviewCount={248}
              description="Premium sound quality with noise cancellation"
              badge="Sale"
              badgeVariant="sale"
              onAddToCart={() => alert("Added to cart!")}
              onFavorite={() => alert("Favorited!")}
            />
            <ProductCard
              image="https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=300&h=300&fit=crop"
              title="Smart Watch"
              price={299.99}
              rating={5}
              reviewCount={512}
              description="Latest features with health tracking"
              badge="New"
              badgeVariant="new"
              onAddToCart={() => alert("Added to cart!")}
              onFavorite={() => alert("Favorited!")}
              isFavorited={true}
            />
            <ProductCard
              image="https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=300&h=300&fit=crop"
              title="Camera Sunglasses"
              price={89.99}
              rating={4}
              reviewCount={156}
              description="Capture moments hands-free"
              badge="Featured"
              badgeVariant="featured"
              onAddToCart={() => alert("Added to cart!")}
              onFavorite={() => alert("Favorited!")}
            />
          </div>
        </section>

        {/* Profile Card Section */}
        <section className="mb-24">
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-2">
              <Users className="w-6 h-6 text-green-500" />
              <Headline>Profile Cards</Headline>
            </div>
            <Body className="text-neutral">
              Display user profiles with avatars, roles, bios, and action
              buttons. Available in vertical and horizontal layouts.
            </Body>
          </div>

          <div className="mb-8">
            <Title>Vertical Layout</Title>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <ProfileCard
                avatar="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix"
                name="Sarah Johnson"
                title="Product Designer"
                description="Passionate about creating beautiful user experiences"
                actionButton={{
                  label: "View Profile",
                  onClick: () => alert("Profile clicked!"),
                }}
              />
              <ProfileCard
                avatar="https://api.dicebear.com/7.x/avataaars/svg?seed=Sophia"
                name="Alex Chen"
                title="Full Stack Developer"
                description="Building scalable web applications"
                actionButton={{
                  label: "Follow",
                  onClick: () => alert("Following!"),
                  variant: "outline",
                }}
              />
              <ProfileCard
                avatar="https://api.dicebear.com/7.x/avataaars/svg?seed=Jordan"
                name="Jordan Davis"
                title="Project Manager"
                description="Delivering projects on time and on budget"
                actionButton={{
                  label: "Message",
                  onClick: () => alert("Message sent!"),
                  variant: "secondary",
                }}
              />
            </div>
          </div>

          <div>
            <Title>Horizontal Layout</Title>
            <div className="space-y-4">
              <ProfileCard
                layout="horizontal"
                avatar="https://api.dicebear.com/7.x/avataaars/svg?seed=Taylor"
                name="Taylor Mitchell"
                title="UI/UX Designer"
                description="5+ years of experience in digital design"
                actionButton={{
                  label: "Connect",
                  onClick: () => alert("Connected!"),
                }}
              />
              <ProfileCard
                layout="horizontal"
                avatar="https://api.dicebear.com/7.x/avataaars/svg?seed=Morgan"
                name="Morgan Williams"
                title="Marketing Manager"
                description="Helping brands grow through strategic marketing"
                actionButton={{
                  label: "Follow",
                  onClick: () => alert("Following!"),
                  variant: "outline",
                }}
              />
            </div>
          </div>
        </section>

        {/* Progress Card Section */}
        <section className="mb-24">
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-2">
              <ProgressIcon className="w-6 h-6 text-purple-500" />
              <Headline>Progress Cards</Headline>
            </div>
            <Body className="text-neutral">
              Display progress in multiple formats: linear bars, circular
              indicators, and step-based tracking.
            </Body>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <ProgressCard
              title="Project Completion"
              description="Overall progress on current project"
              progress={65}
              progressColor="blue"
              variant="linear"
              showPercentage={true}
            />
            <ProgressCard
              title="Skill Level"
              description="Your React expertise"
              progress={85}
              progressColor="green"
              variant="linear"
              showPercentage={true}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <ProgressCard
              title="Download Progress"
              progress={45}
              progressColor="blue"
              variant="circular"
            />
            <ProgressCard
              title="Storage Used"
              progress={72}
              progressColor="purple"
              variant="circular"
            />
            <ProgressCard
              title="Battery Level"
              progress={38}
              progressColor="orange"
              variant="circular"
            />
          </div>

          <ProgressCard
            title="Onboarding Steps"
            description="Complete your profile setup"
            progress={60}
            variant="steps"
            steps={[
              { label: "Create Account", completed: true },
              { label: "Verify Email", completed: true },
              { label: "Add Profile Photo", completed: true },
              { label: "Choose Preferences", completed: false },
              { label: "Get Started", completed: false },
            ]}
            progressColor="green"
          />
        </section>

        {/* Timeline Card Section */}
        <section className="mb-24">
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-2">
              <Clock className="w-6 h-6 text-red-500" />
              <Headline>Timeline Cards</Headline>
            </div>
            <Body className="text-neutral">
              Display activity feeds, project history, and event timelines with
              status indicators.
            </Body>
          </div>

          <TimelineCard
            events={[
              {
                date: "Today at 2:30 PM",
                title: "Project Launched",
                description:
                  "Your new product is now live and available to users",
                status: "completed",
              },
              {
                date: "Yesterday at 10:15 AM",
                title: "Design Review Complete",
                description: "All design assets have been approved by the team",
                status: "completed",
              },
              {
                date: "Tomorrow at 3:00 PM",
                title: "Team Meeting",
                description:
                  "Q&A session with stakeholders about the new features",
                status: "current",
              },
              {
                date: "Next Week",
                title: "Beta Testing Phase",
                description: "Open beta program for early adopters",
                status: "upcoming",
              },
              {
                date: "In 2 weeks",
                title: "Public Release",
                description: "Full rollout to all users",
                status: "upcoming",
              },
            ]}
          />
        </section>

        {/* Skeleton Card Section */}
        <section className="mb-24">
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-2">
              <LoadingIcon className="w-6 h-6 text-indigo-500" />
              <Headline>Skeleton Cards</Headline>
            </div>
            <Body className="text-neutral">
              Use skeleton cards as loading placeholders to maintain layout
              stability while content loads.
            </Body>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <SkeletonCard variant="product" />
            <SkeletonCard variant="product" />
            <SkeletonCard variant="product" />
          </div>

          <div className="mb-8">
            <Title>Other Variants</Title>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <SkeletonCard variant="profile" />
              <SkeletonCard variant="feature" />
            </div>
          </div>
        </section>

        {/* Empty State Card Section */}
        <section className="mb-24">
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-2">
              <Inbox className="w-6 h-6 text-pink-500" />
              <Headline>Empty State Cards</Headline>
            </div>
            <Body className="text-neutral">
              Display when there's no content to show. Provides guidance and
              action options to users.
            </Body>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <EmptyStateCard
              icon={<Inbox className="w-12 h-12" />}
              title="No Messages"
              description="You don't have any messages yet. Start a conversation with someone to get started."
              actionButton={{
                label: "Send a Message",
                onClick: () => alert("Send message clicked!"),
              }}
            />
            <EmptyStateCard
              icon={<Package className="w-12 h-12" />}
              title="No Orders"
              description="You haven't placed any orders yet. Browse our products to get started."
              actionButton={{
                label: "Start Shopping",
                onClick: () => alert("Shopping clicked!"),
                variant: "secondary",
              }}
            />
          </div>

          <div className="mt-8">
            <EmptyStateCard
              icon={<Grid className="w-12 h-12" />}
              title="No Projects"
              description="Create your first project to start organizing your work and collaborating with your team."
              actionButton={{
                label: "Create Project",
                onClick: () => alert("Create project clicked!"),
                variant: "default",
              }}
            />
          </div>
        </section>

        {/* Usage Guide */}
        <section className="mb-24 border-t pt-16">
          <Headline className="mb-8">How to Use</Headline>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <Title>Import Cards</Title>
              <div className="bg-slate-900 rounded-lg p-6 overflow-x-auto">
                <pre className="text-slate-100 text-sm font-mono">
                  {`import {
  BasicCard,
  FeaturedCard,
  StatCard,
  TestimonialCard,
  ImageCard,
  CTACard,
  PricingCard,
  AlertCard,
  ColorVariantCard,
  ProductCard,
  ProfileCard,
  ProgressCard,
  TimelineCard,
  SkeletonCard,
  EmptyStateCard,
} from '@caliber/ui-kit'`}
                </pre>
              </div>
            </div>
            <div>
              <Title>Use in Components</Title>
              <div className="bg-slate-900 rounded-lg p-6 overflow-x-auto">
                <pre className="text-slate-100 text-sm font-mono">
                  {`<BasicCard
  title="Hello"
  description="Your card here"
/>

<FeaturedCard
  icon={<Icon />}
  title="Featured"
  description="With icon"
/>`}
                </pre>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="bg-slate-50 rounded-xl p-8 md:p-12">
          <Headline className="mb-8">Features</Headline>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-red-500 text-white">
                  <Zap size={20} />
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Fully Modular</h3>
                <p className="text-slate-600 text-sm">
                  Mix and match components as needed
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-red-500 text-white">
                  <Grid size={20} />
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">
                  Responsive Design
                </h3>
                <p className="text-slate-600 text-sm">
                  Works on all screen sizes
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-red-500 text-white">
                  <Heart size={20} />
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Customizable</h3>
                <p className="text-slate-600 text-sm">
                  Easy to customize colors and styling
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
