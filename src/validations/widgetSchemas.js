import * as yup from 'yup';

export const addDomainSchema = yup.object({
  domain: yup
    .string()
    .trim()
    .min(3, 'Enter a valid domain hostname (e.g. example.com)')
    .max(255, 'Domain must be under 255 characters')
    .required('Domain is required'),
});

export const widgetAppearanceSchema = yup.object({
  brandColor: yup
    .string()
    .trim()
    .matches(/^#[0-9a-fA-F]{6}$/, 'Brand color must be a valid hex code (e.g. #2563EB)')
    .required('Brand color is required'),
  logoUrl: yup
    .string()
    .trim()
    .nullable()
    .test('http-url', 'Logo URL must start with http:// or https://', (val) => {
      if (!val) return true;
      return /^https?:\/\/.+/i.test(val);
    }),
  humanHandoverEmail: yup
    .string()
    .trim()
    .nullable()
    .test('email', 'Enter a valid email address', (val) => {
      if (!val) return true;
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
    }),
  widgetPosition: yup
    .string()
    .oneOf(['bottom-right', 'bottom-left'], 'Select bottom-right or bottom-left')
    .required(),
  widgetTitle: yup.string().trim().max(100, 'Title must be under 100 characters').nullable().optional(),
  widgetSubtitle: yup.string().trim().max(180, 'Subtitle must be under 180 characters').nullable().optional(),
  launcherLabel: yup.string().trim().max(60, 'Launcher label must be under 60 characters').nullable().optional(),
  showCitations: yup.boolean().required(),
});
