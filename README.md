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
Strudel is AGPL-3.0: keep this repo public under AGPL, credit Strudel, link source from the app.
