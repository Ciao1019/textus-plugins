# Cloud Sync for Textus

Keeps a folder the same on your computers through your own S3-compatible
storage, WebDAV or Nutstore. Files are encrypted before they leave the device,
so the service sees neither their contents nor their names. Requires Textus
1.3.2 or later on desktop.

## Getting started

1. Open the folder to sync in Textus, then choose **Plugins › Cloud Sync**.
2. Pick the storage service and enter its server address and sign-in. Nutstore
   needs only your email and an app password from Account › Security.
3. Set a **sync password** of at least 12 characters and keep it in your
   password manager: it can't be reset.
4. Choose **Save connection**, then **Sync now**.

On another device, open the matching folder and enter the same service, the
same remote folder and the same sync password. Turn on **Sync automatically
while Textus is open** to sync every few minutes.

When both devices changed the same file, both versions stay: yours in place,
the other device's in `Sync conflicts/`.

**Permissions:** read and write the open folder (to scan it and apply what
comes down), and reach any website (only the HTTPS server you enter). No
telemetry, analytics, remote code or self-updates.

## Details

S3 takes a custom endpoint (empty means AWS), region, bucket, path-style or
virtual-host addressing and an optional session token under **More options**.
The remote folder holds the plugin's storage format, not a plain file mirror;
use a different one for each workspace.

Credentials are stored through `ctx.secrets`, separately from sync state.
They are never sent back to the settings page or copied to the remote
manifest. Blank credential fields keep an existing connection's credentials.
Changing the endpoint, remote folder or account requires appropriate credentials.
The sync password is also saved locally through `ctx.secrets` for automatic sync,
never returned to the settings page or sent to the storage service. Blank password
fields retain it. Entering a different password here does not re-encrypt an existing
repository: it must match the password used to initialize that remote folder.

## What is synced

- Saved `.md`, `.markdown`, `.mdown`, `.mkd`, `.txt` and `.csv` documents.
- Images, PDF, Office/OpenDocument files, audio and video. The exact allowlist
  is `development/cloud-sync/src/config.ts` in the plugin repository.
- Textus project data: `.textus/agent.md`, `style.md`, `style.previous.md`,
  and Markdown under `.textus/library/`, `memory/` and `skills/`.

Global settings, chat history, drafts, unsaved edits, credentials, other
plugins' data, arbitrary dotfiles and build/dependency folders are excluded.
Only files inside the open workspace can be accessed. Files outside it,
including linked attachments outside the folder, are not uploaded.

The current limits are 128 MiB per file, 20,000 visited files/folders,
48 directory levels, and an 8 MiB manifest. Empty directories are not synced.
Paths that are unsafe on supported platforms, or differ only in case or
Unicode normalization, stop the run rather than being silently renamed.

## Changes and conflicts

SHA-256 hashes and the last successful sync determine which side changed.
Only changed content is transferred. Files are stored in 2 MiB blocks and
shared blocks are reused; ETags are not treated as content hashes.

- Independent edits are copied to the other device.
- Concurrent edits keep the local file and save the remote version under
  `Sync conflicts/`. Both versions are published for other devices.
- Open destination files are deferred; save and close them, then sync again.
- Existing text files are updated through Textus's version-checked
  `files.process` API. Existing binary files are never overwritten: differing
  attachments keep both versions, even when only one side changed. The current
  plugin API has no conditional binary replacement operation.
- Deletions are deliberately not propagated in this release. A file that
  remains remotely will return after local deletion; renames retain the old
  remote path as well. To remove content permanently, use a fresh remote folder
  for a cleaned workspace. There is no remote garbage collection yet.

Content and filenames are **encrypted before upload**, with HTTPS in transit.
Use a private S3 bucket or WebDAV folder. The service account
needs read, write and delete permission in the dedicated remote folder
(delete is needed for temporary objects and locks).

## End-to-end encryption

Cloud Sync always encrypts; there is no plaintext fallback or encryption-off switch.
File contents, paths, content hashes and snapshots are authenticated and encrypted
using AES-256-GCM through Web Crypto. Each encryption uses a fresh 96-bit nonce and
a 128-bit tag. Authentication binds the repository's encryption header and the
logical object key, preventing substitution between blocks, manifests and snapshots.

A 256-bit root is derived locally with PBKDF2-HMAC-SHA-256, 600,000 iterations and
a random 256-bit repository salt. HKDF-SHA-256 derives separate keys for AES and
HMAC-SHA-256 object naming. Names for content blocks are keyed HMACs, not public
plaintext hashes. Equal blocks are reused within a repository; unrelated repositories
use different salts and keys. Decryption authenticates bytes before applying files.

Only public KDF parameters, a repository ID and an encrypted fixed verification
message are stored in the encryption descriptor. A device pins the descriptor's
fingerprint after its first successful unlock and stops if it changes or disappears.
Wrong passwords, malformed descriptors and tampered ciphertext stop sync.

The provider can still observe the chosen remote prefix, object sizes and counts,
block reuse within one repository, request timing and the anonymous lock owner/time.
The protocol does not guarantee detection of a malicious server replaying an older
valid encrypted state. Strong passwords matter because remote ciphertext allows
offline password guessing; the KDF raises its cost but cannot make a weak password
strong. This implementation has automated interoperability and tampering tests,
but has not received an independent security audit.

