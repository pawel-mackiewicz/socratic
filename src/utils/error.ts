export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return 'Unexpected error. Please try again.';
};
