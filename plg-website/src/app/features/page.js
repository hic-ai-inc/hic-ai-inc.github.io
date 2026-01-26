3; /**
 * Features Page
 *
 * Standalone features page with capability comparison matrix.
 * Compares Mouse to other AI coding tools.
 */

import Link from "next/link";
import { Header, Footer } from "@/components/layout";
import { Button, Badge } from "@/components/ui";
import { EXTERNAL_URLS } from "@/lib/constants";

// Comparison matrix data
const COMPETITORS = [
  { name: "Mouse", key: "mouse" },
  { name: "GitHub Copilot", key: "copilot" },
  { name: "Cursor", key: "cursor" },
  { name: "Claude Code", key: "claude" },
  { name: "Q Developer", key: "qdev" },
  { name: "Gemini CLI", key: "gemini" },
];

const FEATURES = [
  {
    name: "Content replacement",
    description: "Basic find-and-replace editing capability",
    support: {
      mouse: "full",
      copilot: "full",
      cursor: "full",
      claude: "full",
      qdev: "full",
      gemini: "full",
    },
  },
  {
    name: "Coordinate-based addressing",
    description: "Edit by line/column coordinates without echoing content",
    support: {
      mouse: "full",
      copilot: "none",
      cursor: "partial",
      claude: "none",
      qdev: "none",
      gemini: "none",
    },
  },
  {
    name: "Zero content-echo required",
    description: "Make edits without repeating existing file content",
    support: {
      mouse: "full",
      copilot: "none",
      cursor: "none",
      claude: "none",
      qdev: "none",
      gemini: "none",
    },
  },
  {
    name: "Atomic batching",
    description: "Group multiple edits into a single atomic operation",
    support: {
      mouse: "full",
      copilot: "none",
      cursor: "partial",
      claude: "none",
      qdev: "none",
      gemini: "none",
    },
  },
  {
    name: "Full rollback on failure",
    description: "Automatically revert all changes if any edit fails",
    support: {
      mouse: "full",
      copilot: "none",
      cursor: "none",
      claude: "none",
      qdev: "none",
      gemini: "full",
    },
  },
  {
    name: "In-place refinement of staged edits",
    description: "Adjust pending changes without starting over",
    support: {
      mouse: "full",
      copilot: "none",
      cursor: "none",
      claude: "none",
      qdev: "none",
      gemini: "none",
    },
  },
];

function SupportIcon({ level }) {
  if (level === "full") {
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 text-success text-lg">
        ✓
      </span>
    );
  }
  if (level === "partial") {
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 text-warning text-lg">
        ?
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 text-error text-lg font-bold">
      ✕
    </span>
  );
}

