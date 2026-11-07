# Python copy of the ids in web/src/model/sounds.ts SOUNDS.
# The server only needs to know which ids exist so labels and Strudel names stay in the web app.
# Keep the two lists in sync when adding a sound.
SOUND_IDS = frozenset(
    {
        "saw",
        "square",
        "triangle",
        "sine",
        "piano",
        "tr909-bd",
        "tr909-sd",
        "tr909-hh",
        "tr909-oh",
        "tr909-cp",
        "tr909-cr",
    }
)


def is_sound_id(sound_id: object) -> bool:
    return isinstance(sound_id, str) and sound_id in SOUND_IDS
