"use client";

/**
 * Account Settings Page
 *
 * Manage profile, notification preferences, and account actions.
 *
 * @see PLG User Journey - Section 2.6
 */

import { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  Button,
  Input,
} from "@/components/ui";
import { useUser } from "@/lib/cognito-provider";
import { AUTH_NAMESPACE } from "@/lib/constants";
import { getSession } from "@/lib/cognito";

export default function SettingsPage() {
  const { user: cognitoUser } = useUser();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Profile state
  const [profile, setProfile] = useState({
    givenName: "",
    middleName: "",
    familyName: "",
    email: "",
    picture: "",
    accountType: "individual",
  });

  // Notification preferences state
  const [notifications, setNotifications] = useState({
    productUpdates: true,
    usageAlerts: true,
    billingReminders: true,
    marketingEmails: false,
  });

  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Leave organization state
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaveConfirmation, setLeaveConfirmation] = useState("");
  const [leaving, setLeaving] = useState(false);

  // Organization state
  const [organization, setOrganization] = useState(null);
  const [editingOrgName, setEditingOrgName] = useState(false);
  const [orgNameInput, setOrgNameInput] = useState("");
  const [orgNameError, setOrgNameError] = useState(null);
  const [showCertModal, setShowCertModal] = useState(false);
  const [savingOrgName, setSavingOrgName] = useState(false);

  // Get user role info for conditional rendering
  const accountType = cognitoUser?.[`${AUTH_NAMESPACE}/account_type`] || "individual";
  const orgRole = cognitoUser?.[`${AUTH_NAMESPACE}/org_role`] || "member";
  const isBusinessAccount = accountType === "business";
  const isOrgOwner = isBusinessAccount && orgRole === "owner";
  const isOrgMember = isBusinessAccount && orgRole !== "owner";

  // Load profile from API (DynamoDB) and Cognito, fetch preferences from API with auth token
  useEffect(() => {
    async function loadSettings() {
      try {
        // Fetch profile and preferences from API with auth token
        // This gets data from DynamoDB which includes name for email signups
        const session = await getSession();
        if (session?.idToken) {
          const response = await fetch("/api/portal/settings", {
            headers: {
              Authorization: `Bearer ${session.idToken}`,
            },
          });
          
          if (response.ok) {
            const data = await response.json();
            
            // Merge profile: prefer DynamoDB data, fall back to Cognito
            // For email signups, Cognito doesn't have given_name/family_name
            setProfile({
              givenName: data.profile?.givenName || cognitoUser?.givenName || "",
              middleName: data.profile?.middleName || cognitoUser?.middleName || "",
              familyName: data.profile?.familyName || cognitoUser?.familyName || "",
              email: cognitoUser?.email || data.profile?.email || "",
              picture: cognitoUser?.picture || data.profile?.picture || "",
              accountType: data.profile?.accountType || cognitoUser?.["https://hic-ai.com/account_type"] || "individual",
            });
            
            // Load organization context for Business users
            if (data.organization) {
              setOrganization(data.organization);
            }

            if (data.notifications) {
              setNotifications({
                productUpdates: data.notifications.productUpdates ?? true,
                usageAlerts: data.notifications.usageAlerts ?? true,
                billingReminders: data.notifications.billingReminders ?? true,
                marketingEmails: data.notifications.marketingEmails ?? false,
              });
            }
          } else {
            // Fallback to Cognito user only if API fails
            if (cognitoUser) {
              setProfile({
                givenName: cognitoUser.givenName || "",
                middleName: cognitoUser.middleName || "",
                familyName: cognitoUser.familyName || "",
                email: cognitoUser.email || "",
                picture: cognitoUser.picture || "",
                accountType: cognitoUser["https://hic-ai.com/account_type"] || "individual",
              });
            }
          }
        }
      } catch (err) {
        console.error("Settings load error:", err);
        // Don't show error for preferences fetch failure, profile is still shown
      } finally {
        setLoading(false);
      }
    }

    if (cognitoUser) {
      loadSettings();
    }
  }, [cognitoUser]);

  // Save profile changes
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const session = await getSession();
      const response = await fetch("/api/portal/settings", {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          ...(session?.idToken && { Authorization: `Bearer ${session.idToken}` }),
        },
        body: JSON.stringify({
          givenName: profile.givenName,
          middleName: profile.middleName,
          familyName: profile.familyName,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save profile");
      }

      setSuccess("Profile updated successfully");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Save notification preferences
  const handleSaveNotifications = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const session = await getSession();
      const response = await fetch("/api/portal/settings", {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          ...(session?.idToken && { Authorization: `Bearer ${session.idToken}` }),
        },
        body: JSON.stringify({ notifications }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save preferences");
      }

      setSuccess("Notification preferences updated");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Export account data
  const handleExport = async () => {
    setExporting(true);
    setError(null);

    try {
      const session = await getSession();
      const response = await fetch("/api/portal/settings/export", {
        method: "POST",
        headers: {
          ...(session?.idToken && { Authorization: `Bearer ${session.idToken}` }),
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to export data");
      }

      // Get the filename from Content-Disposition header or use default
      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = "mouse-data-export.json";
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match) filename = match[1];
      }

      // Create download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();

      setSuccess("Data exported successfully");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  };

  // Delete account
  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== "DELETE MY ACCOUNT") {
      setError("Please type 'DELETE MY ACCOUNT' to confirm");
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      const session = await getSession();
      const response = await fetch("/api/portal/settings/delete-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.idToken && { Authorization: `Bearer ${session.idToken}` }),
        },
        body: JSON.stringify({
          confirmation: deleteConfirmation,
          reason: "User requested deletion",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete account");
      }

      // Redirect to homepage after successful deletion request
      window.location.href = "/auth/logout?returnTo=/";
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  // Leave organization
  const handleLeaveOrganization = async () => {
    if (leaveConfirmation !== "LEAVE ORGANIZATION") {
      setError("Please type 'LEAVE ORGANIZATION' to confirm");
      return;
    }

    setLeaving(true);
    setError(null);

    try {
      const session = await getSession();
      const response = await fetch("/api/portal/settings/leave-organization", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.idToken && { Authorization: `Bearer ${session.idToken}` }),
        },
        body: JSON.stringify({
          confirmation: leaveConfirmation,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to leave organization");
      }

      // Redirect to portal after leaving
      window.location.href = data.redirectTo || "/portal";
    } catch (err) {
      setError(err.message);
    } finally {
      setLeaving(false);
    }
  };

  // Save organization name — shows certification modal if name changed
  const handleOrgNameSave = () => {
    const trimmed = orgNameInput.trim();
    if (!trimmed) {
      setOrgNameError("Organization name cannot be empty");
      return;
    }
    if (trimmed.length > 120) {
      setOrgNameError("Organization name must be 120 characters or fewer");
      return;
    }

    // If name hasn't changed (case-insensitive), save directly without certification
    const currentName = (organization?.name || "").trim();
    if (currentName.toUpperCase() === trimmed.toUpperCase() && currentName === trimmed) {
      // No change at all — just close edit mode
      setEditingOrgName(false);
      return;
    }

    // Name changed — show certification modal
    setShowCertModal(true);
  };

  // Handle certification modal confirm — submit the org name PATCH
  const handleCertConfirm = async () => {
    setShowCertModal(false);
    setSavingOrgName(true);
    setOrgNameError(null);

    try {
      const session = await getSession();
      const response = await fetch("/api/portal/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(session?.idToken && { Authorization: `Bearer ${session.idToken}` }),
        },
        body: JSON.stringify({ organizationName: orgNameInput.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          setOrgNameError("This business name is already registered.");
        } else if (response.status === 403) {
          setOrgNameError("You don't have permission to edit the organization name.");
        } else {
          setOrgNameError(data.error || "Failed to update organization name");
        }
        return;
      }

      // Update local state with the new name
      if (data.organization) {
        setOrganization(data.organization);
      }
      setEditingOrgName(false);
      setSuccess("Business name updated successfully");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setOrgNameError(err.message || "Failed to update organization name");
    } finally {
      setSavingOrgName(false);
    }
  };

  // Toggle notification
  const toggleNotification = (key) => {
    setNotifications((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  if (loading) {
    return (
      <div className="max-w-4xl">
        <div className="mb-8">
          <div className="h-9 w-32 bg-card-border rounded animate-pulse"></div>
          <div className="h-5 w-48 bg-card-border rounded animate-pulse mt-2"></div>
        </div>
        <div className="space-y-6">
          <div className="h-64 bg-card-border rounded-lg animate-pulse"></div>
          <div className="h-64 bg-card-border rounded-lg animate-pulse"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-frost-white">Settings</h1>
        <p className="text-slate-grey mt-1">Manage your account preferences</p>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="mb-6 p-4 bg-success/10 border border-success/30 rounded-lg text-success">
          {success}
        </div>
      )}
      {error && (
        <div className="mb-6 p-4 bg-error/10 border border-error/30 rounded-lg text-error">
          {error}
        </div>
      )}

      {/* Profile Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <form onSubmit={handleSaveProfile}>
          <CardContent>
            <div className="space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                <Input
                  label="First Name"
                  name="givenName"
                  value={profile.givenName}
                  onChange={(e) =>
                    setProfile((prev) => ({ ...prev, givenName: e.target.value }))
                  }
                  placeholder="First name"
                  required
                />
                <Input
                  label="Middle Initial"
                  name="middleName"
                  value={profile.middleName}
                  onChange={(e) =>
                    setProfile((prev) => ({ ...prev, middleName: e.target.value }))
                  }
                  placeholder="M.I. (optional)"
                  maxLength={5}
                />
                <Input
                  label="Last Name"
                  name="familyName"
                  value={profile.familyName}
                  onChange={(e) =>
                    setProfile((prev) => ({ ...prev, familyName: e.target.value }))
                  }
                  placeholder="Last name"
                  required
                />
              </div>
              <div>
                <Input
                  label="Email"
                  name="email"
                  type="email"
                  value={profile.email}
                  disabled
                  className="opacity-60"
                />
                <p className="text-sm text-slate-grey mt-2">
                  Email address cannot be changed. Contact support if you need
                  assistance.
                </p>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* Organization Section - Business users only */}
      {organization && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Organization</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-grey mb-1">
                  Business Name
                </label>
                {organization.canEdit && editingOrgName ? (
                  <div className="flex gap-3">
                    <Input
                      value={orgNameInput}
                      onChange={(e) => {
                        setOrgNameInput(e.target.value);
                        setOrgNameError(null);
                      }}
                      placeholder="Enter your business name"
                      maxLength={120}
                      className="flex-1"
                    />
                    <Button
                      onClick={handleOrgNameSave}
                      disabled={savingOrgName || !orgNameInput.trim()}
                    >
                      {savingOrgName ? "Saving..." : "Save"}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setEditingOrgName(false);
                        setOrgNameInput(organization.name || "");
                        setOrgNameError(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <p className="text-frost-white">
                      {organization.name || (
                        <span className="text-slate-grey italic">Not set — add your business name</span>
                      )}
                    </p>
                    {organization.canEdit && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setOrgNameInput(organization.name || "");
                          setEditingOrgName(true);
                          setOrgNameError(null);
                        }}
                      >
                        Edit
                      </Button>
                    )}
                  </div>
                )}
                {orgNameError && (
                  <p className="text-sm text-error mt-2">{orgNameError}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-grey mb-1">
                  Your Role
                </label>
                <p className="text-frost-white capitalize">{organization.role}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Certification Modal */}
      {showCertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
          <div className="bg-card-bg border border-card-border rounded-lg p-6 max-w-lg mx-4">
            <h3 className="text-lg font-semibold text-frost-white mb-4">
              Business Name Certification
            </h3>
            <p className="text-silver leading-relaxed mb-6">
              By providing this business name, you certify that you are legally
              authorized to act on behalf of{" "}
              <strong className="text-frost-white">{orgNameInput.trim()}</strong>{" "}
              and to bind it to the HIC AI, INC. Terms of Service. You understand
              that HIC AI, INC. may request additional proof of entity existence
              or authorization.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => setShowCertModal(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleCertConfirm}>
                I Certify
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Preferences */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <form onSubmit={handleSaveNotifications}>
          <CardContent>
            <div className="space-y-4">
              <NotificationToggle
                label="Product updates"
                description="News about new features and improvements"
                checked={notifications.productUpdates}
                onChange={() => toggleNotification("productUpdates")}
              />
              <NotificationToggle
                label="Usage alerts"
                description="Notifications when approaching device limits"
                checked={notifications.usageAlerts}
                onChange={() => toggleNotification("usageAlerts")}
              />
              <NotificationToggle
                label="Billing reminders"
                description="Payment confirmations and renewal notices"
                checked={notifications.billingReminders}
                onChange={() => toggleNotification("billingReminders")}
              />
              <NotificationToggle
                label="Marketing emails"
                description="Tips, tutorials, and promotional content"
                checked={notifications.marketingEmails}
                onChange={() => toggleNotification("marketingEmails")}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Preferences"}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* Danger Zone */}
      <Card className="border-error/30">
        <CardHeader>
          <CardTitle className="text-error">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-error/5 rounded-lg border border-error/20">
              <div>
                <h4 className="font-medium text-frost-white">
                  Export Account Data
                </h4>
                <p className="text-sm text-slate-grey">
                  Download all your data in JSON format
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExport}
                disabled={exporting}
              >
                {exporting ? "Exporting..." : "Export"}
              </Button>
            </div>

            {/* Leave Organization - for business members only */}
            {isOrgMember && (
              <div className="p-4 bg-error/5 rounded-lg border border-error/20">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-frost-white">
                      Leave Organization
                    </h4>
                    <p className="text-sm text-slate-grey">
                      Remove yourself from the organization
                    </p>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setShowLeaveConfirm(!showLeaveConfirm)}
                  >
                    {showLeaveConfirm ? "Cancel" : "Leave Organization"}
                  </Button>
                </div>

                {showLeaveConfirm && (
                  <div className="mt-4 pt-4 border-t border-error/20">
                    <p className="text-sm text-error mb-3">
                      You will lose access to your organization&apos;s license and team features.
                      Type <strong>LEAVE ORGANIZATION</strong> to confirm.
                    </p>
                    <div className="flex gap-3">
                      <Input
                        value={leaveConfirmation}
                        onChange={(e) => setLeaveConfirmation(e.target.value)}
                        placeholder="Type LEAVE ORGANIZATION"
                        className="flex-1"
                      />
                      <Button
                        variant="danger"
                        onClick={handleLeaveOrganization}
                        disabled={leaving || leaveConfirmation !== "LEAVE ORGANIZATION"}
                      >
                        {leaving ? "Leaving..." : "Confirm Leave"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Delete Account - for individual users and org owners */}
            {!isOrgMember && (
              <div className="p-4 bg-error/5 rounded-lg border border-error/20">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-frost-white">
                      {isOrgOwner ? "Delete Account & Organization" : "Delete Account"}
                    </h4>
                    <p className="text-sm text-slate-grey">
                      {isOrgOwner
                        ? "Cancel subscription and dissolve your organization"
                        : "Cancel subscription and delete your account"}
                    </p>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
                  >
                    {showDeleteConfirm ? "Cancel" : "Delete Account"}
                  </Button>
                </div>

                {showDeleteConfirm && (
                  <div className="mt-4 pt-4 border-t border-error/20">
                    {isOrgOwner && (
                      <div className="mb-3 p-3 bg-warning/10 rounded border border-warning/20">
                        <p className="text-sm text-warning font-medium mb-1">
                          ⚠️ Organization Dissolution Warning
                        </p>
                        <p className="text-xs text-slate-grey">
                          Deleting your account will also dissolve your organization.
                          All team members will lose access to Mouse at the end of the
                          current billing period. They can subscribe individually if they
                          wish to continue using Mouse.
                        </p>
                      </div>
                    )}
                    <p className="text-sm text-error mb-3">
                      Your subscription will be canceled. You&apos;ll keep access to Mouse
                      until the end of your current billing period. Type{" "}
                      <strong>DELETE MY ACCOUNT</strong> to confirm.
                    </p>
                    <div className="flex gap-3">
                      <Input
                        value={deleteConfirmation}
                        onChange={(e) => setDeleteConfirmation(e.target.value)}
                        placeholder="Type DELETE MY ACCOUNT"
                        className="flex-1"
                      />
                      <Button
                        variant="danger"
                        onClick={handleDeleteAccount}
                        disabled={
                          deleting || deleteConfirmation !== "DELETE MY ACCOUNT"
                        }
                      >
                        {deleting ? "Deleting..." : "Confirm Delete"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function NotificationToggle({ label, description, checked, onChange }) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <div>
        <p className="font-medium text-frost-white">{label}</p>
        <p className="text-sm text-slate-grey">{description}</p>
      </div>
      <div className="relative">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className="sr-only peer"
        />
        <div className="w-11 h-6 bg-card-border rounded-full peer peer-checked:bg-cerulean-mist transition-colors"></div>
        <div className="absolute left-1 top-1 w-4 h-4 bg-frost-white rounded-full transition-transform peer-checked:translate-x-5"></div>
      </div>
    </label>
  );
}