export default function FeaturesPage() {
  return (
    <>
      <Header />
      <main className="pt-16">
        {/* Hero Section */}
        <section className="py-24 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-midnight-navy via-midnight-navy to-midnight-navy/95" />
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-cerulean-mist/10 blur-[100px] rounded-full" />

          <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
            <Badge variant="info" className="mb-6">
              Capability Comparison
            </Badge>

            <h1 className="text-4xl md:text-6xl font-bold text-frost-white leading-tight mb-6">
              Why Mouse Wins
            </h1>

            <p className="text-xl text-silver max-w-3xl mx-auto">
              Mouse is the only tool that eliminates content-echo, provides
              coordinate-based addressing, and offers true atomic operations
              with full rollback.
            </p>
          </div>
        </section>

        {/* The Core Problem */}
        <section className="py-16 bg-card-bg/30 border-y border-card-border">
          <div className="max-w-5xl mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-frost-white mb-4">
                The Core Problem: Execution Slop
              </h2>
              <p className="text-lg text-silver max-w-2xl mx-auto">
                <span className="text-frost-white font-medium">
                  Right plan. Right tool call. Wrong output.
                </span>
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <div className="card text-center">
                <div className="text-3xl mb-3">🎯</div>
                <h3 className="text-lg font-semibold text-frost-white mb-2">
                  Right Plan
                </h3>
                <p className="text-sm text-silver">
                  The AI understands what you want. It correctly identifies the
                  files, functions, and changes needed.
                </p>
              </div>
              <div className="card text-center">
                <div className="text-3xl mb-3">🔧</div>
                <h3 className="text-lg font-semibold text-frost-white mb-2">
                  Right Tool Call
                </h3>
                <p className="text-sm text-silver">
                  The AI calls the correct editing function with reasonable
                  parameters. The intent is clear.
                </p>
              </div>
              <div className="card text-center border-error/30">
                <div className="text-3xl mb-3">💥</div>
                <h3 className="text-lg font-semibold text-error mb-2">
                  Wrong Output
                </h3>
                <p className="text-sm text-silver mb-3">
                  But the edit still fails. Wrong line. Mangled syntax.
                  Corrupted file.
                </p>
                <p className="text-frost-white font-bold">
                  This is Execution Slop.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Comparison Matrix */}
        <section className="py-24 bg-midnight-navy">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-frost-white mb-4">
                Feature Comparison
              </h2>
              <p className="text-lg text-silver">
                See how Mouse stacks up against other AI coding tools
              </p>
            </div>

            {/* Desktop Table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-left py-4 px-4 text-frost-white font-semibold">
                      Benefits
                    </th>
                    {COMPETITORS.map((competitor) => (
                      <th
                        key={competitor.key}
                        className={`text-center py-4 px-3 font-semibold ${
                          competitor.key === "mouse"
                            ? "text-cerulean-mist bg-cerulean-mist/15 border-x-2 border-t-2 border-cerulean-mist/50 rounded-t-lg"
                            : "text-silver"
                        }`}
                      >
                        {competitor.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {FEATURES.map((feature, index) => (
                    <tr
                      key={feature.name}
                      className={index % 2 === 0 ? "bg-card-bg/10" : ""}
                    >
                      <td className="py-4 px-4">
                        <div className="text-frost-white font-medium">
                          {feature.name}
                        </div>
                        <div className="text-sm text-slate-grey">
                          {feature.description}
                        </div>
                      </td>
                      {COMPETITORS.map((competitor) => (
                        <td
                          key={competitor.key}
                          className={`text-center py-4 px-3 ${
                            competitor.key === "mouse"
                              ? `bg-cerulean-mist/15 border-x-2 border-cerulean-mist/50 ${
                                  index === FEATURES.length - 1
                                    ? "border-b-2 rounded-b-lg"
                                    : ""
                                }`
                              : ""
                          }`}
                        >
                          <SupportIcon
                            level={feature.support[competitor.key]}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="lg:hidden space-y-6">
              {FEATURES.map((feature) => (
                <div key={feature.name} className="card">
                  <h3 className="text-frost-white font-semibold mb-1">
                    {feature.name}
                  </h3>
                  <p className="text-sm text-slate-grey mb-4">
                    {feature.description}
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {COMPETITORS.map((competitor) => (
                      <div
                        key={competitor.key}
                        className={`py-2 px-1 rounded ${
                          competitor.key === "mouse"
                            ? "bg-cerulean-mist/10"
                            : "bg-card-bg/50"
                        }`}
                      >
                        <div className="text-xs text-slate-grey mb-1">
                          {competitor.name}
                        </div>
                        <SupportIcon level={feature.support[competitor.key]} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="flex justify-center gap-8 mt-8 text-sm">
              <div className="flex items-center gap-2">
                <SupportIcon level="full" />
                <span className="text-silver">Supported</span>
              </div>
              <div className="flex items-center gap-2">
                <SupportIcon level="partial" />
                <span className="text-silver">Unknown</span>
              </div>
              <div className="flex items-center gap-2">
                <SupportIcon level="none" />
                <span className="text-silver">Not supported</span>
              </div>
            </div>
          </div>
        </section>

        {/* Key Differentiators */}
        <section className="py-24 bg-card-bg/30 border-y border-card-border">
          <div className="max-w-5xl mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-frost-white mb-4">
                What Makes Mouse Different
              </h2>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="card">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-2xl">📍</span>
                  <h3 className="text-xl font-semibold text-frost-white">
                    Coordinate-Based Addressing
                  </h3>
                </div>
                <p className="text-silver">
                  Your agent edits by line and column numbers instead of
                  matching text patterns. No more &quot;find the string that
                  looks like this&quot;—just &quot;line 42, column 10&quot; and
                  the edit lands precisely where intended.
                </p>
              </div>

              <div className="card">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-2xl">🚫</span>
                  <h3 className="text-xl font-semibold text-frost-white">
                    Zero Content-Echo
                  </h3>
                </div>
                <p className="text-silver">
                  Other tools force agents to repeat back existing code, wasting
                  tokens and introducing transcription errors. With Mouse, your
                  agent edits without echoing—70% fewer tokens, zero copy-paste
                  mistakes.
                </p>
              </div>

              <div className="card">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-2xl">⚛️</span>
                  <h3 className="text-xl font-semibold text-frost-white">
                    Atomic Batching
                  </h3>
                </div>
                <p className="text-silver">
                  Group multiple edits into a single atomic operation. Either
                  all changes succeed or none do. No more half-applied
                  refactors.
                </p>
              </div>

              <div className="card">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-2xl">⏪</span>
                  <h3 className="text-xl font-semibold text-frost-white">
                    Full Rollback
                  </h3>
                </div>
                <p className="text-silver">
                  If any edit in a batch fails, Mouse automatically rolls back
                  all changes. Your codebase is never left in a broken
                  intermediate state.
                </p>
              </div>

              <div className="card md:col-span-2">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-2xl">🔄</span>
                  <h3 className="text-xl font-semibold text-frost-white">
                    In-Place Refinement
                  </h3>
                </div>
                <p className="text-silver">
                  When an agent catches its own mistake, it can adjust pending
                  changes without starting over—self-correcting without human
                  intervention. Your agent tweaks, refines, and perfects edits
                  before committing. No other tool offers this capability.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Evidence */}
        <section className="py-24 bg-midnight-navy">
          <div className="max-w-5xl mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-frost-white mb-4">
                The Evidence
              </h2>
              <p className="text-lg text-silver">
                3 Preregistered Confirmatory Studies · 67 Paired Trials
              </p>
              <p className="text-sm text-slate-grey mt-2">
                Mouse vs Baseline (GitHub Copilot default tools)
              </p>
            </div>

            <div className="grid sm:grid-cols-3 gap-6">
              {/* Easy - Efficiency */}
              <div className="card border-success/30">
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2 py-0.5 text-xs font-medium rounded bg-success/20 text-success">
                    Easy
                  </span>
                  <span className="text-xs text-slate-grey">BX-504D</span>
                </div>
                <h3 className="text-lg font-semibold text-frost-white mb-1">
                  Efficiency
                </h3>
                <div className="text-3xl font-bold text-gradient mb-2">
                  3.6× faster
                </div>
                <p className="text-sm text-silver mb-2">37% cheaper per task</p>
                <p className="text-xs text-slate-grey">N=23 · p &lt; 10⁻⁶</p>
                <p className="text-xs text-slate-grey mt-1">
                  Mouse faster in all 23 runs
                </p>
              </div>

              {/* Medium - Precision */}
              <div className="card border-warning/30">
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2 py-0.5 text-xs font-medium rounded bg-warning/20 text-warning">
                    Medium
                  </span>
                  <span className="text-xs text-slate-grey">BX-504B</span>
                </div>
                <h3 className="text-lg font-semibold text-frost-white mb-1">
                  Precision
                </h3>
                <div className="text-3xl font-bold text-gradient mb-2">
                  56% vs 0%
                </div>
                <p className="text-sm text-silver mb-2">
                  First-try correctness
                </p>
                <p className="text-xs text-slate-grey">
                  N=25 · p = 1.22 × 10⁻⁴
                </p>
                <p className="text-xs text-slate-grey mt-1">
                  Baseline: 0% Perfect First Try
                </p>
              </div>

              {/* Hard - Capability */}
              <div className="card border-error/30">
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2 py-0.5 text-xs font-medium rounded bg-error/20 text-error">
                    Hard
                  </span>
                  <span className="text-xs text-slate-grey">BX-701R</span>
                </div>
                <h3 className="text-lg font-semibold text-frost-white mb-1">
                  Capability
                </h3>
                <div className="text-3xl font-bold text-gradient mb-2">
                  89% vs 0%
                </div>
                <p className="text-sm text-silver mb-2">Task completion</p>
                <p className="text-xs text-slate-grey">
                  N=19 · p = 7.63 × 10⁻⁶
                </p>
                <p className="text-xs text-slate-grey mt-1">
                  Baseline never completed task
                </p>
              </div>
            </div>

            <p className="text-center text-lg text-silver mt-10">
              As task difficulty increases, Mouse&apos;s advantage shifts from{" "}
              <span className="text-cerulean-mist">efficiency</span> to{" "}
              <span className="text-cerulean-mist">precision</span> to{" "}
              <span className="text-cerulean-mist">capability</span>.
            </p>
          </div>
        </section>

        {/* Compatibility Section - Expansion Plan v0.9.9 Results */}
        <section
          aria-labelledby="compatibility-heading"
          className="py-20 px-6 border-t border-card-border"
        >
          <div className="max-w-6xl mx-auto">
            <h2
              id="compatibility-heading"
              className="text-3xl font-bold text-frost-white mb-4 text-center"
            >
              Compatibility
            </h2>
            <p className="text-silver text-center mb-12 max-w-3xl mx-auto">
              Mouse works with an extensive range of IDEs, extensions, and AI
              models.
            </p>

            <div className="grid lg:grid-cols-3 gap-8">
              {/* IDEs Table */}
              <div className="bg-card-bg rounded-lg p-6 border border-card-border">
                <h3 className="text-xl font-semibold text-frost-white mb-4">
                  IDEs & Editors
                </h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-center py-2 border-b border-card-border/50">
                    <span className="text-silver">VS Code</span>
                    <span className="text-green-400">✓ Confirmed</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-card-border/50">
                    <span className="text-silver">Cursor</span>
                    <span className="text-green-400">✓ Confirmed</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-card-border/50">
                    <span className="text-silver">Kiro</span>
                    <span className="text-green-400">✓ Confirmed</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-card-border/50">
                    <span className="text-silver">Windsurf</span>
                    <span className="text-amber-400">⏳ Pending</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-card-border/50">
                    <span className="text-silver">Visual Studio</span>
                    <span className="text-amber-400">⏳ Pending</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-silver">JetBrains IDEs</span>
                    <span className="text-amber-400">⏳ Pending</span>
                  </div>
                </div>
              </div>

              {/* Extensions Table */}
              <div className="bg-card-bg rounded-lg p-6 border border-card-border">
                <h3 className="text-xl font-semibold text-frost-white mb-4">
                  VS Code Extensions
                </h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-center py-2 border-b border-card-border/50">
                    <span className="text-silver">GitHub Copilot</span>
                    <span className="text-green-400">✓</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-card-border/50">
                    <span className="text-silver">Amazon Q Developer</span>
                    <span className="text-green-400">✓</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-card-border/50">
                    <span className="text-silver">Claude Code</span>
                    <span className="text-green-400">✓</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-card-border/50">
                    <span className="text-silver">Roo Code</span>
                    <span className="text-green-400">✓</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-card-border/50">
                    <span className="text-silver">Cline</span>
                    <span className="text-green-400">✓</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-card-border/50">
                    <span className="text-silver">Kilo Code</span>
                    <span className="text-green-400">✓</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-silver">CodeGPT Chat</span>
                    <span className="text-green-400">✓</span>
                  </div>
                </div>
              </div>

              {/* Models Table */}
              <div className="bg-card-bg rounded-lg p-6 border border-card-border">
                <h3 className="text-xl font-semibold text-frost-white mb-4">
                  AI Models
                </h3>
                <div className="space-y-4 text-sm">
                  <div>
                    <p className="text-electric-cyan font-medium mb-1">
                      Anthropic
                    </p>
                    <p className="text-silver">All Claude models (4.0+)</p>
                  </div>
                  <div>
                    <p className="text-electric-cyan font-medium mb-1">
                      Google
                    </p>
                    <p className="text-silver">All Gemini models (2.5+)</p>
                  </div>
                  <div>
                    <p className="text-electric-cyan font-medium mb-1">
                      OpenAI
                    </p>
                    <p className="text-silver">All GPT models (4o+)</p>
                  </div>
                  <div>
                    <p className="text-electric-cyan font-medium mb-1">Other</p>
                    <p className="text-silver">Raptor mini</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Value Proposition */}
            <div className="mt-10 bg-card-bg rounded-lg p-8 border-2 border-green-500/60 text-center">
              <h3 className="text-xl font-bold text-green-400 mb-3">
                Keep Coding When Credits Run Out
              </h3>
              <p className="text-silver max-w-2xl mx-auto text-lg">
                Mouse&apos;s compatibility with free-tier and lower-cost models
                means human developers can continue high-stakes work even after
                premium monthly credits are exhausted. Token efficiency makes
                every model more capable.
              </p>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 bg-gradient-to-b from-midnight-navy to-card-bg/30 border-t border-card-border">
          <div className="max-w-3xl mx-auto px-6 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-frost-white mb-4">
              Ready to Eliminate Execution Slop?
            </h2>
            <p className="text-lg text-silver mb-8">
              Start your free trial and see the difference precision tools make.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button href="/pricing" size="lg">
                Start Free Trial
              </Button>
              <Button
                href={EXTERNAL_URLS.marketplace}
                variant="secondary"
                size="lg"
              >
                Install VS Code Extension
              </Button>
            </div>
            <p className="mt-6 text-sm text-slate-grey">
              14-day free trial • No credit card required
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
