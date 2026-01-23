/**
 * Landing Page
 *
 * Marketing homepage showcasing Mouse product.
 * Uses HIC AI design system (Midnight Navy, Frost White, Cerulean Mist).
 */

import Link from "next/link";
import { Header, Footer } from "@/components/layout";
import { Button, Badge } from "@/components/ui";
import { PRICING, EXTERNAL_URLS } from "@/lib/constants";

export default function HomePage() {
  return (
    <>
      <Header />
      <main className="pt-16">
        {/* Hero Section */}
        <section className="min-h-[90vh] flex items-center justify-center relative overflow-hidden">
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-b from-midnight-navy via-midnight-navy to-midnight-navy/95" />
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-cerulean-mist/10 blur-[120px] rounded-full" />

          <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
            <Badge variant="info" className="mb-6">
              Now in Public Beta
            </Badge>

            <h1 className="text-5xl md:text-7xl font-bold text-frost-white leading-tight mb-6">
              The First Proven Treatment for{" "}
              <span className="text-gradient">Execution Slop</span>
            </h1>

            <p className="text-xl md:text-2xl text-silver max-w-3xl mx-auto mb-10">
              Mouse gives AI coding agents the precision tools they need to edit
              files reliably. Stop watching agents fumble with basic file
              operations.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button href="/pricing" size="lg">
                Start Free Trial
              </Button>
              <Button href={EXTERNAL_URLS.docs} variant="secondary" size="lg">
                Read the Docs
              </Button>
            </div>

            <p className="mt-6 text-sm text-slate-grey">
              14-day free trial • No credit card required
            </p>
          </div>
        </section>

        {/* Problem/Solution Section */}
        <section id="features" className="py-24 bg-midnight-navy">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold text-frost-white mb-4">
                AI Agents Can&apos;t Edit Files
              </h2>
              <p className="text-xl text-silver max-w-2xl mx-auto">
                Current tools weren&apos;t designed for agents. Mouse was built
                from the ground up to solve the precision problem.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
              {/* Problem */}
              <div className="card bg-error/5 border-error/20">
                <h3 className="text-xl font-semibold text-error mb-4">
                  ❌ The Problem
                </h3>
                <ul className="space-y-3 text-silver">
                  <li className="flex items-start gap-3">
                    <span className="text-error">•</span>
                    Agents write incorrect line numbers
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-error">•</span>
                    Search-and-replace hits wrong occurrences
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-error">•</span>
                    Indentation breaks constantly
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-error">•</span>
                    Complex edits require multiple retries
                  </li>
                </ul>
              </div>

              {/* Solution */}
              <div className="card bg-success/5 border-success/20">
                <h3 className="text-xl font-semibold text-success mb-4">
                  ✓ The Solution
                </h3>
                <ul className="space-y-3 text-silver">
                  <li className="flex items-start gap-3">
                    <span className="text-success">•</span>
                    Atomic operations with preview & rollback
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-success">•</span>
                    Context-aware matching eliminates ambiguity
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-success">•</span>
                    Batch operations with transaction guarantees
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-success">•</span>
                    79% reduction in edit failures
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Evidence Section */}
        <section className="py-24 bg-card-bg/30 border-y border-card-border">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold text-frost-white mb-4">
                Proven Results
              </h2>
              <p className="text-xl text-silver">
                Real measurements from production environments.
              </p>
            </div>

            <div className="grid sm:grid-cols-3 gap-8 max-w-4xl mx-auto">
              <div className="text-center">
                <div className="text-5xl md:text-6xl font-bold text-gradient mb-2">
                  79%
                </div>
                <p className="text-silver">Reduction in edit failures</p>
              </div>
              <div className="text-center">
                <div className="text-5xl md:text-6xl font-bold text-gradient mb-2">
                  3.2×
                </div>
                <p className="text-silver">Faster task completion</p>
              </div>
              <div className="text-center">
                <div className="text-5xl md:text-6xl font-bold text-gradient mb-2">
                  91%
                </div>
                <p className="text-silver">First-attempt success rate</p>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Preview */}
        <section className="py-24 bg-midnight-navy">
          <div className="max-w-7xl mx-auto px-6 text-center">
            <h2 className="text-4xl md:text-5xl font-bold text-frost-white mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-xl text-silver mb-12">
              Start with a free trial. Upgrade when you&apos;re ready.
            </p>

            <div className="grid sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
              {/* Individual */}
              <div className="card border-cerulean-mist/50 relative">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge variant="info">Most Popular</Badge>
                </div>
                <h3 className="text-lg font-semibold text-frost-white">
                  Individual
                </h3>
                <div className="my-4">
                  <span className="text-4xl font-bold text-frost-white">
                    ${PRICING.individual.priceMonthly}
                  </span>
                  <span className="text-slate-grey">/month</span>
                </div>
                <p className="text-sm text-slate-grey mb-6">
                  {PRICING.individual.description}
                </p>
                <Button href="/pricing" className="w-full">
                  Start Free Trial
                </Button>
              </div>

              {/* Enterprise */}
              <div className="card">
                <h3 className="text-lg font-semibold text-frost-white">
                  Enterprise
                </h3>
                <div className="my-4">
                  <span className="text-4xl font-bold text-frost-white">
                    ${PRICING.enterprise.pricePerSeat}
                  </span>
                  <span className="text-slate-grey">/seat/mo</span>
                </div>
                <p className="text-sm text-slate-grey mb-6">
                  {PRICING.enterprise.description}
                </p>
                <Button href="/pricing" variant="secondary" className="w-full">
                  Contact Sales
                </Button>
              </div>
            </div>

            <Link
              href="/pricing"
              className="inline-block mt-8 text-cerulean-mist hover:text-frost-white transition-colors"
            >
              View full pricing details →
            </Link>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 bg-gradient-to-b from-midnight-navy to-card-bg/30 border-t border-card-border">
          <div className="max-w-3xl mx-auto px-6 text-center">
            <h2 className="text-4xl md:text-5xl font-bold text-frost-white mb-4">
              Ready to Fix Execution Slop?
            </h2>
            <p className="text-xl text-silver mb-8">
              Join developers who are already using Mouse to make AI agents
              actually work.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button href="/pricing" size="lg">
                Start Your Free Trial
              </Button>
              <Button
                href={EXTERNAL_URLS.marketplace}
                variant="secondary"
                size="lg"
              >
                Install VS Code Extension
              </Button>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
