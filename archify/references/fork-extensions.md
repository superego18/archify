# Fork extensions (dev_chanju)

Fields below exist only in the superego18 fork. Use them when the user's diagram needs them; upstream rejects them, so a candidate that uses them renders only with this fork.

## Architecture connections

| Field | Type | Effect |
|---|---|---|
| `bidirectional` | boolean | Draws an arrowhead at both ends for a two-way exchange (read/write, sync). Keep `from` as the side that starts the exchange. |

Browser checks measure both ends: each end needs a visible shaft behind its arrowhead, and a single straight run must fit both heads plus the shaft.

## Architecture components

| Field | Type | Effect |
|---|---|---|
| `note` | string | Role or responsibility text shown under the detail line of the Semantic Passport when the node is focused. Not drawn on the canvas, so it can be longer than `sublabel`; line breaks are kept. |

A diagram that uses `note` carries one small fork script after the SVG; diagrams without notes are unchanged.
