# Collaborative Music Canvas

Multiplayer flowchart-style music editor that compiles to Strudel. Plan lives in the Career_Vault: `WebDev/Projects/Collaborative Music Canvas.md`.

## Run
```
# web
cd web && npm install && npm run dev        # http://localhost:3000
# server
cd server && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000
pytest   # inside server/
```

## License note
Licensed under AGPL-3.0-or-later (see [LICENSE](LICENSE)), the same license as [Strudel](https://strudel.cc), which this app builds on. The app's footer credits Strudel and links to this repo, so users of the hosted version can always find the source.
