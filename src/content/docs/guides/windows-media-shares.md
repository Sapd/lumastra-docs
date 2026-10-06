---
title: Windows media shares and filename encoding
description: Prevent and repair filenames written with Windows NFS clients, and safely share media over SMB and NFS.
---

## Diagnose filename encoding

Microsoft's built-in **Client for NFS** writes filenames using the system ANSI
codepage (CP1252 on Western-European installs), rather than UTF-8. NFS stores the
bytes unchanged, so Windows-written names can contain invalid UTF-8 even when the
media itself plays correctly.

| Character | UTF-8 (correct) | CP1252 (what Windows writes) |
| --- | --- | --- |
| `ä` | `c3 a4` | `e4` |
| `ö` | `c3 b6` | `f6` |
| `ü` | `c3 bc` | `fc` |
| `ß` | `c3 9f` | `df` |

In a mixed library, Linux-written names remain correct while Windows-written
names reach the scanner with replacement characters. Those names affect title
matching and the labels on [unmatched items](/guides/organizing-media/#troubleshooting).

:::caution[No mount option fixes this]
`iocharset=utf8` is a **Linux `cifs`** option and has no equivalent in Windows' Client for
NFS. NFSv4 *does* mandate UTF-8, but Microsoft's built-in **client** speaks NFSv3 only
(their NFSv4.1 support is server-side), so you can't get there by requesting a newer
protocol version either.
:::

### Fixing the write path

1. **Write over SMB (recommended).** Export the directory with Samba and point
   Windows tooling at it. SMB handles Unicode natively; Linux/container readers
   can keep their [NFS mounts](/guides/performance-tuning/#nfs-mount-options-media-library).
2. **Replace the NFS client.**
   [`ms-nfs41-client`](https://github.com/kofemann/ms-nfs41-client) supports NFSv4.2
   and UTF-8, including characters above the BMP. It requires Cygwin and an
   unsigned kernel driver (Secure Boot off). Its documented `nfsd.exe` crashes
   require a reboot; benchmark throughput against SMB. For a machine-wide mount
   restored at boot, use `/etc/fstab.msnfs41client`. The `nfs_globalmount -p` option
   persists a per-user connection that doesn't restore on a headless server.
3. **Switch Windows to a UTF-8 codepage.** In *Region → Administrative → Change
   system locale*, enable **Beta: Use Unicode UTF-8 for worldwide language
   support**, then reboot. This sets the ANSI codepage to 65001. It can break
   older non-Unicode applications; check your download client afterward.

:::danger[Exporting one directory over both NFS and SMB]
When SMB and NFS access the same files, Samba's default oplocks permit caching
that doesn't account for NFS writes. Disable oplocks on that share to avoid stale
data and overwritten writes:

```ini
[library]
   oplocks = no
   level2 oplocks = no
   strict locking = yes
```

Verify with `testparm -s` and apply with `systemctl reload smbd` (no restart needed,
existing sessions stay connected). A reload only governs opens made **after** it: a file
already holding an oplock keeps it until closed, so remap the drive on the Windows client
right after the change.
:::

### Repairing names you already have

None of the above is retroactive. Fix existing filenames on the NFS **server** with
`convmv`:

```bash
# Dry run — convmv only prints what it would do unless you pass --notest
convmv -r -f cp1252 -t utf8 /path/to/library

# Apply, once the proposed renames look right
convmv -r -f cp1252 -t utf8 --notest /path/to/library
```

:::tip[convmv leaves already-correct names alone]
By default convmv detects filenames that are already valid UTF-8 and skips them, which is
what makes it safe across a mixed library. Do **not** add `--nosmart`: that forces the
conversion and produces double-encoded names. If something did get double-encoded,
`convmv --fixdouble` reverses it.
:::

Renaming changes the path, so run a scan afterwards to pick the files up under their
corrected names.

See [Performance tuning](/guides/performance-tuning/) for scan concurrency and
NFS mount settings.
