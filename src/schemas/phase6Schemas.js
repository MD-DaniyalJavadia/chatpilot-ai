import * as yup from 'yup';

export const planFormSchema = yup.object({
  code: yup
    .string()
    .trim()
    .matches(/^[A-Z0-9_]{2,40}$/, 'Code must be 2–40 uppercase letters, digits, or underscores.')
    .required('Plan code is required.'),
  name: yup.string().trim().min(2, 'Minimum 2 characters').max(100).required('Plan name is required.'),
  description: yup.string().trim().max(500).nullable(),
  monthlyPriceUsd: yup.number().typeError('Must be a number').min(0, 'Cannot be negative').required(),
  yearlyPriceUsd: yup.number().typeError('Must be a number').min(0, 'Cannot be negative').required(),
  maxChatbots: yup.number().typeError('Must be an integer').integer().min(1, 'At least 1').required(),
  maxMonthlyMessages: yup.number().typeError('Must be an integer').integer().min(1, 'At least 1').required(),
  maxTeamMembers: yup.number().typeError('Must be an integer').integer().min(1, 'At least 1').required(),
  allowWebsiteIngestion: yup.boolean().required(),
});

export const createTicketSchema = yup.object({
  subject: yup.string().trim().min(4, 'Minimum 4 characters').max(255).required('Subject is required.'),
  category: yup.string().oneOf(['General', 'Billing', 'Technical', 'AIQuality', 'Security']).required(),
  priority: yup.string().oneOf(['Low', 'Normal', 'High', 'Urgent']).required(),
  message: yup
    .string()
    .trim()
    .min(10, 'Please provide at least 10 characters of context.')
    .max(4000)
    .required('Description is required.'),
});

export const systemSettingsSchema = yup.object({
  allowPublicRegistration: yup.boolean().required(),
  defaultTrialDays: yup.number().typeError('Must be a number').integer().min(0).max(90).required(),
  defaultWidgetRateLimitPerMin: yup.number().typeError('Must be a number').integer().min(5).max(1000).required(),
  conversationRetentionDays: yup.number().typeError('Must be a number').integer().min(7).max(3650).required(),
  maintenanceMode: yup.boolean().required(),
  supportContactEmail: yup.string().trim().email('Enter a valid email address.').max(256).required(),
});
