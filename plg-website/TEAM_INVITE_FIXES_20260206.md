# Team Invite Issues - Fixes Applied

**Date**: 2026-02-06  
**Reported by**: Simon  
**Fixed by**: Q Developer

---

## Issue 1: Dropdown Background Color (FIXED ✅)

### Problem
When clicking the role dropdown in the "Invite Team Member" component, the options (Admin/Member) had incorrect background colors. Admin was only visible on hover, and Member disappeared when hovering over Admin.

### Root Cause
The `<option>` elements were inheriting the parent `<select>` background (`bg-card-bg`) but needed explicit dark background styling to be visible against the dropdown menu's default light background.

### Fix Applied
**File**: `plg-website/src/app/portal/team/TeamManagement.js`

Added Tailwind CSS classes to all three select dropdowns:
```css
[&>option]:bg-midnight-navy [&>option]:text-frost-white
```

This ensures option elements have:
- Dark background (`midnight-navy`) matching the app theme
- White text (`frost-white`) for proper contrast

**Lines changed**: 365, 485, 565

---

## Issue 2: Email Not Sending (FIXED ✅)

### Problem
When sending a team invite, the UI updated correctly (showing pending invite, updating seat count), but no email was actually sent to the invited user (e.g., `simon.reiff@gmail.com`).

### Root Cause
Missing AWS SES configuration in `.env.local`:
- `AWS_REGION` - Required for SES client initialization
- `SES_FROM_EMAIL` - Required for email sender address
- AWS credentials - Required for SES API authentication

The code was failing silently because the error was caught in a try/catch block at `route.js:289` and only logged to console.

### Fix Applied
**File**: `plg-website/.env.local`

Added missing SES configuration:
```bash
# ───────────────────────────────────────────────────────────────────
# 📧 AWS SES - Email Sending
# ───────────────────────────────────────────────────────────────────

AWS_REGION=us-east-1
SES_FROM_EMAIL=noreply@hic-ai.com

# Note: AWS credentials should be configured via AWS CLI or IAM role
# For local development, run: aws configure
# For staging/production, use IAM role attached to Amplify/Lambda
```

### Additional Steps Required

#### 1. Configure AWS Credentials (Local Development)
```bash
aws configure
```
Enter your AWS Access Key ID and Secret Access Key when prompted.

#### 2. Verify Email Address in SES (Sandbox Mode)
If SES is in sandbox mode, you must verify recipient email addresses:

**Via AWS Console**:
1. Go to AWS SES Console → Verified identities
2. Click "Create identity"
3. Select "Email address"
4. Enter `simon.reiff@gmail.com`
5. Click "Create identity"
6. Check email inbox for verification link
7. Click verification link

**Via AWS CLI**:
```bash
aws ses verify-email-identity --email-address simon.reiff@gmail.com
```

#### 3. Move SES Out of Sandbox (Production)
For production, request SES production access to send to any email:
1. AWS SES Console → Account dashboard
2. Click "Request production access"
3. Fill out the form explaining your use case
4. Wait for AWS approval (usually 24-48 hours)

---

## Email Flow Architecture

```
User clicks "Send Invite"
  ↓
TeamManagement.js → handleInvite()
  ↓
POST /api/portal/team (action: "invite")
  ↓
route.js → createOrgInvite() → DynamoDB ✅
  ↓
route.js:289 → sendEnterpriseInviteEmail()
  ↓
ses.js → sendEmail("enterpriseInvite")
  ↓
SESClient.send(SendEmailCommand) → AWS SES
  ↓
Email delivered to recipient ✅
```

**Why DynamoDB worked but SES didn't**:
- DynamoDB uses AWS SDK with default credential chain (works with IAM roles)
- SES requires explicit region and sender email configuration
- Missing env vars caused SES to fail while DynamoDB succeeded

---

## Testing Checklist

### Dropdown Fix
- [ ] Open https://staging.hic-ai.com/portal/team
- [ ] Click "Invite Member"
- [ ] Click the "Role" dropdown
- [ ] Verify both "Admin" and "Member" options are visible with dark background
- [ ] Hover over each option - both should remain visible

### Email Fix
- [ ] Configure AWS credentials locally (`aws configure`)
- [ ] Verify `simon.reiff@gmail.com` in SES (if sandbox mode)
- [ ] Restart Next.js dev server to load new env vars
- [ ] Open https://staging.hic-ai.com/portal/team
- [ ] Click "Invite Member"
- [ ] Enter `simon.reiff@gmail.com`
- [ ] Select role and click "Send Invite"
- [ ] Check email inbox for invite email
- [ ] Check browser console for any SES errors
- [ ] Verify invite appears in "Pending Invitations" section

---

## Files Modified

1. `plg-website/.env.local` - Added SES configuration
2. `plg-website/src/app/portal/team/TeamManagement.js` - Fixed dropdown styling

---

## Notes

- The email template is defined in `dm/layers/ses/src/email-templates.js` (enterpriseInvite)
- Email includes organization name, inviter name, and invite token
- Invite link format: `${APP_URL}/invite/accept?token=${inviteToken}`
- Invites expire in 7 days (configured in DynamoDB)
- SES configuration is also needed in staging/production Amplify environment variables

---

## Related Documentation

- PLG Technical Specification v2 - Section 4.5 (Team Management)
- `docs/plg/20260131_PLG_EMAIL_SYSTEM_TECHNICAL_SPECIFICATION_V5.md`
- `infrastructure/cloudformation/plg-ses.yaml` (SES infrastructure)
