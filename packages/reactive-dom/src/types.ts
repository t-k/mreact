export type Dispose = () => void;

export type RenderValue =
  | Node
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly RenderValue[];
