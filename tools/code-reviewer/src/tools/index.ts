import type { ToolSet } from "ai";

// Tools the review agent may call. Empty for now: the reviewer is single-step;
// the agency ladder (M5L3) adds context-reading tools here.
export const reviewTools = {} satisfies ToolSet;
