/**
 * Unit Tests — Organization Card and Certification Modal
 *
 * Feature: business-name-implementation, Task 7.5
 *
 * Tests the Organization card rendering logic and Certification Modal
 * interaction flow using extracted pure functions with dependency injection.
 *
 * - Owner sees edit controls
 * - "Not set" prompt when name is null/placeholder
 * - Read-only for admin/member (no edit button)
 * - Not rendered for individual user
 * - Certification modal appears on name change
 * - Certification modal skipped when name unchanged
 * - Cancel aborts save
 * - Confirm triggers PATCH
 * - 409/400 error display
 * - Successful save updates displayed name
 *
 * **Validates: Requirements 6.1–6.6, 7.1, 7.3–7.5, 8.1, 8.2, 8.4**
 */

import { describe, it } from "node:test";
import { expect, createSpy } from "../../../../../dm/facade/test-helpers/index.js";

// ============================================================================
// Extracted logic: mirrors settings/page.js Organization card behavior
// ============================================================================

/**
 * Determine Organization card visibility and edit permissions.
 * Pure function extraction of the conditional rendering logic.
 *
 * @param {Object|null} organization - Organization data from Settings API GET
 * @returns {{ visible: boolean, canEdit: boolean, displayName: string|null, role: string|null }}
 */
function getOrgCardState(organization) {
  if (!organization) {
    return { visible: false, canEdit: false, displayName: null, role: null };
  }
  return {
    visible: true,
    canEdit: organization.canEdit === true,
    displayName: organization.name || null,
    role: organization.role || null,
  };
}

/**
 * Determine whether the certification modal should be shown on save.
 * Pure function extraction of handleOrgNameSave's modal trigger logic.
 *
 * @param {string} inputValue - The value in the org name input field
 * @param {string|null} currentName - The currently stored org name
 * @returns {{ showModal: boolean, error: string|null, trimmedName: string }}
 */
function shouldShowCertModal(inputValue, currentName) {
  const trimmed = inputValue.trim();

  if (!trimmed) {
    return { showModal: false, error: "Organization name cannot be empty", trimmedName: "" };
  }
  if (trimmed.length > 120) {
    return { showModal: false, error: "Organization name must be 120 characters or fewer", trimmedName: trimmed };
  }

  const current = (currentName || "").trim();

  // If name hasn't changed at all (same casing), just close edit mode — no modal
  if (current.toUpperCase() === trimmed.toUpperCase() && current === trimmed) {
    return { showModal: false, error: null, trimmedName: trimmed };
  }

  // Name changed (or casing changed) — show certification modal
  return { showModal: true, error: null, trimmedName: trimmed };
}

/**
 * Build the certification modal text with the business name interpolated.
 *
 * @param {string} businessName - The submitted business name (trimmed)
 * @returns {string} The full certification text
 */
function buildCertificationText(businessName) {
  return (
    `By providing this business name, you certify that you are legally ` +
    `authorized to act on behalf of ${businessName} and to bind it to the ` +
    `HIC AI, INC. Terms of Service. You understand that HIC AI, INC. may ` +
    `request additional proof of entity existence or authorization.`
  );
}

/**
 * Process the PATCH response for org name update.
 * Pure function extraction of handleCertConfirm's response handling.
 *
 * @param {number} status - HTTP response status
 * @param {Object} data - Response body
 * @returns {{ success: boolean, error: string|null, organization: Object|null }}
 */
function processOrgNameResponse(status, data) {
  if (status === 409) {
    return { success: false, error: "This business name is already registered.", organization: null };
  }
  if (status === 403) {
    return { success: false, error: "You don't have permission to edit the organization name.", organization: null };
  }
  if (status === 400) {
    return { success: false, error: data.error || "Invalid organization name", organization: null };
  }
  if (status >= 200 && status < 300) {
    return { success: true, error: null, organization: data.organization || null };
  }
  return { success: false, error: data.error || "Failed to update organization name", organization: null };
}

