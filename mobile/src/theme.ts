export interface Theme {
  bg: string;
  surface: string;
  searchBg: string;
  brand: string;
  brandLight: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  success: string;
  warning: string;
  neutral: string;
  skeleton: string;
  cardShadow: string;
}

export const LIGHT_THEME: Theme = {
  bg: '#F5F4F0',
  surface: '#FFFFFF',
  searchBg: '#EBEBEB',
  brand: '#E4572E',
  brandLight: '#FDE8E0',
  textPrimary: '#1C1C1E',
  textSecondary: '#636366',
  textTertiary: '#AEAEB2',
  border: '#E5E3DE',
  success: '#2E7D32',
  warning: '#E65100',
  neutral: '#9E9E9E',
  skeleton: '#E5E3DE',
  cardShadow: '0 1px 3px rgba(0,0,0,0.04)',
};

export const DARK_THEME: Theme = {
  bg: '#1C1C1E',
  surface: '#2C2C2E',
  searchBg: '#3A3A3C',
  brand: '#E4572E',
  brandLight: '#3A1A10',
  textPrimary: '#F5F5F7',
  textSecondary: '#AEAEB2',
  textTertiary: '#636366',
  border: '#38383A',
  success: '#2E7D32',
  warning: '#E65100',
  neutral: '#9E9E9E',
  skeleton: '#38383A',
  cardShadow: '0 1px 3px rgba(0,0,0,0.2)',
};