Local files remain readable. The password lives in Textus's per-user local secrets
storage, not in the remote repository; this does not protect a compromised or unlocked
client. Losing the password or original encryption descriptor makes remote recovery
impossible. A full backup must include the descriptor and encrypted objects.

### Remote format

- `v1/head.json`: the public encryption descriptor (`textus-cloud-sync-e2ee/1`).
  The old path is intentional: v0.1 clients reject this format before uploading files.
- `v1/lock.json`: shared exclusion with old and new clients; no document data.
- `v2/head.bin`: encrypted current manifest.
- `v2/blocks/<prefix>/<HMAC>`: encrypted content blocks.
- `v2/snapshots/<revision>.bin`: immutable encrypted manifests.

Encrypted objects contain `TCS2`, a 12-byte nonce, then ciphertext and its 16-byte
GCM tag. AAD is UTF-8 of the canonical JSON header (`format`, `repositoryId`, `kdf`,
`iterations`, `salt`, in that order), a newline and the logical v1 object key. The
password is UTF-8 without normalization. HKDF uses the UTF-8 repository ID as salt
and `textus-cloud-sync-e2ee/1/content` or `/names` as info. Block HMAC input is the
UTF-8 logical `v1/blocks/<hash-prefix>/<SHA-256>` key. The verification plaintext is
`Textus encrypted workspace key check`, with logical key `key-check`; its envelope
is hex-encoded in `verifier`. These choices are verified against Node's independent
PBKDF2, HKDF, HMAC and AES-GCM APIs in tests.

### Upgrading from v0.1

An existing plaintext remote is refused without changing it. First ensure one local
workspace contains all the files and conflict copies you need, then select a **new,
empty remote folder** and set a sync password. Sync that complete workspace first;
other devices can then join using an encrypted version and the same password and remote folder.

Old remote data, including provider version history and backups, remains unencrypted.
The plugin does not automatically delete or migrate it. Manage old copies through
your provider after verifying the encrypted workspace. In-place password rotation
is not supported; use another new remote folder to change passwords.

## Interrupted sync

A remote lock serializes devices. S3 uses `If-None-Match: *`; WebDAV uses a
temporary upload followed by `MOVE` with `Overwrite: F`, including Nutstore's
409 response for an existing target. The connection test verifies exclusion
before a sync can touch workspace data. No listing API or unbounded directory
listing is required.

Encrypted blocks and an immutable snapshot are written before `v2/head.bin` is
published. The local baseline advances only after publication succeeds.
Retries reuse completed blocks. Cancellation stops after the current network
request and releases the lock when possible. Textus's network API bounds a
request to 60 seconds; it does not offer request-level cancellation.

New binary downloads reserve a path with a unique marker recorded in local
plugin storage. After an interrupted write, the next sync resumes that exact
marker instead of uploading it as file content. If another application changes
the file, its content is preserved. Keep the plugin's local data when retrying.

After a crash, **Sync stuck? › Recover stale lock** removes the lock only after
confirmation. Check that all other devices have stopped syncing first.
Locks never expire automatically, so a slow device cannot lose its write
ownership just because a timer expired. If the descriptor or current manifest is
accidentally removed, a previously joined device stops. Restore a complete remote
backup with the original descriptor. Encrypted snapshots are bound to their own
object names and cannot be copied directly over `v2/head.bin`; restoring a single
snapshot requires decrypting and re-encrypting it for that logical key. There is
currently no single-snapshot restore UI.
Do not change the remote files while a sync is running.

## Moving from the community plugin

The official plugin is `catvinci.cloud-sync`. The earlier community plugin,
`ciao1019.cloud-sync`, has separate local settings, secrets and sync state.
Before switching, finish or recover any interrupted sync with the old plugin,
then turn off its automatic sync and disable it. Keep a backup of the workspace.

Install the official plugin and enter the same storage connection, exact remote
folder and sync password. The encrypted remote format is unchanged, so existing
v0.2/v0.3 remote data can be read without moving or re-encrypting it. Local
credentials, descriptor pins and baselines are not copied across plugin IDs;
the first run joins the existing remote as a new device and may preserve
conflict copies if files differ. Never run both plugins' automatic sync on the
same workspace. Plaintext v0.1 data still needs the separate upgrade procedure above.

## Development and credits

Source, protocol tests and build instructions live in
[development/cloud-sync](https://github.com/CatVinci-Studio/textus-plugins/tree/main/development/cloud-sync).
The catalog packages the readable files in `plugins/catvinci.cloud-sync/`
without compiling them. Releases follow this repository's official plugin
workflow, with a tag such as `catvinci.cloud-sync-v0.3.0`.

Originally developed by Ciao1019; the 0.3.0 interface and setup improvements
were contributed by ChengAo Shen. The MIT notices are preserved in `LICENSE`
and `THIRD_PARTY_NOTICES.md`. The storage design was informed by Petrichor/Sylva's
`apps/api/internal/cloudsync/`; no Go source or PostgreSQL backup format is copied.
