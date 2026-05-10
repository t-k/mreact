export type Flags = number;

export const NoFlags = 0;
export const Placement = 1 << 0;
export const Update = 1 << 1;
export const Deletion = 1 << 2;
export const ChildDeletion = 1 << 3;
export const Ref = 1 << 4;
export const Visibility = 1 << 5;
export const Hydrating = 1 << 6;
export const DidCapture = 1 << 7;
export const Passive = 1 << 8;
export const Layout = 1 << 9;

export function mergeFlags(left: Flags, right: Flags): Flags {
  return left | right;
}

export function includesFlag(flags: Flags, flag: Flags): boolean {
  return (flags & flag) !== NoFlags;
}
