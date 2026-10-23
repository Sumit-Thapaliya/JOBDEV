import { z } from 'zod';

/** Opening a conversation: the applicant row the recruiter is looking at. */
export const openThreadSchema = z.object({
  applicationId: z.string().uuid('Pick an applicant to message'),
});

/**
 * Sending a message. The body is trimmed before it is stored, so a
 * whitespace-only message is rejected instead of landing as an empty bubble.
 */
export const sendMessageSchema = z.object({
  body: z
    .string({ required_error: 'Write a message first' })
    .trim()
    .min(1, 'Write a message first')
    .max(2000, 'Messages are limited to 2000 characters'),
});