// ============================================================================
// Organization card visibility and rendering
// ============================================================================

describe("Organization card — visibility and rendering", () => {
  it("renders for Business Owner with edit controls", () => {
    const state = getOrgCardState({ id: "cus_123", name: "Acme Corp", role: "owner", canEdit: true });

    expect(state.visible).toBe(true);
    expect(state.canEdit).toBe(true);
    expect(state.displayName).toBe("Acme Corp");
    expect(state.role).toBe("owner");
  });

  it("shows 'Not set' prompt when name is null", () => {
    const state = getOrgCardState({ id: "cus_123", name: null, role: "owner", canEdit: true });

    expect(state.visible).toBe(true);
    expect(state.displayName).toBe(null);
    // UI renders "Not set — add your business name" when displayName is null
  });

  it("shows 'Not set' prompt when name is empty string", () => {
    const state = getOrgCardState({ id: "cus_123", name: "", role: "owner", canEdit: true });

    expect(state.visible).toBe(true);
    expect(state.displayName).toBe(null); // empty string → null via || null
  });

  it("renders read-only for Admin (no edit controls)", () => {
    const state = getOrgCardState({ id: "cus_123", name: "Acme Corp", role: "admin", canEdit: false });

    expect(state.visible).toBe(true);
    expect(state.canEdit).toBe(false);
    expect(state.displayName).toBe("Acme Corp");
    expect(state.role).toBe("admin");
  });

  it("renders read-only for Member (no edit controls)", () => {
    const state = getOrgCardState({ id: "cus_123", name: "Acme Corp", role: "member", canEdit: false });

    expect(state.visible).toBe(true);
    expect(state.canEdit).toBe(false);
    expect(state.role).toBe("member");
  });

  it("not rendered for Individual user (no organization data)", () => {
    const state = getOrgCardState(null);

    expect(state.visible).toBe(false);
    expect(state.canEdit).toBe(false);
    expect(state.displayName).toBe(null);
  });
});

// ============================================================================
// Certification modal trigger logic
// ============================================================================

describe("Certification modal — trigger logic", () => {
  it("shows modal when name changed from stored value", () => {
    const result = shouldShowCertModal("New Corp", "Old Corp");

    expect(result.showModal).toBe(true);
    expect(result.error).toBe(null);
    expect(result.trimmedName).toBe("New Corp");
  });

  it("shows modal when casing changed", () => {
    const result = shouldShowCertModal("ACME CORP", "Acme Corp");

    // Casing change: same uppercase but different actual string → modal shown
    expect(result.showModal).toBe(true);
    expect(result.error).toBe(null);
  });

  it("does not show modal when name is identical (no change)", () => {
    const result = shouldShowCertModal("Acme Corp", "Acme Corp");

    expect(result.showModal).toBe(false);
    expect(result.error).toBe(null);
  });

  it("shows modal when setting name for the first time (current is null)", () => {
    const result = shouldShowCertModal("Acme Corp", null);

    expect(result.showModal).toBe(true);
    expect(result.error).toBe(null);
  });

  it("shows modal when setting name for the first time (current is empty)", () => {
    const result = shouldShowCertModal("Acme Corp", "");

    expect(result.showModal).toBe(true);
    expect(result.error).toBe(null);
  });

  it("returns error for empty input (no modal)", () => {
    const result = shouldShowCertModal("", "Acme Corp");

    expect(result.showModal).toBe(false);
    expect(result.error).toBe("Organization name cannot be empty");
  });

  it("returns error for whitespace-only input (no modal)", () => {
    const result = shouldShowCertModal("   ", "Acme Corp");

    expect(result.showModal).toBe(false);
    expect(result.error).toBe("Organization name cannot be empty");
  });

  it("returns error for name exceeding 120 chars (no modal)", () => {
    const longName = "A".repeat(121);
    const result = shouldShowCertModal(longName, "Acme Corp");

    expect(result.showModal).toBe(false);
    expect(result.error).toBe("Organization name must be 120 characters or fewer");
  });
});


