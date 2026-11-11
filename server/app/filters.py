# Python copy of the keys in web/src/model/filters.ts FILTERS.
# The server only needs to know which effect kinds exist (to validate FX rack rows); labels, units and ranges
# stay in the web app. Keep the two lists in sync when adding an effect.
FILTER_KINDS = frozenset({"lpf", "hpf", "bpf", "room", "delay", "gain"})
