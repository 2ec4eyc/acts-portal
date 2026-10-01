export const HIDDEN_ADMIN_EMAILS = ['actsportal2026@gmail.com'];

// Profile fields a user may change on their own account. Keep in sync with
// selfEditableFields() in firestore.rules and SelfProfileUpdate in server/lib/profiles.ts.
export const PROFILE_SELF_EDITABLE_FIELDS = [
  'firstName', 'middleName', 'lastName', 'photoURL',
  'contactNumber', 'gender', 'birthDate',
  'address', 'city', 'province', 'postalCode',
  'church', 'pastorName',
  'holyGhostBaptismDate', 'holyGhostBaptismLocation',
  'waterBaptismDate', 'waterBaptismLocation',
  'emergencyFirstName', 'emergencyLastName',
  'emergencyRelationship', 'emergencyContactNumber',
] as const;
