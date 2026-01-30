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

  // Load profile from Cognito user context, fetch preferences from API with auth token
  useEffect(() => {
    async function loadSettings() {
      try {
        // Get profile from Cognito user directly (already authenticated)
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

        // Fetch notification preferences from API with auth token
        const session = await getSession();
        if (session?.idToken) {
          const response = await fetch("/api/portal/settings", {
            headers: {
              Authorization: `Bearer ${session.idToken}`,
            },
          });
          
          if (response.ok) {
            const data = await response.json();
            if (data.notifications) {
              setNotifications({
                productUpdates: data.notifications.productUpdates ?? true,
                usageAlerts: data.notifications.usageAlerts ?? true,
                billingReminders: data.notifications.billingReminders ?? true,
                marketingEmails: data.notifications.marketingEmails ?? false,
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

            <div className="p-4 bg-error/5 rounded-lg border border-error/20">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-frost-white">
                    Delete Account
                  </h4>
                  <p className="text-sm text-slate-grey">
                    Permanently delete your account and all data
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
                  <p className="text-sm text-error mb-3">
                    This action cannot be undone. Your account will be scheduled
                    for deletion with a 30-day grace period. Type{" "}
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
