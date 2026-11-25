import * as yup from 'yup';

export const businessProfileSchema = yup.object({
  name: yup
    .string()
    .trim()
    .min(2, 'Business name must be at least 2 characters')
    .max(200)
    .required('Business name is required'),
  industry: yup.string().trim().max(100).nullable().optional(),
  websiteUrl: yup
    .string()
    .trim()
    .test('valid-url', 'Website URL must start with http:// or https://', (val) => {
      if (!val) return true;
      return /^https?:\/\/.+/i.test(val);
    })
    .nullable()
    .optional(),
  supportEmail: yup
    .string()
    .trim()
    .test('valid-email', 'Enter a valid support email', (val) => {
      if (!val) return true;
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
    })
    .nullable()
    .optional(),
  timezone: yup.string().trim().required('Timezone is required'),
});

export const addTeamMemberSchema = yup.object({
  fullName: yup
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(150)
    .required('Full name is required'),
  email: yup
    .string()
    .trim()
    .email('Enter a valid email address')
    .required('Email is required'),
  role: yup
    .string()
    .oneOf(['BusinessAdmin', 'BusinessStaff'], 'Select a valid role')
    .required('Role is required'),
  password: yup
    .string()
    .min(8, 'Temporary password must be at least 8 characters')
    .max(128)
    .required('Temporary password is required'),
});

export const accountProfileSchema = yup.object({
  fullName: yup
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(150)
    .required('Full name is required'),
});

export const changePasswordSchema = yup.object({
  currentPassword: yup.string().required('Current password is required'),
  newPassword: yup
    .string()
    .min(8, 'New password must be at least 8 characters')
    .max(128)
    .required('New password is required'),
  confirmNewPassword: yup
    .string()
    .oneOf([yup.ref('newPassword')], 'Passwords must match')
    .required('Confirm your new password'),
});
