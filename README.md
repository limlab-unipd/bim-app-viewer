# BIM App Viewer

A web-based BIM viewer for IFC-native cost data visualization and model-based cost analysis.

**Live viewer:** The application is deployed on Vercel and can be accessed at: https://bim-app-viewer.vercel.app

**Video demo:** A short video-tutorial demonstrates the main functionalities of the viewer, including model loading, cost inspection, unit-cost exploration, resource-based cost analysis, and scene-visibility controls at: https://www.youtube.com/watch?v=VLsOLtp-TaI

This repository contains the source code of a research prototype developed to explore how cost information embedded in IFC models can be inspected, filtered, aggregated, and visualized directly in a browser-based BIM environment. The viewer focuses on openBIM workflows, IFC-native cost structures, and interactive cost-data visualization.

> The viewer is not intended to replace professional cost-estimation software. Its purpose is to support downstream inspection, interpretation, and visualization of cost information already encoded in an IFC model.

---

## Overview

The application enables users to load and explore IFC models through a browser-based 3D interface. When the IFC model contains structured cost information, the viewer can retrieve the cost data associated with model elements and visualize them through coordinated geometric, tabular, and graphical outputs.

The research context behind this repository focuses on the use of IFC-native entities for cost representation, particularly:

- `IfcCostItem`
- `IfcCostValue`
- `IfcRelAssignsToControl`

The viewer reads these cost structures and exposes them through an interactive interface designed for model-based cost inspection and analysis.

---

## Main features

### BIM model visualization

- Load IFC models directly in the browser.
- Convert IFC models into the Fragments format for optimized web visualization.
- Import pre-converted `.frag` files for faster repeated visualization sessions.
- Navigate the model in a 3D scene.
- Select, isolate, hide, restore, and inspect model elements.
- Use clipping planes and scene-configuration tools.
- Inspect element properties and relationships.

### Cost inspection

- Retrieve cost information directly from selected BIM elements.
- Display cost assignments in an interactive table.
- Report cost item name, description, category, quantity, unit of measure, unit cost, and total cost.
- Preserve the link between tabular cost records and the corresponding 3D model elements.
- Support inspection of multiple cost items associated with the same element.

### Resource-level price analysis

When available in the IFC model, the viewer supports the inspection of nested unit-cost components, including:

- material costs;
- labor costs;
- equipment costs.

This enables users to move from an element-level total cost to the internal composition of the related unit cost.

### Cost Analysis interface

The Cost Analysis tool allows users to generate model-based cost visualizations by combining analytical parameters and visual encoding strategies.

Supported analyses include:

- total-cost visualization;
- material-cost visualization;
- labor-cost visualization;
- equipment-cost visualization;
- filtering by IFC class;
- filtering by selected elements;
- filtering by cost item name;
- filtering by absolute or normalized cost ranges;
- color-based classification of model elements;
- coordinated cost tables and graphical summaries.

The output combines:

1. color mapping applied to BIM model geometries;
2. an interactive cost-analysis table;
3. graphical summaries of the active cost distribution.

---

## Technology stack

The viewer is implemented as a front-end web application using:

- React
- TypeScript
- Vite
- Three.js
- That Open Company libraries:
  - `@thatopen/components`
  - `@thatopen/components-front`
  - `@thatopen/fragments`
  - `@thatopen/ui`
  - `@thatopen/ui-obc`
- `web-ifc`

---

## Basic usage

1. Open the application in the browser.
2. Go to the Costs Viewer page.
3. Load an IFC model or import a pre-converted Fragments file.
4. Navigate the 3D model and select one or more elements.
5. Open the cost-inspection panel to read the cost data associated with the selected elements.
6. Use the Cost Analysis interface to generate model-based cost visualizations.
7. Adjust filters, color scales, and analysis parameters according to the cost information to be explored.

---

## Repository structure

The main application code is organized around reusable viewer and interface components.

```text
src/
├── viewer-components/
│   ├── MainViewer.tsx
│   ├── MenuSidebar.tsx
│   ├── HomePage.tsx
│   ├── InfoPage.tsx
│   └── SurveyPage.tsx
│
├── custom-components/
│   ├── colors
│   ├── conversion
│   └── ifc-code-converter
│
index.html
vite.config.ts
package.json
```

The central component for the BIM and cost-visualization workflow is `MainViewer.tsx`.

---

## Research context

This repository is part of a broader research workflow on IFC-native cost integration and advanced BIM-based data visualization. The related study investigates how cost data exported from professional cost-estimation environments can be structured inside IFC models and then explored through a custom web-based BIM viewer.

The IFC cost-enrichment process is documented in the companion repository: https://github.com/limlab-unipd/5D-data_IFC-integration. That repository explains how cost data are inserted into the IFC model so that they can be correctly read and used by this viewer.

The viewer demonstrates how IFC models can be used not only as geometric containers, but also as open semantic backbones for accessing and visualizing structured cost information.

Related manuscript:

```text
This section will be updated soon.
```

---

## Data and confidentiality

The viewer can be used with local IFC files loaded by the user in the browser. Cost-analysis functions require IFC models enriched with the expected IFC-native cost entities.

Project-specific models and cost datasets may be subject to confidentiality constraints and are therefore not necessarily included in this repository.

---

## Authors

Developed by **Ygor Fasanella**, PhD candidate at the University of Padua, Department of Civil, Environmental and Architectural Engineering.

Research supervision and scientific contribution: **Paolo Borin**.

---

## Contact

For questions or research-related inquiries, please contact:

```text
Ygor Fasanella
University of Padua
Department of Civil, Environmental and Architectural Engineering
```

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.