/**
 * Team Management Page (Enterprise Only)
 *
 * Manage team members, seats, and permissions.
 *
 * @see PLG User Journey - Section 2.6
 */

import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
  Input,
} from "@/components/ui";
import { AUTH0_NAMESPACE } from "@/lib/constants";

export const metadata = {
  title: "Team",
};

// Mock team data - in production this comes from DynamoDB/Auth0 Organizations
const mockTeamMembers = [
  {
    id: "user_1",
    name: "Simon Reiff",
    email: "simon@hic-ai.com",
    role: "owner",
    status: "active",
    devices: 2,
    joinedAt: "2025-10-15",
  },
  {
    id: "user_2",
    name: "Alice Johnson",
    email: "alice@hic-ai.com",
    role: "admin",
    status: "active",
    devices: 1,
    joinedAt: "2025-11-01",
  },
  {
    id: "user_3",
    name: "Bob Smith",
    email: "bob@hic-ai.com",
    role: "member",
    status: "active",
    devices: 2,
    joinedAt: "2025-12-10",
  },
  {
    id: "user_4",
    name: "Pending User",
    email: "pending@example.com",
    role: "member",
    status: "pending",
    devices: 0,
    joinedAt: null,
  },
];

export default async function TeamPage() {
  const session = await getSession();
  const user = session.user;
  const namespace = AUTH0_NAMESPACE;

  const accountType = user[`${namespace}/account_type`];

  // Redirect non-enterprise users
  if (accountType !== "enterprise") {
    redirect("/portal");
  }

  const totalSeats = 10; // Would come from subscription
  const usedSeats = mockTeamMembers.filter((m) => m.status === "active").length;
  const teamMembers = mockTeamMembers;

  return (
    <div className="max-w-5xl">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-frost-white">Team</h1>
          <p className="text-slate-grey mt-1">
            Manage team members and seat allocation
          </p>
        </div>
        <Button>Invite Member</Button>
      </div>

      {/* Seat Usage */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-grey">Seat Usage</span>
            <span className="text-sm text-frost-white">
              {usedSeats} / {totalSeats} seats used
            </span>
          </div>
          <div className="h-2 bg-card-border rounded-full overflow-hidden">
            <div
              className="h-full bg-cerulean-mist rounded-full transition-all"
              style={{ width: `${(usedSeats / totalSeats) * 100}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-slate-grey">
            {totalSeats - usedSeats} seats available.{" "}
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
                    Devices
                  </th>
                  <th className="text-right py-4 px-6 text-sm font-medium text-slate-grey">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {teamMembers.map((member) => (
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
                            {member.name || "Pending"}
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
                          member.status === "active" ? "success" : "warning"
                        }
                      >
                        {member.status}
                      </Badge>
                    </td>
                    <td className="py-4 px-6 text-frost-white">
                      {member.devices} / 2
                    </td>
                    <td className="py-4 px-6 text-right">
                      {member.role !== "owner" && (
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="sm">
                            Edit
                          </Button>
                          <Button variant="ghost" size="sm">
                            Remove
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
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
          {mockTeamMembers.filter((m) => m.status === "pending").length > 0 ? (
            <div className="space-y-3">
              {mockTeamMembers
                .filter((m) => m.status === "pending")
                .map((invite) => (
                  <div
                    key={invite.id}
                    className="flex items-center justify-between p-3 bg-card-bg rounded-lg border border-card-border"
                  >
                    <div>
                      <p className="text-frost-white">{invite.email}</p>
                      <p className="text-sm text-slate-grey">
                        Invited as {invite.role}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm">
                        Resend
                      </Button>
                      <Button variant="ghost" size="sm">
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
    </div>
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
      className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium capitalize ${variants[role]}`}
    >
      {role}
    </span>
  );
}
