/**
 * Team Management Client Component
 *
 * Handles team member and invite management with real API integration.
 *
 * @see PLG Technical Specification v2 - Section 4.5
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
  Input,
} from "@/components/ui";

export default function TeamManagement({ initialUserId }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [usage, setUsage] = useState({
    totalSeats: 0,
    usedSeats: 0,
    availableSeats: 0,
  });

  // Invite form state
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState(null);

  // Fetch team data
  const fetchTeamData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/portal/team");
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch team data");
      }
      const data = await res.json();
      setMembers(data.members || []);
      setInvites(data.invites || []);
      setUsage(
        data.usage || { totalSeats: 0, usedSeats: 0, availableSeats: 0 },
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeamData();
  }, [fetchTeamData]);

  // Handle invite submission
  const handleInvite = async (e) => {
    e.preventDefault();
    setInviteLoading(true);
    setInviteError(null);

    try {
      const res = await fetch("/api/portal/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "invite",
          email: inviteEmail,
          role: inviteRole,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to send invite");
      }

      // Reset form and refresh data
      setInviteEmail("");
      setInviteRole("member");
      setShowInviteForm(false);
      await fetchTeamData();
    } catch (err) {
      setInviteError(err.message);
    } finally {
      setInviteLoading(false);
    }
  };

  // Handle member status update
  const handleUpdateStatus = async (memberId, status) => {
    if (
      !confirm(
        `Are you sure you want to ${status === "suspended" ? "suspend" : status === "revoked" ? "revoke access for" : "activate"} this member?`,
      )
    ) {
      return;
    }

    try {
      const res = await fetch("/api/portal/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_status",
          memberId,
          status,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update member");
      }

      await fetchTeamData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Handle member removal
  const handleRemoveMember = async (memberId) => {
    if (
      !confirm("Are you sure you want to remove this member from the team?")
    ) {
      return;
    }

    try {
      const res = await fetch("/api/portal/team", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "member",
          memberId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove member");
      }

      await fetchTeamData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Handle invite cancellation
  const handleCancelInvite = async (inviteId) => {
    if (!confirm("Are you sure you want to cancel this invitation?")) {
      return;
    }

    try {
      const res = await fetch("/api/portal/team", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "invite",
          inviteId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to cancel invite");
      }

      await fetchTeamData();
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-grey">Loading team data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center">
            <p className="text-red-400 mb-4">{error}</p>
            <Button onClick={fetchTeamData}>Retry</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Header with Invite Button */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-frost-white">Team</h1>
          <p className="text-slate-grey mt-1">
            Manage team members and seat allocation
          </p>
        </div>
        <Button onClick={() => setShowInviteForm(true)}>Invite Member</Button>
      </div>

      {/* Invite Form Modal */}
      {showInviteForm && (
        <Card className="mb-6 border-cerulean-mist">
          <CardHeader>
            <CardTitle>Invite Team Member</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-frost-white mb-1">
                  Email Address
                </label>
                <Input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  required
                  disabled={inviteLoading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-frost-white mb-1">
                  Role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full px-3 py-2 bg-card-bg border border-card-border rounded-lg text-frost-white focus:outline-none focus:border-cerulean-mist"
                  disabled={inviteLoading}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              {inviteError && (
                <p className="text-red-400 text-sm">{inviteError}</p>
              )}
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setShowInviteForm(false);
                    setInviteError(null);
                  }}
                  disabled={inviteLoading}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={inviteLoading}>
                  {inviteLoading ? "Sending..." : "Send Invite"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Seat Usage */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-grey">Seat Usage</span>
            <span className="text-sm text-frost-white">
              {usage.usedSeats} / {usage.totalSeats} seats used
            </span>
          </div>
          <div className="h-2 bg-card-border rounded-full overflow-hidden">
            <div
              className="h-full bg-cerulean-mist rounded-full transition-all"
              style={{
                width: `${usage.totalSeats > 0 ? (usage.usedSeats / usage.totalSeats) * 100 : 0}%`,
              }}
            />
          </div>
          <p className="mt-2 text-sm text-slate-grey">
            {usage.availableSeats} seats available.{" "}
            {invites.length > 0 && (
              <span className="text-slate-grey">
                ({invites.length} pending invite
                {invites.length !== 1 ? "s" : ""}){" "}
              </span>
            )}
            <a
              href="/portal/billing"
              className="text-cerulean-mist hover:text-frost-white"
            >
              Need more?
            </a>
          </p>
        </CardContent>
      </Card>

      {/* Team Members Table */}
      <Card>
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-card-border">
                  <th className="text-left py-4 px-6 text-sm font-medium text-slate-grey">
                    Member
                  </th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-slate-grey">
                    Role
                  </th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-slate-grey">
                    Status
                  </th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-slate-grey">
                    Joined
                  </th>
                  <th className="text-right py-4 px-6 text-sm font-medium text-slate-grey">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-8 text-center text-slate-grey"
                    >
                      No team members yet
                    </td>
                  </tr>
                ) : (
                  members.map((member) => (
                    <tr
                      key={member.id}
                      className="border-b border-card-border last:border-0"
                    >
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-cerulean-mist/20 flex items-center justify-center">
                            <span className="text-sm font-medium text-cerulean-mist">
                              {member.name?.[0]?.toUpperCase() || "?"}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-frost-white">
                              {member.name || "Unknown"}
                            </p>
                            <p className="text-sm text-slate-grey">
                              {member.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <RoleBadge role={member.role} />
                      </td>
                      <td className="py-4 px-6">
                        <Badge
                          variant={
                            member.status === "active"
                              ? "success"
                              : member.status === "suspended"
                                ? "warning"
                                : "destructive"
                          }
                        >
                          {member.status}
                        </Badge>
                      </td>
                      <td className="py-4 px-6 text-frost-white">
                        {member.joinedAt
                          ? new Date(member.joinedAt).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="py-4 px-6 text-right">
                        {member.role !== "owner" && (
                          <div className="flex items-center justify-end gap-2">
                            {member.status === "active" ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  handleUpdateStatus(member.id, "suspended")
                                }
                              >
                                Suspend
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  handleUpdateStatus(member.id, "active")
                                }
                              >
                                Activate
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveMember(member.id)}
                            >
                              Remove
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Pending Invitations</CardTitle>
        </CardHeader>
        <CardContent>
          {invites.length > 0 ? (
            <div className="space-y-3">
              {invites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between p-3 bg-card-bg rounded-lg border border-card-border"
                >
                  <div>
                    <p className="text-frost-white">{invite.email}</p>
                    <p className="text-sm text-slate-grey">
                      Invited as {invite.role} •{" "}
                      {invite.expiresAt
                        ? `Expires ${new Date(invite.expiresAt).toLocaleDateString()}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCancelInvite(invite.id)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-grey text-center py-4">
              No pending invitations
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function RoleBadge({ role }) {
  const variants = {
    owner: "bg-cerulean-mist/20 text-cerulean-mist",
    admin: "bg-info/20 text-info",
    member: "bg-card-bg text-silver border border-card-border",
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium capitalize ${variants[role] || variants.member}`}
    >
      {role}
    </span>
  );
}
