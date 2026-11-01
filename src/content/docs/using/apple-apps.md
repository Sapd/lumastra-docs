---
title: Apple apps
description: Set up Apple TV with a signed-in iPhone, download audiobooks to Apple Watch, and switch the audio language in the Apple TV player.
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

## Audiobooks on Apple Watch

Apple Watch can download audiobooks itself, in the background, over Wi-Fi. The files
come straight from your server. They do not pass through the iPhone. Music still
transfers from the iPhone.

### Send a book to the Watch

1. Install Lumastra on your Apple Watch and open it once.
2. On iPhone, download the audiobook in Lumastra first.
3. On iPhone, open **Settings → Apple Watch**.
4. Under **Audiobooks**, choose **Transfer All Audiobooks**, or tap a book. You can also
   open the menu next to a book (**Manage Watch Download**) and choose
   **Transfer to Watch**.

Keep the Watch charged and connected to Wi-Fi.

### What the iPhone shows

Each book on the **Apple Watch** screen has a status line:

- **Downloading directly on Watch**, with the number of audio files finished and the
  size transferred. A book can have many audio files, so the counts are files, not books.
- **iPhone is requesting new download access for Apple Watch.** The iPhone is getting
  fresh download links for the Watch. Download links last up to 7 days. Wait; this needs
  no action.
- **No recent update from Watch.** The Watch has not reported progress for a while. Check
  that it is charged and on Wi-Fi, and open Lumastra on the Watch.
- **Ready on Watch.** The book is complete.

The menu next to a book also has **Cancel Transfer** and **Remove from Watch**.

### If a download fails

The iPhone shows why. After you fix the cause, choose **Transfer to Watch** for the book
again.

| Message | What to do |
|---|---|
| Apple Watch is out of storage. Free some space on the Watch, then transfer again. | Delete something on the Watch, then transfer again. |
| Sign in to Lumastra on iPhone again, then transfer this audiobook. | Sign in on the iPhone, then transfer again. |
| Apple Watch is signed in to a different account. | Sign in to the same account on both devices. |
| The server refused the download for Apple Watch. Check your access, then transfer again. | Check that your account may use the book. Ask your server admin if it keeps failing. |
| The server requires a sign-in in a browser (proxy login) before Apple Watch can download. | Your server sits behind a proxy login. Ask your server admin. |
| Apple Watch received damaged audio files. Transfer the book again. | Transfer the book again. |

Other failures show **Download failed. Tap Transfer to Watch to try again.** The Watch app
shows its own short messages for the same problems, such as **Not enough space on Apple
Watch. Free some space to continue.** and **The server refused the download. Send it again
from iPhone.** Send the book again from the iPhone.

## Audio language in the player

When a movie or episode has more than one audio track, the Apple TV player's info panel
has an **Audio** tab. It lists each audio track with its language and marks the current
one. Choose a track to switch to it.

Some streams carry only one audio track. For those the tab shows **Playback restarts at
your current position**, and picking a track restarts the video at the place you were.

The language you pick is saved as your audio language, so Lumastra uses it for the next
title that has it. The tab does not appear for a title with a single audio track.
