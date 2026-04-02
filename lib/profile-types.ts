/** Scalar row from Salesforce (all columns returned by the profile refresh SOQL). */
export type SalesforceFieldBag = Record<string, unknown>;

export type ProfileSectionItem = {
  id: string;
  name: string;
  /** Full query row for this section item (all selected Salesforce fields). */
  fields: SalesforceFieldBag;
};

export type ProfileSection = {
  id: string;
  name: string;
  items: ProfileSectionItem[];
  /** Full query row for this profile section (all selected Salesforce fields). */
  fields: SalesforceFieldBag;
};

export type ProfileRecord = {
  id: string;
  name: string;
  title: string;
  company: string;
  location: string;
  imageUrl: string | null;
  sections: ProfileSection[];
  /** Full query row for this profile (all selected Salesforce fields). */
  fields: SalesforceFieldBag;
};

export type ProfilesListResponse = {
  profiles: ProfileRecord[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  cachedAt: number | null;
};
