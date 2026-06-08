import { Link } from "wouter";
import {
  Twitter,
  Send,
  Github,
  Youtube,
  Instagram,
  Facebook,
  Linkedin,
  MessageCircle,
  Mail,
  Shield,
  Lock,
  Award,
  Globe2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSiteConfig, type FooterSocial, type FooterBadge } from "@/lib/siteConfig";

const SOCIAL_ICONS: Record<string, LucideIcon> = {
  twitter:   Twitter,
  telegram:  Send,
  instagram: Instagram,
  youtube:   Youtube,
  github:    Github,
  facebook:  Facebook,
  linkedin:  Linkedin,
  discord:   MessageCircle,
};

const BADGE_ICONS: Record<string, LucideIcon> = {
  shield: Shield,
  lock:   Lock,
  award:  Award,
};

export function AppFooter() {
  const { brand, footer } = useSiteConfig();

  return (
    <footer className="mt-auto border-t border-border bg-gradient-to-b from-card/40 to-card/80">
      {/* ── Top: Newsletter strip ─────────────────────────────── */}
      <div className="border-b border-border/60">
        <div className="container mx-auto px-4 py-8 flex flex-col md:flex-row items-start md:items-center gap-6 justify-between">
          <div>
            <h3 className="text-lg font-bold">Stay in the market</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Get weekly market briefings, new listings and product updates — straight to your inbox.
            </p>
          </div>
          <form
            className="flex w-full md:w-auto md:min-w-[420px] gap-2"
            onSubmit={(e) => e.preventDefault()}
          >
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="email"
                placeholder="you@example.com"
                className="pl-9 bg-background border-border"
                aria-label="Email address"
              />
            </div>
            <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90 px-6">
              Subscribe
            </Button>
          </form>
        </div>
      </div>

      {/* ── Middle: Brand + columns ───────────────────────────── */}
      <div className="container mx-auto px-4 py-12 grid gap-10 md:grid-cols-12">
        {/* Brand block */}
        <div className="md:col-span-4 lg:col-span-4 space-y-4">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 text-black font-extrabold text-lg flex items-center justify-center shadow-lg">
              {brand.name.charAt(0).toUpperCase()}
            </span>
            <span className="text-xl font-extrabold tracking-tight">
              {brand.name}<span className="text-primary">.</span>
            </span>
          </Link>
          <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
            {brand.tagline}
          </p>

          {/* Trust badges */}
          {footer.badges.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {footer.badges.map((b) => <TrustBadge key={b.label} badge={b} />)}
            </div>
          )}

          {/* Socials */}
          {footer.socials.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-3">
              {footer.socials.map((s) => <SocialLink key={s.label} social={s} />)}
            </div>
          )}
        </div>

        {/* Link columns */}
        <div className="md:col-span-8 lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-6">
          {footer.columns.map((col) => (
            <div key={col.title}>
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground/90 mb-3">
                {col.title}
              </h4>
              <ul className="space-y-2.5">
                {col.links.map((l) => (
                  <li key={`${col.title}:${l.label}`}>
                    {l.external || /^https?:\/\//.test(l.href) ? (
                      <a
                        href={l.href}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-sm text-muted-foreground hover:text-primary transition-colors"
                      >
                        {l.label}
                      </a>
                    ) : (
                      <Link
                        href={l.href}
                        className="text-sm text-muted-foreground hover:text-primary transition-colors"
                      >
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* ── Risk disclaimer ───────────────────────────────────── */}
      {footer.riskWarning && (
        <div className="border-t border-border/60">
          <div className="container mx-auto px-4 py-5 text-[11px] leading-relaxed text-muted-foreground">
            <strong className="text-foreground/90">Risk warning:</strong> {footer.riskWarning}
          </div>
        </div>
      )}

      {/* ── Bottom strip ──────────────────────────────────────── */}
      <div className="border-t border-border bg-background/60">
        <div className="container mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <div>{brand.copyright.replace(/^©\s*/, "© ").replace(/\{year\}/g, String(new Date().getFullYear()))}</div>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              All systems operational
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Globe2 className="h-3 w-3" />
              English (IN)
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function SocialLink({ social }: { social: FooterSocial }) {
  const Icon = SOCIAL_ICONS[social.kind] ?? Globe2;
  return (
    <a
      href={social.href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={social.label}
      title={social.label}
      className="h-9 w-9 rounded-lg border border-border bg-background/60 text-muted-foreground hover:text-primary hover:border-primary/50 flex items-center justify-center transition-colors"
    >
      <Icon className="h-4 w-4" />
    </a>
  );
}

function TrustBadge({ badge }: { badge: FooterBadge }) {
  const Icon = BADGE_ICONS[badge.kind] ?? Shield;
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-border bg-background/40 text-[11px] text-muted-foreground">
      <span className="text-primary"><Icon className="h-3 w-3" /></span>
      {badge.label}
    </span>
  );
}
