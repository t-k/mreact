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
  {
    obligationId: "RF-DRAG-001",
    feature: "Node drag with controlled node state",
    risk: "Dragging a node must emit controlled node position changes and preserve edge rendering",
    fixtureId: "react-flow-node-drag-position",
    vrt: true,
    domSummary: true,
    interaction: true,
    status: "covered",
  },
  {
    obligationId: "RF-CONNECT-001",
    feature: "connectOnClick + addEdge",
    risk: "Click-based handle connection must call onConnect and add a controlled edge",
    fixtureId: "react-flow-connect-on-click",
    vrt: true,
    domSummary: true,
    interaction: true,
    status: "covered",
  },
  {
    obligationId: "RF-RECONNECT-001",
    feature: "reconnectEdge + controlled edge target",
    risk: "Controlled edge reconnection must update the edge target and rerender the edge path",
    fixtureId: "react-flow-controlled-reconnect",
    vrt: true,
    domSummary: true,
    interaction: true,
    status: "covered",
  },
  {
    obligationId: "RF-RESIZE-001",
    feature: "NodeResizer dimensions",
    risk: "NodeResizer must render resize handles and commit dimension changes",
    fixtureId: "react-flow-node-resizer",
    vrt: true,
    domSummary: true,
    interaction: true,
    status: "covered",
  },
];
