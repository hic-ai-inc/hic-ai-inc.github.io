/**
 * Open Source Plan Application
 *
 * Application flow for OSS maintainers and contributors.
 * Requires GitHub verification.
 *
 * @see PLG User Journey - Section 2.3
 */

"use client";

import { useState } from "react";
import { useUser } from "@auth0/nextjs-auth0/client";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Input,
  Badge,
} from "@/components/ui";
import { PRICING, EXTERNAL_URLS } from "@/lib/constants";

export default function OSSCheckoutPage() {
  const { user, isLoading } = useUser();
  const [githubUsername, setGithubUsername] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const plan = PRICING.oss;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/oss-application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          githubUsername,
          repoUrl,
          email: user?.email || email,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Application failed");
      }

      setSubmitted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto px-6 text-center">
        <div className="mb-8">
          <span className="text-6xl">🎉</span>
        </div>
        <h1 className="text-4xl font-bold text-frost-white mb-4">
          Application Submitted!
        </h1>
        <p className="text-xl text-silver mb-8">
          We&apos;ll review your application and get back to you within 2-3
          business days.
        </p>
        <Card>
          <CardContent className="py-6">
            <h3 className="font-semibold text-frost-white mb-2">
              What&apos;s Next?
            </h3>
            <ol className="text-left space-y-3 text-silver">
              <li className="flex gap-3">
                <span className="text-cerulean-mist">1.</span>
                We&apos;ll verify your GitHub profile and repository
              </li>
              <li className="flex gap-3">
                <span className="text-cerulean-mist">2.</span>
                You&apos;ll receive an email with your OSS license key
              </li>
              <li className="flex gap-3">
                <span className="text-cerulean-mist">3.</span>
                Create your account and start using Mouse!
              </li>
            </ol>
          </CardContent>
        </Card>
        <Button href="/" variant="secondary" className="mt-8">
          Return Home
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6">
      <div className="text-center mb-8">
        <Badge variant="success" className="mb-4">
          Free Forever
        </Badge>
        <h1 className="text-4xl font-bold text-frost-white mb-2">
          Mouse for Open Source
        </h1>
        <p className="text-xl text-silver">
          Free access for OSS maintainers and contributors
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Plan Details */}
        <div>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>What&apos;s Included</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-3 text-silver">
                    <span className="text-success mt-0.5">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Eligibility Requirements</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-silver">
                <li className="flex items-start gap-3">
                  <span className="text-info mt-0.5">ℹ</span>
                  Active maintainer or significant contributor to an OSS project
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-info mt-0.5">ℹ</span>
                  Project must have a recognized open source license
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-info mt-0.5">ℹ</span>
                  Non-commercial use only
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-4">
              <p className="text-sm text-slate-grey">
                Need Mouse for commercial projects?{" "}
                <a
                  href="/checkout/individual"
                  className="text-cerulean-mist hover:text-frost-white"
                >
                  Check out our Individual plan
                </a>
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Application Form */}
        <Card>
          <CardHeader>
            <CardTitle>Apply for OSS License</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* GitHub Username */}
              <Input
                label="GitHub Username"
                value={githubUsername}
                onChange={(e) => setGithubUsername(e.target.value)}
                placeholder="octocat"
                required
              />

              {/* Repository URL */}
              <Input
                label="Primary OSS Repository"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/org/repo"
                required
              />

              {/* Email */}
              {!user && !isLoading && (
                <Input
                  label="Email Address"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              )}

              {user && (
                <div className="p-3 bg-card-bg rounded-lg border border-card-border">
                  <p className="text-sm text-slate-grey">Signed in as</p>
                  <p className="text-frost-white">{user.email}</p>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="p-3 bg-error/10 border border-error/30 rounded-lg text-error text-sm">
                  {error}
                </div>
              )}

              {/* Terms */}
              <div className="p-4 bg-card-bg rounded-lg border border-card-border">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    className="mt-1 w-4 h-4 rounded border-card-border bg-midnight-navy"
                  />
                  <span className="text-sm text-silver">
                    I confirm this license will only be used for non-commercial,
                    open source development and I agree to the{" "}
                    <a
                      href="/terms"
                      className="text-cerulean-mist hover:underline"
                    >
                      Terms of Service
                    </a>
                  </span>
                </label>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={isSubmitting}
                loading={isSubmitting}
              >
                {isSubmitting ? "Submitting..." : "Submit Application"}
              </Button>

              <p className="text-xs text-center text-slate-grey">
                Applications are typically reviewed within 2-3 business days
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
