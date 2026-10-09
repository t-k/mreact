export function SingleProp(props: { label: string }) {
  return <span>{props.label}</span>;
}

export function MultipleProps(props: { label: string; selected: boolean }) {
  return <span className={props.selected ? "selected" : ""}>{props.label}</span>;
}

export function ObjectProps(props: { row: { label: string }; selected: boolean }) {
  return <span className={props.selected ? "selected" : ""}>{props.row.label}</span>;
}
