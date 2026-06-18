export interface ReactFlowCoverageRow {
  obligationId: string;
  feature: string;
  risk: string;
  fixtureId: string;
  vrt: boolean;
  domSummary: boolean;
  interaction: boolean;
  status: "covered" | "partial" | "debt";
}

export const reactFlowCoverageLedger: ReactFlowCoverageRow[] = [
  {
    obligationId: "RF-CANVAS-001",
    feature: "ReactFlow + Background + Controls + MiniMap + Panel",
    risk: "Nodes, edges, Background, Controls, MiniMap, and Panel must mount under ReactFlow context",
    fixtureId: "react-flow-basic-canvas",
    vrt: true,
    domSummary: true,
    interaction: false,
    status: "covered",
  },
  {
    obligationId: "RF-EDGE-001",
    feature: "ReactFlow SVG edge layer",
    risk: "SVG edge paths and marker definitions must render inside the flow viewport",
    fixtureId: "react-flow-basic-canvas",
    vrt: true,
    domSummary: true,
    interaction: false,
    status: "covered",
  },
  {
    obligationId: "RF-MEASURE-001",
    feature: "Viewport measurement and transform",
    risk: "React Flow measurement and viewport transforms must stabilize in a fixed-size container",
    fixtureId: "react-flow-basic-canvas",
    vrt: true,
    domSummary: true,
    interaction: false,
    status: "covered",
  },
  {
    obligationId: "RF-HANDLE-001",
    feature: "Custom node with Handle and Position",
    risk: "Custom node components must receive data and render source and target handles",
    fixtureId: "react-flow-custom-node-handles",
    vrt: true,
    domSummary: true,
    interaction: false,
    status: "covered",
  },
  {
    obligationId: "RF-CONTROLLED-001",
    feature: "useNodesState and useEdgesState",
    risk: "Controlled node and edge state must update after pointer interaction",
    fixtureId: "react-flow-controlled-interaction",
    vrt: true,
    domSummary: true,
    interaction: true,
    status: "covered",
  },
  {
    obligationId: "RF-CONTROLS-001",
    feature: "Controls fitView",
    risk: "fitView control interaction must update viewport state without unmounting nodes",
    fixtureId: "react-flow-controlled-interaction",
    vrt: true,
    domSummary: true,
    interaction: true,
    status: "covered",
  },
];