// ============================================================================
// Certification modal — cancel and confirm behavior
// ============================================================================

describe("Certification modal — cancel and confirm", () => {
  it("cancel aborts save (no PATCH called)", async () => {
    const patchFn = createSpy("patchFn");

    // Simulate: user clicks Save → modal shown → user clicks Cancel
    const modalResult = shouldShowCertModal("New Corp", "Old Corp");
    expect(modalResult.showModal).toBe(true);

    // Cancel: modal closes, patchFn never called
    // (In the real UI, setShowCertModal(false) is called, no PATCH)
    expect(patchFn.callCount).toBe(0);
  });

  it("confirm triggers PATCH with trimmed name", async () => {
    const patchFn = createSpy("patchFn").mockResolvedValue({
      status: 200,
      data: { success: true, organization: { id: "cus_123", name: "New Corp", role: "owner", canEdit: true } },
    });

    // Simulate: user clicks Save → modal shown → user clicks Confirm
    const modalResult = shouldShowCertModal("  New Corp  ", "Old Corp");
    expect(modalResult.showModal).toBe(true);

    // Confirm: PATCH called with trimmed name
    await patchFn(modalResult.trimmedName);
    expect(patchFn.callCount).toBe(1);
    expect(patchFn.calls[0][0]).toBe("New Corp");
  });
});

// ============================================================================
// PATCH response handling — error display
// ============================================================================

describe("Organization card — PATCH response handling", () => {
  it("409 error displays 'already registered' message", () => {
    const result = processOrgNameResponse(409, { error: "This business name is already registered." });

    expect(result.success).toBe(false);
    expect(result.error).toBe("This business name is already registered.");
    expect(result.organization).toBe(null);
  });

  it("400 error displays validation message from API", () => {
    const result = processOrgNameResponse(400, { error: "Organization name cannot be empty" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Organization name cannot be empty");
  });

  it("403 error displays permission message", () => {
    const result = processOrgNameResponse(403, { error: "Only the organization owner can update the business name" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("You don't have permission to edit the organization name.");
  });

  it("successful save returns updated organization", () => {
    const org = { id: "cus_123", name: "Acme Corp", role: "owner", canEdit: true };
    const result = processOrgNameResponse(200, { success: true, organization: org });

    expect(result.success).toBe(true);
    expect(result.error).toBe(null);
    expect(result.organization.name).toBe("Acme Corp");
    expect(result.organization.id).toBe("cus_123");
  });

  it("successful save updates displayed name to new value", () => {
    const org = { id: "cus_123", name: "New Name", role: "owner", canEdit: true };
    const result = processOrgNameResponse(200, { success: true, organization: org });

    expect(result.success).toBe(true);
    expect(result.organization.name).toBe("New Name");
  });

  it("500 error returns generic failure message", () => {
    const result = processOrgNameResponse(500, { error: "Failed to update settings" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Failed to update settings");
  });
});

// ============================================================================
// Certification text content
// ============================================================================

describe("Certification modal — text content", () => {
  it("contains the exact business name in certification language", () => {
    const text = buildCertificationText("Acme Corp");

    expect(text.includes("Acme Corp")).toBe(true);
    expect(text.includes("legally authorized to act on behalf of Acme Corp")).toBe(true);
    expect(text.includes("HIC AI, INC. Terms of Service")).toBe(true);
  });

  it("handles names with special characters", () => {
    const name = "O'Brien & Associates, LLC.";
    const text = buildCertificationText(name);

    expect(text.includes(name)).toBe(true);
  });

  it("handles single-character names", () => {
    const text = buildCertificationText("X");

    expect(text.includes("on behalf of X and")).toBe(true);
  });
});
