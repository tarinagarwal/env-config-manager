// Validation utility functions

export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const isValidPassword = (password: string): boolean => {
  // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password)
  );
};

export const isValidVariableKey = (key: string): boolean => {
  // Environment variable naming convention: alphanumeric and underscore, cannot start with number
  const keyRegex = /^[A-Z_][A-Z0-9_]*$/;
  return keyRegex.test(key);
};

export const getPasswordStrength = (
  password: string
): {
  score: number;
  label: string;
  color: string;
} => {
  let score = 0;

  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 2) return { score, label: "Weak", color: "red" };
  if (score <= 4) return { score, label: "Medium", color: "yellow" };
  return { score, label: "Strong", color: "green" };
};

export const validateProjectName = (name: string): string | null => {
  if (!name || name.trim().length === 0) {
    return "Project name is required";
  }
  if (name.length < 3) {
    return "Project name must be at least 3 characters";
  }
  if (name.length > 50) {
    return "Project name must be less than 50 characters";
  }
  return null;
};

export const validateEnvironmentName = (name: string): string | null => {
  if (!name || name.trim().length === 0) {
    return "Environment name is required";
  }
  if (name.length < 2) {
    return "Environment name must be at least 2 characters";
  }
  if (name.length > 30) {
    return "Environment name must be less than 30 characters";
  }
  if (!/^[a-z0-9-]+$/.test(name)) {
    return "Environment name can only contain lowercase letters, numbers, and hyphens";
  }
  return null;
};
