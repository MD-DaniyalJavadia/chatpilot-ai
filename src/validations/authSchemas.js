import * as yup from 'yup';

export const loginSchema = yup.object({
  email: yup
    .string()
    .trim()
    .email('Enter a valid email address')
    .required('Email is required'),
  password: yup.string().required('Password is required'),
});

export const registerSchema = yup.object({
  fullName: yup
    .string()
    .trim()
    .min(2, 'Full name must be at least 2 characters')
    .max(150, 'Full name is too long')
    .required('Full name is required'),
  businessName: yup
    .string()
    .trim()
    .min(2, 'Business name must be at least 2 characters')
    .max(200, 'Business name is too long')
    .required('Business name is required'),
  email: yup
    .string()
    .trim()
    .email('Enter a valid business email')
    .required('Work email is required'),
  industry: yup.string().trim().max(100, 'Industry must be under 100 characters').optional(),
  websiteUrl: yup
    .string()
    .trim()
    .test('valid-url', 'Website URL must start with http:// or https://', (val) => {
      if (!val) return true;
      return /^https?:\/\/.+/i.test(val);
    })
    .optional(),
  password: yup
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password is too long')
    .required('Password is required'),
  confirmPassword: yup
    .string()
    .oneOf([yup.ref('password')], 'Passwords must match')
    .required('Please confirm your password'),
});

export const claimSuperAdminSchema = yup.object({
  fullName: yup
    .string()
    .trim()
    .min(2, 'Full name must be at least 2 characters')
    .max(150)
    .required('Full name is required'),
  email: yup
    .string()
    .trim()
    .email('Enter a valid email address')
    .required('Email is required'),
  password: yup
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .required('Password is required'),
  confirmPassword: yup
    .string()
    .oneOf([yup.ref('password')], 'Passwords must match')
    .required('Please confirm your password'),
  passcode: yup.string().optional(),
});
