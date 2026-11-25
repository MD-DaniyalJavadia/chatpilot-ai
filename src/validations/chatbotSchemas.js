import * as yup from 'yup';

const optionalHttpUrl = yup
  .string()
  .trim()
  .nullable()
  .test('valid-url', 'Website URL must start with http:// or https://', (val) => {
    if (!val) return true;
    return /^https?:\/\/.+/i.test(val);
  });

export const createChatbotSchema = yup.object({
  name: yup
    .string()
    .trim()
    .min(2, 'Chatbot name must be at least 2 characters')
    .max(150, 'Chatbot name must be under 150 characters')
    .required('Chatbot name is required'),
  description: yup.string().trim().max(500, 'Description must be under 500 characters').nullable().optional(),
  businessName: yup
    .string()
    .trim()
    .min(2, 'Business name must be at least 2 characters')
    .max(200, 'Business name must be under 200 characters')
    .required('Business name is required'),
  websiteUrl: optionalHttpUrl,
  aiProvider: yup.string().trim().required('AI provider is required'),
  aiModel: yup.string().trim().required('AI model is required'),
  systemInstructions: yup.string().trim().max(4000, 'Instructions must be under 4000 characters').nullable().optional(),
  welcomeMessage: yup.string().trim().max(500, 'Welcome message must be under 500 characters').nullable().optional(),
  responseLanguage: yup.string().trim().max(50).required('Response language is required'),
  responseTone: yup.string().trim().max(50).required('Response tone is required'),
  personality: yup.string().trim().max(100).nullable().optional(),
});

export const updateChatbotConfigSchema = yup.object({
  name: yup
    .string()
    .trim()
    .min(2, 'Chatbot name must be at least 2 characters')
    .max(150)
    .required('Chatbot name is required'),
  description: yup.string().trim().max(500).nullable().optional(),
  businessName: yup
    .string()
    .trim()
    .min(2, 'Business name must be at least 2 characters')
    .max(200)
    .required('Business name is required'),
  websiteUrl: optionalHttpUrl,
  isEnabled: yup.boolean().required(),
  aiProvider: yup.string().trim().required('AI provider is required'),
  aiModel: yup.string().trim().required('Gemini model is required'),
  systemInstructions: yup.string().trim().max(4000).nullable().optional(),
  temperature: yup
    .number()
    .typeError('Temperature must be a number')
    .min(0, 'Minimum temperature is 0.0')
    .max(2, 'Maximum temperature is 2.0')
    .required('Temperature is required'),
  maxOutputTokens: yup
    .number()
    .typeError('Max output tokens must be a whole number')
    .integer('Must be a whole number')
    .min(128, 'Minimum is 128 tokens')
    .max(8192, 'Maximum is 8192 tokens')
    .required('Max output tokens is required'),
  responseLanguage: yup.string().trim().max(50).required('Response language is required'),
  responseTone: yup.string().trim().max(50).required('Response tone is required'),
  personality: yup.string().trim().max(100).nullable().optional(),
  welcomeMessage: yup.string().trim().max(500).nullable().optional(),
  fallbackMessage: yup.string().trim().max(500).nullable().optional(),
  enableConversationHistory: yup.boolean().required(),
  enableHumanHandover: yup.boolean().required(),
  enableFollowUpQuestions: yup.boolean().required(),
});
