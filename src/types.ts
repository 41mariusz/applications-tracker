export const APPLICATION_STATUSES = [
  "sent",
  "hr_contact",
  "interviews",
  "offer",
  "accepted",
  "rejected",
  "withdrawn",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const EMPLOYMENT_TYPES = ["b2b", "employment_contract"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const WORK_MODES = ["remote", "hybrid", "onsite"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export interface Application {
  id: string;
  user_id: string;
  company: string;
  position: string;
  posting_url: string | null;
  salary_range: string | null;
  quoted_rate: string | null;
  hr_contact_name: string | null;
  hr_contact_phone: string | null;
  applied_on: string | null;
  employment_type: EmploymentType | null;
  work_mode: WorkMode | null;
  cv_file_id: string | null;
  status: ApplicationStatus;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
}

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  sent: "Wysłana",
  hr_contact: "Kontakt HR",
  interviews: "Rozmowy",
  offer: "Oferta",
  accepted: "Zaakceptowana",
  rejected: "Odrzucona",
  withdrawn: "Wycofana",
};

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  b2b: "B2B",
  employment_contract: "Umowa o pracę",
};

export const WORK_MODE_LABELS: Record<WorkMode, string> = {
  remote: "Zdalnie",
  hybrid: "Hybrydowo",
  onsite: "Stacjonarnie",
};

export const NOTE_KINDS = ["comment", "phone_call"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export const NOTE_KIND_LABELS: Record<NoteKind, string> = {
  comment: "Komentarz",
  phone_call: "Rozmowa telefoniczna",
};

export interface NoteRevision {
  id: string;
  note_id: string;
  previous_kind: NoteKind;
  previous_body: string;
  previous_noted_at: string;
  changed_at: string;
}

export interface Note {
  id: string;
  application_id: string;
  kind: NoteKind;
  body: string;
  noted_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  revisions: NoteRevision[];
}

export interface StatusChange {
  id: string;
  from_status: ApplicationStatus;
  to_status: ApplicationStatus;
  is_revert: boolean;
  changed_at: string;
}

export interface FieldChangeRow {
  id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
}

export interface CvFile {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}
