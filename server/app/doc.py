# MIRRORS DOC.TS AND EDGEID FROM TYPES.TS
OUTPUT_ID = "output"


def edge_id(source: str, target: str) -> str:
    """deterministic: 2 users drawing the same cable get the same id, so the second is a dupe"""
    return f"{source}->{target}"  # this is the f string version of the ts template literal ${source}->${target}


def empty_doc() -> dict:
    """a function, not a constant: every call returns a fresh doc, so nothing can leak between rooms or tests"""
    return {
        "nodes": {
            OUTPUT_ID: {
                "id": OUTPUT_ID,
                "type": "output",
                "position": {"x": 800, "y": 200},
                "data": {},
            },
        },
        "edges": {},
        "settings": {"bpm": 120, "eq": {"low": 0, "mid": 0, "high": 0}},
    }
