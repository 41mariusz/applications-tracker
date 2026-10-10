// Classes of the application list's controls, shared by /dashboard and the kitchen sink (/dev/ui) so the two
// cannot drift. The status filter chip is a <label> around an sr-only checkbox: checked and keyboard focus are
// drawn on the label (has-[:checked], has-[:focus-visible]); at least 40 px tall for a thumb.
export const FILTER_CHIP_CLASS =
  "border-input bg-card text-supporting-foreground hover:bg-muted has-[:checked]:border-link has-[:checked]:bg-accent has-[:checked]:text-foreground has-[:focus-visible]:ring-ring inline-flex min-h-10 cursor-pointer items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors select-none has-[:focus-visible]:ring-2";
