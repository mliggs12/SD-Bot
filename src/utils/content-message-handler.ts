import { Message } from '../types';

/**
 * Generic message handler factory for content scripts
 * Creates a standardized message listener that handles errors consistently
 *
 * @param messageType - The message type to listen for
 * @param handler - Function that processes the message and returns a response,
 *   either synchronously or as a Promise (the message channel is kept open
 *   until an async handler resolves)
 * @param createErrorResponse - Function that creates an error response with the given error message
 * @returns A message listener function compatible with chrome.runtime.onMessage
 * 
 * @example
 * ```typescript
 * chrome.runtime.onMessage.addListener(
 *   createContentMessageHandler(
 *     'GET_CALLING_NUMBER',
 *     () => {
 *       const result = extractCallingNumber();
 *       return {
 *         type: 'CALLING_NUMBER_RESULT',
 *         success: result.success,
 *         phoneNumber: result.phoneNumber,
 *         error: result.error,
 *       };
 *     },
 *     (errorMessage) => ({
 *       type: 'CALLING_NUMBER_RESULT',
 *       success: false,
 *       error: errorMessage,
 *     })
 *   )
 * );
 * ```
 */
export function createContentMessageHandler<TRequest extends Message, TResponse extends Message>(
  messageType: TRequest['type'],
  handler: (message: TRequest) => TResponse | Promise<TResponse>,
  createErrorResponse: (errorMessage: string) => TResponse
): (
  message: Message,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: TResponse) => void
) => boolean {
  return (
    message: Message,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: TResponse) => void
  ): boolean => {
    if (message.type === messageType) {
      try {
        const response = handler(message as TRequest);
        if (response instanceof Promise) {
          response
            .then((resolved) => sendResponse(resolved))
            .catch((error: unknown) => {
              const errorMessage = error instanceof Error ? error.message : String(error);
              sendResponse(createErrorResponse(errorMessage));
            });
        } else {
          sendResponse(response);
        }
        return true; // Indicates we will send a response asynchronously
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorResponse = createErrorResponse(errorMessage);
        sendResponse(errorResponse);
        return true;
      }
    }

    return false;
  };
}
