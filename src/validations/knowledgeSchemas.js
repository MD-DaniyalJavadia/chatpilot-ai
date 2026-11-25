import * as yup from 'yup';

export const websiteSourceSchema = yup.object({
  url: yup
    .string()
    .trim()
    .required('Website URL is required.')
    .test('is-http-url', 'Enter a valid http:// or https:// URL.', (value) => {
      if (!value) return false;
      try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        return false;
      }
    }),
  title: yup.string().trim().max(200, 'Title cannot exceed 200 characters.').nullable(),
  crawlMode: yup.string().oneOf(['single', 'crawl']).required(),
  maxPages: yup
    .number()
    .typeError('Enter a number between 1 and 10.')
    .integer('Must be a whole number.')
    .min(1, 'Minimum 1 page.')
    .max(10, 'Maximum 10 pages per crawl.')
    .required(),
});

export const faqSourceSchema = yup.object({
  title: yup.string().trim().max(200, 'Title cannot exceed 200 characters.').nullable(),
  question: yup
    .string()
    .trim()
    .min(5, 'Question must be at least 5 characters.')
    .max(500, 'Question cannot exceed 500 characters.')
    .required('Question is required.'),
  answer: yup
    .string()
    .trim()
    .min(5, 'Answer must be at least 5 characters.')
    .max(8000, 'Answer cannot exceed 8000 characters.')
    .required('Answer is required.'),
});

export const manualSourceSchema = yup.object({
  title: yup
    .string()
    .trim()
    .min(2, 'Title must be at least 2 characters.')
    .max(200, 'Title cannot exceed 200 characters.')
    .required('Title is required.'),
  content: yup
    .string()
    .trim()
    .min(15, 'Content must be at least 15 characters.')
    .max(100000, 'Content cannot exceed 100,000 characters.')
    .required('Knowledge text content is required.'),
});
