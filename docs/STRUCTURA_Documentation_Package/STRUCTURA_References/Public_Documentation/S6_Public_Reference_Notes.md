# Public technical reference notes

These notes preserve the technical context used in the specification. They are concise summaries with original links, not full copies of third-party manuals. Consult the live documentation for the version selected during implementation. Checked 29 September 2026.

## S6a — Leaflet

The reference provides map, marker, polyline and GeoJSON APIs. These support rendering Event POIs and stored routes. Rendering does not itself supply routing optimization or a licensed offline tile source. The page currently identifies its main reference as version 1.9.4 and links separate alpha documentation. No library version is locked by STRUCTURA.

[Official Leaflet API reference](https://leafletjs.com/reference)

## S6b — OpenStreetMap tile service

The public raster tile service has usage restrictions, including no bulk/offline prefetch. STRUCTURA must choose a provider permitting its intended offline use or use appropriately hosted map assets. Event geometry can be stored independently of a basemap provider.

[Official tile usage policy](https://operations.osmfoundation.org/policies/tiles/)

## S6c — Odoo inventory conventions

The specification used the inventory documentation as a conventional workflow reference, not as a requirement to implement Odoo or adopt its accounting architecture. The original referenced page is retained below. A fresh retrieval during packaging failed, so no current page content is claimed or reproduced here. Version 16 is historical context, not a selected current dependency.

[Originally referenced Odoo Inventory documentation](https://www.odoo.com/documentation/16.0/applications/inventory_and_mrp/inventory.html)
