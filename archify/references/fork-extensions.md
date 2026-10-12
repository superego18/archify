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

## Architecture boundaries

| Field | Type | Effect |
|---|---|---|
| `id` | id | Makes the boundary clickable. |
| `note` | string | Description shown when the boundary is clicked. A note alone also makes it clickable. |

Clicking the boundary frame or label (or Enter on the focused label) opens a panel with the note and the wrapped components; choosing a component opens its Semantic Passport. Escape or a click elsewhere closes it.

## Architecture facets

Facets are concepts the diagram wants to show on every component, defined per diagram: a service provider, an owning team, a delivery stage, and so on. Declare each facet and its values at the top level, then pick a value per facet on components.

```json
"facets": [
  { "id": "provider", "label": "Provider", "values": [
    { "id": "aws", "label": "AWS" },
    { "id": "ours", "label": "In-house", "color": "#2D6CDF" }
  ] },
  { "id": "stage", "label": "Stage", "marker": "none", "values": [
    { "id": "base", "label": "Base" }, { "id": "ext", "label": "Extension" }
  ] }
],
"components": [{ "id": "api", "type": "backend", "label": "API", "facets": { "provider": "ours", "stage": "base" } }]
```

| Field | Type | Effect |
|---|---|---|
| `facets[].id` / `label` | id / string | Unique facet id and the name shown in the passport. |
| `facets[].marker` | `stripe-left` · `stripe-right` · `none` | Canvas marker. Default: the first facet `stripe-left`, others `none`. Each stripe side can be used by one facet. |
| `facets[].values[]` | `{ id, label, color? }` | Allowed values; `color` is `#RRGGBB`, otherwise a fixed palette in list order. |
| `components[].facets` | object | Facet id → value id; both must be declared, or rendering fails. |

A stripe facet draws a thin colored stripe inside the card edge and adds legend rows for the values in use (prefixed with the facet label when two facets have stripes; omitted when the legend is hidden). Every picked value appears as a colored `Facet: Value` chip in the Semantic Passport.
