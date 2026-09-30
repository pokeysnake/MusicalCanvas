# Collaborative Music Canvas

Multiplayer flowchart-style music editor that compiles to Strudel. Plan lives in the Career_Vault: `WebDev/Projects/Collaborative Music Canvas.md`.

## Stage 0 status
Scaffold only: Next.js (App Router, TS) + React Flow + `@strudel/web`, FastAPI `/health`.

## Run
```
# web
cd web && npm install && npm run dev        # http://localhost:3000
# server
cd server && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000
pytest   # inside server/
```

## Stage 0 completion gate (check by hand)
- [ ] Pan, zoom, drag nodes, connect them
- [ ] Play makes sound (click first: browsers need a gesture), Stop silences it
- [ ] Layout matches the sketch (top bar, collaborators, graph/strudel tabs, right palette, EQ bar)
- [ ] `GET :8000/health` returns `{"status":"ok"}`

Automated already: `next build` passes, `pytest` passes (1 test).

## License note
Strudel is AGPL-3.0: keep this repo public under AGPL, credit Strudel, link source from the app.
