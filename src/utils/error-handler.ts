/**
 * Utility functions for consistent error handling across the extension
 */

/**
 * Formats an error into a user-friendly message string
 * @param error - The error to format (Error instance, string, or unknown)
 * @returns A formatted error message string
 */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return String(error);
}

/**
 * Formats an error with stack trace information
 * @param error - The error to format
 * @param includeStack - Whether to include stack trace (default: false)
 * @returns A formatted error message with optional stack trace
 */
export function formatErrorWithStack(error: unknown, includeStack: boolean = false): string {
  const message = formatError(error);
  
  if (includeStack && error instanceof Error && error.stack) {
    // Get first line of stack trace for context
    const firstStackLine = error.stack.split('\n')[1]?.trim();
    return firstStackLine ? `${message}\nStack: ${firstStackLine}` : message;
  }
  
  return message;
}

/**
 * Creates a standardized error object with context
 * @param message - Primary error message
 * @param details - Optional additional details
 * @param code - Optional error code
 * @returns Formatted error details object
 */
export function createErrorDetails(
  message: string,
  details?: string,
  code?: string
): { message: string; details?: string; code?: string } {
  return {
    message,
    ...(details && { details }),
    ...(code && { code }),
  };
}

/**
 * Combines multiple error messages into a single formatted string
 * @param errors - Array of error messages or Error instances
 * @param separator - Separator between errors (default: '; ')
 * @returns Combined error message string
 */
export function combineErrors(errors: unknown[], separator: string = '; '): string {
  return errors.map(formatError).join(separator);
}
