/**
 * Research Page
 *
 * Summary of Mouse research findings from the peer-review-ready paper.
 * Includes downloadable PDF link for full paper.
 */

import { Header, Footer } from "@/components/layout";
import { Button, Badge } from "@/components/ui";

export const metadata = {
  title: "Research - Mouse by HIC AI",
  description:
    "Peer-review-ready research on Mouse precision editing tools. 67 paired trials, 3 preregistered studies, statistically significant results.",
};

export default function ResearchPage() {
  return (
    <>
      <Header />
      <main className="pt-16 min-h-screen bg-midnight-navy">
        {/* Hero */}
        <section className="py-24 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-midnight-navy via-midnight-navy to-midnight-navy/95" />
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-cerulean-mist/10 blur-[100px] rounded-full" />

          <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
            <Badge variant="info" className="mb-6">
              Peer-Review Ready
            </Badge>

            <h1 className="text-4xl md:text-5xl font-bold text-frost-white leading-tight mb-6">
              The Research Behind Mouse
            </h1>

            <p className="text-xl text-silver max-w-3xl mx-auto mb-8">
              A controlled study of tool architecture effects on AI coding agent
              performance. 67 paired trials. 3 preregistered studies. Results
              that speak for themselves.
            </p>

            <Button
              href="/papers/mouse-paper-v13.pdf"
              size="lg"
              className="inline-flex items-center gap-2"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Download Full Paper (PDF)
            </Button>

            <p className="text-sm text-slate-grey mt-4">
              Working Draft — January 2026 · Simon W. Reiff
            </p>
          </div>
        </section>

        {/* Paper Overview */}
        <section className="py-16 bg-card-bg/30 border-y border-card-border">
          <div className="max-w-5xl mx-auto px-6">
            <h2 className="text-3xl font-bold text-frost-white mb-8 text-center">
              Paper Overview
            </h2>

            <div className="card mb-8">
              <h3 className="text-xl font-semibold text-frost-white mb-4">
                Mouse: Precision File-Editing Tools for AI Coding Agents
              </h3>
              <p className="text-lg text-silver italic mb-4">
                A Controlled Study of Tool Architecture Effects on Agent
                Performance
              </p>
              <p className="text-silver leading-relaxed">
                This paper investigates whether purpose-built editing tools can
                measurably improve AI coding agent performance compared to
                baseline tools (GitHub Copilot default editing). Through three
                preregistered confirmatory studies with 67 paired trials, we
                demonstrate that Mouse tools produce statistically significant
                improvements in efficiency, precision, and capability—with
                effect sizes 2-3× the &quot;large&quot; threshold by
                Cohen&apos;s benchmarks.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <div className="card text-center">
                <div className="text-3xl font-bold text-gradient mb-2">67</div>
                <p className="text-frost-white font-medium">Paired Trials</p>
                <p className="text-sm text-slate-grey">
                  Same task, same model, different tools
                </p>
              </div>
              <div className="card text-center">
                <div className="text-3xl font-bold text-gradient mb-2">3</div>
                <p className="text-frost-white font-medium">
                  Preregistered Studies
                </p>
                <p className="text-sm text-slate-grey">
                  Hypotheses locked before data collection
                </p>
              </div>
              <div className="card text-center">
                <div className="text-3xl font-bold text-gradient mb-2">
                  &lt;10⁻⁶
                </div>
                <p className="text-frost-white font-medium">p-value</p>
                <p className="text-sm text-slate-grey">
                  Less than 1-in-a-million chance
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Key Findings */}
        <section className="py-24 bg-midnight-navy">
          <div className="max-w-5xl mx-auto px-6">
            <h2 className="text-3xl font-bold text-frost-white mb-4 text-center">
              Key Findings
            </h2>
            <p className="text-lg text-silver text-center mb-12">
              As task difficulty increases, Mouse&apos;s advantage shifts from{" "}
              <span className="text-cerulean-mist">efficiency</span> to{" "}
              <span className="text-cerulean-mist">precision</span> to{" "}
              <span className="text-cerulean-mist">capability</span>.
            </p>

            <div className="grid md:grid-cols-3 gap-6 mb-12">
              {/* Easy - Efficiency */}
              <div className="card border-success/30">
                <div className="flex items-center gap-2 mb-4">
                  <span className="px-2 py-0.5 text-xs font-medium rounded bg-success/20 text-success">
                    Easy Tasks
                  </span>
                  <span className="text-xs text-slate-grey">BX-504D</span>
                </div>
                <h3 className="text-lg font-semibold text-frost-white mb-2">
                  Efficiency Gains
                </h3>
                <div className="space-y-4">
                  <div>
                    <div className="text-3xl font-bold text-gradient">3.6×</div>
                    <p className="text-sm text-silver">Faster completion</p>
                  </div>
                  <div>
                    <div className="text-3xl font-bold text-gradient">37%</div>
                    <p className="text-sm text-silver">Cheaper per task</p>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-card-border">
                  <p className="text-xs text-slate-grey">
                    N=23 · p &lt; 10⁻⁶ · Mouse faster in all 23 runs
                  </p>
                </div>
              </div>

              {/* Medium - Precision */}
              <div className="card border-warning/30">
                <div className="flex items-center gap-2 mb-4">
                  <span className="px-2 py-0.5 text-xs font-medium rounded bg-warning/20 text-warning">
                    Medium Tasks
                  </span>
                  <span className="text-xs text-slate-grey">BX-504B</span>
                </div>
                <h3 className="text-lg font-semibold text-frost-white mb-2">
                  Precision Gains
                </h3>
                <div className="space-y-4">
                  <div>
                    <div className="text-3xl font-bold text-gradient">56%</div>
                    <p className="text-sm text-silver">
                      Perfect First Try (Mouse)
                    </p>
                  </div>
                  <div>
                    <div className="text-3xl font-bold text-frost-white">
                      0%
                    </div>
                    <p className="text-sm text-silver">
                      Perfect First Try (Baseline)
                    </p>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-card-border">
                  <p className="text-xs text-slate-grey">
                    N=25 · p = 1.22 × 10⁻⁴ · +56pp risk difference
                  </p>
                </div>
              </div>

              {/* Hard - Capability */}
              <div className="card border-error/30">
                <div className="flex items-center gap-2 mb-4">
                  <span className="px-2 py-0.5 text-xs font-medium rounded bg-error/20 text-error">
                    Hard Tasks
                  </span>
                  <span className="text-xs text-slate-grey">BX-701R</span>
                </div>
                <h3 className="text-lg font-semibold text-frost-white mb-2">
                  Capability Unlock
                </h3>
                <div className="space-y-4">
                  <div>
                    <div className="text-3xl font-bold text-gradient">
                      89.5%
                    </div>
                    <p className="text-sm text-silver">
                      Task Completion (Mouse)
                    </p>
                  </div>
                  <div>
                    <div className="text-3xl font-bold text-frost-white">
                      0%
                    </div>
                    <p className="text-sm text-silver">
                      Task Completion (Baseline)
                    </p>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-card-border">
                  <p className="text-xs text-slate-grey">
                    N=19 · p = 7.63 × 10⁻⁶ · Baseline never succeeded
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Methodology */}
        <section className="py-24 bg-card-bg/30 border-y border-card-border">
          <div className="max-w-5xl mx-auto px-6">
            <h2 className="text-3xl font-bold text-frost-white mb-8 text-center">
              Methodology Highlights
            </h2>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="card">
                <h3 className="text-xl font-semibold text-frost-white mb-4">
                  🔬 Controlled Design
                </h3>
                <ul className="space-y-2 text-silver">
                  <li className="flex items-start gap-2">
                    <span className="text-success">✓</span>
                    Paired comparisons: same task, same AI model
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-success">✓</span>
                    Only variable: tool architecture (Mouse vs Baseline)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-success">✓</span>
                    Randomized task order to prevent learning effects
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-success">✓</span>
                    Blinded evaluation of outputs
                  </li>
                </ul>
              </div>

              <div className="card">
                <h3 className="text-xl font-semibold text-frost-white mb-4">
                  📋 Preregistration
                </h3>
                <ul className="space-y-2 text-silver">
                  <li className="flex items-start gap-2">
                    <span className="text-success">✓</span>
                    Hypotheses specified before data collection
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-success">✓</span>
                    Sample sizes determined a priori
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-success">✓</span>
                    Analysis plan locked in advance
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-success">✓</span>
                    No p-hacking or HARKing
                  </li>
                </ul>
              </div>

              <div className="card">
                <h3 className="text-xl font-semibold text-frost-white mb-4">
                  📊 Statistical Rigor
                </h3>
                <ul className="space-y-2 text-silver">
                  <li className="flex items-start gap-2">
                    <span className="text-success">✓</span>
                    Non-parametric tests (no distributional assumptions)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-success">✓</span>
                    Effect sizes with confidence intervals
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-success">✓</span>
                    Multiple comparison corrections
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-success">✓</span>
                    Distribution-free lower bounds
                  </li>
                </ul>
              </div>

              <div className="card">
                <h3 className="text-xl font-semibold text-frost-white mb-4">
                  🎯 Task Selection
                </h3>
                <ul className="space-y-2 text-silver">
                  <li className="flex items-start gap-2">
                    <span className="text-success">✓</span>
                    Real-world editing scenarios
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-success">✓</span>
                    Varying difficulty levels (Easy/Medium/Hard)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-success">✓</span>
                    Objective success criteria
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-success">✓</span>
                    Reproducible task specifications
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Why This Matters */}
        <section className="py-24 bg-midnight-navy">
          <div className="max-w-4xl mx-auto px-6">
            <h2 className="text-3xl font-bold text-frost-white mb-8 text-center">
              Why This Matters
            </h2>

            <div className="card">
              <h3 className="text-xl font-semibold text-frost-white mb-4">
                Tool Architecture as a Performance Lever
              </h3>
              <p className="text-silver leading-relaxed mb-6">
                The conventional wisdom is that AI agent performance is
                determined by the underlying language model. Our research
                demonstrates that{" "}
                <strong className="text-frost-white">
                  tool architecture is an independent performance lever
                </strong>
                —you can dramatically improve agent outcomes without changing
                the model, simply by giving agents better tools.
              </p>

              <h3 className="text-xl font-semibold text-frost-white mb-4">
                The Verbosity Tax
              </h3>
              <p className="text-silver leading-relaxed mb-6">
                Baseline tools force agents to echo file content back in their
                tool calls—a &quot;verbosity tax&quot; that wastes tokens and
                introduces transcription errors. Mouse eliminates this tax
                through coordinate-based addressing, reducing output tokens by{" "}
                <strong className="text-frost-white">74%</strong> (172 vs 708
                tokens per call).
              </p>

              <h3 className="text-xl font-semibold text-frost-white mb-4">
                Predictable Execution
              </h3>
              <p className="text-silver leading-relaxed">
                Beyond average performance, Mouse produces remarkably consistent
                results. While baseline tools show high variance (SD = 26s),
                Mouse operations are predictable (SD = 2.6s). This consistency
                matters for production workflows where reliability is as
                important as speed.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 bg-gradient-to-b from-midnight-navy to-card-bg/30 border-t border-card-border">
          <div className="max-w-3xl mx-auto px-6 text-center">
            <h2 className="text-3xl font-bold text-frost-white mb-4">
              Read the Full Paper
            </h2>
            <p className="text-lg text-silver mb-8">
              Get all the details: methodology, statistical analysis, additional
              findings, and discussion of implications.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                href="/papers/mouse-paper-v13.pdf"
                size="lg"
                className="inline-flex items-center gap-2"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                Download PDF
              </Button>
              <Button href="/pricing" variant="secondary" size="lg">
                Try Mouse Free
              </Button>
            </div>
            <p className="text-sm text-slate-grey mt-6">
              Working Draft — January 2026 · Comments welcome at{" "}
              <a
                href="mailto:research@hic-ai.com"
                className="text-cerulean-mist hover:underline"
              >
                research@hic-ai.com
              </a>
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
