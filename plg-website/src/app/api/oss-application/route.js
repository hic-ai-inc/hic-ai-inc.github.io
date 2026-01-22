/**
 * OSS Application API
 *
 * POST /api/oss-application
 *
 * Handles Open Source license applications. Verifies GitHub
 * project eligibility and creates OSS license if approved.
 *
 * @see User Journey and Guest Checkout v2 - Section 1.2
 */

import { NextResponse } from "next/server";
import { createLicenseForPlan } from "@/lib/keygen";
import {
  createLicense,
  upsertCustomer,
  getCustomerByEmail,
} from "@/lib/dynamodb";
import { sendLicenseEmail } from "@/lib/ses";

// GitHub API helpers
async function getGitHubRepo(repoUrl) {
  // Extract owner/repo from URL
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) {
    throw new Error("Invalid GitHub URL format");
  }
  const [, owner, repo] = match;

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}`,
    {
      headers: {
        Accept: "application/vnd.github.v3+json",
        // Use token if available for higher rate limits
        ...(process.env.GITHUB_TOKEN && {
          Authorization: `token ${process.env.GITHUB_TOKEN}`,
        }),
      },
    },
  );

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Repository not found or is private");
    }
    throw new Error("Failed to fetch repository information");
  }

  return response.json();
}

function isValidOSSLicense(licenseSpdxId) {
  const validLicenses = [
    "MIT",
    "Apache-2.0",
    "GPL-2.0",
    "GPL-3.0",
    "LGPL-2.1",
    "LGPL-3.0",
    "BSD-2-Clause",
    "BSD-3-Clause",
    "MPL-2.0",
    "ISC",
    "Unlicense",
    "0BSD",
    "AGPL-3.0",
  ];
  return validLicenses.includes(licenseSpdxId);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { email, name, githubUrl, projectName, intendedUse } = body;

    // Validate required fields
    if (!email || !githubUrl) {
      return NextResponse.json(
        { error: "Email and GitHub URL are required" },
        { status: 400 },
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 },
      );
    }

    // Check if user already has an OSS license
    const existingCustomer = await getCustomerByEmail(email);
    if (existingCustomer?.accountType === "oss") {
      return NextResponse.json(
        {
          error: "You already have an OSS license",
          code: "EXISTING_OSS_LICENSE",
          detail: "Check your email for your existing license key.",
        },
        { status: 409 },
      );
    }

    // Verify GitHub repository
    let repo;
    try {
      repo = await getGitHubRepo(githubUrl);
    } catch (error) {
      return NextResponse.json(
        {
          error: "GitHub verification failed",
          code: "GITHUB_VERIFICATION_FAILED",
          detail: error.message,
        },
        { status: 400 },
      );
    }

    // Check repository requirements
    const issues = [];

    // Must be public
    if (repo.private) {
      issues.push("Repository must be public");
    }

    // Should have OSS license
    if (!repo.license || !isValidOSSLicense(repo.license.spdx_id)) {
      issues.push("Repository must have a recognized open source license");
    }

    // Should have minimum activity (not empty/abandoned)
    if (repo.size < 10) {
      issues.push("Repository appears to be empty or near-empty");
    }

    // Optional: Check star count for established projects
    // if (repo.stargazers_count < 10) {
    //   issues.push("Consider gaining some community traction first");
    // }

    if (issues.length > 0) {
      return NextResponse.json(
        {
          error: "Repository does not meet OSS criteria",
          code: "OSS_CRITERIA_NOT_MET",
          issues,
          repository: {
            name: repo.full_name,
            license: repo.license?.spdx_id || "None",
            private: repo.private,
          },
        },
        { status: 400 },
      );
    }

    // Create Keygen license
    const license = await createLicenseForPlan("oss", {
      name: projectName || repo.full_name,
      email,
      metadata: {
        githubUrl,
        githubRepoId: repo.id.toString(),
        githubOwner: repo.owner.login,
        intendedUse,
        applicantName: name,
      },
    });

    // Generate a placeholder Auth0 ID for OSS users (they can link account later)
    const ossUserId = `oss|${Date.now()}|${email.replace(/[^a-z0-9]/gi, "")}`;

    // Store in DynamoDB
    await upsertCustomer({
      auth0Id: ossUserId,
      email,
      keygenLicenseId: license.id,
      accountType: "oss",
      subscriptionStatus: "active",
      metadata: {
        name,
        githubUrl,
        projectName: projectName || repo.full_name,
        autoApproved: true,
      },
    });

    await createLicense({
      keygenLicenseId: license.id,
      auth0Id: ossUserId,
      licenseKey: license.key,
      policyId: "oss",
      status: "active",
      maxDevices: 2, // OSS gets 2 devices
    });

    // Send license email
    await sendLicenseEmail(email, license.key, "Open Source");

    return NextResponse.json({
      success: true,
      message: "OSS license approved!",
      repository: {
        name: repo.full_name,
        license: repo.license?.spdx_id,
        stars: repo.stargazers_count,
      },
      // Don't expose full license key in response, send via email
      licenseKeyPreview: `${license.key.slice(0, 8)}...${license.key.slice(-4)}`,
      note: "Your full license key has been sent to your email.",
    });
  } catch (error) {
    console.error("OSS application error:", error);
    return NextResponse.json(
      { error: "Application processing failed", detail: error.message },
      { status: 500 },
    );
  }
}
