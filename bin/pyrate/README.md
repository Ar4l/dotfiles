# pyrate

Download and maintain a local music library: Spotify playlists (via
spotdl), plus individual YouTube and SoundCloud tracks (via yt-dlp).

Playlists are tracked in the `pyrate-data` pickle next to the script;
each playlist syncs into `<library>/playlists/<name>/` with an `.m3u`.

```sh
uv run pyrate.py list        # show tracked playlists and track counts
uv run pyrate.py get <url>   # download/sync a playlist or single track
```

Run `uv run pyrate.py -- --help` for the full command list.
