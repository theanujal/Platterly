export interface PlatformNoticeInput {
  enabled: boolean;
  title: string;
  message: string;
  buttonLabel: string;
  buttonUrl: string;
}

export const NOTICE_LIMITS = { title: 80, message: 240, buttonLabel: 30, buttonUrl: 500 } as const;
