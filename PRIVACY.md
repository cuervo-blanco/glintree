# Privacy

Updated 2026-10-25. This document describes this fork of TextReadsFast for YouTube.

The extension reads captions from YouTube and displays them locally. It has no
account system, analytics, advertising network, AI provider or application server.
It does not upload transcripts, record audio, or download video.

## Storage

| Data                                                    | Location                  |
| ------------------------------------------------------- | ------------------------- |
| Reading preferences, caption language and script choice | `chrome.storage.sync`     |
| Named presets created by the user                       | `chrome.storage.local`    |
| The active video’s captions and transcript interface    | Memory in the YouTube tab |

Chrome may synchronize reading preferences through the user’s browser account
when browser sync is enabled. Presets remain in the current browser profile.
Closing or navigating away from the video removes its in-memory transcript.

Previous versions could store assistant keys, notes and sessions locally. This
version does not read, transmit or delete that legacy data. Removing features
does not require silently erasing the user’s old records.

## Network and permissions

The extension requests caption tracks from YouTube and observes caption
responses that the YouTube player already fetches. It does not send that text
to another service.

The package requests:

- **storage**, for preferences and named presets;
- access to **YouTube pages**, to read captions and place the reader in the player.

There are no optional provider permissions, download permissions or API keys.

## User controls

Use the TRF switch in the player to turn the reader off. Change preferences and
save or delete presets in settings. Browser extension management can remove the
extension and its locally stored data.

Issues for this fork can be reported at
[cuervo-blanco/textreadsfast-youtube](https://github.com/cuervo-blanco/textreadsfast-youtube/issues).
