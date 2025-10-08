import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { use2FA } from "../hooks/useAuth";
import { Button, Input } from "../components/common";
import { useAuthStore } from "../stores/authStore";

export const Setup2FAPage = () => {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [verificationCode, setVerificationCode] = useState("");
  const [error, setError] = useState("");
  const [step, setStep] = useState<"enable" | "verify">("enable");

  const {
    enable2FA,
    enable2FAData,
    isEnabling2FA,
    enable2FAError,
    verify2FA,
    isVerifying2FA,
    verify2FAError,
  } = use2FA();

  useEffect(() => {
    if (user?.twoFactorEnabled) {
      // If 2FA is already enabled, show disable option
      navigate("/settings");
    }
  }, [user, navigate]);

  const handleEnable2FA = () => {
    enable2FA(undefined, {
      onSuccess: () => {
        setStep("verify");
      },
    });
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (verificationCode.length !== 6) {
      setError("Please enter a 6-digit code");
      return;
    }

    verify2FA(verificationCode, {
      onSuccess: () => {
        navigate("/settings");
      },
      onError: () => {
        setError("Invalid verification code. Please try again.");
      },
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Set up Two-Factor Authentication
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Add an extra layer of security to your account
          </p>
        </div>

        {step === "enable" && (
          <div className="space-y-6">
            {enable2FAError && (
              <div className="rounded-md bg-red-50 p-4">
                <p className="text-sm text-red-800">
                  {(enable2FAError as any)?.response?.data?.error?.message ||
                    "Failed to enable 2FA. Please try again."}
                </p>
              </div>
            )}

            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                How it works
              </h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
                <li>
                  Install an authenticator app on your phone (Google
                  Authenticator, Authy, etc.)
                </li>
                <li>Scan the QR code with your authenticator app</li>
                <li>Enter the 6-digit code from your app to verify</li>
              </ol>
            </div>

            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={handleEnable2FA}
              isLoading={isEnabling2FA}
            >
              Enable Two-Factor Authentication
            </Button>

            <div className="text-center">
              <button
                onClick={() => navigate("/settings")}
                className="font-medium text-blue-600 hover:text-blue-500"
              >
                Skip for now
              </button>
            </div>
          </div>
        )}

        {step === "verify" && enable2FAData && (
          <div className="space-y-6">
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4 text-center">
                Scan this QR code
              </h3>
              <div className="flex justify-center mb-4">
                <img
                  src={enable2FAData.qrCode}
                  alt="2FA QR Code"
                  className="w-64 h-64"
                />
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-2">
                  Or enter this code manually:
                </p>
                <code className="bg-gray-100 px-3 py-2 rounded text-sm font-mono">
                  {enable2FAData.secret}
                </code>
              </div>
            </div>

            <form onSubmit={handleVerify} className="space-y-4">
              {(error || verify2FAError) && (
                <div className="rounded-md bg-red-50 p-4">
                  <p className="text-sm text-red-800">
                    {error ||
                      (verify2FAError as any)?.response?.data?.error?.message ||
                      "Verification failed"}
                  </p>
                </div>
              )}

              <Input
                label="Verification Code"
                type="text"
                value={verificationCode}
                onChange={(e) =>
                  setVerificationCode(e.target.value.replace(/\D/g, ""))
                }
                placeholder="000000"
                maxLength={6}
                helperText="Enter the 6-digit code from your authenticator app"
                required
              />

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                isLoading={isVerifying2FA}
              >
                Verify and Enable
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
