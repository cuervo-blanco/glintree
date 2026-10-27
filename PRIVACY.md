# Privacy

Updated 2026-10-26. This document describes Glintree, an independent learning tool built on the TextReadsFast foundation.

The extension reads YouTube captions and articles you explicitly open, and
displays them locally. It has no
account system, analytics, advertising network, AI provider or application server.
It does not upload transcripts, record audio, or download video.

## Storage

| Data                                                                                          | Location                  |
| --------------------------------------------------------------------------------------------- | ------------------------- |
| Reading preferences, caption language and script choice                                       | `chrome.storage.sync`     |
| Named presets created by the user                                                             | `chrome.storage.local`    |
| The active video’s captions and transcript interface                                          | Memory in the YouTube tab |
| Article text, source URL, title, byline and position                                          | `chrome.storage.session`  |
| Article pace, typography and display preferences                                              | `chrome.storage.local`    |
| Saved terms/concepts, languages, meanings, examples, lists/colours, progress and review dates | `chrome.storage.local`    |
| Explicitly saved source excerpts, titles, URLs and video times                                | `chrome.storage.local`    |

Chrome may synchronize reading preferences through the user’s browser account
when browser sync is enabled. Presets remain in the current browser profile.
Closing or navigating away from the video removes its in-memory transcript.
Article text is available for reloads while its reading tab is open. Closing
that tab removes its session copy. Closing the browser or reloading/disabling
the extension also clears browser-session storage. Article text is not synced
through the browser account. Explicitly saving a word or concept keeps its
source excerpt, title, URL and optional video time in the local learning collection.
The full article is not copied to that collection. Up to five source contexts are
kept per item. Items persist until deleted or the extension is removed.

Imported lists and backups are parsed locally. The extension does not upload
these files or request definitions, translations, examples or pronunciation
from external services. Meanings and examples come from your edits or imports.
A requested collection backup downloads a JSON file containing saved learning
items and source excerpts; it is stored wherever you choose to save it.

Previous versions could store assistant keys, notes and sessions locally. This
version does not read, transmit or delete that legacy data. Removing features
does not require silently erasing the user’s old records.

## Network and permissions

The extension requests caption tracks from YouTube and observes caption
responses that the YouTube player already fetches. It does not send that text
to another service.
Article extraction runs in the chosen page only after a context-menu action.
It reads the current document or selected text, without fetching another copy
or sending the content to a server. Pasted text is processed in the extension.
The reading tab renders text rather than executing the source page's HTML or
loading its images, scripts or embedded media.

The package requests:

- **storage**, for preferences, named presets and the learning collection;
- **activeTab**, for temporary access to a page when explicitly invoked;
- **scripting**, to extract that page's article or selected text;
- **contextMenus**, for the page and selection reading actions;
- access to **YouTube pages**, to read captions and place the reader in the player.

There are no optional provider permissions, download permissions or API keys.

## User controls

Use the G· switch in the player to turn the reader off. Change preferences and
save or delete presets in settings. Browser extension management can remove the
extension and its locally stored data.
Close an article reading tab to discard its temporary text and reading position.
Manage learning items in **Learning collection**. Delete an item to remove its
meanings, contexts and card. Download a collection backup or restore one from
that page. Restore merges records and keeps existing local definitions and
review progress. Locally downloaded backup files are independent of browser storage.

Issues for this fork can be reported at
[cuervo-blanco/textreadsfast-youtube](https://github.com/cuervo-blanco/textreadsfast-youtube/issues).
