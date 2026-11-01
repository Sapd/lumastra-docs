---
title: Apple apps
description: Set up Apple TV with a signed-in iPhone and recover when local setup is unavailable.
sidebar:
  order: 5
---

## Set up Apple TV with your iPhone

Use the Lumastra app on your iPhone to sign in on Apple TV.

### Before you start

- Connect both devices to the same Wi-Fi network. The network must allow devices
  to reach each other. Turn off client isolation; guest networks may block setup.
- Allow Local Network access for Lumastra on both devices.
- Sign in to Lumastra on your iPhone with the account you want to use on Apple TV.

### Connect and confirm

1. On Apple TV, open Lumastra and choose **Set up with your iPhone**. To add
   another account, open the account switcher, choose **Add Account**, then
   **Add account with your iPhone**.
2. On iPhone, open Lumastra and go to **Settings → Account → Set up Apple TV**.
   Keep this screen open and keep Lumastra in the foreground.
3. On Apple TV, select your iPhone. On iPhone, choose the account to add if asked.
4. Compare the **Pairing code** on both screens. Then compare the **Sign-in code**
   on both screens. Check the account and server too. Continue only if both codes
   match and the account is correct.
5. On Apple TV, choose **Both codes match**. Then, on iPhone, tap
   **Both codes match — Approve**. The iPhone button becomes available after the
   TV confirmation. If either code differs, cancel on the TV or tap **Decline**
   on iPhone.
6. Wait for Apple TV to finish signing in. It adds the account and makes it active.
   Other saved accounts stay available.

Apple TV gets its own session. Your iPhone's sign-in token is never copied to
the TV. The TV session can be revoked separately. Revoking the approving iPhone
session also revokes the TV session it approved.

### If the account is already added

Apple TV checks the selected server and username. If that account is already
signed in, it offers **Switch to this account**. Choose it to use the saved account.
This does not replace its credentials or create another session.

### If setup does not work

- **Local Network access is off:** on iPhone, tap **Open Settings**, or open
  **Settings → Privacy & Security → Local Network** and enable Lumastra. On
  Apple TV, check Lumastra's local-network permission in Settings. Return to
  Lumastra and choose **Try Again**.
- **No iPhone appears:** check the Wi-Fi network and client isolation. Keep
  **Set up Apple TV** open on iPhone. A phone in the background cannot complete
  setup.
- **Connection interrupted or setup expired:** choose **Try Again** and reopen
  setup on both devices. Compare both new codes.
- **Use the usual sign-in instead:** choose **Enter server address** on Apple TV.
  Once a server is selected, choose **Continue with QR code** when offered.
  Scan the QR code and approve in a signed-in browser. Use this if the server
  cannot accept approval from your iPhone session or local setup is unavailable.
