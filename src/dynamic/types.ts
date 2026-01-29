export type FilterType = 'select' | 'pill' | 'toggle';

export interface FilterOption {
  id: string;
  label: string;
  type: FilterType;
  // For 'select' and 'pill' types
  choices?: { value: string; label: string }[];
  // For 'toggle' type, the value is essentially boolean string "true"/"false" or custom
}

export type ViewOptionType = 'toggle' | 'select';

export interface ViewOption {
  key: string;
  label: string;
  default: any;
  type?: ViewOptionType;
  choices?: { value: any; label: string }[];
}

export interface ResourceConfig {
  filterSchema?: FilterOption[];
  viewSchema?: ViewOption[];
}