/**
 * Account Settings Page
 *
 * Manage profile, notification preferences, and account actions.
 *
 * @see PLG User Journey - Section 2.6
 */

import { getSession } from "@/lib/auth";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  Button,
  Input,
} from "@/components/ui";
import { AUTH0_NAMESPACE } from "@/lib/constants";

export const metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const session = await getSession();
  const user = session.user;

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-frost-white">Settings</h1>
        <p className="text-slate-grey mt-1">Manage your account preferences</p>
      </div>

      {/* Profile Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Input
                label="Full Name"
                name="name"
                defaultValue={user.name || ""}
                placeholder="Your name"
              />
              <Input
                label="Email"
                name="email"
                type="email"
                defaultValue={user.email}
                disabled
                className="opacity-60"
              />
            </div>
            <p className="text-sm text-slate-grey">
              Email changes must be done through Auth0. Contact support if
              needed.
            </p>
          </form>
        </CardContent>
        <CardFooter>
          <Button>Save Changes</Button>
        </CardFooter>
      </Card>

      {/* Notification Preferences */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <NotificationToggle
              label="Product updates"
              description="News about new features and improvements"
              defaultChecked={true}
            />
            <NotificationToggle
              label="Usage alerts"
              description="Notifications when approaching device limits"
              defaultChecked={true}
            />
            <NotificationToggle
              label="Billing reminders"
              description="Payment confirmations and renewal notices"
              defaultChecked={true}
            />
            <NotificationToggle
              label="Marketing emails"
              description="Tips, tutorials, and promotional content"
              defaultChecked={false}
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button>Save Preferences</Button>
        </CardFooter>
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
              <Button variant="secondary" size="sm">
                Export
              </Button>
            </div>

            <div className="flex items-center justify-between p-4 bg-error/5 rounded-lg border border-error/20">
              <div>
                <h4 className="font-medium text-frost-white">Delete Account</h4>
                <p className="text-sm text-slate-grey">
                  Permanently delete your account and all data
                </p>
              </div>
              <Button variant="danger" size="sm">
                Delete Account
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function NotificationToggle({ label, description, defaultChecked }) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <div>
        <p className="font-medium text-frost-white">{label}</p>
        <p className="text-sm text-slate-grey">{description}</p>
      </div>
      <div className="relative">
        <input
          type="checkbox"
          defaultChecked={defaultChecked}
          className="sr-only peer"
        />
        <div className="w-11 h-6 bg-card-border rounded-full peer peer-checked:bg-cerulean-mist transition-colors"></div>
        <div className="absolute left-1 top-1 w-4 h-4 bg-frost-white rounded-full transition-transform peer-checked:translate-x-5"></div>
      </div>
    </label>
  );
}
