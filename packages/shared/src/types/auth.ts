export interface OtpRequestInput {
  phone: string;
  method: 'sms' | 'email';
}

export interface OtpVerifyInput {
  phone: string;
  code: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface SessionInfo {
  id: string;
  userId: string;
  deviceFingerprint: string;
  createdAt: string;
  expiresAt: string;
}
