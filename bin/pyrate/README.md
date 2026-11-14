# pyrate

Download and maintain a local music library: Spotify playlists (via
spotdl), plus individual YouTube and SoundCloud tracks (via yt-dlp).

Playlists are tracked in the `pyrate-data` pickle next to the script;
each playlist syncs into `<library>/playlists/<name>/` with an `.m3u`.

A SoundCloud set or a user's likes (`https://soundcloud.com/<user>/likes`)
is tracked as `<user>/<set>` or `<user>/likes` and syncs into
`<library>/soundcloud/<user>/<set>/`. Its `.m3u` follows SoundCloud's
order, newest like first. Liked sets, 30-second previews and tracks that
need a login are skipped and listed at the end of the run.

```sh
uv run pyrate.py list        # show tracked playlists and track counts
uv run pyrate.py get <url>   # download/sync a playlist or single track
uv run pyrate.py rekordbox <name>...   # mirror playlists into rekordbox's `spotify` or `soundcloud` folder
```

Run `uv run pyrate.py -- --help` for the full command list.
