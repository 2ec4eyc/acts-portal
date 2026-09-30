import type { UserProfile } from '../types';

export const toTitleCase = (str: string) => {
  if (!str) return '';
  return str.split(' ').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
};

export const formatName = (user: UserProfile | Partial<UserProfile> | null | undefined) => {
  if (!user) return 'Unknown User';
  if (user.lastName && user.firstName) {
    return `${toTitleCase(user.lastName)}, ${toTitleCase(user.firstName)}`;
  }
  return toTitleCase(user.fullName || 'Unknown User');
};
