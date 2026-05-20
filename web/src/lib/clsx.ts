// Tiny clsx replacement — avoid extra dep for one helper.
type Value = string | number | false | null | undefined;
export default function clsx(...args: Value[]): string {
  return args.filter(Boolean).join(" ");
}
