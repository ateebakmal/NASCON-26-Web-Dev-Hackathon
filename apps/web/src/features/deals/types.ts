export type StageType = "OPEN" | "WON" | "LOST";

export interface Stage {
  id: string;
  name: string;
  position: number;
  type: StageType;
  color: string;
  requiredFieldKeys: string[];
}

export interface CustomFieldDef {
  key: string;
  label: string;
  type: "TEXT" | "NUMBER" | "DATE" | "DROPDOWN" | "CHECKBOX";
  options: string[];
}

export interface Deal {
  id: string;
  name: string;
  value: string | number | null;
  currency: string;
  tag: string | null;
  stageId: string;
  createdAt: string;
  expectedAt: string | null;
  customFields: Record<string, unknown>;
  contact: {
    id: string;
    name: string;
    company: { id: string; name: string; logoUrl: string | null } | null;
  };
  owner: { id: string; name: string } | null;
}

export interface BoardResponse {
  pipeline: { id: string; name: string; isDefault: boolean };
  stages: Stage[];
  opportunities: Deal[];
  fields: CustomFieldDef[];
}

/** Thrown by the API as 409 when a stage move is missing required fields. */
export interface RequiredFieldsError {
  error: "REQUIRED_FIELDS_MISSING";
  message: string;
  stageId: string;
  stageName: string;
  fields: CustomFieldDef[];
}
