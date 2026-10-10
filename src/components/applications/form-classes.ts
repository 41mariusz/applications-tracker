import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Classes of the application form, shared by ApplicationForm and the kitchen sink (/dev/ui) so the two cannot
// drift. Controls are at least 40 px tall for a thumb: the ui components are h-9, so the height is overridden
// here (h-auto + min-h-10), never inside src/components/ui. Text stays 16 px on every width so iOS does not zoom.
export const FORM_CONTROL_CLASS = "bg-muted h-auto min-h-10 text-base md:text-base";

// Field label above its control (Label is flex + leading-none by default).
export const FORM_LABEL_CLASS = "text-supporting-foreground mb-1 block text-sm leading-normal font-normal";

// Field error message under its control.
export const FORM_ERROR_CLASS = "text-destructive mt-1 text-xs";

// "Anuluj": a text action next to the submit button, as tall as the button.
export const FORM_TEXT_ACTION_CLASS = cn(buttonVariants({ variant: "link" }), "h-auto min-h-10 px-0 font-normal");
